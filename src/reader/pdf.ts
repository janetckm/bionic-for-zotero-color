/* eslint-disable no-restricted-globals */
import { wait } from "zotero-plugin-toolkit";
import { computeFont, computeColor } from "../utils/font";

import type {
  PDFPage,
  CanvasGraphics,
  InternalRenderTask,
  Glyph,
} from "./typings/pdfViewer";

declare const PDFViewerApplication: _ZoteroTypes.Reader.PDFViewerApplication;

declare const pdfjsLib: _ZoteroTypes.Reader.pdfjs;

let intentStatesPrototype: any;

let firstRenderTriggered = false;

let isWordBroken = false;

function main() {
  patchIntentStatesGet();

  // If the first render is not triggered in 3 seconds, trigger a refresh again
  setTimeout(() => {
    if (!firstRenderTriggered) {
      refresh();
    }
  }, 3000);
}

main();

async function patchIntentStatesGet(pageIndex = 0) {
  await PDFViewerApplication?.pdfViewer?.firstPagePromise;
  await wait.waitUtilAsync(
    () =>
      !!PDFViewerApplication?.pdfViewer?._pages &&
      !!PDFViewerApplication?.pdfViewer?._pages[pageIndex],
    100,
    10000,
  );
  const page = PDFViewerApplication.pdfViewer!._pages![pageIndex] as PDFPage;
  // @ts-ignore Prototypes are not typed
  intentStatesPrototype = page.pdfPage._intentStates.__proto__;
  const original_get = intentStatesPrototype.get;
  intentStatesPrototype.__original_get = original_get;
  intentStatesPrototype.get = function (intent: any) {
    const ret = original_get.apply(this, [intent]);
    if (ret && typeof ret === "object" && ret.renderTasks) {
      _log("Intent", intent, ret);
      patchRenderTasksAdd(ret.renderTasks);
    }
    return ret;
  };
  // Refresh the page to apply the patch
  refresh();
}

function unPatchIntentStatesGet() {
  if (intentStatesPrototype.__original_get) {
    intentStatesPrototype.get = intentStatesPrototype.__original_get;
    delete intentStatesPrototype.__original_get;
  }
}

function patchRenderTasksAdd(renderTasks: Set<InternalRenderTask>) {
  const original_add = renderTasks.add;
  renderTasks.add = function (renderTask) {
    _log("Adding render task", renderTask);
    wait
      .waitUtilAsync(() => renderTask.gfx, 100, 10000)
      .then(() => {
        patchCanvasGraphicsShowText(renderTask.gfx.__proto__);
        renderTasks.add = original_add;
        unPatchIntentStatesGet();
      });
    return original_add.apply(this, [renderTask]);
  };
}

