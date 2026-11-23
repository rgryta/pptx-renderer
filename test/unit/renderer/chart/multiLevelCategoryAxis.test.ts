import { describe, expect, it } from 'vitest';
import {
  applyZeroCrossingAxisLabelLayout,
  parseChartXml,
} from '../../../../src/renderer/ChartRenderer';
import { extractCategoryLevels, extractStringValues } from '../../../../src/renderer/chart/format';
import { parseXml } from '../../../../src/parser/XmlParser';
import { createMockRenderContext } from '../../helpers/mockContext';

type Axis = {
  data?: string[];
  inverse?: boolean;
  nameGap?: number;
  offset?: number;
  z?: number;
  axisLabel?: { formatter?: (v: string) => string; margin?: number };
  axisTick?: { interval?: (i: number) => boolean; length?: number };
};

const NS =
  'xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"';

function pts(labels: Record<number, string>): string {
  return Object.entries(labels)
    .map(([idx, v]) => `<c:pt idx="${idx}"><c:v>${v}</c:v></c:pt>`)
    .join('');
}

function multiLevelCat(leafCount: number, groups: Record<number, string>, leafLevel = true) {
  const leaves = Object.fromEntries(Array.from({ length: leafCount }, (_, i) => [i, `L${i}`]));
  return `<c:cat><c:multiLvlStrRef><c:f>Sheet1!$A$2:$B$${leafCount + 1}</c:f><c:multiLvlStrCache>
    <c:ptCount val="${leafCount}"/>
    <c:lvl>${leafLevel ? pts(leaves) : ''}</c:lvl>
    <c:lvl>${pts(groups)}</c:lvl>
  </c:multiLvlStrCache></c:multiLvlStrRef></c:cat>`;
}

function singleLevelCat(leafCount: number) {
  const leaves = Object.fromEntries(Array.from({ length: leafCount }, (_, i) => [i, `L${i}`]));
  return `<c:cat><c:strRef><c:strCache><c:ptCount val="${leafCount}"/>${pts(leaves)}</c:strCache></c:strRef></c:cat>`;
}

function chartXml(opts: {
  cat: string;
  leafCount: number;
  type?: 'bar' | 'line' | 'area';
  barDir?: 'col' | 'bar';
  catAxExtra?: string;
  values?: number[];
  chartSpaceExtra?: string;
}) {
  const { type = 'bar', barDir = 'col', catAxExtra = '', chartSpaceExtra = '' } = opts;
  const values = pts(
    Object.fromEntries(
      Array.from({ length: opts.leafCount }, (_, i) => [i, opts.values?.[i] ?? i + 1]),
    ),
  );
  const tag = `${type}Chart`;
  return `<c:chartSpace ${NS}><c:chart><c:autoTitleDeleted val="1"/><c:plotArea>
    <c:${tag}>${type === 'bar' ? `<c:barDir val="${barDir}"/>` : ''}<c:grouping val="clustered"/>
      <c:ser><c:idx val="0"/><c:order val="0"/>${opts.cat}
        <c:val><c:numRef><c:numCache><c:ptCount val="${opts.leafCount}"/>${values}</c:numCache></c:numRef></c:val>
      </c:ser><c:axId val="1"/><c:axId val="2"/>
    </c:${tag}>
    <c:catAx><c:axId val="1"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/>
      <c:axPos val="b"/><c:tickLblPos val="nextTo"/>${catAxExtra}<c:crossAx val="2"/></c:catAx>
    <c:valAx><c:axId val="2"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/>
      <c:axPos val="l"/><c:crossAx val="1"/></c:valAx>
  </c:plotArea></c:chart>${chartSpaceExtra}</c:chartSpace>`;
}

function parse(xml: string) {
  return parseChartXml(parseXml(xml), createMockRenderContext()).option;
}

function groupRow(axis: Axis) {
  const labels = (axis.data ?? [])
    .map((v, slot) => ({ slot, text: axis.axisLabel?.formatter?.(v) ?? v }))
    .filter((l) => l.text !== '');
  const ticks = (axis.data ?? []).map((_, i) => i).filter((i) => axis.axisTick?.interval?.(i));
  return { labels, ticks, slots: axis.data?.length };
}

