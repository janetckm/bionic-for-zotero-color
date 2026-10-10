/* eslint-disable no-restricted-globals */
import { config } from "../../package.json";
import { computeFont, computeColor } from "../utils/font";

function main() {
  document.querySelector("#prefs-navigation")?.addEventListener("select", init);

  setTimeout(() => {
    init();
  }, 1000);
}

main();

let initialized = false;

// Track the last known-good JSON for customColors so we can rollback invalid input.
let lastCustomColors = "[]";

const MAX_CUSTOM_COLORS = 3;
const DEFAULT_CUSTOM_COLORS = ["#c13b8c", "#4a7fd6", "#2f9e6d"];
const CUSTOM_COLOR_PICKER_IDS = ["customColor1", "customColor2", "customColor3"] as const;

function init() {
  if (initialized) {
    return;
  }
  const parsingContainer = document.querySelector(
    `#${config.addonRef}-parsing`,
  );
  const colorfulContainer = document.querySelector(
    `#${config.addonRef}-colorful`,
  );
  if (!parsingContainer || !colorfulContainer) {
    return;
  }
  initialized = true;
  document
    .querySelector("#prefs-navigation")
    ?.removeEventListener("select", init);

  parsingContainer.addEventListener("input", () => {
    updatePreview();
  });
  colorfulContainer.addEventListener("input", (ev) => {
    updatePreview();
    const target = ev.target as HTMLElement | null;
    if (!target) return;
    if (target.id === `${config.addonRef}-colorMode`) {
      toggleColorModeVisibility();
    }
    if (CUSTOM_COLOR_PICKER_IDS.some((id) => target.id === `${config.addonRef}-${id}`)) {
      // Write pickers -> JSON pref immediately (also persists through preference binding on hidden field)
      syncPickersToJSON(true);
    }
  });
  colorfulContainer.addEventListener("change", (ev) => {
    const target = ev.target as HTMLElement | null;
    if (!target) return;
    if (target.id === `${config.addonRef}-customColors`) {
      validateCustomColors(target as HTMLInputElement);
      syncJSONToPickers();
      updatePreview();
    }
    if (CUSTOM_COLOR_PICKER_IDS.some((id) => target.id === `${config.addonRef}-${id}`)) {
      syncPickersToJSON(true);
      updatePreview();
    }
  });
  colorfulContainer.addEventListener("blur", (ev) => {
    const target = ev.target as HTMLElement | null;
    if (target && target.id === `${config.addonRef}-customColors`) {
      validateCustomColors(target as HTMLInputElement);
      syncJSONToPickers();
      updatePreview();
    }
  }, true);

  // Populate initial state: read pref-backed hidden JSON field -> last good + pickers
  const customInput = document.querySelector(
    `#${config.addonRef}-customColors`,
  ) as HTMLInputElement | null;
  if (customInput) {
    const validated = validateCustomColors(customInput, /* silent */ true);
    if (!validated) {
      // Fall back to defaults if pref value is entirely malformed
      customInput.value = JSON.stringify(DEFAULT_CUSTOM_COLORS);
    }
    lastCustomColors = customInput.value || JSON.stringify(DEFAULT_CUSTOM_COLORS);
  }
  syncJSONToPickers();

  toggleColorModeVisibility();
  updatePreview();
}

const PREVIEW_STRING =
  "Zotero is a free, easy-to-use tool to help you collect, organize, annotate, cite, and share research.";
interface BionicGroup {
  startIdx: number;
  endIdx: number;
  isBold: boolean;
  wordIndex: number;
  segmentKind: "bold" | "light" | "separator";
}
const BIONIC_GROUPS: BionicGroup[] = buildBionicGroups();

/**
 * Produce the preview bionic groups mirroring the parser's behavior as closely
 * as possible for the hardcoded PREVIEW_STRING. Assigns wordIndex so coloring
 * is deterministic across renders.
 */