function patchCanvasGraphicsShowText(
  canvasGraphicsPrototype: typeof CanvasGraphics & {
    __showTextPatched?: boolean;
    ctx: CanvasRenderingContext2D;
  },
) {
  if (canvasGraphicsPrototype.__showTextPatched) {
    return;
  }
  firstRenderTriggered = true;
  canvasGraphicsPrototype.__showTextPatched = true;
  // @ts-ignore Runtime generated method on prototype
  const original_showText = canvasGraphicsPrototype[pdfjsLib.OPS.showText];
  _log("Patching showText", canvasGraphicsPrototype);
  // @ts-ignore Runtime generated method on prototype
  canvasGraphicsPrototype[pdfjsLib.OPS.showText] = function (
    ...args: [Glyph[]] | [number, Glyph[]]
  ) {
    // PDF.js < 5.7 calls showText(glyphs); >= 5.7 calls showText(opIdx, glyphs).
    const hasOpIdx = args.length >= 2;
    const glyphs = (hasOpIdx ? args[1] : args[0]) as Glyph[];
    const buildArgs = (g: Glyph[]) => (hasOpIdx ? [args[0], g] : [g]);

    if (!window.__BIONIC_READER_ENABLED) {
      return original_showText.apply(this, buildArgs(glyphs));
    }

    const opacityContrast = window.__BIONIC_OPACITY_CONTRAST || 1;

    const weightContrast = window.__BIONIC_WEIGHT_CONTRAST || 1;
    const weightOffset = window.__BIONIC_WEIGHT_OFFSET || 0;

    const colorfulEnabled = !!window.__BIONIC_ENABLE_COLORFUL;
    const colorMode = (window.__BIONIC_COLOR_MODE as string) || "rainbow";
    const colorPalette = (window.__BIONIC_COLOR_PALETTE as string) || "default";
    const colorOpacity = Number(window.__BIONIC_COLOR_OPACITY);
    const colorSaturation = Number(window.__BIONIC_COLOR_SATURATION);
    const customColors = safeParseJSON(
      (window.__BIONIC_CUSTOM_COLORS as string) || "[]",
      [] as string[],
    );

    const savedFont = this.ctx.font;
    const savedOpacity = this.ctx.globalAlpha;
    const savedFillStyle = this.ctx.fillStyle as string;
    const savedStrokeStyle = this.ctx.strokeStyle as string;

    const { bold, light } = computeFont({
      font: savedFont,
      alpha: savedOpacity,
      opacityContrast,
      weightContrast,
      weightOffset,
    });

    const newGlyphData = computeBionicGlyphs(glyphs);

    // Deterministic segment hash for "wordpos" mode to be stable across re-renders
    let glyphHash = 0;
    for (let hi = 0; hi < Math.min(glyphs.length, 64); hi++) {
      const g = glyphs[hi];
      const v =
        typeof g === "number" ? g : (g.unicode || " ").charCodeAt(0) || 0;
      glyphHash = (glyphHash * 31 + v) | 0;
    }

    for (let sIdx = 0; sIdx < newGlyphData.length; sIdx++) {
      const seg = newGlyphData[sIdx];
      const newG = seg.glyphs;
      const isBold = seg.isBold;
      this.ctx.font = isBold ? bold.font : light.font;
      // If use greater contrast is enabled, set text opacity to less than 1
      if (opacityContrast > 1 && !isBold) {
        this.ctx.globalAlpha = light.alpha;
      }

      if (colorfulEnabled) {
        const segmentKind = seg.segmentKind || (isBold ? "bold" : "light");
        // segmentIndex: combine glyph-hash with segment index for stability
        const segmentIndex = ((glyphHash + sIdx * 7) | 0) >>> 0;
        const targetColor = computeColor({
          segmentIndex,
          wordIndex: seg.wordIndex ?? sIdx,
          segmentKind,
          mode: colorMode,
          palette: colorPalette,
          opacity: Number.isFinite(colorOpacity) ? colorOpacity : 1,
          saturation: Number.isFinite(colorSaturation)
            ? colorSaturation
            : 1,
          customColors,
          fallbackColor: savedFillStyle,
        });
        this.ctx.fillStyle = targetColor;
        this.ctx.strokeStyle = targetColor;
      }

      original_showText.apply(this, buildArgs(newG));
      this.ctx.font = savedFont;
      this.ctx.globalAlpha = savedOpacity;
      if (colorfulEnabled) {
        this.ctx.fillStyle = savedFillStyle;
        this.ctx.strokeStyle = savedStrokeStyle;
      }
    }

    return undefined;
  };
  _log("Patched showText", window.__BIONIC_READER_ENABLED);
  if (window.__BIONIC_READER_ENABLED) {
    refresh();
  }
}

interface BionicSegment {
  glyphs: Glyph[];
  isBold: boolean;
  wordIndex: number;
  segmentKind: "bold" | "light" | "separator";
}

