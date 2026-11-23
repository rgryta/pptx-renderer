import { expect, test } from '@playwright/test';

test.use({ channel: process.env.PLAYWRIGHT_CHANNEL });

const rowPx = 330200 / 9525;

const measureRows = (page: import('@playwright/test').Page, tallRow: number) =>
  page.evaluate(
    async ({ tallRow }) => {
      const { parseXml } = await import('/src/parser/XmlParser.ts');
      const { parseTableNode } = await import('/src/model/nodes/TableNode.ts');
      const { renderTable } = await import('/src/renderer/TableRenderer.ts');
      const { createMockRenderContext } = await import('/test/unit/helpers/mockContext.ts');
      const cell = (text: string) =>
        `<a:tc><a:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" sz="1000"/><a:t>${text}</a:t></a:r></a:p></a:txBody><a:tcPr marT="25400" marB="25400"/></a:tc>`;
      const rows = Array.from(
        { length: 15 },
        (_, index) =>
          `<a:tr h="330200">${cell(index === tallRow ? Array(40).fill('grow').join(' ') : `Row ${index + 1}`)}</a:tr>`,
      ).join('');
      const frame = parseXml(
        `<p:graphicFrame xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:xfrm><a:off x="0" y="0"/><a:ext cx="1905000" cy="4953000"/></p:xfrm><a:graphic><a:graphicData><a:tbl><a:tblPr/><a:tblGrid><a:gridCol w="1905000"/></a:tblGrid>${rows}</a:tbl></a:graphicData></a:graphic></p:graphicFrame>`,
      );
      const element = renderTable(parseTableNode(frame), createMockRenderContext());
      document.body.append(element);
      await document.fonts.ready;
      const heights = [...element.querySelectorAll('tr')].map(
        (tr) => tr.getBoundingClientRect().height,
      );
      element.remove();
      return heights;
    },
    { tallRow },
  );

test('table rows of equal height measure equal', async ({ page }) => {
  await page.goto('/test/browser/blank.html');
  const heights = await measureRows(page, -1);
  expect(heights).toHaveLength(15);
  for (const height of heights) expect(height).toBeCloseTo(rowPx, 0);
});

test('an over-tall cell grows only its own row', async ({ page }) => {
  await page.goto('/test/browser/blank.html');
  const heights = await measureRows(page, 2);
  expect(heights[2]).toBeGreaterThan(rowPx * 2);
  for (const [index, height] of heights.entries()) {
    if (index !== 2) expect(height).toBeCloseTo(rowPx, 0);
  }
});