function buildBionicGroups(): BionicGroup[] {
  const raw = [
    [0, 3, true],
    [3, 7, false],
    [7, 8, true],
    [8, 10, false],
    [10, 11, true],
    [11, 12, false],
    [12, 14, true],
    [14, 18, false],
    [18, 20, true],
    [20, 23, false],
    [23, 24, true],
    [24, 26, false],
    [26, 27, true],
    [27, 30, false],
    [30, 32, true],
    [32, 35, false],
    [35, 36, true],
    [36, 38, false],
    [38, 40, true],
    [40, 43, false],
    [43, 44, true],
    [44, 47, false],
    [47, 51, true],
    [51, 56, false],
    [56, 60, true],
    [60, 66, false],
    [66, 70, true],
    [70, 76, false],
    [76, 78, true],
    [78, 82, false],
    [82, 83, true],
    [83, 86, false],
    [86, 89, true],
    [89, 92, false],
    [92, 96, true],
    [96, 101, false],
  ];
  let wordIndex = -1;
  const result: BionicGroup[] = [];
  for (let i = 0; i < raw.length; i++) {
    const [s, e, b] = raw[i] as [number, number, boolean];
    if (b) wordIndex += 1; // every bold segment starts a new word
    // Light segments following a bold share the bold's word index
    result.push({
      startIdx: s,
      endIdx: e,
      isBold: b,
      wordIndex,
      segmentKind: b ? "bold" : "light",
    });
  }
  return result;
}

function toggleColorModeVisibility() {
  const colorful = document.querySelector(
    `#${config.addonRef}-colorful`,
  ) as HTMLElement | null;
  const mode = (
    document.querySelector(
      `#${config.addonRef}-colorMode`,
    ) as HTMLSelectElement | null
  )?.value;
  if (!colorful) return;
  if (mode !== "custom") {
    colorful.classList.add("is-not-custom");
  } else {
    colorful.classList.remove("is-not-custom");
  }
}

/**
 * Check whether a string is a well-formed CSS color that browsers accept.
 * Uses Canvas.fillStyle round-trip to detect invalid values (blank/transparent
 * strings are rejected so the palette actually contains useful colors).
 */
function isValidCssColor(value: unknown): value is string {
  if (typeof value !== "string" || value.trim() === "") return false;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext("2d");
    if (!ctx) return /^#([0-9a-f]{3}){1,2}$/i.test(value);
    ctx.fillStyle = "#000000";
    ctx.fillStyle = value;
    const out = ctx.fillStyle;
    // invalid values leave fillStyle unchanged from previous set; ensure it changed
    // unless the user explicitly gave "#000000".
    if (value.toLowerCase() === "#000000" || value.toLowerCase() === "black") {
      return true;
    }
    return out !== "#000000" || /^#([0-9a-f]{3}){1,2}$|^(rgb|hsl)a?\(/i.test(value);
  } catch (e) {
    return false;
  }
}

/**
 * Validate customColors JSON. Enforces:
 *   - valid JSON array
 *   - length <= MAX_CUSTOM_COLORS (3)
 *   - every item is a valid CSS color string
 * If invalid, reverts to the last good value and shows a warning banner
 * (unless `silent` is true). Returns true when the input is valid.
 */
function validateCustomColors(input: HTMLInputElement, silent = false): boolean {
  const warn = document.querySelector(
    `#${config.addonRef}-customColorsWarning`,
  ) as HTMLElement | null;

  let arr: unknown;
  try {
    arr = JSON.parse(input.value || "null");
  } catch (e) {
    arr = null;
  }
  const ok =
    Array.isArray(arr) &&
    arr.length <= MAX_CUSTOM_COLORS &&
    (arr as unknown[]).every(isValidCssColor);

  if (ok) {
    lastCustomColors = input.value || "[]";
    if (warn && !silent) warn.style.display = "none";
    return true;
  }
  input.value = lastCustomColors;
  if (warn && !silent) {
    warn.style.display = "";
    setTimeout(() => {
      if (warn.style.display !== "none") warn.style.display = "none";
    }, 4000);
  }
  return false;
}

