/**
 * Font resolution helpers shared by text-like renderers.
 */

import type { RenderContext } from './RenderContext';

type ThemeFontSlot = 'lt' | 'ea' | 'cs';
type ThemeFontKey = 'latin' | 'ea' | 'cs';
type LanguageHint = string | null | undefined;

const THEME_FONT_REF = /^\+(mj|mn)-(lt|ea|cs)$/;
const THEME_FONT_SLOT_MAP: Record<ThemeFontSlot, ThemeFontKey> = {
  lt: 'latin',
  ea: 'ea',
  cs: 'cs',
};

const EAST_ASIAN_SCRIPT_FALLBACKS = ['Hans', 'Hant', 'Jpan', 'Hang'];

function normalizeLanguageHints(hints?: LanguageHint | LanguageHint[]): string[] {
  if (Array.isArray(hints)) {
    return hints.filter((hint): hint is string => typeof hint === 'string' && hint.length > 0);
  }
  return typeof hints === 'string' && hints.length > 0 ? [hints] : [];
}

function scriptFromLanguage(lang: string): string | undefined {
  const normalized = lang.toLowerCase();
  if (normalized.startsWith('zh')) {
    return /-(tw|hk|mo)\b/.test(normalized) ? 'Hant' : 'Hans';
  }
  if (normalized.startsWith('ja')) return 'Jpan';
  if (normalized.startsWith('ko')) return 'Hang';
  if (normalized.startsWith('ar')) return 'Arab';
  if (normalized.startsWith('he')) return 'Hebr';
  if (normalized.startsWith('th')) return 'Thai';
  if (normalized.startsWith('hi') || normalized.startsWith('mr') || normalized.startsWith('ne')) {
    return 'Deva';
  }
  return undefined;
}

function resolveScriptFont(
  scripts: Record<string, string> | undefined,
  hints?: LanguageHint | LanguageHint[],
): string | undefined {
  if (!scripts) return undefined;
  for (const hint of normalizeLanguageHints(hints)) {
    const script = scriptFromLanguage(hint);
    if (script && scripts[script]) return scripts[script];
  }
  for (const script of EAST_ASIAN_SCRIPT_FALLBACKS) {
    if (scripts[script]) return scripts[script];
  }
  return undefined;
}

function resolveThemeFontName(
  typeface: string,
  ctx: RenderContext,
  languageHints?: LanguageHint | LanguageHint[],
): string {
  const match = typeface.match(THEME_FONT_REF);
  if (!match) return typeface;

  const scheme = match[1];
  const slot = match[2] as ThemeFontSlot;
  const fonts = scheme === 'mj' ? ctx.theme.majorFont : ctx.theme.minorFont;
  const key = THEME_FONT_SLOT_MAP[slot];
  const direct = fonts[key];
  if (direct) return direct;
  if (slot === 'ea') {
    const scriptFont = resolveScriptFont(fonts.scripts, languageHints);
    if (scriptFont) return scriptFont;
  }
  return fonts.latin || fonts.ea || fonts.cs || typeface;
}

/**
 * Resolve theme font placeholder references like "+mj-lt" or "+mn-ea".
 */
export function resolveThemeFont(
  typeface: string,
  ctx: RenderContext,
  languageHints?: LanguageHint | LanguageHint[],
): string {
  const resolved = resolveThemeFontName(typeface, ctx, languageHints);
  const embeddedFamily = ctx.presentation.embeddedFontFamilies?.get(resolved.trim().toLowerCase());
  if (!embeddedFamily) return resolved;
  ctx.usedEmbeddedFontFamilies?.add(embeddedFamily);
  return embeddedFamily;
}

export function resolveThemeFontStack(
  typefaces: (string | undefined)[],
  ctx: RenderContext,
  languageHints?: LanguageHint | LanguageHint[],
): string[] {
  const seen = new Set<string>();
  const stack: string[] = [];
  for (const typeface of typefaces) {
    if (!typeface) continue;
    const resolved = resolveThemeFontName(typeface, ctx, languageHints).trim();
    const embedded = ctx.presentation.embeddedFontFamilies?.get(resolved.toLowerCase());
    if (embedded) ctx.usedEmbeddedFontFamilies?.add(embedded);
    for (const font of embedded ? [embedded, resolved] : [resolved]) {
      const key = font.toLowerCase();
      if (!font || seen.has(key)) continue;
      seen.add(key);
      stack.push(font);
    }
  }
  return stack;
}

