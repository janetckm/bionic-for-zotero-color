# Colorful Bionic Effect Implementation Plan

## Repository Research

### Current Architecture Summary

**Bionic for Zotero** is a Zotero 7 plugin (built on zotero-plugin-template) that implements Bionic Reading in the Zotero PDF reader. The core mechanism works by:

1. **Patching PDF.js rendering** — `src/reader/pdf.ts` intercepts the `showText` operation inside PDF.js's `CanvasGraphics` pipeline. For each run of glyphs, it calls `computeBionicGlyphs()` to split each word into a **bold prefix** and a **light suffix**, then renders each segment with a different font/alpha via the original `showText`.

2. **Word-parsing logic** — The function `computeBionicGlyphs()` (in `pdf.ts`, lines 147–300) handles word boundaries, CJK/Unicode separators, hyphenation (broken-word detection via zero-width space), and calculates how many leading glyphs of each word to bold (via `boldNumber`, influenced by word length, vowel positions, and `__BIONIC_PARSING_OFFSET`).

3. **Font/opacity computation** — `src/utils/font.ts` exports `computeFont()` which produces `{ bold: { font, alpha }, light: { font, alpha } }` from the current canvas font string plus user-controlled contrast/offset prefs (`opacityContrast`, `weightContrast`, `weightOffset`).

4. **Settings flow**:
   - Defaults declared in `addon/prefs.js` (prefs are prefixed `extensions.bionicReader.*`).
   - Type declarations in `typings/prefs.d.ts` under `_ZoteroTypes.Prefs.PluginPrefsMap`.
   - UI bound to prefs via `addon/chrome/content/preferences.xhtml` (native XHTML `<input preference="...">`).
   - `src/modules/settings.ts` registers observers on each pref so any change calls `addon.hooks.onRefreshReaders()` → `refreshReaders()` → PDF viewer refresh.
   - `src/modules/reader.ts` copies prefs onto each reader iframe's `window` object (`__BIONIC_*`) before the injected script runs.

5. **Preferences preview** — `src/preferences/index.ts` reuses the same `computeFont()` and parsing-offset logic to render a live preview of a hardcoded sample string against a static `BIONIC_GROUPS` array. It does NOT reuse `computeBionicGlyphs()`; it has its own slice logic.

6. **Key touchpoints for the colorful feature**:
   - The `CanvasGraphics.prototype[pdfjsLib.OPS.showText]` patch in `pdf.ts` is the single real rendering point → colors must be applied there via `ctx.fillStyle`/`ctx.strokeStyle` save/restore.
   - The preferences preview in `preferences/index.ts` must mirror the color logic visually, using `<span style="color:…">`.
   - Pref registration (prefs.js + prefs.d.ts + XHTML + locale + settings.ts observer list + reader.ts `setWindowPrefs`/`deleteWindowPrefs`).

### Constraints and Observations

- Rendering happens at the **Canvas 2D** level inside a PDF.js iframe; HTML DOM-based coloring won't work for the actual PDF. The only lever is `this.ctx.fillStyle` (and possibly `strokeStyle` when text is stroked).
- `computeBionicGlyphs` returns segments tagged only with `isBold`. To support **per-word** or **position-based** coloring, the segment metadata must also carry color information (or at least a word index / sequence number so the renderer can compute a color deterministically).
- The preview in `preferences/index.ts` currently operates on precomputed `BIONIC_GROUPS`. To faithfully preview color schemes, it needs to either re-run the bionic parser on the preview string or extend `BIONIC_GROUPS` with color tags.
- The plugin currently supports only **PDF** reader type (`type !== "pdf"` early-return everywhere). Colorful mode should respect the same scope.
- All prefs are simple scalar values (boolean, number, string). JSON-encoded prefs are supported via `getPrefJSON()` in `src/utils/prefs.ts` but not used currently; custom-color palettes may need a JSON string pref.

---

## Files and Modules

