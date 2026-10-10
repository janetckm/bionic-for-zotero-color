export { computeFont, computeColor };

type ColorMode =
  | "rainbow"
  | "solid"
  | "alternating"
  | "wordpos"
  | "custom";
type ColorPalette = "default" | "pastel" | "vivid" | "mono";

// Maximum custom palette size the renderer will accept.
export const MAX_CUSTOM_COLORS = 3;

const PALETTES: Record<ColorPalette, { base: [number, number, number]; alt: [number, number, number] }> = {
  default: { base: [220, 70, 45], alt: [200, 65, 50] },
  pastel: { base: [220, 55, 72], alt: [190, 55, 72] },
  vivid: { base: [350, 85, 55], alt: [210, 90, 55] },
  mono: { base: [220, 15, 35], alt: [220, 15, 55] },
};

/**
 * Compute a color for a bionic reading segment.
 * Purely numeric; does not allocate beyond the return string when possible.
 */
function computeColor(options: {
  segmentIndex: number;
  wordIndex: number;
  segmentKind: "bold" | "light" | "separator";
  mode: ColorMode | string;
  palette: ColorPalette | string;
  opacity: number;
  saturation: number;
  customColors: string[];
  fallbackColor: string;
}): string {
  const {
    segmentIndex,
    wordIndex,
    segmentKind,
    opacity,
    saturation,
    customColors,
    fallbackColor,
  } = options;
  let mode = options.mode as ColorMode;
  let palette = options.palette as ColorPalette;

  if (
    mode !== "rainbow" &&
    mode !== "solid" &&
    mode !== "alternating" &&
    mode !== "wordpos" &&
    mode !== "custom"
  ) {
    mode = "rainbow";
  }
  if (
    palette !== "default" &&
    palette !== "pastel" &&
    palette !== "vivid" &&
    palette !== "mono"
  ) {
    palette = "default";
  }

  // Separators and light segments (unless explicitly recolored) keep fallback.
  if (segmentKind === "separator" || segmentKind === "light") {
    return fallbackColor;
  }

  const alpha = clamp(Number(opacity) || 1, 0.1, 1);
  const sat = clamp(Number(saturation) || 1, 0, 2);

  const applyPalette = (hsl: [number, number, number]) => {
    const [h, s, l] = hsl;
    const finalS = clamp(Math.round(s * sat), 0, 100);
    return `hsla(${h}, ${finalS}%, ${l}%, ${alpha})`;
  };

  switch (mode) {
    case "rainbow": {
      const hue = ((wordIndex * 37) % 360 + 360) % 360;
      return applyPalette([hue, 70, 48]);
    }
    case "solid": {
      return applyPalette(PALETTES[palette].base);
    }
    case "alternating": {
      const pair = PALETTES[palette];
      return applyPalette(wordIndex % 2 === 0 ? pair.base : pair.alt);
    }
    case "wordpos": {
      // Hue shift based on bucketed word length
      const hue = ((segmentIndex * 53) % 360 + 360) % 360;
      return applyPalette([hue, 65, 50]);
    }
    case "custom": {
      if (!customColors || customColors.length === 0) {
        return applyPalette(PALETTES[palette].base);
      }
      const safe = customColors.slice(0, MAX_CUSTOM_COLORS);
      const idx = ((wordIndex % safe.length) + safe.length) % safe.length;
      return withAlpha(safe[idx], alpha);
    }
  }
  return fallbackColor;
}

function clamp(n: number, lo: number, hi: number) {
  return n < lo ? lo : n > hi ? hi : n;
}

/**
 * Attach an alpha multiplier to an arbitrary CSS color string.
 * Falls back to returning the original string if the format is not recognized.
 */
