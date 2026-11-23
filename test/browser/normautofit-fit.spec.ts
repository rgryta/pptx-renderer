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
) =>
  page.evaluate(
    async ({ body, runs, heightPx }) => {
      const { renderTextFixture } = await import('/test/fixtures/text-coverage.ts');
      const { element, span, container } = renderTextFixture(
        `<a:bodyPr wrap="square">${body}</a:bodyPr>`,
        '',
        '',
        '',
        runs,
        undefined,
        { cx: 2743200, cy: heightPx * 9525 },
      );
      document.body.append(element);
      await document.fonts.ready;
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
      const box = element.getBoundingClientRect();
      const spans = [...container.querySelectorAll('span')];
      return {
        fontSize: getComputedStyle(span).fontSize,
        transform: container.style.transform,
        overflow: Math.max(...spans.map((s) => s.getBoundingClientRect().bottom)) - box.bottom,
      };
    },
    { body, runs, heightPx },
  );

test('stale stored fontScale on text that fits at 100% renders at full size', async ({ page }) => {
  await page.goto('/test/browser/blank.html');
  const result = await renderFit(
    page,
    '<a:normAutofit fontScale="25000" lnSpcReduction="20000"/>',
    paragraphs(2, 1200),
    144,
  );
  expect(result).toEqual({ fontSize: '16px', transform: '', overflow: expect.any(Number) });
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