describe('two-level category axis', () => {
  it('centres five group labels under 4-leaf spans and separates them with ticks', () => {
    const groups = { 0: 'FY21', 4: 'FY22', 8: 'FY23', 12: 'FY24', 16: 'FY25' };
    const option = parse(chartXml({ cat: multiLevelCat(20, groups), leafCount: 20 }));
    const [leaf, group] = option.xAxis as Axis[];

    expect(leaf.data).toEqual(Array.from({ length: 20 }, (_, i) => `L${i}`));
    // 20 bands -> 41 half-band slots; a span [s, e) is centred on slot s + e.
    expect(groupRow(group)).toEqual({
      slots: 41,
      labels: [
        { slot: 4, text: '\nFY21' },
        { slot: 12, text: '\nFY22' },
        { slot: 20, text: '\nFY23' },
        { slot: 28, text: '\nFY24' },
        { slot: 36, text: '\nFY25' },
      ],
      ticks: [0, 8, 16, 24, 32, 40],
    });
  });

  it('centres labels under unequal spans', () => {
    const groups = { 11: 'D', 0: 'A', 4: 'B', 8: 'C' };
    const option = parse(chartXml({ cat: multiLevelCat(16, groups), leafCount: 16, type: 'line' }));
    const group = (option.xAxis as Axis[])[1];

    expect(groupRow(group).labels.map((l) => l.slot / 2)).toEqual([2, 6, 9.5, 13.5]);
    expect(groupRow(group).ticks).toEqual([0, 8, 16, 22, 32]);
  });

  it('places area-chart groups on leaf ticks rather than bands', () => {
    const option = parse(
      chartXml({ cat: multiLevelCat(4, { 0: 'A', 2: 'B' }), leafCount: 4, type: 'area' }),
    );
    const group = (option.xAxis as Axis[])[1];

    // Leaves sit on slots 0, 2, 4, 6; A spans leaves 0-1, B spans 2-3.
    expect(groupRow(group)).toEqual({
      slots: 7,
      labels: [
        { slot: 1, text: '\nA' },
        { slot: 5, text: '\nB' },
      ],
      ticks: [0, 3, 6],
    });
  });

  it('follows a reversed category axis and moves the axis title below the group row', () => {
    const title =
      '<c:title><c:tx><c:rich><a:bodyPr/><a:p><a:r><a:t>Period</a:t></a:r></a:p></c:rich></c:tx></c:title>';
    const option = parse(
      chartXml({
        cat: multiLevelCat(4, { 0: 'A', 2: 'B' }),
        leafCount: 4,
        catAxExtra: title,
      }).replace(
        '<c:orientation val="minMax"/></c:scaling><c:delete',
        '<c:orientation val="maxMin"/></c:scaling><c:delete',
      ),
    );
    const [leaf, group] = option.xAxis as Axis[];

    expect(group.inverse).toBe(true);
    expect(leaf.nameGap).toBeGreaterThan(28);
  });

  it('moves the group row and its ticks with leaf labels that follow the zero line', () => {
    const option = parse(
      chartXml({
        cat: multiLevelCat(4, { 0: 'A', 2: 'B' }),
        leafCount: 4,
        values: [15, -8, 5, -3],
        catAxExtra: '<c:crosses val="autoZero"/>',
      }),
    );
    applyZeroCrossingAxisLabelLayout(option, { w: 400, h: 300 });
    const [leaf, group] = option.xAxis as Axis[];

    expect(leaf.axisLabel?.margin).toBeLessThan(-50);
    expect(group.offset).toBe(leaf.axisLabel!.margin! - 8);
    expect(group.z).toBe(leaf.z);
  });

  it('sizes the group row from the chart default font size', () => {
    const title =
      '<c:title><c:tx><c:rich><a:bodyPr/><a:p><a:r><a:t>Period</a:t></a:r></a:p></c:rich></c:tx></c:title>';
    const option = parse(
      chartXml({
        cat: multiLevelCat(4, { 0: 'A', 2: 'B' }),
        leafCount: 4,
        catAxExtra: title,
        chartSpaceExtra:
          '<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1800"/></a:pPr></a:p></c:txPr>',
      }),
    );
    const [leaf, group] = option.xAxis as Axis[];
    const rowPx = Math.round(24 * 1.2);

    expect(group.axisTick?.length).toBe(8 + 2 * rowPx);
    expect(leaf.nameGap).toBe(28 + rowPx);
  });

  describe('leaf-only cases match the single-level option exactly', () => {
    const groups = { 0: 'A', 4: 'B' };
    const json = (xml: string) => JSON.stringify(parse(xml));
    const twoLevel = chartXml({ cat: multiLevelCat(8, groups), leafCount: 8 });

    it('draws the group row for a plain multi-level column chart', () => {
      expect(json(twoLevel)).not.toEqual(json(chartXml({ cat: singleLevelCat(8), leafCount: 8 })));
    });

    it('shows the leaf row only when noMultiLvlLbl is set', () => {
      const extra = '<c:noMultiLvlLbl val="1"/>';
      expect(Array.isArray(parse(twoLevel).xAxis)).toBe(true);
      expect(
        json(chartXml({ cat: multiLevelCat(8, groups), leafCount: 8, catAxExtra: extra })),
      ).toEqual(json(chartXml({ cat: singleLevelCat(8), leafCount: 8, catAxExtra: extra })));
    });

    it('keeps horizontal bars leaf-only', () => {
      expect(Array.isArray(parse(twoLevel).xAxis)).toBe(true);
      expect(
        json(chartXml({ cat: multiLevelCat(8, groups), leafCount: 8, barDir: 'bar' })),
      ).toEqual(json(chartXml({ cat: singleLevelCat(8), leafCount: 8, barDir: 'bar' })));
    });

    it('leaves a single-level chart with a plain category axis', () => {
      expect(Array.isArray(parse(twoLevel).xAxis)).toBe(true);
      const option = parse(chartXml({ cat: singleLevelCat(8), leafCount: 8 }));
      expect(Array.isArray(option.xAxis)).toBe(false);
      expect((option.xAxis as Axis).data).toEqual(Array.from({ length: 8 }, (_, i) => `L${i}`));
    });
  });
});

describe('extractCategoryLevels', () => {
  it('sorts group starts, drops starts past ptCount and leaves a leading span unlabeled', () => {
    const node = parseXml(
      `<c:root ${NS}>${multiLevelCat(6, { 4: 'B', 2: 'A', 9: 'X' })}</c:root>`,
    ).child('cat');

    expect(extractCategoryLevels(node)).toEqual([
      [
        { label: 'A', start: 2, end: 4 },
        { label: 'B', start: 4, end: 6 },
      ],
    ]);
  });

  it('uses the outer level as the leaf row when the leaf level is empty', () => {
    const node = parseXml(
      `<c:root ${NS}>${multiLevelCat(4, { 0: 'A', 2: 'B' }, false)}</c:root>`,
    ).child('cat');

    expect(extractStringValues(node)).toEqual(['A', '', 'B', '']);
    expect(extractCategoryLevels(node)).toEqual([]);
  });
});
