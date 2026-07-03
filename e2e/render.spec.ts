import { test, expect, type Page } from '@playwright/test';
import { ingestFixture } from './helpers';

async function loadAndView(page: Page, fixture = 'phantom-axial') {
  await page.goto('/?e2e=1');
  await page.waitForFunction(() => '__mriIngest' in window);
  await ingestFixture(page, fixture);
  await page.getByTestId('series-card').first().click();
  await page.getByTestId('orient-axial').waitFor();
  await page.waitForTimeout(700);
}

/** Count of lit (non-background) pixels on the 3D WebGL canvas. */
async function litPixels(page: Page): Promise<number> {
  return page.evaluate(() => {
    const canvas = document.querySelector('.viewer-canvas-wrap canvas') as HTMLCanvasElement;
    const gl = canvas.getContext('webgl2')!;
    const W = gl.drawingBufferWidth;
    const H = gl.drawingBufferHeight;
    const buf = new Uint8Array(W * H * 4);
    gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    let lit = 0;
    for (let i = 0; i < buf.length; i += 4) {
      if (buf[i]! + buf[i + 1]! + buf[i + 2]! > 40) lit++;
    }
    return lit;
  });
}

/** Mean luminance of the primary 2D slice canvas. */
async function mainSliceBrightness(page: Page): Promise<number> {
  return page.evaluate(() => {
    const canvas = document.querySelector('[data-testid=main-slice-canvas]') as HTMLCanvasElement;
    const ctx = canvas.getContext('2d')!;
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let sum = 0;
    for (let i = 0; i < data.length; i += 4) sum += data[i]! + data[i + 1]! + data[i + 2]!;
    return sum / ((data.length / 4) * 3);
  });
}

/** Mean luminance of a named orthogonal thumbnail (2D canvas). */
async function thumbBrightness(page: Page, label: string): Promise<number> {
  return page.evaluate((label) => {
    const thumb = [...document.querySelectorAll('.thumb')].find((t) =>
      t.textContent?.includes(label),
    );
    const canvas = thumb!.querySelector('canvas') as HTMLCanvasElement;
    const ctx = canvas.getContext('2d')!;
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let sum = 0;
    for (let i = 0; i < data.length; i += 4) sum += data[i]! + data[i + 1]! + data[i + 2]!;
    return sum / ((data.length / 4) * 3);
  }, label);
}

test('main slice viewer renders non-empty pixels by default', async ({ page }) => {
  await loadAndView(page);
  await page.waitForTimeout(300);
  expect(await mainSliceBrightness(page)).toBeGreaterThan(2);
});

test('all three orthogonal thumbnails render the volume', async ({ page }) => {
  await loadAndView(page);
  expect(await thumbBrightness(page, 'Axial')).toBeGreaterThan(2);
  expect(await thumbBrightness(page, 'Sagittal')).toBeGreaterThan(2);
  expect(await thumbBrightness(page, 'Coronal')).toBeGreaterThan(2);
});

test('render modes and orientation presets stay interactive', async ({ page }) => {
  await loadAndView(page);
  await page.locator('.viewer-header').getByRole('button', { name: '3D', exact: true }).click();
  await page.getByRole('button', { name: 'ISO', exact: true }).click();
  await expect(page.getByRole('button', { name: 'ISO', exact: true })).toHaveClass(/active/);
  await page.getByTestId('orient-sagittal').click();
  await expect(page.getByTestId('orient-sagittal')).toHaveClass(/active/);
  await page.waitForTimeout(300);
  expect(await litPixels(page)).toBeGreaterThan(500);
});

test('study swap keeps the viewer working', async ({ page }) => {
  await loadAndView(page, 'phantom-axial');
  await ingestFixture(page, 'phantom-oblique');
  await page.getByTestId('series-card').first().click();
  await page.getByTestId('orient-axial').waitFor();
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: 'Reset View' }).click();
  await page.waitForTimeout(700);
  expect(await mainSliceBrightness(page)).toBeGreaterThan(2);
});