/**
 * Read picker values, validate, clamp to MAX_CUSTOM_COLORS, drop empty slots,
 * write the JSON string into the pref-backed hidden field and persist it
 * through Zotero's preference system.
 *
 * When `writePref` is true, also invoke Zotero.Prefs.set so the change is
 * picked up by the pref observer (forces refresh of all open readers).
 */
function syncPickersToJSON(writePref = false) {
  const colors: string[] = [];
  for (let i = 0; i < CUSTOM_COLOR_PICKER_IDS.length; i++) {
    const id = CUSTOM_COLOR_PICKER_IDS[i];
    const picker = document.querySelector(
      `#${config.addonRef}-${id}`,
    ) as HTMLInputElement | null;
    if (!picker) continue;
    const v = picker.value && picker.value.trim();
    if (v && isValidCssColor(v) && colors.length < MAX_CUSTOM_COLORS) {
      colors.push(v);
    }
  }
  const json = JSON.stringify(colors);
  const hiddenInput = document.querySelector(
    `#${config.addonRef}-customColors`,
  ) as HTMLInputElement | null;
  if (hiddenInput && hiddenInput.value !== json) {
    hiddenInput.value = json;
    lastCustomColors = json;
    if (writePref) {
      try {
        // Trigger Zotero's preference engine; the hidden field is bound via
        // the preference attribute but some XHTML engines need an explicit poke.
        hiddenInput.dispatchEvent(new Event("change", { bubbles: true }));
      } catch (e) {
        // ignore
      }
    }
  }
}

/**
 * Read the JSON value from the pref-backed hidden field (already validated
 * against MAX_CUSTOM_COLORS by validateCustomColors) and populate each color
 * picker. Missing entries fall back to the slot-specific default; entries
 * beyond MAX_CUSTOM_COLORS are ignored.
 */
function syncJSONToPickers() {
  const hiddenInput = document.querySelector(
    `#${config.addonRef}-customColors`,
  ) as HTMLInputElement | null;
  let list: string[] = [];
  try {
    const parsed = JSON.parse((hiddenInput && hiddenInput.value) || "null");
    if (Array.isArray(parsed)) {
      list = (parsed as unknown[])
        .filter(isValidCssColor)
        .slice(0, MAX_CUSTOM_COLORS);
    }
  } catch (e) {
    list = [];
  }
  for (let i = 0; i < CUSTOM_COLOR_PICKER_IDS.length; i++) {
    const id = CUSTOM_COLOR_PICKER_IDS[i];
    const picker = document.querySelector(
      `#${config.addonRef}-${id}`,
    ) as HTMLInputElement | null;
    if (!picker) continue;
    const v = list[i];
    // type=color inputs only accept #rrggbb hex. If the slot has a hex color
    // use it directly; otherwise fall back to the default so the picker still
    // shows a reasonable swatch while the actual JSON value preserves full
    // format (rgba/hsla etc.) via fallback defaults.
    if (v && /^#[0-9a-f]{6}$/i.test(v)) {
      picker.value = v;
    } else if (v && /^#[0-9a-f]{3}$/i.test(v)) {
      // normalize #rgb -> #rrggbb
      const expanded =
        "#" +
        v[1] + v[1] + v[2] + v[2] + v[3] + v[3];
      picker.value = expanded.toLowerCase();
    } else {
      picker.value = DEFAULT_CUSTOM_COLORS[i] || "#cccccc";
    }
    // Attach tooltip label
    picker.title = picker.getAttribute("data-l10n-tooltip") || "";
  }
}

/**
 * Try to parse JSON into a string[] of at most MAX_CUSTOM_COLORS valid CSS
 * colors. If any part fails, returns fallback. When returnValidOnly=true,
 * returns boolean validity instead of the array.
 */
function safeParseJSON<T>(
  str: string,
  fallback: T,
  returnValidOnly = false,
): T | boolean {
  try {
    const parsed = JSON.parse(str || "null");
    if (!Array.isArray(parsed)) {
      return returnValidOnly ? false : fallback;
    }
    const filtered = (parsed as unknown[])
      .filter(isValidCssColor)
      .slice(0, MAX_CUSTOM_COLORS);
    // Only treat as "valid" if every original element was a valid CSS color
    // and length is within the cap.
    if (returnValidOnly) {
      return (
        (parsed as unknown[]).every(isValidCssColor) &&
        parsed.length <= MAX_CUSTOM_COLORS
      );
    }
    return filtered as unknown as T;
  } catch (e) {
    return returnValidOnly ? false : fallback;
  }
}

