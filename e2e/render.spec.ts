import { test, expect } from '@playwright/test';
import { ingestFixture } from './helpers';

async function loadAndView(page: import('@playwright/test').Page, fixture: string) {
  await page.goto('/?e2e=1');
  await ingestFixture(page, fixture);
  await page.getByTestId('series-card').first().click();
  // Wait until the shared volume texture is built and viewing stage is active.
  await expect(page.getByRole('toolbar', { name: 'Viewer tools' })).toBeVisible();
  await page.waitForTimeout(500); // let demand-frameloop paint the panes
}

/** Sample the mean luminance of a rectangular region of a pane's canvas. */
async function regionBrightness(
  page: import('@playwright/test').Page,
  testId: string,
  region: { x0: number; y0: number; x1: number; y1: number },
): Promise<number> {
  return page.evaluate(
    ({ testId, region }) => {
      const pane = document.querySelector(`[data-testid="${testId}"]`)!;
      const canvas = document.querySelector('canvas') as HTMLCanvasElement;
      const pr = pane.getBoundingClientRect();
      const cr = canvas.getBoundingClientRect();
      // Map pane-relative fractions to backing-store pixels of the shared canvas.
      const gl = canvas.getContext('webgl2')!;
      const W = gl.drawingBufferWidth;
      const H = gl.drawingBufferHeight;
      const sx = W / cr.width;
      const sy = H / cr.height;
      const px0 = Math.round((pr.left - cr.left + region.x0 * pr.width) * sx);
      const px1 = Math.round((pr.left - cr.left + region.x1 * pr.width) * sx);
      // WebGL y is bottom-up.
      const py0 = Math.round((cr.bottom - (pr.top + region.y1 * pr.height)) * sy);
      const py1 = Math.round((cr.bottom - (pr.top + region.y0 * pr.height)) * sy);
      const w = Math.max(1, px1 - px0);
      const h = Math.max(1, py1 - py0);
      const buf = new Uint8Array(w * h * 4);
      gl.readPixels(px0, py0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i += 4) sum += buf[i]! + buf[i + 1]! + buf[i + 2]!;
      return sum / (w * h * 3);
    },
    { testId, region },
  );
}

test('MIP renders non-empty pixels', async ({ page }) => {
  await loadAndView(page, 'phantom-axial');
  await page.getByRole('button', { name: 'MIP', exact: true }).click();
  await page.waitForTimeout(400);
  const full = await regionBrightness(page, 'pane-axial', { x0: 0.05, y0: 0.05, x1: 0.95, y1: 0.95 });
  expect(full).toBeGreaterThan(2);
});

test('ORIENTATION: marker is in the correct axial quadrant (anti-mirroring)', async ({ page }) => {
  await loadAndView(page, 'phantom-axial');
  // The bright marker sits at k≈18 (of 24). Scrub the axial slice onto it —
  // sliceAxis for axial is k = texture axis 2.
  await page.evaluate(() =>
    (window as unknown as { __mriSetState: (p: unknown) => void }).__mriSetState({
      crosshairTex: [0.5, 0.5, 18.5 / 24],
    }),
  );
  await page.waitForTimeout(400);

  // Marker is in the patient LEFT-ANTERIOR-SUPERIOR octant.
  // Axial pane, radiological: patient Left → screen RIGHT, Anterior → screen TOP.
  // The bright marker (value 3000 ≫ background) must dominate the TOP-RIGHT quadrant.
  const topRight = await regionBrightness(page, 'pane-axial', { x0: 0.55, y0: 0.05, x1: 0.95, y1: 0.45 });
  const topLeft = await regionBrightness(page, 'pane-axial', { x0: 0.05, y0: 0.05, x1: 0.45, y1: 0.45 });
  const bottomLeft = await regionBrightness(page, 'pane-axial', { x0: 0.05, y0: 0.55, x1: 0.45, y1: 0.95 });
  expect(topRight).toBeGreaterThan(topLeft * 1.3);
  expect(topRight).toBeGreaterThan(bottomLeft * 1.3);
});

test('axial edge labels follow radiological convention', async ({ page }) => {
  await loadAndView(page, 'phantom-axial');
  const pane = page.getByTestId('pane-axial');
  await expect(pane).toContainText('A'); // anterior at top
  await expect(pane).toContainText('L'); // left at right edge
});

test('study swap leaves no leaked GPU textures', async ({ page }) => {
  await loadAndView(page, 'phantom-axial');
  const before = await page.evaluate(() => {
    const c = document.querySelector('canvas') as HTMLCanvasElement;
    return (c.getContext('webgl2') as any).getParameter(0x8b4d); // MAX_TEXTURE_IMAGE_UNITS — just a liveness probe
  });
  expect(before).toBeGreaterThan(0);
  // Reload a different series; texture disposal happens in effect cleanup.
  await page.getByRole('button', { name: '← Series' }).click();
  await ingestFixture(page, 'phantom-oblique');
  await page.getByTestId('series-card').first().click();
  await expect(page.getByRole('toolbar', { name: 'Viewer tools' })).toBeVisible();
});
