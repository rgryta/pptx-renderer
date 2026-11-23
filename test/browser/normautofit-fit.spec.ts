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

for (const [name, body, size, transform, maxFontSize] of [
  ['without a stored scale', '<a:normAutofit/>', 1000, /^scale\(0\.9\d*\)$/, 13.34],
  [
    'after a stored scale',
    '<a:normAutofit fontScale="85000" lnSpcReduction="10000"/>',
    1200,
    /^$/,
    13.6,
  ],
] as const) {
  test(`normAutofit text slightly taller than the box shrinks to fit ${name}`, async ({ page }) => {
    await page.goto('/test/browser/blank.html');
    const result = await renderFit(page, body, paragraphs(12, size), 180);
    expect(result.transform).toMatch(transform);
    expect(parseFloat(result.fontSize)).toBeLessThan(maxFontSize);
    expect(result.overflow).toBeLessThanOrEqual(1);
  });
}

test('stale stored fontScale that overflows at every font scale floors at 25% without a transform', async ({
  page,
}) => {
  await page.goto('/test/browser/blank.html');
  const result = await renderFit(
    page,
    '<a:normAutofit fontScale="25000" lnSpcReduction="20000"/>',
    paragraphs(40, 1900),
    179,
    '<a:lvl1pPr><a:spcBef><a:spcPts val="2000"/></a:spcBef></a:lvl1pPr>',
    433,
  );
  expect(result.fontSize).toBe('6.33333px');
  expect(result.transform).toBe('');
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
      return {
        fontSize: parseFloat(getComputedStyle(spans[0]).fontSize),
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
  geometry = { width: 433, height: 179 },
) => {
  const runs = [
    ...Array.from({ length: leadingEmpties }, () => '<a:endParaRPr sz="1900"/>'),
    ...texts.map((text) =>
      text ? `<a:r><a:rPr sz="${size}"/><a:t>${text}</a:t></a:r>` : '<a:endParaRPr sz="1900"/>',
    ),
    '<a:endParaRPr sz="6400"/>',
    ...Array.from({ length: empties }, () => '<a:endParaRPr sz="1900"/>'),
  ].join('</a:p><a:p>');
  const body =
    '<a:bodyPr vert="horz" wrap="square" anchor="ctr"><a:normAutofit fontScale="25000" lnSpcReduction="20000"/></a:bodyPr>';
  return [false, false, true].map((flipH) => ({
    body,
    runs,
    list,
    ...geometry,
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
    expect(result.firstLineTop).toBeGreaterThanOrEqual(0);
    expect(result.lastLineBottom).toBeGreaterThanOrEqual(0);
    expect(result.outside).toBeLessThanOrEqual(1);
  }
});

test('stale stored fontScale boxes keep visible text inside when the empty tail overflows', async ({
  page,
}) => {
  await page.goto('/test/browser/blank.html');
  const results = await renderBoxes(
    page,
    stalePlaceholderBoxes(
      1600,
      [heading, 'Issued in total : 103', 'Completed : 47'],
      25,
      '<a:lvl1pPr><a:lnSpc><a:spcPct val="90000"/></a:lnSpc><a:spcBef><a:spcPts val="1000"/></a:spcBef></a:lvl1pPr>',
    ),
  );
  for (const result of results) {
    expect(result.transform).not.toContain('scale(');
    expect(result.fontSize).toBeGreaterThanOrEqual(0.6 * (1600 / 75));
    expect(result.leftToRight).toBe(true);
    expect(result.firstLineTop).toBeGreaterThanOrEqual(0);
    expect(result.lastLineBottom).toBeGreaterThanOrEqual(0);
    expect(result.outside).toBeLessThanOrEqual(1);
    expect(result.contentOverflow).toBeLessThanOrEqual(0);
    expect(result.firstLineTop).toBeLessThanOrEqual(4.8 + 2);
  }
});

test('stale stored fontScale boxes drop overflowing leading empty paragraphs and start at the top', async ({
  page,
}) => {
  await page.goto('/test/browser/blank.html');
  const results = await renderBoxes(
    page,
    stalePlaceholderBoxes(
      1600,
      [heading, 'Issued in total : 103', 'Completed : 47', 'Open : 56', 'Overdue : 3', 'Next'],
      11,
      '<a:lvl1pPr><a:lnSpc><a:spcPct val="90000"/></a:lnSpc><a:spcBef><a:spcPts val="1000"/></a:spcBef></a:lvl1pPr>',
      11,
    ),
  );
  for (const result of results) {
    expect(result.transform).not.toContain('scale(');
    expect(result.leftToRight).toBe(true);
    expect(result.firstLineTop).toBeGreaterThanOrEqual(0);
    expect(result.firstLineTop).toBeLessThanOrEqual(4.8 + 2);
    expect(result.lastLineBottom).toBeGreaterThanOrEqual(0);
    expect(result.outside).toBeLessThanOrEqual(1);
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

test('stale stored fontScale shrinks master point spacing with the text so every line fits', async ({
  page,
}) => {
  await page.goto('/test/browser/blank.html');
  const results = await renderBoxes(
    page,
    stalePlaceholderBoxes(
      1600,
      [
        heading,
        '',
        'Issued in total : 103',
        '',
        'Completed : 47',
        '',
        'Open : 56',
        '',
        'Overdue',
        '',
        'Next',
      ],
      11,
      '<a:lvl1pPr><a:lnSpc><a:spcPct val="90000"/></a:lnSpc><a:spcBef><a:spcPts val="1000"/></a:spcBef></a:lvl1pPr>',
      11,
      { width: 403, height: 139 },
    ),
  );
  for (const result of results) {
    expect(result.transform).not.toContain('scale(');
    expect(result.leftToRight).toBe(true);
    expect(result.firstLineTop).toBeGreaterThanOrEqual(0);
    expect(result.lastLineBottom).toBeGreaterThanOrEqual(0);
    expect(result.outside).toBeLessThanOrEqual(1);
    expect(result.contentOverflow).toBeLessThanOrEqual(0);
  }
});

test('stale stored fontScale on a bulleted body keeps paragraphs apart and inside the box', async ({
  page,
}) => {
  await page.goto('/test/browser/blank.html');
  const paragraph = (level: number, text: string, color: string) =>
    `<a:pPr lvl="${level}"><a:lnSpc><a:spcPct val="120000"/></a:lnSpc></a:pPr><a:r><a:rPr><a:solidFill><a:srgbClr val="${color}"/></a:solidFill></a:rPr><a:t>${text}</a:t></a:r>`;
  const runs = [
    paragraph(
      0,
      'Alpha inspection tool fully implemented (both Cloud &amp; APP). Now used for:',
      '000000',
    ),
    ...Array.from({ length: 12 }, (_, index) =>
      paragraph(1, `Inspection type number ${index + 1}`, index % 2 ? 'C00000' : '0070C0'),
    ),
    paragraph(
      0,
      'The tool is now used for incident investigation with the project leads and liaison for improvements.',
      '000000',
    ),
    paragraph(1, 'Implemented new forms for the ease of completing them', '000000'),
    paragraph(
      0,
      'More widespread use of the tool for trending (audits and inspections).',
      '000000',
    ),
  ]
    .join('</a:p><a:p>')
    .replace(/^<a:pPr[^]*?<\/a:pPr>/, '');
  const list =
    '<a:lvl1pPr marL="228600" indent="-228600"><a:spcBef><a:spcPts val="1000"/></a:spcBef><a:buChar char="•"/><a:defRPr sz="2800"/></a:lvl1pPr><a:lvl2pPr marL="685800" indent="-228600"><a:spcBef><a:spcPct val="50000"/></a:spcBef><a:buChar char="–"/><a:defRPr sz="2400"/></a:lvl2pPr>';
  const result = await page.evaluate(
    async ({ runs, list }) => {
      const { renderTextFixture } = await import('/test/fixtures/text-coverage.ts');
      const { element, container } = renderTextFixture(
        '<a:bodyPr><a:normAutofit fontScale="25000" lnSpcReduction="20000"/></a:bodyPr>',
        '<a:lnSpc><a:spcPct val="120000"/></a:lnSpc>',
        list,
        '',
        runs,
        undefined,
        { cx: 560 * 9525, cy: 300 * 9525 },
      );
      document.body.append(element);
      await document.fonts.ready;
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
      const box = element.getBoundingClientRect();
      const rects = (Array.from(container.children) as HTMLElement[])
        .filter((paragraph) => paragraph.textContent?.trim())
        .map((paragraph) => {
          const range = document.createRange();
          range.selectNodeContents(paragraph);
          return range.getBoundingClientRect();
        });
      return {
        overlap: Math.max(...rects.slice(1).map((rect, index) => rects[index].bottom - rect.top)),
        outside: Math.max(box.top - rects[0].top, rects[rects.length - 1].bottom - box.bottom),
      };
    },
    { runs, list },
  );
  expect(result.overlap).toBeLessThanOrEqual(1);
  expect(result.outside).toBeLessThanOrEqual(1);
});

test('a measured normAutofit fit survives a later pass while its box is hidden', async ({
  page,
}) => {
  await page.goto('/test/browser/blank.html');
  const transform = await page.evaluate(
    async (runs) => {
      const { renderTextFixture } = await import('/test/fixtures/text-coverage.ts');
      const { element, container } = renderTextFixture(
        '<a:bodyPr wrap="square"><a:normAutofit/></a:bodyPr>',
        '',
        '',
        '',
        runs,
        undefined,
        { cx: 288 * 9525, cy: 150 * 9525 },
      );
      const panel = document.createElement('div');
      panel.style.display = 'none';
      panel.append(element);
      document.body.append(panel);
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
      );
      panel.style.display = '';
      return container.style.transform;
    },
    paragraphs(12, 1000),
  );
  expect(transform).toMatch(/^scale\(0\.\d+\)$/);
});
