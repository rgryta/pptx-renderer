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
        columnTop:
          container.firstElementChild!.getBoundingClientRect().top -
          parseFloat(getComputedStyle(container.firstElementChild!).marginTop) -
          box.top,
        columnBottom:
          box.bottom -
          container.lastElementChild!.getBoundingClientRect().bottom -
          parseFloat(getComputedStyle(container.lastElementChild!).marginBottom),
        fontSize: getComputedStyle(span).fontSize,
        transform: container.style.transform,
        overflowY: getComputedStyle(container).overflowY,
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

for (const heightPx of [189, 180]) {
  test(`normAutofit without a stored scale keeps 100% for an overflow under 10% at ${heightPx}px`, async ({
    page,
  }) => {
    await page.goto('/test/browser/blank.html');
    const result = await renderFit(page, '<a:normAutofit/>', paragraphs(12, 1000), heightPx);
    expect(result).toMatchObject({ fontSize: '13.3333px', transform: '', overflowY: 'visible' });
    expect(result.overflow).toBeGreaterThan(0);
  });
}

test('normAutofit text over 10% taller than the box shrinks to fit without a stored scale', async ({
  page,
}) => {
  await page.goto('/test/browser/blank.html');
  const result = await renderFit(page, '<a:normAutofit/>', paragraphs(12, 1000), 170);
  expect(result.transform).toMatch(/^scale\(0\.8\d*\)$/);
  expect(result.fontSize).toBe('13.3333px');
  expect(result.overflow).toBeLessThanOrEqual(1);
});

test('stored fontScale that overflows slightly keeps the stored render unclipped', async ({
  page,
}) => {
  await page.goto('/test/browser/blank.html');
  const result = await renderFit(
    page,
    '<a:normAutofit fontScale="85000" lnSpcReduction="10000"/>',
    paragraphs(12, 1200),
    175,
  );
  expect(result).toMatchObject({ fontSize: '13.6px', transform: '', overflowY: 'visible' });
});

