import { describe, expect, it } from 'vitest';
import { parseXml } from '../../../src/parser/XmlParser';
import { parseShapeNode } from '../../../src/model/nodes/ShapeNode';
import { renderShape } from '../../../src/renderer/ShapeRenderer';
import { createMockRenderContext } from '../helpers/mockContext';

const NS =
  'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"';
const STOPS =
  '<a:gsLst><a:gs pos="0"><a:srgbClr val="FF0000"/></a:gs><a:gs pos="100000"><a:srgbClr val="0000FF"/></a:gs></a:gsLst>';

function gradFill(rotWithShape: string | null, body = '<a:lin ang="5400000" scaled="0"/>'): string {
  const attr = rotWithShape === null ? '' : ` rotWithShape="${rotWithShape}"`;
  return `<a:gradFill${attr}>${STOPS}${body}</a:gradFill>`;
}

function shapeXml(xfrmAttrs: string, fill: string, extra = ''): string {
  return `
    <p:sp ${NS}>
      <p:nvSpPr><p:cNvPr id="1" name="Arrow"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
      <p:spPr>
        <a:xfrm ${xfrmAttrs}><a:off x="0" y="0"/><a:ext cx="1905000" cy="952500"/></a:xfrm>
        <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
        ${fill}
      </p:spPr>
      ${extra}
    </p:sp>`;
}

function render(xml: string, ctx = createMockRenderContext()): HTMLElement {
  return renderShape(parseShapeNode(parseXml(xml)), ctx);
}

function linearVector(el: HTMLElement): number[] {
  const gradient = el.querySelector('linearGradient[id^="grad-fill-"]');
  expect(gradient).not.toBeNull();
  return ['x1', 'y1', 'x2', 'y2'].map((name) => Number(gradient!.getAttribute(name)));
}

function expectVector(actual: number[], expected: number[]): void {
  actual.forEach((value, i) => expect(value).toBeCloseTo(expected[i], 6));
}

const TOP_TO_BOTTOM = [100, 0, 100, 100];
const BOTTOM_TO_TOP = [100, 100, 100, 0];

describe('renderShape gradient rotWithShape', () => {
  it.each(['0', 'false'])('counters a 180 degree rotation when rotWithShape="%s"', (value) => {
    const el = render(shapeXml('rot="10800000"', gradFill(value)));

    expectVector(linearVector(el), BOTTOM_TO_TOP);
  });

  it.each([null, '1', 'true'])('turns with the shape when rotWithShape is %s', (value) => {
    const el = render(shapeXml('rot="10800000"', gradFill(value)));

    expectVector(linearVector(el), TOP_TO_BOTTOM);
  });

  it('counters a 90 degree rotation on a non-square shape', () => {
    const el = render(shapeXml('rot="5400000"', gradFill('0')));

    expectVector(linearVector(el), [0, 50, 200, 50]);
  });

  it('mirrors the angle for flipH', () => {
    const el = render(shapeXml('flipH="1"', gradFill('0', '<a:lin ang="0" scaled="0"/>')));

    expectVector(linearVector(el), [200, 50, 0, 50]);
  });

  it('mirrors the angle for flipV', () => {
    const el = render(shapeXml('flipV="1"', gradFill('0')));

    expectVector(linearVector(el), BOTTOM_TO_TOP);
  });

  it('applies to a theme fillRef gradient', () => {
    const theme = createMockRenderContext().theme;
    const ctx = createMockRenderContext({
      theme: {
        ...theme,
        fillStyles: [parseXml(`<a:root ${NS}>${gradFill('0')}</a:root>`).child('gradFill')],
      },
    });
    const style =
      '<p:style><a:lnRef idx="0"><a:schemeClr val="accent1"/></a:lnRef><a:fillRef idx="1"><a:schemeClr val="accent1"/></a:fillRef><a:effectRef idx="0"><a:schemeClr val="accent1"/></a:effectRef><a:fontRef idx="minor"/></p:style>';

    const el = render(shapeXml('rot="10800000"', '', style), ctx);

    expectVector(linearVector(el), BOTTOM_TO_TOP);
  });

  it('applies to a group fill gradient', () => {
    const ctx = createMockRenderContext({
      groupFillNode: parseXml(`<p:grpSpPr ${NS}>${gradFill('0')}</p:grpSpPr>`),
    });

    const el = render(shapeXml('rot="10800000"', '<a:grpFill/>'), ctx);

    expectVector(linearVector(el), BOTTOM_TO_TOP);
  });

  it('remaps the radial centre through the counter rotation', () => {
    const path =
      '<a:path path="circle"><a:fillToRect l="20000" t="30000" r="80000" b="70000"/></a:path>';
    const el = render(shapeXml('rot="10800000"', gradFill('0', path)));

    const gradient = el.querySelector('radialGradient');
    expect(gradient).not.toBeNull();
    expect(Number(gradient!.getAttribute('cx'))).toBeCloseTo(0.8 * 200, 6);
    expect(Number(gradient!.getAttribute('cy'))).toBeCloseTo(0.7 * 100, 6);
  });
});