const CSS_GENERIC_FONT_FAMILIES = new Set([
  'serif',
  'sans-serif',
  'monospace',
  'cursive',
  'fantasy',
  'system-ui',
  'ui-serif',
  'ui-sans-serif',
  'ui-monospace',
  'emoji',
  'math',
  'fangsong',
]);

const CJK_SANS_FALLBACKS = [
  'PingFang SC',
  'Hiragino Sans GB',
  'Noto Sans CJK SC',
  'Source Han Sans SC',
  'Malgun Gothic',
  'AppleGothic',
  'Apple SD Gothic Neo',
  'Noto Sans CJK KR',
  'Noto Sans KR',
  'Arial Unicode MS',
  'sans-serif',
];

const CJK_FONT_FAMILY_ALIAS_KEYS = new Set([
  'microsoft yahei',
  'microsoft yahei ui',
  '微软雅黑',
  'dengxian',
  '等线',
  'simhei',
  '黑体',
  'heiti sc',
]);

const FONT_FAMILY_ALIASES: Record<string, string[]> = {
  calibri: ['Calibri', 'Aptos', 'Carlito', 'Arial', 'system-ui', 'Helvetica', 'sans-serif'],
  'calibri light': [
    'Calibri Light',
    'Calibri',
    'Aptos Display',
    'Aptos',
    'Carlito',
    'Arial',
    'system-ui',
    'Helvetica',
    'sans-serif',
  ],
  aptos: ['Aptos', 'Arial', 'system-ui', 'Helvetica', 'sans-serif'],
  'aptos display': ['Aptos Display', 'Aptos', 'Arial', 'system-ui', 'Helvetica', 'sans-serif'],
  'bradley hand itc': ['Bradley Hand ITC', 'Bradley Hand'],
  'french script mt': ['French Script MT', 'Brush Script MT', 'Snell Roundhand'],
  'freestyle script': ['Freestyle Script', 'Brush Script MT', 'Snell Roundhand'],
  mistral: ['Mistral', 'Brush Script MT', 'Snell Roundhand'],
  'lucida handwriting': ['Lucida Handwriting', 'Apple Chancery'],
  'microsoft yahei': ['Microsoft YaHei', '微软雅黑'],
  'microsoft yahei ui': ['Microsoft YaHei UI', 'Microsoft YaHei', '微软雅黑'],
  微软雅黑: ['微软雅黑', 'Microsoft YaHei'],
  dengxian: ['DengXian', '等线'],
  等线: ['等线', 'DengXian'],
  simhei: ['SimHei', '黑体'],
  黑体: ['黑体', 'SimHei'],
  'heiti sc': ['Heiti SC', '黑体', 'SimHei'],
};

const MONOSPACE_FONT_FAMILIES = new Set([
  'courier',
  'courier new',
  'consolas',
  'lucida console',
  'menlo',
  'monaco',
  'source code pro',
  'fira mono',
  'fira code',
  'roboto mono',
  'ibm plex mono',
  'jetbrains mono',
  'dejavu sans mono',
  'liberation mono',
  'cousine',
]);

const SERIF_FONT_FAMILIES = new Set([
  'times',
  'times new roman',
  'georgia',
  'garamond',
  'cambria',
  'book antiqua',
  'palatino',
  'palatino linotype',
  'baskerville',
  'baskerville old face',
  'bodoni',
  'bodoni mt',
  'didot',
  'century schoolbook',
  'bookman',
  'bookman old style',
  'constantia',
  'simsun',
  '宋体',
  'nsimsun',
  'mingliu',
  'pmingliu',
  'ms mincho',
  'ms pmincho',
  'yu mincho',
  'batang',
  '바탕',
]);

