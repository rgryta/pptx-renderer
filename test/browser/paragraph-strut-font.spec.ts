import { expect, test } from '@playwright/test';

test.use({ channel: process.env.PLAYWRIGHT_CHANNEL });

test('text lines are exactly the line-height when the run font differs from the host font', async ({
  page,
}) => {
  await page.goto('/test/browser/blank.html');
  const result = await page.evaluate(async () => {
    const { renderTextBody } = await import('/src/renderer/TextRenderer.ts');
    const { xmlNode } = await import('/test/unit/helpers/xmlNode.ts');
    const { createMockRenderContext } = await import('/test/unit/helpers/mockContext.ts');

    // Installed sans faces with skewed vertical metrics, so a host-font strut inflates every line.
    const face = new FontFace(
      'Strut Probe',
      'local("Arial"), local("Liberation Sans"), local("Helvetica"), local("DejaVu Sans")',
      { ascentOverride: '150%', descentOverride: '10%' },
    );
    document.fonts.add(await face.load());
    document.body.style.fontFamily = 'serif';

    const container = document.createElement('div');
    container.style.width = '600px';
    renderTextBody(
      {
        bodyProperties: xmlNode('<bodyPr wrap="square"><noAutofit/></bodyPr>'),
        paragraphs: Array.from({ length: 10 }, (_, index) => ({
          properties: xmlNode('<pPr><lnSpc><spcPct val="100000"/></lnSpc></pPr>'),
          runs: [
            {
              text: `Line ${index + 1}`,
              properties: xmlNode('<rPr sz="2400"><latin typeface="Strut Probe"/></rPr>'),
            },
          ],
          level: 0,
        })),
      },
      undefined,
      createMockRenderContext(),
      container,
    );
    document.body.append(container);

    const paragraphs = Array.from(container.children) as HTMLElement[];
    return {
      lineHeight: parseFloat(getComputedStyle(paragraphs[0]).lineHeight),
      heights: paragraphs.map((paragraph) => paragraph.getBoundingClientRect().height),
      total: container.getBoundingClientRect().height,
    };
  });

  expect(result.heights).toHaveLength(10);
  for (const height of result.heights) {
    expect(Math.abs(height - result.lineHeight)).toBeLessThanOrEqual(1);
  }
  expect(Math.abs(result.total - 10 * result.lineHeight)).toBeLessThanOrEqual(1);
});
