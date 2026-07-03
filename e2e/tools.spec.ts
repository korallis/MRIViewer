import { test, expect, type Page } from '@playwright/test';
import { ingestFixture } from './helpers';

async function loadAndView(page: Page) {
  await page.goto('/?e2e=1');
  await page.waitForFunction(() => '__mriIngest' in window);
  await ingestFixture(page, 'phantom-axial');
  await page.getByTestId('series-card').first().click();
  await page.getByTestId('orient-axial').waitFor();
  await page.waitForTimeout(400);
}

const clim = (page: Page) =>
  page.evaluate(() =>
    (window as unknown as { __mriGetState: () => { windowClim: number[] } }).__mriGetState().windowClim,
  );

test('slice slider scrubs and updates the companion readout', async ({ page }) => {
  await loadAndView(page);
  await page.locator('#slice').fill('20');
  await expect(page.getByTestId('slice-metric')).toContainText('20');
});

test('contrast slider narrows the window', async ({ page }) => {
  await loadAndView(page);
  const before = await clim(page);
  await page.locator('#contrast').fill('170');
  const after = await clim(page);
  expect(after[1]! - after[0]!).toBeLessThan(before[1]! - before[0]!);
});

test('colormap select changes the map', async ({ page }) => {
  await loadAndView(page);
  await page.selectOption('#cmap', 'hot-iron');
  await expect(page.locator('#cmap')).toHaveValue('hot-iron');
});

test('cine toggles playback and advances the slice', async ({ page }) => {
  await loadAndView(page);
  const s0 = await page.evaluate(() =>
    (window as unknown as { __mriGetState: () => { crosshairTex: number[] } }).__mriGetState().crosshairTex[2],
  );
  await page.getByRole('button', { name: 'Play Cine' }).click();
  await expect(page.getByRole('button', { name: 'Pause Cine' })).toBeVisible();
  await page.waitForTimeout(600);
  const s1 = await page.evaluate(() =>
    (window as unknown as { __mriGetState: () => { crosshairTex: number[] } }).__mriGetState().crosshairTex[2],
  );
  expect(s1).not.toEqual(s0);
});

test('companion shows real metadata + privacy notice', async ({ page }) => {
  await loadAndView(page);
  const companion = page.locator('.companion-panel');
  await expect(companion).toContainText('PHANTOM');
  await expect(companion).toContainText('64 × 64 × 24');
  await expect(companion).toContainText('never uploaded');
});

test('export snapshot triggers a PNG download', async ({ page }) => {
  await loadAndView(page);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export Snapshot' }).click();
  expect((await download).suggestedFilename()).toBe('mri-snapshot.png');
});
