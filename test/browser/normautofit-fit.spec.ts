import { expect, test } from '@playwright/test';

test.use({ channel: process.env.PLAYWRIGHT_CHANNEL });

const paragraphs = (count: number, size: number) =>
  Array.from(
    { length: count },
    (_, index) =>
      `<a:r><a:rPr sz="${size}"/><a:t>Alpha ${index + 1} item text that runs along</a:t></a:r>`,
  ).join('</a:p><a:p>');

const renderFit = (
  page: import('@playwright/test').Page,
  body: string,
  runs: string,
  heightPx: number,
  list = '',
  widthPx = 288,
  bodyAttributes = '',
) =>
  page.evaluate(
    async ({ body, runs, heightPx, list, widthPx, bodyAttributes }) => {
      const { renderTextFixture } = await import('/test/fixtures/text-coverage.ts');
      const { element, span, container } = renderTextFixture(
        `<a:bodyPr wrap="square"${bodyAttributes}>${body}</a:bodyPr>`,
        '',
        list,
        '',
        runs,
        undefined,
        { cx: widthPx * 9525, cy: heightPx * 9525 },
      );
      document.body.append(element);
      await document.fonts.ready;
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
      const box = element.getBoundingClientRect();
      const rects = [...container.querySelectorAll('span')]
        .filter((s) => s.textContent?.trim())
        .map((s) => s.getBoundingClientRect());
      return {
        fontSize: getComputedStyle(span).fontSize,
        transform: container.style.transform,
        overflow: Math.max(...rects.map((rect) => rect.bottom)) - box.bottom,
        underflow: box.top - Math.min(...rects.map((rect) => rect.top)),
      };
    },
    { body, runs, heightPx, list, widthPx, bodyAttributes },
  );

test('stale stored fontScale on text that fits at 100% renders at full size', async ({ page }) => {
  await page.goto('/test/browser/blank.html');
  const result = await renderFit(
    page,
    '<a:normAutofit fontScale="25000" lnSpcReduction="20000"/>',
    paragraphs(2, 1200),
    144,
  );
  expect(result).toMatchObject({ fontSize: '16px', transform: '' });
  expect(result.overflow).toBeLessThan(0);
});

test('stored fontScale that fits while 100% overflows stays as stored', async ({ page }) => {
  await page.goto('/test/browser/blank.html');
  const result = await renderFit(
    page,
    '<a:normAutofit fontScale="85000" lnSpcReduction="10000"/>',
    paragraphs(12, 1200),
    200,
  );
  expect(result.fontSize).toBe('13.6px');
  expect(result.transform).toBe('');
});

for (const [name, body, size] of [
  ['without a stored scale', '<a:normAutofit/>', 1000],
  ['after a stored scale', '<a:normAutofit fontScale="85000" lnSpcReduction="10000"/>', 1200],
] as const) {
  test(`normAutofit text slightly taller than the box shrinks to fit ${name}`, async ({ page }) => {
    await page.goto('/test/browser/blank.html');
    const result = await renderFit(page, body, paragraphs(12, size), 180);
    expect(result.transform).toMatch(/^scale\(0\.9\d*\)$/);
    expect(result.overflow).toBeLessThanOrEqual(1);
  });
}

test('stale stored fontScale whose render still overflows fits the full-size render by measurement', async ({
  page,
}) => {
  await page.goto('/test/browser/blank.html');
  const result = await renderFit(
    page,
    '<a:normAutofit fontScale="25000" lnSpcReduction="20000"/>',
    paragraphs(8, 1900),
    179,
    '<a:lvl1pPr><a:spcBef><a:spcPts val="2000"/></a:spcBef></a:lvl1pPr>',
    433,
  );
  expect(result.fontSize).toBe('25.3333px');
  const scale = Number(/^scale\(([\d.]+)\)$/.exec(result.transform)?.[1]);
  expect(scale).toBeGreaterThanOrEqual(0.25);
  expect(scale).toBeLessThan(1);
  expect(result.overflow).toBeLessThanOrEqual(1);
});

test('stale stored fontScale ignores trailing empty paragraphs when fitting visible text', async ({
  page,
}) => {
  await page.goto('/test/browser/blank.html');
  const lines = [
    ...paragraphs(6, 1900).split('</a:p><a:p>'),
    '<a:endParaRPr sz="6400"/>',
    ...Array.from({ length: 22 }, () => '<a:endParaRPr sz="1900"/>'),
  ];
  const result = await renderFit(
    page,
    '<a:normAutofit fontScale="25000" lnSpcReduction="20000"/>',
    lines.join('</a:p><a:p>'),
    179,
    '<a:lvl1pPr><a:spcBef><a:spcPts val="1000"/></a:spcBef></a:lvl1pPr>',
    433,
    ' anchor="ctr"',
  );
  const scale = Number(/^scale\(([\d.]+)\)$/.exec(result.transform)?.[1] ?? 1);
  expect(parseFloat(result.fontSize) * scale).toBeGreaterThanOrEqual(2 * 0.25 * (1900 / 75));
  expect(result.overflow).toBeLessThanOrEqual(1);
  expect(result.underflow).toBeLessThanOrEqual(1);
});