function readNumeric(idSuffix: string, fallback: number): number {
  const el = document.querySelector(
    `#${config.addonRef}-${idSuffix}`,
  ) as HTMLInputElement | HTMLSelectElement | null;
  if (!el || el.value === "" || el.value === undefined) return fallback;
  const n = Number(el.value);
  return Number.isFinite(n) ? n : fallback;
}

function updatePreview() {
  const previewContainer = document.querySelector(
    `#${config.addonRef}-parsingPreview`,
  );

  if (!previewContainer) {
    return;
  }

  const fontData = computeFont({
    alpha: 1,
    font: 'normal normal 14px "Roboto", sans-serif',
    opacityContrast: readNumeric("opacityContrast", 1),
    weightContrast: readNumeric("weightContrast", 3),
    weightOffset: readNumeric("weightOffset", 0),
  });

  const parsingOffset = readNumeric("parsingOffset", 0);

  // Colorful prefs (read from DOM controls bound to preferences)
  const enableColorful = (
    document.querySelector(
      `#${config.addonRef}-enableColorful`,
    ) as HTMLInputElement | null
  )?.checked;
  const colorMode =
    (
      document.querySelector(
        `#${config.addonRef}-colorMode`,
      ) as HTMLSelectElement | null
    )?.value || "rainbow";
  const colorPalette =
    (
      document.querySelector(
        `#${config.addonRef}-colorPalette`,
      ) as HTMLSelectElement | null
    )?.value || "default";
  const colorOpacity = readNumeric("colorOpacity", 1);
  const colorSaturation = readNumeric("colorSaturation", 1);
  const customColorsRaw =
    (
      document.querySelector(
        `#${config.addonRef}-customColors`,
      ) as HTMLInputElement | null
    )?.value || "[]";
  const customColors = safeParseJSON<string[]>(customColorsRaw, []);

  previewContainer.innerHTML = "";

  const pc = previewContainer as Element;
  const style = window.getComputedStyle(pc);
  const defaultColor = (style && style.color) || "currentColor";

  for (let i = 0; i < BIONIC_GROUPS.length; i++) {
    const group = BIONIC_GROUPS[i];
    let startIdx = group.startIdx;
    let endIdx = group.endIdx;
    if (parsingOffset) {
      const nextGroup = BIONIC_GROUPS[i + 1];
      const prevGroup = BIONIC_GROUPS[i - 1];
      if (group.isBold && nextGroup) {
        endIdx = Math.max(
          // Can grow until the next group ends
          Math.min(endIdx + parsingOffset, nextGroup.endIdx),
          startIdx + 1,
        );
      } else if (!group.isBold && prevGroup) {
        startIdx = Math.min(
          // Can shrink until the previous group starts
          Math.max(startIdx + parsingOffset, prevGroup.startIdx + 1),
          endIdx,
        );
      }
    }

    if (startIdx >= endIdx) {
      continue;
    }

    const span = document.createElement("span");
    span.textContent = PREVIEW_STRING.slice(startIdx, endIdx);
    span.style.font = group.isBold ? fontData.bold.font : fontData.light.font;
    if (!group.isBold) {
      span.style.opacity = String(fontData.light.alpha);
    }

    if (enableColorful) {
      const color = computeColor({
        segmentIndex: i,
        wordIndex: group.wordIndex,
        segmentKind: group.segmentKind,
        mode: colorMode,
        palette: colorPalette,
        opacity: colorOpacity,
        saturation: colorSaturation,
        customColors: Array.isArray(customColors) ? customColors : [],
        fallbackColor: defaultColor,
      });
      span.style.color = color;
    }

    previewContainer.appendChild(span);
  }
}
