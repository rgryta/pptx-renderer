import { SafeXmlNode } from '../../parser/XmlParser';

const MAX_CHART_CACHE_POINTS = 10_000;

function getCachePointLimit(cache: SafeXmlNode, countSource: SafeXmlNode = cache): number {
  const declared = countSource.child('ptCount').numAttr('val');
  let maxPresentIndex = -1;

  for (const pt of cache.children('pt')) {
    const idx = pt.numAttr('idx');
    if (idx !== undefined && Number.isInteger(idx) && idx >= 0 && idx < MAX_CHART_CACHE_POINTS) {
      maxPresentIndex = Math.max(maxPresentIndex, idx);
    }
  }

  const presentCount = maxPresentIndex + 1;
  if (declared === undefined || !Number.isFinite(declared) || declared < 0) {
    return presentCount;
  }

  const declaredCount = Math.floor(declared);
  if (declaredCount > MAX_CHART_CACHE_POINTS) {
    return presentCount;
  }

  return Math.min(Math.max(declaredCount, presentCount), MAX_CHART_CACHE_POINTS);
}

function isCachePointInRange(idx: number | undefined, pointLimit: number): idx is number {
  return (
    idx !== undefined &&
    Number.isInteger(idx) &&
    idx >= 0 &&
    idx < pointLimit &&
    idx < MAX_CHART_CACHE_POINTS
  );
}

/** Reference caches win when populated; empty/missing caches may use inline data. */
function resolveDataCache(refNode: SafeXmlNode, kind: 'str' | 'num'): SafeXmlNode {
  const candidates = [
    refNode.child(`${kind}Ref`).child(`${kind}Cache`),
    refNode.child(`${kind}Lit`),
    refNode.child(`${kind}Cache`),
  ];
  return (
    candidates.find((cache) => cache.children('pt').length > 0) ??
    candidates.find((cache) => cache.exists()) ??
    candidates[0]
  );
}

/** The first `lvl` of a multi-level category cache holds the leaf labels, one per data point. */
function resolveMultiLevelLeaf(refNode: SafeXmlNode): { leaf: SafeXmlNode; cache: SafeXmlNode } {
  const candidates = [
    refNode.child('multiLvlStrRef').child('multiLvlStrCache'),
    refNode.child('multiLvlStrCache'),
  ];
  const cache =
    candidates.find((c) => c.child('lvl').children('pt').length > 0) ??
    candidates.find((c) => c.exists()) ??
    candidates[0];
  return { leaf: cache.child('lvl'), cache };
}

function readStringPoints(points: SafeXmlNode, countSource: SafeXmlNode = points): string[] {
  const pointLimit = getCachePointLimit(points, countSource);
  const values: string[] = new Array(pointLimit).fill('');

  for (const pt of points.children('pt')) {
    const idx = pt.numAttr('idx');
    if (isCachePointInRange(idx, pointLimit)) {
      values[idx] = pt.child('v').text();
    }
  }

  return values;
}

export function extractStringValues(refNode: SafeXmlNode): string[] {
  const cache = resolveDataCache(refNode, 'str');

  if (cache.children('pt').length === 0) {
    const numCache = resolveDataCache(refNode, 'num');
    if (numCache.exists() && (!cache.exists() || numCache.children('pt').length > 0)) {
      return extractNumericValuesAsStrings(numCache);
    }
    const multiLevel = resolveMultiLevelLeaf(refNode);
    if (multiLevel.leaf.children('pt').length > 0) {
      return readStringPoints(multiLevel.leaf, multiLevel.cache);
    }
    if (!cache.exists()) return [];
  }

  return readStringPoints(cache);
}

export function extractFormatCode(refNode: SafeXmlNode): string | undefined {
  const cache = resolveDataCache(refNode, 'num');

  if (!cache.exists()) return undefined;

  const fc = cache.child('formatCode');
  if (!fc.exists()) return undefined;

  const text = fc.text();
  return text || undefined;
}

function splitFormatSections(formatCode: string): string[] {
  const sections: string[] = [];
  let current = '';
  let inQuote = false;

  for (let i = 0; i < formatCode.length; i++) {
    const ch = formatCode[i];
    if (ch === '"') {
      inQuote = !inQuote;
      current += ch;
      continue;
    }
    if (ch === ';' && !inQuote) {
      sections.push(current);
      current = '';
      continue;
    }
    current += ch;
  }

  sections.push(current);
  return sections;
}

const LITERAL_CHARS = new Set("$-+/():!^&'~{}<>= €£¥");
const MAX_FRACTION_DIGITS = 20;
const MAX_INTEGER_DIGITS = 21;

interface NumericFormatSection {
  prefix: string;
  pattern: string;
  suffix: string;
  percent: number;
}

