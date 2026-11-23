import { expect, test } from '@playwright/test';

test.use({ channel: process.env.PLAYWRIGHT_CHANNEL });

const renderTitle = (page: import('@playwright/test').Page, cy: number) =>
  page.evaluate(async (cy) => {
    const { parseXml } = await import('/src/parser/XmlParser.ts');
    const { parseShapeNode } = await import('/src/model/nodes/ShapeNode.ts');
    const { renderShape } = await import('/src/renderer/ShapeRenderer.ts');
    const { createMockRenderContext } = await import('/test/unit/helpers/mockContext.ts');
    const xml = `<p:sp xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:nvSpPr><p:cNvPr id="2" name="Title"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="3657600" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr><p:txBody><a:bodyPr wrap="square"><a:spAutoFit/></a:bodyPr><a:lstStyle/><a:p><a:pPr algn="ctr"><a:lnSpc><a:spcPts val="6720"/></a:lnSpc></a:pPr><a:r><a:rPr lang="en-US" sz="4800"/><a:t>Quarterly outlook</a:t></a:r></a:p></p:txBody></p:sp>`;
    const element = renderShape(parseShapeNode(parseXml(xml)), createMockRenderContext());
    document.body.append(element);
    await document.fonts.ready;
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    const span = [...element.querySelectorAll('span')].find((s) => s.textContent?.trim())!;
    const tops = [...new Set([...span.getClientRects()].map((r) => Math.round(r.top)))];
    const result = {
      lines: tops.length,
      pitch: tops.length > 1 ? tops[1] - tops[0] : 0,
      lineHeight: getComputedStyle(span.closest('div')!).lineHeight,
    };
    element.remove();
    return result;
  }, cy);

test('a wrapped spAutoFit title whose stored height holds two lines keeps its fixed line pitch', async ({
  page,
}) => {
  await page.goto('/test/browser/blank.html');
  const result = await renderTitle(page, 1798320);
  expect(result.lines).toBe(2);
  expect(result.lineHeight).toBe('89.6px');
  expect(result.pitch).toBeGreaterThanOrEqual(89);
});

test('a spAutoFit title whose stored height holds one line keeps the compact line height', async ({
  page,
}) => {
  await page.goto('/test/browser/blank.html');
  const result = await renderTitle(page, 944880);
  expect(result.lineHeight).toBe('normal');
});
