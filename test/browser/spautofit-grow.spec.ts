import { expect, test } from '@playwright/test';

test.use({ channel: process.env.PLAYWRIGHT_CHANNEL });

const panelParagraphs = [
  '<a:r><a:rPr lang="en-US" sz="1400" b="1"/><a:t>Alpha what can I do?</a:t></a:r>',
  ...[1, 2, 3, 4, 5].map(
    (index) =>
      `<a:pPr marL="228600" indent="-228600"><a:buAutoNum type="arabicPeriod"/></a:pPr><a:r><a:rPr lang="en-US" sz="1200"/><a:t>Step ${index} keeps the panel text readable at its stored size</a:t></a:r>`,
  ),
].join('</a:p><a:p>');

const renderPanel = (page: import('@playwright/test').Page, anchor: string) =>
  page.evaluate(
    async ({ anchor, runs }) => {
      const { parseXml } = await import('/src/parser/XmlParser.ts');
      const { parseShapeNode } = await import('/src/model/nodes/ShapeNode.ts');
      const { renderShape } = await import('/src/renderer/ShapeRenderer.ts');
      const { createMockRenderContext } = await import('/test/unit/helpers/mockContext.ts');
      const xml = `<p:sp xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:nvSpPr><p:cNvPr id="2" name="Panel"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="0" y="952500"/><a:ext cx="2743200" cy="762000"/></a:xfrm><a:prstGeom prst="roundRect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="1F3864"/></a:solidFill></p:spPr><p:txBody><a:bodyPr wrap="square" anchor="${anchor}"><a:spAutoFit/></a:bodyPr><a:lstStyle/><a:p>${runs}</a:p></p:txBody></p:sp>`;
      const element = renderShape(parseShapeNode(parseXml(xml)), createMockRenderContext());
      document.body.append(element);
      await document.fonts.ready;
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
      const spans = [...element.querySelectorAll('span')].filter((s) => s.textContent?.trim());
      const container = spans[0].closest('div')!.parentElement!;
      const box = element.getBoundingClientRect();
      const result = {
        fontSizes: [...new Set(spans.map((s) => getComputedStyle(s).fontSize))].sort(),
        transform: container.style.transform,
        top: box.top,
        bottom: box.bottom,
        height: box.height,
        textBottom: Math.max(...spans.map((s) => s.getBoundingClientRect().bottom)),
        svgHeight: Number(element.querySelector('svg')?.getAttribute('height')),
      };
      element.remove();
      return result;
    },
    { anchor, runs: panelParagraphs },
  );

test('multi-paragraph spAutoFit shape grows down with its text at the stored font size', async ({
  page,
}) => {
  await page.goto('/test/browser/blank.html');
  const result = await renderPanel(page, 't');
  expect(result.fontSizes).toEqual(['16px', '18.6667px']);
  expect(result.transform).toBe('');
  expect(result.top).toBe(100);
  expect(result.height).toBeGreaterThan(80 * 2.5);
  expect(result.svgHeight).toBeCloseTo(result.height, 0);
  expect(result.textBottom).toBeLessThanOrEqual(result.bottom);
});

for (const [anchor, share] of [
  ['ctr', 0.5],
  ['b', 1],
] as const) {
  test(`multi-paragraph spAutoFit shape anchored ${anchor} grows up by ${share} of the growth`, async ({
    page,
  }) => {
    await page.goto('/test/browser/blank.html');
    const result = await renderPanel(page, anchor);
    expect(result.transform).toBe('');
    expect(result.height).toBeGreaterThan(80 * 2.5);
    expect(result.top).toBeCloseTo(100 - (result.height - 80) * share, 0);
  });
}
