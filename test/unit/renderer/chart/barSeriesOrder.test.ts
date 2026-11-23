import { describe, expect, it } from 'vitest';
import { parseChartXml } from '../../../../src/renderer/ChartRenderer';
import { buildCustomLegendOverlay } from '../../../../src/renderer/chart/legendOverlay';
import { parseXml } from '../../../../src/parser/XmlParser';
import { createMockRenderContext } from '../../helpers/mockContext';

type BarSeries = { name: string; itemStyle?: { color?: unknown } };

function seriesXml(idx: number, name: string, fill?: string): string {
  const spPr = fill ? `<c:spPr><a:solidFill><a:srgbClr val="${fill}"/></a:solidFill></c:spPr>` : '';
  return `<c:ser><c:idx val="${idx}"/><c:order val="${idx}"/>
    <c:tx><c:strRef><c:strCache><c:ptCount val="1"/><c:pt idx="0"><c:v>${name}</c:v></c:pt></c:strCache></c:strRef></c:tx>
    ${spPr}
    <c:cat><c:strRef><c:strCache><c:ptCount val="2"/>
      <c:pt idx="0"><c:v>P</c:v></c:pt><c:pt idx="1"><c:v>Q</c:v></c:pt>
    </c:strCache></c:strRef></c:cat>
    <c:val><c:numRef><c:numCache><c:ptCount val="2"/>
      <c:pt idx="0"><c:v>${idx + 1}</c:v></c:pt><c:pt idx="1"><c:v>${idx + 3}</c:v></c:pt>
    </c:numCache></c:numRef></c:val></c:ser>`;
}

function barChartXml(opts: {
  barDir?: string;
  grouping?: string;
  overlap?: number;
  orientation?: string;
  fills?: (string | undefined)[];
  legend?: boolean;
}): string {
  const {
    barDir = 'bar',
    grouping = 'clustered',
    overlap,
    orientation = 'minMax',
    fills = ['AA0000', '00AA00'],
    legend = true,
  } = opts;
  const overlapXml = overlap !== undefined ? `<c:overlap val="${overlap}"/>` : '';
  return `<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart"
      xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
    <c:chart><c:autoTitleDeleted val="1"/><c:plotArea>
      <c:barChart><c:barDir val="${barDir}"/><c:grouping val="${grouping}"/>
        ${fills.map((fill, idx) => seriesXml(idx, `S${idx + 1}`, fill)).join('')}
        <c:gapWidth val="150"/>${overlapXml}
        <c:axId val="1"/><c:axId val="2"/>
      </c:barChart>
      <c:catAx><c:axId val="1"/><c:scaling><c:orientation val="${orientation}"/></c:scaling>
        <c:axPos val="l"/><c:crossAx val="2"/></c:catAx>
      <c:valAx><c:axId val="2"/><c:scaling><c:orientation val="minMax"/></c:scaling>
        <c:axPos val="b"/><c:crossAx val="1"/></c:valAx>
    </c:plotArea>${legend ? '<c:legend><c:legendPos val="r"/></c:legend>' : ''}</c:chart>
  </c:chartSpace>`;
}

function parse(xml: string) {
  const { option } = parseChartXml(parseXml(xml), createMockRenderContext(), undefined, {
    w: 480,
    h: 320,
  });
  const series = option.series as BarSeries[];
  return {
    option,
    names: series.map((s) => s.name),
    colors: series.map((s) => s.itemStyle?.color),
  };
}

describe('horizontal clustered bar series order', () => {
  it('reverses series for a minMax category axis and keeps each series colour', () => {
    const { names, colors } = parse(barChartXml({}));

    expect(names).toEqual(['S2', 'S1']);
    expect(colors).toEqual(['#00AA00', '#AA0000']);
  });

  it('keeps palette colours with theme-coloured series after the reversal', () => {
    const { option, names, colors } = parse(barChartXml({ fills: [undefined, undefined] }));
    const palette = option.color as string[];

    expect(palette[0]).not.toBe(palette[1]);
    expect(names).toEqual(['S2', 'S1']);
    expect(colors).toEqual([palette[1], palette[0]]);
  });

  it('keeps the legend in file order with each swatch on its own series colour', () => {
    const { option } = parse(barChartXml({ fills: [undefined, undefined] }));
    const palette = option.color as string[];
    const legend = option.legend as { data: unknown[] };

    expect(legend.data).toEqual(['S1', 'S2']);
    const overlay = buildCustomLegendOverlay(option, { w: 480, h: 320 });
    const labels = [...(overlay?.querySelectorAll('span') ?? [])].map((n) => n.textContent);
    const fills = [...(overlay?.querySelectorAll('svg [fill]') ?? [])].map((n) =>
      n.getAttribute('fill'),
    );
    expect(labels.filter((t) => t === 'S1' || t === 'S2')).toEqual(['S1', 'S2']);
    expect(fills).toEqual([palette[0], palette[1]]);
  });

  it.each([
    ['maxMin category axis', { orientation: 'maxMin' }],
    ['overlap 100', { overlap: 100 }],
    ['vertical bars', { barDir: 'col' }],
    ['stacked bars', { grouping: 'stacked', overlap: 100 }],
  ])('keeps file order for %s', (_label, opts) => {
    const themed = parse(barChartXml({ ...opts, fills: [undefined, undefined] }));
    const explicit = parse(barChartXml(opts));

    expect(themed.names).toEqual(['S1', 'S2']);
    expect(themed.colors).toEqual([undefined, undefined]);
    expect(explicit.colors).toEqual(['#AA0000', '#00AA00']);
  });
});