| File | Expected Change |
|------|----------------|
| `addon/prefs.js` | Add defaults: `enableColorful`, `colorMode`, `colorPalette`, `colorOpacity`, `colorSaturation`, `customColors` (JSON). |
| `typings/prefs.d.ts` | Extend `PluginPrefsMap` with the new prefs. |
| `src/utils/font.ts` | Add a new exported helper `computeColor(segmentIndex, wordIndex, mode, palette, opts)` → CSS color string, shared by preview and PDF renderer. |
| `src/reader/pdf.ts` | (a) Pass per-segment color through the patched `showText`: save/restore `ctx.fillStyle` (and `ctx.strokeStyle` if stroked text detected) and set the computed color for the bold (and optionally light) segment. (b) Extend `computeBionicGlyphs()` return type so each segment carries a `wordIndex` or direct `color` field. (c) Read new `window.__BIONIC_*` prefs (`ENABLE_COLORFUL`, `COLOR_MODE`, `COLOR_PALETTE`, `COLOR_OPACITY`, `COLOR_SATURATION`, `CUSTOM_COLORS`). |
| `src/modules/reader.ts` | In `setWindowPrefs` / `deleteWindowPrefs`, copy the new colorful prefs onto each reader iframe window (and clean them up on unload). |
| `src/modules/settings.ts` | Add new colorful-related pref keys to `PREFS_TO_OBSERVE` so changes trigger a viewer refresh. |
| `addon/chrome/content/preferences.xhtml` | Add a new `<groupbox>` "Colorful Bionic" section: enable checkbox, mode `<select>` (rainbow / solid / alternating / word-position), palette preset `<select>`, opacity/saturation sliders/number inputs, and a row of custom-color inputs (shown when mode=custom). |
| `addon/chrome/content/preferences.css` | Styles for the colorful-preview swatches, color picker row layout, and any new groupbox spacing. |
| `src/preferences/index.ts` | (a) Update `updatePreview()` to apply span-level `color:` using the same `computeColor()` helper. (b) Either re-parse the preview string through bionic logic (recommended for accuracy) or enrich `BIONIC_GROUPS` with indices so coloring is deterministic. (c) Add live refresh bindings for the new color inputs. |
| `addon/locale/en-US/preferences.ftl` | Add labels, placeholders, and section title for the new colorful UI. |
| `addon/locale/zh-CN/preferences.ftl` | Mirror the en-US strings with Chinese translations. |

---

## Implementation Steps

### Step 1 — Define Preference Contract (all consumers depend on this)

1.1 In `addon/prefs.js`, register defaults:
```
pref("…enableColorful", false);
pref("…colorMode", "rainbow");          // "rainbow" | "solid" | "alternating" | "wordpos" | "custom"
pref("…colorPalette", "default");       // preset name: "default","pastel","vivid","mono"
pref("…colorOpacity", 1);               // 0.1 – 1
pref("…colorSaturation", 1);            // 0 – 2
pref("…customColors", "[]");            // JSON array of CSS color strings
```

1.2 In `typings/prefs.d.ts`, append the six new keys to `PluginPrefsMap` with matching TS types.

### Step 2 — Build the shared color-computation utility

2.1 In `src/utils/font.ts`, add and export:

```ts
export function computeColor(opts: {
  segmentIndex: number;   // global ordinal of the bionic segment
  wordIndex: number;      // per-word ordinal (resets per showText call? -> use a stable counter or hash)
  segmentKind: "bold" | "light";
  mode: "rainbow" | "solid" | "alternating" | "wordpos" | "custom";
  palette: "default" | "pastel" | "vivid" | "mono";
  opacity: number;        // 0..1, multiplier on alpha channel
  saturation: number;     // 0..2, multiplier on HSL saturation
  customColors: string[]; // user-provided CSS colors (for "custom" mode)
  fallbackColor: string;  // current ctx fillStyle (original text color)
}): string;
```

Implementation outline:
- For mode `rainbow`: return `hsla((wordIndex * 37) % 360, 70% * saturation, 45%, opacity)`, or similar.
- For mode `solid`: return the bold color (and for light segment, the original/fallback unless user asks light segments to also be colored).
- For mode `alternating`: cycle between two accent colors from the selected palette.
- For mode `wordpos`: color changes based on word position in the sentence (e.g., by length bucket or by paragraph-relative index).
- For mode `custom`: cycle through `customColors`, ignoring palette preset.
- Saturation multipliers are applied in HSL space. Opacity is applied as alpha channel on all modes.
- If segmentKind is `"light"` and mode is not configured to recolor light segments, return `fallbackColor` unchanged (do not force color on the dimmer half unless the user opts in via a later pref if desired).