test('stale stored fontScale that overflows at every font scale keeps the stored render unclipped', async ({
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
  expect(result).toMatchObject({ fontSize: '6.33333px', transform: '', overflowY: 'visible' });
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

test('normAutofit line reduction without a stored scale keeps blank lines from shrinking the text', async ({
  page,
}) => {
  await page.goto('/test/browser/blank.html');
  const lines = [
    ...paragraphs(4, 1000).split('</a:p><a:p>'),
    ...Array.from({ length: 12 }, () => '<a:endParaRPr sz="1900"/>'),
  ];
  const result = await renderFit(
    page,
    '<a:normAutofit lnSpcReduction="10000"/>',
    lines.join('</a:p><a:p>'),
    200,
    '',
    288,
    ' anchor="b"',
  );
  expect(result).toMatchObject({ fontSize: '13.3333px', transform: '', overflowY: 'visible' });
  expect(result.columnBottom).toBeGreaterThanOrEqual(0);
  expect(result.underflow).toBeGreaterThan(0);
});

type Box = {
  body: string;
  runs: string;
  width: number;
  height: number;
  flipH?: boolean;
  list?: string;
  top?: number;
};

const renderBoxes = (page: import('@playwright/test').Page, boxes: Box[]) =>
  page.evaluate(async (boxes) => {
    const { renderTextFixture } = await import('/test/fixtures/text-coverage.ts');
    const { renderShape } = await import('/src/renderer/ShapeRenderer.ts');
    let left = 0;
    const rendered = boxes.map((box) => {
      const fixture = renderTextFixture(box.body, '', box.list ?? '', '', box.runs, undefined, {
        cx: box.width * 9525,
        cy: box.height * 9525,
      });
      fixture.node.flipH = !!box.flipH;
      const element = box.flipH ? renderShape(fixture.node, fixture.ctx) : fixture.element;
      element.style.left = `${left}px`;
      element.style.top = `${box.top ?? 0}px`;
      left += box.width + 27;
      document.body.append(element);
      return element;
    });
    await document.fonts.ready;
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    return rendered.map((element) => {
      const box = element.getBoundingClientRect();
      const spans = [...element.querySelectorAll('span')].filter((s) => s.textContent?.trim());
      const rects = spans.map((s) => s.getBoundingClientRect());
      const container = spans[0].closest('div')!.parentElement!;
      const charLeft = (offset: number) => {
        const range = document.createRange();
        range.setStart(spans[0].firstChild!, offset);
        range.setEnd(spans[0].firstChild!, offset + 1);
        return range.getBoundingClientRect().left;
      };
      const containerRect = container.getBoundingClientRect();
      const lines = spans.flatMap((span) => [...span.getClientRects()]);
      return {
        fontSize: parseFloat(getComputedStyle(spans[0]).fontSize),
        columnTop:
          container.firstElementChild!.getBoundingClientRect().top -
          parseFloat(getComputedStyle(container.firstElementChild!).marginTop) -
          box.top,
        columnBottom:
          box.bottom -
          container.lastElementChild!.getBoundingClientRect().bottom -
          parseFloat(getComputedStyle(container.lastElementChild!).marginBottom),
        lineHeight: spans[0].closest('div')!.style.lineHeight,
        clippedLines:
          getComputedStyle(container).overflowY === 'visible'
            ? 0
            : lines.filter(
                (line) =>
                  line.top < containerRect.top - 0.5 || line.bottom > containerRect.bottom + 0.5,
              ).length,
        transform: container.style.transform,
        firstLineChars: spans[0].getClientRects().length,
        firstLineTop: rects[0].top - box.top,
        lastLineBottom: box.bottom - rects[rects.length - 1].bottom,
        contentOverflow: container.scrollHeight - container.clientHeight,
        leftToRight: charLeft(0) < charLeft(4),
        outside: Math.max(
          box.left - Math.min(...rects.map((rect) => rect.left)),
          Math.max(...rects.map((rect) => rect.right)) - box.right,
          box.top - Math.min(...rects.map((rect) => rect.top)),
          Math.max(...rects.map((rect) => rect.bottom)) - box.bottom,
        ),
      };
    });
  }, boxes);

const stalePlaceholderBoxes = (
  size: number,
  texts: string[],
  empties: number,
  list = '',
  leadingEmpties = 0,
  anchor = 'ctr',
) => {
  const runs = [
    ...Array.from({ length: leadingEmpties }, () => '<a:endParaRPr sz="1900"/>'),
    ...texts.map((text) => `<a:r><a:rPr sz="${size}"/><a:t>${text}</a:t></a:r>`),
    '<a:endParaRPr sz="6400"/>',
    ...Array.from({ length: empties }, () => '<a:endParaRPr sz="1900"/>'),
  ].join('</a:p><a:p>');
  const body = `<a:bodyPr vert="horz" wrap="square" anchor="${anchor}"><a:normAutofit fontScale="25000" lnSpcReduction="20000"/></a:bodyPr>`;
  return [false, false, true].map((flipH) => ({
    body,
    runs,
    list,
    width: 433,
    height: 179,
    top: 194,
    flipH,
  }));
};

const heading = 'Alpha 13 issued total (From 01/04-2025 until 01/09 - 2026):';

test('stale stored fontScale boxes side by side wrap at their own width and stay inside', async ({
  page,
}) => {
  await page.goto('/test/browser/blank.html');
  const lines = [heading, 'Issued in total : 103', 'Completed : 47', 'Open : 56', 'Overdue : 3'];
  const results = await renderBoxes(page, stalePlaceholderBoxes(1900, [...lines, 'Next'], 15));
  for (const result of results) {
    expect(result.transform).not.toContain('scale(');
    expect(result.fontSize).toBeGreaterThanOrEqual(0.6 * (1900 / 75));
    expect(result.firstLineChars).toBeGreaterThanOrEqual(2);
    expect(result.leftToRight).toBe(true);
    expect(result.clippedLines).toBe(0);
    expect(result.firstLineTop).toBeGreaterThanOrEqual(0);
    expect(result.lastLineBottom).toBeGreaterThanOrEqual(0);
    expect(result.outside).toBeLessThanOrEqual(1);
    expect(Math.abs(result.firstLineTop - results[0].firstLineTop)).toBeLessThanOrEqual(1);
  }
});

const emptyTailList =
  '<a:lvl1pPr><a:lnSpc><a:spcPct val="90000"/></a:lnSpc><a:spcBef><a:spcPts val="1000"/></a:spcBef></a:lvl1pPr>';

for (const anchor of ['t', 'ctr', 'b']) {
  test(`stale stored fontScale boxes refit above the stored scale keep their text inside with anchor ${anchor}`, async ({
    page,
  }) => {
    await page.goto('/test/browser/blank.html');
    const results = await renderBoxes(
      page,
      stalePlaceholderBoxes(1600, [heading, 'Completed : 47'], 25, emptyTailList, 0, anchor),
    );
    for (const result of results) {
      expect(result.transform).not.toContain('scale(');
      expect(result.fontSize).toBeGreaterThanOrEqual(0.6 * (1600 / 75));
      expect(result.leftToRight).toBe(true);
      expect(result.clippedLines).toBe(0);
      expect(result.firstLineTop).toBeGreaterThanOrEqual(0);
      expect(result.firstLineTop).toBeLessThanOrEqual(4.8 + 2);
      expect(result.lastLineBottom).toBeGreaterThanOrEqual(0);
      expect(result.outside).toBeLessThanOrEqual(1);
    }
  });
}

test('stale stored fontScale boxes keep overflowing edge empty paragraphs and centre their text by anchor', async ({
  page,
}) => {
  await page.goto('/test/browser/blank.html');
  const [tall, short, flipped] = stalePlaceholderBoxes(
    6400,
    [heading, 'Issued in total : 103', 'Completed : 47'],
    11,
    emptyTailList,
    11,
  );
  const results = await renderBoxes(page, [
    tall,
    { ...short, height: 139, top: 214 },
    { ...flipped, height: 159, top: 204 },
  ]);
  for (const result of results) {
    expect(result.transform).not.toContain('scale(');
    expect(result.fontSize).toBeCloseTo(0.25 * (6400 / 75), 2);
    expect(result.leftToRight).toBe(true);
    expect(result.clippedLines).toBe(0);
    expect(result.columnTop).toBeLessThan(0);
    expect(Math.abs(result.columnTop - result.columnBottom)).toBeLessThanOrEqual(1);
  }
  const firstLineY = results.map((result, index) => result.firstLineTop + [194, 214, 204][index]);
  expect(Math.max(...firstLineY) - Math.min(...firstLineY)).toBeLessThanOrEqual(1);
});

for (const [anchor, spill] of [
  ['t', 'down'],
  ['b', 'up'],
]) {
  test(`stale stored fontScale boxes kept at the stored scale anchor ${anchor} and spill their empty tail ${spill}`, async ({
    page,
  }) => {
    await page.goto('/test/browser/blank.html');
    const results = await renderBoxes(
      page,
      stalePlaceholderBoxes(
        6400,
        [heading, 'Issued in total : 103', 'Completed : 47'],
        25,
        emptyTailList,
        0,
        anchor,
      ),
    );
    for (const result of results) {
      expect(result.transform).not.toContain('scale(');
      expect(result.fontSize).toBeCloseTo(0.25 * (6400 / 75), 2);
      expect(result.clippedLines).toBe(0);
      if (anchor === 't') {
        expect(result.firstLineTop).toBeGreaterThanOrEqual(0);
        expect(result.columnBottom).toBeLessThan(0);
      } else {
        expect(result.columnBottom).toBeGreaterThanOrEqual(0);
        expect(result.firstLineTop).toBeLessThan(0);
      }
    }
  });
}

test('stale stored fontScale boxes that overflow at every scale keep stored line spacing and clip no line', async ({
  page,
}) => {
  await page.goto('/test/browser/blank.html');
  const results = await renderBoxes(
    page,
    stalePlaceholderBoxes(
      6400,
      [heading, 'Issued in total : 103', 'Completed : 47', 'Open : 56', 'Overdue : 3', 'Next'],
      11,
      '<a:lvl1pPr><a:lnSpc><a:spcPct val="90000"/></a:lnSpc><a:spcBef><a:spcPts val="1000"/></a:spcBef></a:lvl1pPr>',
      11,
    ),
  );
  for (const result of results) {
    expect(result.transform).not.toContain('scale(');
    expect(result.contentOverflow).toBeGreaterThan(0);
    expect(result.lineHeight).toBe('0.833');
    expect(result.clippedLines).toBe(0);
  }
});

test('transform fit on a flipped normAutofit box stays inside the box', async ({ page }) => {
  await page.goto('/test/browser/blank.html');
  const [result] = await renderBoxes(page, [
    {
      body: '<a:bodyPr wrap="square"><a:normAutofit/></a:bodyPr>',
      runs: paragraphs(12, 1000),
      width: 288,
      height: 150,
      flipH: true,
    },
  ]);
  expect(result.transform).toMatch(/scale\(0\.\d+\)$/);
  expect(result.leftToRight).toBe(true);
  expect(result.outside).toBeLessThanOrEqual(1);
});
