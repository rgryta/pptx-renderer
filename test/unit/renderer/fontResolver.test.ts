import { describe, expect, it } from 'vitest';
import {
  cssFontFamilyStack,
  fontNameWeight,
  parseFontNameStyle,
  resolveThemeFont,
  resolveThemeFontStack,
} from '../../../src/renderer/fontResolver';
import { createMockRenderContext } from '../helpers/mockContext';

describe('fontResolver', () => {
  it('returns literal typefaces that are not theme placeholders', () => {
    const ctx = createMockRenderContext();

    expect(resolveThemeFont('Arial', ctx)).toBe('Arial');
  });

  it('resolves theme placeholders through direct major and minor slots', () => {
    const ctx = createMockRenderContext();
    ctx.theme.majorFont = { latin: 'Major Latin', ea: 'Major EA', cs: 'Major CS' };
    ctx.theme.minorFont = { latin: 'Minor Latin', ea: 'Minor EA', cs: 'Minor CS' };

    expect(resolveThemeFont('+mj-lt', ctx)).toBe('Major Latin');
    expect(resolveThemeFont('+mj-ea', ctx)).toBe('Major EA');
    expect(resolveThemeFont('+mj-cs', ctx)).toBe('Major CS');
    expect(resolveThemeFont('+mn-lt', ctx)).toBe('Minor Latin');
    expect(resolveThemeFont('+mn-ea', ctx)).toBe('Minor EA');
    expect(resolveThemeFont('+mn-cs', ctx)).toBe('Minor CS');
  });

  it('uses language-specific script fonts for East Asian theme placeholders', () => {
    const ctx = createMockRenderContext();
    ctx.theme.majorFont = {
      latin: 'Major Latin',
      ea: '',
      cs: '',
      scripts: {
        Hans: 'Hans Font',
        Hant: 'Hant Font',
        Jpan: 'Jpan Font',
        Hang: 'Hang Font',
        Arab: 'Arab Font',
        Hebr: 'Hebr Font',
        Thai: 'Thai Font',
        Deva: 'Deva Font',
      },
    };

    expect(resolveThemeFont('+mj-ea', ctx, 'zh-CN')).toBe('Hans Font');
    expect(resolveThemeFont('+mj-ea', ctx, 'zh-TW')).toBe('Hant Font');
    expect(resolveThemeFont('+mj-ea', ctx, 'ja-JP')).toBe('Jpan Font');
    expect(resolveThemeFont('+mj-ea', ctx, 'ko-KR')).toBe('Hang Font');
    expect(resolveThemeFont('+mj-ea', ctx, 'ar-SA')).toBe('Arab Font');
    expect(resolveThemeFont('+mj-ea', ctx, 'he-IL')).toBe('Hebr Font');
    expect(resolveThemeFont('+mj-ea', ctx, 'th-TH')).toBe('Thai Font');
    expect(resolveThemeFont('+mj-ea', ctx, 'hi-IN')).toBe('Deva Font');
  });

  it('falls back through script table, latin, ea, cs, and finally the placeholder text', () => {
    const ctx = createMockRenderContext();
    ctx.theme.majorFont = {
      latin: '',
      ea: '',
      cs: '',
      scripts: { Jpan: 'Jpan Fallback' },
    };
    ctx.theme.minorFont = { latin: '', ea: 'Minor EA Fallback', cs: 'Minor CS Fallback' };

    expect(resolveThemeFont('+mj-ea', ctx, 'en-US')).toBe('Jpan Fallback');
    expect(resolveThemeFont('+mn-lt', ctx)).toBe('Minor EA Fallback');

    ctx.theme.minorFont = { latin: '', ea: '', cs: 'Minor CS Fallback' };
    expect(resolveThemeFont('+mn-lt', ctx)).toBe('Minor CS Fallback');

    ctx.theme.minorFont = { latin: '', ea: '', cs: '' };
    expect(resolveThemeFont('+mn-lt', ctx)).toBe('+mn-lt');
  });

  it('builds a resolved font stack while filtering empty and duplicate typefaces', () => {
    const ctx = createMockRenderContext();
    ctx.theme.minorFont = { latin: 'Calibri', ea: 'Microsoft YaHei', cs: '' };

    expect(resolveThemeFontStack(['+mn-lt', '', undefined, 'Calibri', '+mn-ea'], ctx)).toEqual([
      'Calibri',
      'Microsoft YaHei',
    ]);
  });

  it('splits a comma-separated typeface into one family per name', () => {
    const ctx = createMockRenderContext();

    expect(resolveThemeFontStack(['Wingdings,Sans-Serif', 'Arial, Arial'], ctx)).toEqual([
      'Wingdings',
      'Sans-Serif',
      'Arial',
    ]);
    expect(cssFontFamilyStack(resolveThemeFontStack(['Wingdings,Sans-Serif'], ctx))).toBe(
      '"Wingdings", sans-serif',
    );
  });

  it('keeps the original family as fallback when an embedded face cannot load', () => {
    const ctx = createMockRenderContext();
    ctx.presentation.embeddedFontFamilies = new Map([['example sans', '__pptx_embedded_1_0']]);
    ctx.usedEmbeddedFontFamilies = new Set();

    expect(resolveThemeFontStack(['Example Sans'], ctx)).toEqual([
      '__pptx_embedded_1_0',
      'Example Sans',
    ]);
    expect(ctx.usedEmbeddedFontFamilies).toEqual(new Set(['__pptx_embedded_1_0']));
  });

  it('serializes CSS font family stacks with aliases, CJK fallbacks, generics, and escaping', () => {
    expect(cssFontFamilyStack('Calibri')).toBe(
      '"Calibri", "Aptos", "Carlito", "Arial", system-ui, "Helvetica", sans-serif',
    );
    expect(cssFontFamilyStack(['Calibri', 'sans-serif'])).toBe(
      '"Calibri", "Aptos", "Carlito", "Arial", system-ui, "Helvetica", sans-serif',
    );
    expect(cssFontFamilyStack('Calibri Light')).toBe(
      '"Calibri Light", "Calibri", "Aptos Display", "Aptos", "Carlito", "Arial", system-ui, "Helvetica", sans-serif',
    );
    expect(cssFontFamilyStack('Aptos')).toBe(
      '"Aptos", "Arial", system-ui, "Helvetica", sans-serif',
    );
    expect(cssFontFamilyStack('Aptos Display')).toBe(
      '"Aptos Display", "Aptos", "Arial", system-ui, "Helvetica", sans-serif',
    );
    const cjkStack = cssFontFamilyStack('微软雅黑');
    expect(cjkStack).toContain('"PingFang SC"');
    expect(cjkStack).toContain('"Malgun Gothic"');
    expect(cjkStack.indexOf('"AppleGothic"')).toBeLessThan(cjkStack.indexOf('"Arial Unicode MS"'));
    expect(cssFontFamilyStack('A "Quoted" \\ Font')).toBe('"A \\"Quoted\\" \\\\ Font", sans-serif');
  });

  it('ends unknown font stacks with a generic family chosen from the first font', () => {
    expect(cssFontFamilyStack('IBM Plex Sans')).toBe('"IBM Plex Sans", sans-serif');
    expect(cssFontFamilyStack('PT Sans')).toBe('"PT Sans", sans-serif');
    expect(cssFontFamilyStack('Georgia')).toBe('"Georgia", serif');
    expect(cssFontFamilyStack('Noto Serif')).toBe('"Noto Serif", serif');
    expect(cssFontFamilyStack('SimSun')).toBe('"SimSun", serif');
    expect(cssFontFamilyStack('Fira Mono')).toBe('"Fira Mono", monospace');
    expect(cssFontFamilyStack('Courier New')).toBe('"Courier New", monospace');
    expect(cssFontFamilyStack(['__pptx_embedded_1_0', 'Georgia'])).toBe(
      '"__pptx_embedded_1_0", "Georgia", serif',
    );
  });

  it('adds exactly one generic family, last, and none for an empty stack', () => {
    expect(cssFontFamilyStack(['Calibri', 'IBM Plex Sans'])).toBe(
      '"Calibri", "Aptos", "Carlito", "Arial", system-ui, "Helvetica", sans-serif, "IBM Plex Sans"',
    );
    expect(cssFontFamilyStack(['IBM Plex Sans', 'Calibri'])).toBe(
      '"IBM Plex Sans", "Calibri", "Aptos", "Carlito", "Arial", system-ui, "Helvetica", sans-serif',
    );
    expect(cssFontFamilyStack(['Georgia', 'monospace'])).toBe('"Georgia", monospace');
    expect(cssFontFamilyStack('')).toBe('');
    expect(cssFontFamilyStack([])).toBe('');
  });

  it('appends the generic after theme placeholders resolve', () => {
    const ctx = createMockRenderContext();
    ctx.theme.majorFont = { latin: 'Public Sans', ea: '', cs: '' };

    expect(cssFontFamilyStack(resolveThemeFontStack(['+mj-lt'], ctx))).toBe(
      '"Public Sans", sans-serif',
    );
  });

  it('adds the base family after a weight-named family and picks the generic from the base', () => {
    expect(cssFontFamilyStack('Public Sans Bold')).toBe(
      '"Public Sans Bold", "Public Sans", sans-serif',
    );
    expect(cssFontFamilyStack('Georgia Bold')).toBe('"Georgia Bold", "Georgia", serif');
    expect(cssFontFamilyStack('Consolas Semi Bold Italic')).toBe(
      '"Consolas Semi Bold Italic", "Consolas", monospace',
    );
    expect(cssFontFamilyStack('Gill Sans Ultra Bold')).toBe(
      '"Gill Sans Ultra Bold", "Gill Sans", sans-serif',
    );
    expect(cssFontFamilyStack('Arial Black')).toBe('"Arial Black", "Arial", sans-serif');
    expect(cssFontFamilyStack('Segoe UI Semibold')).toBe(
      '"Segoe UI Semibold", "Segoe UI", sans-serif',
    );
    expect(cssFontFamilyStack('Black')).toBe('"Black", sans-serif');
    const cjkLight = cssFontFamilyStack('DengXian Light');
    expect(cjkLight.startsWith('"DengXian Light", "DengXian", "等线"')).toBe(true);
    expect(cjkLight).toContain('"PingFang SC"');
  });

  it('parses weight and italic from family names but not from embedded tokens or bare weights', () => {
    expect(parseFontNameStyle('Public Sans Bold')).toEqual({
      family: 'Public Sans',
      weight: 700,
      italic: false,
    });
    expect(parseFontNameStyle('Open Sans Extra Light Italic')).toEqual({
      family: 'Open Sans',
      weight: 200,
      italic: true,
    });
    expect(parseFontNameStyle('Inter DemiBold')?.weight).toBe(600);
    expect(parseFontNameStyle('Inter Heavy')?.weight).toBe(900);
    expect(parseFontNameStyle('Black')).toBeUndefined();
    expect(parseFontNameStyle('__pptx_embedded_1_0')).toBeUndefined();
    expect(parseFontNameStyle('Calibri')).toBeUndefined();
  });

  it('never lets bold lower a name weight and keeps plain names on b', () => {
    expect(fontNameWeight('Public Sans Bold', undefined)).toBe('700');
    expect(fontNameWeight('Public Sans Bold', false)).toBe('700');
    expect(fontNameWeight('Segoe UI Light', false)).toBe('300');
    expect(fontNameWeight('Segoe UI Light', true)).toBe('700');
    expect(fontNameWeight('Arial Black', true)).toBe('900');
    expect(fontNameWeight('Calibri', true)).toBe('bold');
    expect(fontNameWeight('Calibri', false)).toBeUndefined();
  });

  it('maps script faces to macOS equivalents and the cursive generic', () => {
    expect(cssFontFamilyStack('Bradley Hand ITC')).toBe(
      '"Bradley Hand ITC", "Bradley Hand", cursive',
    );
    expect(cssFontFamilyStack('Mistral')).toBe(
      '"Mistral", "Brush Script MT", "Snell Roundhand", cursive',
    );
    expect(cssFontFamilyStack('French Script MT')).toBe(
      '"French Script MT", "Brush Script MT", "Snell Roundhand", cursive',
    );
    expect(cssFontFamilyStack('Freestyle Script')).toBe(
      '"Freestyle Script", "Brush Script MT", "Snell Roundhand", cursive',
    );
    expect(cssFontFamilyStack('Lucida Handwriting')).toBe(
      '"Lucida Handwriting", "Apple Chancery", cursive',
    );
    for (const face of [
      'Juice ITC',
      'Pristina',
      'Tempus Sans ITC',
      'MV Boli',
      'Brush Script MT',
      'Segoe Script',
      'Kunstler Script',
      'Vladimir Script',
      'Edwardian Script ITC',
    ]) {
      expect(cssFontFamilyStack(face)).toBe(`"${face}", cursive`);
    }
    expect(cssFontFamilyStack(['Mistral', 'SimSun'])).toBe(
      '"Mistral", "Brush Script MT", "Snell Roundhand", "SimSun", cursive',
    );
  });
});
