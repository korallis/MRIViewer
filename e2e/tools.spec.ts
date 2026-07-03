import { test, expect } from '@playwright/test';
import { ingestFixture } from './helpers';

async function loadAndView(page: import('@playwright/test').Page, fixture = 'phantom-axial') {
  await page.goto('/?e2e=1');
  await page.waitForFunction(() => '__mriIngest' in window);
  await ingestFixture(page, fixture);
  await page.getByTestId('series-card').first().click();
  await expect(page.getByRole('toolbar', { name: 'Viewer tools' })).toBeVisible();
  await page.waitForTimeout(300);
}

test('hotkeys switch render mode', async ({ page }) => {
  await loadAndView(page);
  await page.keyboard.press('m');
  await expect(page.getByRole('button', { name: 'MIP', exact: true })).toHaveClass(/active/);
  await page.keyboard.press('s');
  await expect(page.getByRole('button', { name: 'ISO', exact: true })).toHaveClass(/active/);
});

test('number keys apply window presets', async ({ page }) => {
  await loadAndView(page);
  const before = await page.evaluate(() =>
    (window as unknown as { __mriGetState: () => { windowClim: number[] } }).__mriGetState().windowClim,
  );
  await page.keyboard.press('9');
  const after = await page.evaluate(() =>
    (window as unknown as { __mriGetState: () => { windowClim: number[] } }).__mriGetState().windowClim,
  );
  // Preset 9 is a much tighter window than the default.
  const w0 = before[1]! - before[0]!;
  const w9 = after[1]! - after[0]!;
  expect(w9).toBeLessThan(w0);
});

test('right-drag adjusts window/level', async ({ page }) => {
  await loadAndView(page);
  const before = await page.evaluate(() =>
    (window as unknown as { __mriGetState: () => { windowClim: number[] } }).__mriGetState().windowClim,
  );
  const pane = page.getByTestId('pane-axial');
  const box = (await pane.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2 + 60, { steps: 8 });
  await page.mouse.up({ button: 'right' });
  const after = await page.evaluate(() =>
    (window as unknown as { __mriGetState: () => { windowClim: number[] } }).__mriGetState().windowClim,
  );
  expect(after).not.toEqual(before);
});

test('metadata panel shows patient info and privacy notice', async ({ page }) => {
  await loadAndView(page);
  await page.getByRole('button', { name: 'info' }).click();
  const panel = page.getByRole('complementary', { name: 'Study metadata' });
  await expect(panel).toContainText('PHANTOM');
  await expect(panel).toContainText('never uploaded');
});

test('PNG export triggers a download', async ({ page }) => {
  await loadAndView(page);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '📷 PNG' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('mriviewer.png');
});

test('clip box control opens', async ({ page }) => {
  await loadAndView(page);
  await page.getByRole('button', { name: 'clip', exact: true }).click();
  await expect(page.getByLabel('Clip X min')).toBeVisible();
});