function withAlpha(color: string, alpha: number): string {
  if (!color) return color;
  const c = color.trim();
  // #rgb / #rrggbb / #rgba / #rrggbbaa
  if (c.startsWith("#")) {
    const body = c.slice(1);
    const short = body.length === 3 || body.length === 4;
    const full = body.length === 6 || body.length === 8;
    if (short || full) {
      let r: number, g: number, b: number, a = 1;
      if (short) {
        r = parseInt(body[0] + body[0], 16);
        g = parseInt(body[1] + body[1], 16);
        b = parseInt(body[2] + body[2], 16);
        if (body.length === 4) a = parseInt(body[3] + body[3], 16) / 255;
      } else {
        r = parseInt(body.slice(0, 2), 16);
        g = parseInt(body.slice(2, 4), 16);
        b = parseInt(body.slice(4, 6), 16);
        if (body.length === 8) a = parseInt(body.slice(6, 8), 16) / 255;
      }
      return `rgba(${r}, ${g}, ${b}, ${a * alpha})`;
    }
    return c;
  }
  // rgb(...) / rgba(...) / hsl(...) / hsla(...)
  const rgba = c.match(/^(rgba?)\(\s*([^)]+)\s*\)$/i);
  if (rgba) {
    const parts = rgba[2].split(",").map((p) => p.trim());
    if (parts.length === 3) {
      return `${rgba[1]}(${parts[0]}, ${parts[1]}, ${parts[2]}, ${alpha})`;
    }
    if (parts.length === 4) {
      const baseAlpha = parseFloat(parts[3]) || 1;
      return `${rgba[1]}(${parts[0]}, ${parts[1]}, ${parts[2]}, ${baseAlpha * alpha})`;
    }
  }
  const hsla = c.match(/^(hsla?)\(\s*([^)]+)\s*\)$/i);
  if (hsla) {
    const parts = hsla[2].split(",").map((p) => p.trim());
    if (parts.length === 3) {
      return `${hsla[1]}(${parts[0]}, ${parts[1]}, ${parts[2]}, ${alpha})`;
    }
    if (parts.length === 4) {
      const baseAlpha = parseFloat(parts[3]) || 1;
      return `${hsla[1]}(${parts[0]}, ${parts[1]}, ${parts[2]}, ${baseAlpha * alpha})`;
    }
  }
  // Unknown format: return as-is
  return c;
}

function computeFont(options: {
  font: string;
  alpha: number;
  opacityContrast: number;
  weightContrast: number;
  weightOffset: number;
}) {
  const { font, alpha, opacityContrast, weightContrast, weightOffset } =
    options;
  const computedData = {
    bold: {
      font: "",
      alpha: alpha,
    },
    light: {
      font: "",
      alpha: alpha,
    },
  };

  const fontParams = font.split(" ");

  const fontSizeIndex = fontParams.findIndex((font) => font.includes("px"));

  const baseFont = fontParams.slice(fontSizeIndex).join(" ");

  // Compute alpha
  const opacityRatio = 1 - (opacityContrast - 1) * 0.15;
  if (opacityContrast > 1) {
    computedData.light.alpha *= opacityRatio;
  }

  let baseWeight = 400;
  if (font.includes("black")) {
    baseWeight = 900;
  } else if (font.includes("bold")) {
    baseWeight = 700;
  } else {
    baseWeight = parseInt(fontParams[fontSizeIndex - 1]) || 400;
  }

  baseWeight += weightOffset * 100;

  let boldWeight = baseWeight + 100 * weightContrast;
  let lightWeight = baseWeight;

  if (boldWeight > 900) {
    const diff = boldWeight - 900;
    boldWeight -= diff;
    lightWeight -= diff;
  }

  if (lightWeight < 100) {
    const diff = 100 - lightWeight;
    lightWeight += diff;
    boldWeight += diff;
  }

  const italic = font.includes("italic") ? "italic" : "normal";

  computedData.bold.font = `${italic} ${boldWeight} ${baseFont}`;
  computedData.light.font = `${italic} ${lightWeight} ${baseFont}`;
  return computedData;
}