function computeBionicGlyphs(glyphs: Glyph[]): BionicSegment[] {
  let wordStartIdx = NaN;
  let wordEndIdx = NaN;
  let word = "";
  let currentWordIndex = 0;
  const newGlyphData: BionicSegment[] = [];

  const parsingOffset = window.__BIONIC_PARSING_OFFSET || 0;

  // From text-vide
  const CONVERTIBLE_REGEX = /(\p{L}|\p{Nd})*\p{L}(\p{L}|\p{Nd})*/u;

  const NON_VOWELS_REGEX = /[^aeiou]/gi;

  // Use a regex to match all non-alphanumeric characters, e.g. space, punctuation, etc.
  // But should not match other unicode characters like emojis or cjks
  const SEPARATOR_REGEX = /[\p{P}\p{S}\p{Z}]/u;

  function getStr(glyph: Glyph) {
    if (typeof glyph === "number") {
      if (glyph < -100) {
        return " ";
      } else {
        return "<EMPTY>";
      }
    }
    return glyph.unicode;
  }

  for (let i = 0; i < glyphs.length; i++) {
    const glyph = glyphs[i];
    const str = getStr(glyph);
    const isWordSeparator = SEPARATOR_REGEX.test(str);

    const isWordStarted = !Number.isNaN(wordStartIdx);
    if (isWordStarted) {
      if (isWordSeparator || i === glyphs.length - 1) {
        // If the word has started and we encounter a space, the word has ended
        wordEndIdx = i;
        word += str;
        _log(`Word ended: ${wordStartIdx} ${wordEndIdx}`);
      } else {
        // If the word has started and we encounter a non-space, the word has not ended
        word += str;
        continue;
      }
    } else {
      if (!isWordSeparator) {
        // If the word has not started and we encounter a non-space, the word has started
        wordStartIdx = i;
        word += str;
        _log(`Word started: ${wordStartIdx}`);
      } else {
        // If the word has not started and we encounter a space, the word has not started
        newGlyphData.push({
          glyphs: glyphs.slice(i, i + 1),
          isBold: false,
          wordIndex: currentWordIndex,
          segmentKind: "separator",
        });
        continue;
      }
    }
    const isWordEnded = isWordStarted && !Number.isNaN(wordEndIdx);
    if (!isWordEnded) {
      continue;
    }

    // If the word has ended, bolden the first alphabet of the word
    // const word = showTextArgs.slice(wordStartIdx, wordEndIdx).map((arg) => {
    //     return arg.unicode;
    // }).join("");
    _log(`Boldening word: ${wordStartIdx} ${wordEndIdx}`, word);

    word = word.replace(/<EMPTY>/g, "\u2060");

    if (wordEndIdx === wordStartIdx || !CONVERTIBLE_REGEX.test(word)) {
      newGlyphData.push({
        glyphs: glyphs.slice(wordStartIdx, wordEndIdx + 1),
        isBold: false,
        wordIndex: currentWordIndex,
        segmentKind: "light",
      });
      currentWordIndex += 1;
      wordStartIdx = NaN;
      wordEndIdx = NaN;
      word = "";
      continue;
    }

    let boldNumber = 1;

    const wordLength = wordEndIdx + 1 - wordStartIdx;
    const isPreviousWordBroken = isWordBroken;
    isWordBroken =
      word.endsWith("\u2060") && wordLength >= 1 && wordLength <= 10;
    // If the word ends with a zero-width space, it may be broken
    if (isPreviousWordBroken && !isWordBroken) {
      // If the previous word was broken and the current word is not broken, skip boldening
      boldNumber = 0;
      isWordBroken = false;
    } else if (isWordBroken) {
      // If the word is broken, bolden the entire word as it is the first part
      _log("The word may be broken", word.slice(wordStartIdx, wordEndIdx + 1));
      boldNumber = wordLength;
    } else if (wordLength < 4) {
      boldNumber = 1;
    } else {
      boldNumber = Math.ceil(wordLength / 2);

      if (boldNumber > 6) {
        // Find the closest non-vowel character to the bold number
        const nonVowels = word.matchAll(NON_VOWELS_REGEX);
        const closestMatch = Array.from(nonVowels).sort((a, b) => {
          return (
            Math.abs(a.index! - boldNumber) - Math.abs(b.index! - boldNumber)
          );
        })[0];
        if (closestMatch && Math.abs(closestMatch.index - boldNumber) < 2) {
          boldNumber = closestMatch.index! + 1;
        }
      }
    }

    boldNumber += parsingOffset;

    // Clamp the bold number to the word length
    boldNumber = Math.max(Math.min(boldNumber, wordLength), 1);

    _log("Word length", wordLength, boldNumber);

    newGlyphData.push({
      glyphs: glyphs.slice(wordStartIdx, wordStartIdx + boldNumber),
      isBold: true,
      wordIndex: currentWordIndex,
      segmentKind: "bold",
    });

    if (wordStartIdx + boldNumber <= wordEndIdx) {
      newGlyphData.push({
        glyphs: glyphs.slice(wordStartIdx + boldNumber, wordEndIdx + 1),
        isBold: false,
        wordIndex: currentWordIndex,
        segmentKind: "light",
      });
    }

    currentWordIndex += 1;
    wordStartIdx = NaN;
    wordEndIdx = NaN;
    word = "";
  }

  // If the last word has not ended, push it
  if (!Number.isNaN(wordStartIdx)) {
    newGlyphData.push({
      glyphs: glyphs.slice(wordStartIdx, wordStartIdx + glyphs.length),
      isBold: false,
      wordIndex: currentWordIndex,
      segmentKind: "light",
    });
  }
  return newGlyphData;
}

const MAX_CUSTOM_COLORS_READER = 3;

function isValidCssColorReader(value: unknown): value is string {
  if (typeof value !== "string" || !value.trim()) return false;
  // Lightweight format check; Canvas fillStyle round-trip is not available in every
  // worker/iframe context but the regex covers everything the preferences UI writes.
  return (
    /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value) ||
    /^rgba?\(\s*\d{1,3}%?\s*(,\s*\d{1,3}%?\s*){2}(,\s*[\d.]+%?\s*)?\)$/i.test(value) ||
    /^hsla?\(\s*-?\d{1,3}\s*(,\s*\d{1,3}%\s*){2}(,\s*[\d.]+%?\s*)?\)$/i.test(value)
  );
}

function safeParseJSON<T>(str: string, fallback: T): T {
  try {
    const parsed = JSON.parse(str) as unknown;
    // If the caller expects a string array (customColors), filter and clamp.
    if (Array.isArray(parsed)) {
      const filtered = parsed
        .filter(isValidCssColorReader)
        .slice(0, MAX_CUSTOM_COLORS_READER);
      return filtered as unknown as T;
    }
    return parsed as T;
  } catch (e) {
    return fallback;
  }
}

function refresh() {
  PDFViewerApplication.pdfViewer?.cleanup();
  PDFViewerApplication.pdfViewer?.refresh();
}

function _log(...args: any[]) {
  if (__env__ === "development") {
    console.log("[Bionic for Zotero]", ...args);
  }
}