2.2 Keep `computeFont()` intact; colorful effect is additive to (not a replacement for) font-weight/opac­ity contrast.

### Step 3 — Extend the PDF render pipeline with color application

3.1 In `src/reader/pdf.ts`:

3.1.1 Change the return type of `computeBionicGlyphs` to include color hints:

```ts
interface BionicSegment {
  glyphs: Glyph[];
  isBold: boolean;
  wordIndex: number;   // ordinal word index within this glyph array
  segmentKind: "bold" | "light" | "separator";
}
```

Modify the parser loop inside `computeBionicGlyphs` to assign a monotonically increasing `wordIndex` (per-call basis) for each detected word and label each segment correctly. Separators get `segmentKind: "separator"` and keep `isBold: false`.

3.1.2 In the `showText` patch (around line 98):
- Before the render loop, read:
  ```ts
  const colorEnabled = window.__BIONIC_ENABLE_COLORFUL;
  const colorMode = window.__BIONIC_COLOR_MODE || "rainbow";
  const colorPalette = window.__BIONIC_COLOR_PALETTE || "default";
  const colorOpacity = window.__BIONIC_COLOR_OPACITY ?? 1;
  const colorSaturation = window.__BIONIC_COLOR_SATURATION ?? 1;
  const customColors = safeParseJSON(window.__BIONIC_CUSTOM_COLORS || "[]", []);
  ```
- Save/restore both `ctx.fillStyle` AND `ctx.strokeStyle` (PDF.js sometimes strokes text, e.g., for outlined fonts). Compute a global running counter or derive a deterministic segment index from glyph positions within the showText batch so that successive calls keep colors consistent across the page.
- For each returned segment:
  ```ts
  const targetColor = colorEnabled && segment.segmentKind !== "separator"
    ? computeColor({ segmentIndex, wordIndex: segment.wordIndex,
        segmentKind: segment.isBold ? "bold" : "light",
        mode: colorMode, palette: colorPalette,
        opacity: colorOpacity, saturation: colorSaturation,
        customColors, fallbackColor: savedFillStyle })
    : savedFillStyle;
  this.ctx.fillStyle = targetColor;
  this.ctx.strokeStyle = targetColor;
  ```
- Increment the segment counter appropriately across loops to maintain rainbow continuity.