const SCRIPT_FONT_FAMILIES = new Set([
  'bradley hand itc',
  'french script mt',
  'freestyle script',
  'mistral',
  'lucida handwriting',
  'juice itc',
  'pristina',
  'tempus sans itc',
  'mv boli',
  'brush script mt',
  'segoe script',
  'kunstler script',
  'vladimir script',
  'edwardian script itc',
]);

const FONT_NAME_STYLE =
  /^(.+?)\s+(thin|extra ?light|light|regular|medium|semi ?bold|demi ?bold|bold|extra ?bold|ultra ?bold|black|heavy)(?:\s+(italic))?$/i;

const FONT_NAME_WEIGHTS: Record<string, number> = {
  thin: 100,
  extralight: 200,
  light: 300,
  regular: 400,
  medium: 500,
  semibold: 600,
  demibold: 600,
  bold: 700,
  extrabold: 800,
  ultrabold: 800,
  black: 900,
  heavy: 900,
};

export interface FontNameStyle {
  family: string;
  weight: number;
  italic: boolean;
}

export function parseFontNameStyle(fontFamily: string): FontNameStyle | undefined {
  const match = fontFamily.trim().match(FONT_NAME_STYLE);
  if (!match) return undefined;
  return {
    family: match[1],
    weight: FONT_NAME_WEIGHTS[match[2].replace(' ', '').toLowerCase()],
    italic: match[3] !== undefined,
  };
}

export function fontNameWeight(fontFamily: string, bold: boolean | undefined): string | undefined {
  const weight = parseFontNameStyle(fontFamily)?.weight;
  if (weight === undefined) return bold ? 'bold' : undefined;
  return String(bold ? Math.max(700, weight) : weight);
}

function normalizeFontFamilyName(fontFamily: string): string {
  return fontFamily
    .trim()
    .replace(/^['"]|['"]$/g, '')
    .toLowerCase();
}

function cssFontFamilyToken(fontFamily: string): string {
  const normalized = normalizeFontFamilyName(fontFamily);
  if (CSS_GENERIC_FONT_FAMILIES.has(normalized)) {
    return normalized;
  }
  return `"${fontFamily.trim().replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function expandFontFamilyAliases(fontFamily: string): string[] {
  const aliases = FONT_FAMILY_ALIASES[normalizeFontFamilyName(fontFamily)];
  if (aliases) return aliases;
  const base = parseFontNameStyle(fontFamily)?.family;
  return base ? [fontFamily.trim(), ...expandFontFamilyAliases(base)] : [fontFamily.trim()];
}

function genericFontFamily(fontFamily: string): string {
  const name = normalizeFontFamilyName(parseFontNameStyle(fontFamily)?.family ?? fontFamily);
  if (SCRIPT_FONT_FAMILIES.has(name)) return 'cursive';
  if (MONOSPACE_FONT_FAMILIES.has(name) || name.endsWith(' mono')) return 'monospace';
  if (SERIF_FONT_FAMILIES.has(name) || (name.includes('serif') && !name.includes('sans'))) {
    return 'serif';
  }
  return 'sans-serif';
}

export function cssFontFamilyStack(fontFamily: string | string[]): string {
  const baseFonts = Array.isArray(fontFamily)
    ? fontFamily.flatMap(expandFontFamilyAliases)
    : expandFontFamilyAliases(fontFamily);
  const needsCjkFallbacks = baseFonts.some((font) =>
    CJK_FONT_FAMILY_ALIAS_KEYS.has(normalizeFontFamilyName(font)),
  );
  const stack = needsCjkFallbacks ? [...baseFonts, ...CJK_SANS_FALLBACKS] : baseFonts;
  const seen = new Set<string>();
  const unique = stack.filter((font) => {
    const key = normalizeFontFamilyName(font);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (unique.length === 0) return '';
  const hasGeneric = unique.some((font) =>
    CSS_GENERIC_FONT_FAMILIES.has(normalizeFontFamilyName(font)),
  );
  const named = unique.find((font) => !font.startsWith('__pptx_embedded_')) ?? unique[0];
  const withGeneric = hasGeneric ? unique : [...unique, genericFontFamily(named)];
  return withGeneric.map(cssFontFamilyToken).join(', ');
}
