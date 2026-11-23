import { expect, test } from '@playwright/test';
import { PNG } from 'pngjs';

test('theme bgRef blipFill paints the duotone-recoloured texture', async ({ page }) => {
  const png = new PNG({ width: 4, height: 4 });
  png.data.fill(128);
  for (let i = 3; i < png.data.length; i += 4) png.data[i] = 255;
  const bytes = [...PNG.sync.write(png)];

  await page.goto('/test/browser/blank.html');
  await page.evaluate(async (bytes) => {
    const { parseXml } = await import('/src/parser/XmlParser.ts');
    const { createRenderContext } = await import('/src/renderer/RenderContext.ts');
    const { renderBackground } = await import('/src/renderer/BackgroundRenderer.ts');
    const ns =
      'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
    const slide = {
      index: 0,
      nodes: [],
      layoutIndex: '',
      rels: new Map([['rId1', { type: 'image', target: '../media/slide.png' }]]),
      showMasterSp: true,
      background: parseXml(
        `<p:bg ${ns}><p:bgRef idx="1001"><a:srgbClr val="FF0000"/></p:bgRef></p:bg>`,
      ),
    };
    const presentation = {
      width: 200,
      height: 100,
      slides: [slide],
      layouts: new Map(),
      masters: new Map(),
      themes: new Map(),
      themeRels: new Map([
        [
          'ppt/theme/theme1.xml',
          new Map([['rId1', { type: 'image', target: '../media/texture.png' }]]),
        ],
      ]),
      slideToLayout: new Map(),
      layoutToMaster: new Map(),
      masterToTheme: new Map([['ppt/slideMasters/slideMaster1.xml', 'ppt/theme/theme1.xml']]),
      media: new Map([['ppt/media/texture.png', new Uint8Array(bytes)]]),
      charts: new Map(),
      isWps: false,
    };
    const ctx = createRenderContext(presentation as any, slide as any);
    ctx.masterPath = 'ppt/slideMasters/slideMaster1.xml';
    ctx.theme.bgFillStyles = [
      parseXml(
        `<a:blipFill ${ns}><a:blip r:embed="rId1"><a:duotone><a:srgbClr val="000000"/><a:schemeClr val="phClr"/></a:duotone></a:blip><a:srcRect/><a:tile/></a:blipFill>`,
      ),
    ];
    ctx.asyncTasks = [];
    document.body.style.margin = '0';
    const el = document.createElement('div');
    el.id = 'actual';
    el.style.cssText = 'width:200px;height:100px;';
    document.body.append(el);
    renderBackground(ctx, el);
    await Promise.all(ctx.asyncTasks);
  }, bytes);

  const shot = PNG.sync.read(await page.locator('#actual').screenshot());
  const i = (50 * shot.width + 100) * 4;
  const [r, g, b] = shot.data.slice(i, i + 3);
  expect(Math.abs(r - 128)).toBeLessThanOrEqual(3);
  expect(g).toBeLessThanOrEqual(3);
  expect(b).toBeLessThanOrEqual(3);
});