function tokenizeNumericFormatSection(section: string): NumericFormatSection | undefined {
  const parsed: NumericFormatSection = { prefix: '', pattern: '', suffix: '', percent: 0 };
  const addLiteral = (text: string) => {
    if (parsed.pattern) parsed.suffix += text;
    else parsed.prefix += text;
  };

  for (let i = 0; i < section.length; i++) {
    const ch = section[i];

    if (ch === '"') {
      const close = section.indexOf('"', i + 1);
      const end = close === -1 ? section.length : close;
      addLiteral(section.slice(i + 1, end));
      i = end;
    } else if (ch === '\\') {
      if (i + 1 < section.length) addLiteral(section[++i]);
    } else if (ch === '_' || ch === '*') {
      i++;
    } else if (ch === '[') {
      const close = section.indexOf(']', i);
      if (close === -1) return undefined;
      const directive = section.slice(i + 1, close);
      if (/^[<>=]/.test(directive)) return undefined;
      if (directive.startsWith('$')) addLiteral(directive.slice(1).split('-')[0]);
      i = close;
    } else if ('0#?.,'.includes(ch)) {
      if (parsed.suffix) return undefined;
      parsed.pattern += ch;
    } else if (ch === '%') {
      parsed.percent++;
      addLiteral(ch);
    } else if (LITERAL_CHARS.has(ch)) {
      addLiteral(ch);
    } else {
      return undefined;
    }
  }

  return parsed.pattern && !/[0#?]/.test(parsed.pattern) ? undefined : parsed;
}

function formatNumericPattern(value: number, pattern: string): string {
  const scaleCommas = pattern.match(/,+$/)?.[0].length ?? 0;
  const core = pattern.slice(0, pattern.length - scaleCommas);
  const [intPart, fracPart = ''] = core.split('.');
  const scaled = scaleCommas ? parseFloat((value / 1000 ** scaleCommas).toPrecision(12)) : value;
  const intZeros = intPart.split('0').length - 1;
  const formatted = scaled.toLocaleString('en-US', {
    useGrouping: intPart.includes(','),
    minimumIntegerDigits: Math.min(Math.max(intZeros, 1), MAX_INTEGER_DIGITS),
    minimumFractionDigits: Math.min(fracPart.split('0').length - 1, MAX_FRACTION_DIGITS),
    maximumFractionDigits: Math.min(fracPart.replace(/,/g, '').length, MAX_FRACTION_DIGITS),
  });
  return intZeros === 0 && formatted.startsWith('0') ? formatted.slice(1) : formatted;
}

function formatOfficeNumber(value: number, formatCode: string): string | undefined {
  const sections = splitFormatSections(formatCode);
  const useNegativeSection = value < 0 && sections.length > 1;
  const sectionIndex = useNegativeSection ? 1 : value === 0 && sections.length > 2 ? 2 : 0;
  const parsed = tokenizeNumericFormatSection(sections[sectionIndex]);
  if (!parsed || (!parsed.pattern && sectionIndex === 0)) return undefined;

  const magnitude = Math.abs(value) * 100 ** parsed.percent;
  const number = parsed.pattern
    ? formatNumericPattern(parseFloat(magnitude.toPrecision(12)), parsed.pattern)
    : '';
  const sign = value < 0 && !useNegativeSection ? '-' : '';
  return `${sign}${parsed.prefix}${number}${parsed.suffix}`.trim();
}

export function formatValue(value: number, formatCode: string | undefined): string {
  if (!formatCode || formatCode === 'General') {
    if (Number.isInteger(value)) return String(value);
    return parseFloat(value.toFixed(2)).toString();
  }

  const officeNumber = formatOfficeNumber(value, formatCode);
  if (officeNumber !== undefined) return officeNumber;

  if (formatCode.includes('%')) {
    const match = formatCode.match(/0\.(0+)%/);
    const decimals = match ? match[1].length : 0;
    const pctValue = parseFloat((value * 100).toPrecision(12));
    return `${pctValue.toFixed(decimals)}%`;
  }

  const decMatch = formatCode.match(/\.(0+|#+)/);
  if (decMatch) {
    const decimals = decMatch[1].length;
    return parseFloat(value.toFixed(decimals)).toString();
  }

  if (/^[#0,]+$/.test(formatCode.replace(/[[\]"\\]/g, ''))) {
    return Math.round(value).toString();
  }

  if (Number.isInteger(value)) return String(value);
  return parseFloat(value.toFixed(2)).toString();
}

export function extractNumericValues(refNode: SafeXmlNode): number[] {
  return extractNumericValuesWithBlanks(refNode).values;
}

interface NumericValuesWithBlanks {
  values: number[];
  blankIndices: Set<number>;
}

export function extractNumericValuesWithBlanks(refNode: SafeXmlNode): NumericValuesWithBlanks {
  const cache = resolveDataCache(refNode, 'num');

  if (!cache.exists()) return { values: [], blankIndices: new Set() };

  const pointLimit = getCachePointLimit(cache);
  const values: number[] = new Array(pointLimit).fill(0);
  const blankIndices = new Set<number>();
  for (let i = 0; i < pointLimit; i++) blankIndices.add(i);

  for (const pt of cache.children('pt')) {
    const idx = pt.numAttr('idx');
    if (isCachePointInRange(idx, pointLimit)) {
      const raw = pt.child('v').text().trim();
      const v = parseFloat(raw);
      if (raw !== '' && !isNaN(v)) {
        values[idx] = v;
        blankIndices.delete(idx);
      }
    }
  }

  return { values, blankIndices };
}

function extractNumericValuesAsStrings(cache: SafeXmlNode): string[] {
  const pointLimit = getCachePointLimit(cache);
  const values: string[] = new Array(pointLimit).fill('');

  const fc = cache.child('formatCode').text();
  const isDateFmt = fc && /[yYmMdD]/.test(fc) && !/[#0]/.test(fc);

  for (const pt of cache.children('pt')) {
    const idx = pt.numAttr('idx');
    if (isCachePointInRange(idx, pointLimit)) {
      const raw = pt.child('v').text();
      if (isDateFmt && raw) {
        values[idx] = excelSerialToDateString(parseFloat(raw));
      } else {
        values[idx] = raw;
      }
    }
  }

  return values;
}

export function excelSerialToDateString(serial: number): string {
  if (!Number.isFinite(serial) || serial < 1) return String(serial);
  const adjusted = serial > 59 ? serial - 1 : serial;
  const epochUtc = Date.UTC(1899, 11, 31);
  const date = new Date(epochUtc + adjusted * 86400000);
  return `${date.getUTCFullYear()}/${date.getUTCMonth() + 1}/${date.getUTCDate()}`;
}