3.1.3 Add a helper `safeParseJSON(str, fallback)` inside the module scope to avoid throws on malformed JSON custom-color strings (mirrors what `getPrefJSON` does on the main side; here in the injected world we have to inline a minimal version since we don't have the same imports).

### Step 4 — Plumb new prefs from main world into reader iframes

4.1 In `src/modules/reader.ts` function `setWindowPrefs`:
```ts
win.__BIONIC_ENABLE_COLORFUL = getPref("enableColorful") || false;
win.__BIONIC_COLOR_MODE = getPref("colorMode") || "rainbow";
win.__BIONIC_COLOR_PALETTE = getPref("colorPalette") || "default";
win.__BIONIC_COLOR_OPACITY = Number(getPref("colorOpacity")) ?? 1;
win.__BIONIC_COLOR_SATURATION = Number(getPref("colorSaturation")) ?? 1;
win.__BIONIC_CUSTOM_COLORS = getPref("customColors") || "[]";
```

4.2 Mirror the deletions in `deleteWindowPrefs`.

### Step 5 — Hook preferences observers so changes refresh readers

5.1 In `src/modules/settings.ts`, append to `PREFS_TO_OBSERVE`:
```ts
"enableColorful", "colorMode", "colorPalette",
"colorOpacity", "colorSaturation", "customColors"
```
The existing observer callback already invokes `onRefreshReaders`, which triggers `PDFViewerApplication.pdfViewer.refresh()` inside each patched iframe; no further wiring is needed.

### Step 6 — Build the preferences UI (XHTML + CSS)

6.1 In `addon/chrome/content/preferences.xhtml`, append a new groupbox BEFORE the existing `__addonRef__-pluginInfo` vbox:

```xhtml
<groupbox id="__addonRef__-colorful">
  <label><html:h2 data-l10n-id="colorful-title"></html:h2></label>
  <checkbox id="__addonRef__-enableColorful"
            preference="__prefsPrefix__.enableColorful"
            data-l10n-id="enableColorful" native="true" />
  <hbox align="center">
    <html:label data-l10n-id="colorMode" for="__addonRef__-colorMode"></html:label>
    <html:select id="__addonRef__-colorMode" preference="__prefsPrefix__.colorMode">
      <html:option value="rainbow"     data-l10n-id="colorMode-rainbow"></html:option>
      <html:option value="solid"       data-l10n-id="colorMode-solid"></html:option>
      <html:option value="alternating" data-l10n-id="colorMode-alternating"></html:option>
      <html:option value="wordpos"     data-l10n-id="colorMode-wordpos"></html:option>
      <html:option value="custom"      data-l10n-id="colorMode-custom"></html:option>
    </html:select>
  </hbox>
  <hbox align="center">
    <html:label data-l10n-id="colorPalette" for="__addonRef__-colorPalette"></html:label>
    <html:select id="__addonRef__-colorPalette" preference="__prefsPrefix__.colorPalette">
      <html:option value="default" data-l10n-id="colorPalette-default"></html:option>
      <html:option value="pastel"  data-l10n-id="colorPalette-pastel"></html:option>
      <html:option value="vivid"   data-l10n-id="colorPalette-vivid"></html:option>
      <html:option value="mono"    data-l10n-id="colorPalette-mono"></html:option>
    </html:select>
  </hbox>
  <hbox align="center">
    <html:label data-l10n-id="colorOpacity" for="__addonRef__-colorOpacity"></html:label>
    <html:input id="__addonRef__-colorOpacity" type="number" min="0.1" max="1" step="0.1"
                preference="__prefsPrefix__.colorOpacity" />
  </hbox>
  <hbox align="center">
    <html:label data-l10n-id="colorSaturation" for="__addonRef__-colorSaturation"></html:label>
    <html:input id="__addonRef__-colorSaturation" type="number" min="0" max="2" step="0.1"
                preference="__prefsPrefix__.colorSaturation" />
  </hbox>
  <hbox id="__addonRef__-customColorRow" align="center">
    <html:label data-l10n-id="customColors" for="__addonRef__-customColors"></html:label>
    <html:input id="__addonRef__-customColors" type="text"
                preference="__prefsPrefix__.customColors"
                data-l10n-id="customColorsInput" />
  </hbox>
</groupbox>
```

6.2 In `addon/chrome/content/preferences.css`, add rules:
- Show/hide `#__addonRef__-customColorRow` when `colorMode !== "custom"` (the JS controller in step 7 will toggle a class like `.is-custom-mode` on the groupbox, or show/hide via style).
- Consistent row spacing matching the existing parsing groupbox.

### Step 7 — Preferences controller: preview sync + custom row visibility + JSON validation

7.1 In `src/preferences/index.ts`:

7.1.1 Initialize visibility: at the end of `init()`, add a listener on the `colorMode` input and call a helper `toggleColorModeVisibility()` to show/hide the custom-color row based on the selected value.

7.1.2 Wire the colorful inputs to live preview:
- Extend the existing `parsingContainer.addEventListener("input", …)` listener scope so it covers the new `colorful` groupbox as well (attach to a common ancestor, or add a second listener on the colorful groupbox).
- On every input, re-run `updatePreview()`.

7.1.3 Inside `updatePreview()`:
- Read the new colorful prefs from the DOM elements.
- For each `<span>` created from `BIONIC_GROUPS`, compute its effective color via `computeColor()` (imported from `src/utils/font.ts`). The segmentKind here maps from `group.isBold`. Pass a synthetic `wordIndex` derived from the group order and `segmentIndex` equal to `i`. If `enableColorful` is off, skip setting `span.style.color`.
- (Recommended enhancement, optional but improves accuracy:) replace the static `BIONIC_GROUPS` approach with a real parser call — port the core of `computeBionicGlyphs()` so it operates on characters of `PREVIEW_STRING` (since the preview is HTML text, not PDF glyphs) and produces matching segment metadata. This keeps parsing-offset + color preview in sync with the actual PDF output. If skipped, note the mismatch in validation step V-3.

7.1.4 JSON validation: on blur of `customColors` input, try `JSON.parse` the value; on failure, show an inline validation notice (reuse the style of the existing preview warning) and reset the pref to the last-good value.

### Step 8 — Localization strings

8.1 In `addon/locale/en-US/preferences.ftl` add:
```
colorful-title = Colorful Bionic
enableColorful =
    .label = Enable Colorful Highlights
colorMode = Color mode:
colorMode-rainbow = Rainbow
colorMode-solid = Single Color
colorMode-alternating = Alternating
colorMode-wordpos = Word Position
colorMode-custom = Custom Palette
colorPalette = Preset palette:
colorPalette-default = Default
colorPalette-pastel = Pastel
colorPalette-vivid = Vivid
colorPalette-mono = Monochrome Tones
colorOpacity = Color opacity:
colorSaturation = Color saturation:
customColors = Custom colors (JSON array of CSS colors):
customColorsInput =
    .placeholder = ["#c13b8c","#4a7fd6",…]
```

8.2 In `addon/locale/zh-CN/preferences.ftl`, add Chinese equivalents (e.g., `colorful-title = 彩色仿生模式`, `enableColorful = 启用彩色高亮`, etc.).

---

## Dependencies and Considerations

- **No new runtime dependencies** are required. Color math uses built-in `hsla(...)` CSS colors. The existing build toolchain (`zotero-plugin-scaffold`, `tsc`, `zotero-plugin-toolkit`) covers all needed steps.
- **Build output**: The injected `pdf.js` script (compiled from `src/reader/pdf.ts`) is loaded from `chrome://${addonRef}/content/scripts/reader/pdf.js` by the reader module. Ensure `computeColor` is either inlined in the same bundle (via TypeScript imports) or the build pipeline concatenates it. Verify by running `npm run build` that no import errors occur for files in `src/reader` that reference `../utils/font`.
- **PDF.js version compatibility**: The showText patch already handles both legacy `showText(glyphs)` and new `showText(opIdx, glyphs)` signatures (lines 99–104 of pdf.ts). Colorful changes must not break that dual-path logic.
- **Deterministic coloring across re-renders**: PDF.js can re-render a page multiple times (zoom, pan, cleanup/refresh). Segment indices must be deterministic based on the incoming glyph array, not a global timer/counter, otherwise colors will "jump" on every refresh. Recommend: derive `segmentIndex` from a rolling hash of glyph unicode values accumulated up to that segment, or at minimum a per-`showText` call counter.
- **Accessibility**: Very low opacity + low-saturation text may become illegible against some PDF backgrounds. Consider clamping opacity ≥ 0.4 for the bold ("anchor") portion, or add a warning label near the opacity input.
- **Stroked vs filled text**: A small number of PDFs use stroked (outlined) text. Saving and restoring both `ctx.fillStyle` and `ctx.strokeStyle` in step 3.1.2 covers both cases.
- **Performance**: `computeColor()` is called per segment, per showText, per page render. Keep the function purely numeric with no allocations where possible. The default palette for rainbow mode should be a static lookup rather than recomputing HSL→RGB on every call.

---

## Validation

### V-1 Build & Typecheck
- Run `npm run build` (runs `tsc --noEmit` then `zotero-plugin build`). Confirm no TS errors on new code paths and the XPI is produced under `./builds/`.
- Run `npm run lint`; ensure new files pass Prettier + ESLint.

### V-2 Preferences Sanity
- Open Zotero → Tools → Settings → Bionic pane.
- Confirm the "Colorful Bionic" groupbox appears.
- Toggle **Enable Colorful Highlights** → change should instantly apply to the parsing preview below (text becomes colored on bold segments, or as per selected mode).
- Switch color modes (Rainbow → Solid → Alternating → Word Position → Custom). Preview must update without page reload.
- Change Palette preset → colors change.
- Change opacity (0.1 – 1) → alpha visibly shifts.
- Change saturation (0 – 2) → colors visibly desaturate or become more vivid.
- Select mode = Custom, set `customColors` to a valid JSON array e.g. `["#e94560","#0f3460","#16213e"]` → preview cycles through those colors. Enter invalid JSON → blur field → validation notice appears, last-good value is preserved.

### V-3 PDF Reader Visual Behavior
- Open a multi-page English PDF in Zotero reader.
- Enable Bionic mode via the toolbar button (if `Enable Bionic Mode` is on, the button shows the `Bi<b>o</b>` label).
- In preferences, enable Colorful → switch to a PDF tab; confirm the viewer refreshed and bold portions now appear colored (not just bold).
- Test each mode in a PDF:
  - Rainbow: successive word anchors smoothly cycle through hues without abrupt jumps inside a paragraph.
  - Solid: all anchors share the same tint.
  - Alternating: two colors switch back and forth per word.
  - Wordpos: color correlates with word length or sentence position (verify algorithmically against a short known sentence).
  - Custom: cycles the user palette.
- Zoom in/out, scroll to a new page, then return → colors are stable (no per-render flips).
- Disable `enableColorful` in prefs → PDF reverts to normal weight-only bionic rendering.

### V-4 Edge Cases
- **CJK text**: words are not parsed by `CONVERTIBLE_REGEX` intentionally, so they should appear unchanged; confirm no color or style artifacts.
- **Already-bold headings**: bold segments use the colorized bold font path. Confirm colors still apply and fonts stay readable.
- **Very small / very large fonts**: colors still apply, font weight logic unchanged.
- **Hyphenated words at line breaks**: verify broken-word handling (the `isWordBroken` state machine) still works under colored rendering — the first hyphenated piece should be fully colored/bolded and the second piece not re-bolded, matching existing behavior.

### V-5 Cleanup
- Close the PDF reader tab. `unInitReader` must not throw. Re-open a PDF and confirm settings still apply.
- Disable/enable the entire plugin from the Add-ons Manager. Confirm no leftover errors in the Error Console.

---

## Risks

### R-1 Deterministic coloring fails → colors flicker on zoom/refresh.
**Handling**: Base color derivation on stable indices derived from glyph data (per-call word counter + per-sequence hash) instead of a global counter. Document the chosen approach in code comments. Validate with zoom/pan cycles (V-3).

### R-2 Color application breaks stroked-text PDFs.
**Handling**: Save/restore both `ctx.fillStyle` and `ctx.strokeStyle`. Find a test PDF with outlined text, or force stroked rendering via a temporary code hook during manual testing.

### R-3 Preview and actual PDF output disagree on colors/segments.
**Handling**: (1) Reuse `computeColor()` directly in both places (done in steps 2 and 7.1.3). (2) Optionally share the parser logic (recommended follow-up in step 7.1.3). If not shared, keep the mismatch visible via the existing parsing-preview warning.

### R-4 JSON string pref for `customColors` gets corrupted.
**Handling**: Injected `pdf.ts` must never throw on malformed JSON — wrap in `try/catch` with empty-array fallback. Preferences controller validates on input blur. `getPrefJSON` already provides a main-thread fallback pattern.

### R-5 Performance regression for large PDFs.
**Handling**: Keep `computeColor()` a pure, allocation-free function when possible; no DOM or regex work. If profiling shows overhead, memoize color results by the `(mode, palette, index)` tuple for the duration of a single render pass.

### R-6 Future PDF.js upgrades break the `showText` signature or rendering pipeline.
**Handling**: The existing patch already handles dual signatures; keep ours aligned with the same pattern. Add a small guard (check typeof `original_showText` args count) and log via `_log`.

### R-7 Users with color-vision deficiencies cannot distinguish highlight colors.
**Handling**: Include a `"mono"` palette preset (step 6, palette options) that uses distinguishable lightness steps rather than hue-only differences, and ensure the **Saturation** slider lets users dial down to grayscale if needed.
