import { test } from '@playwright/test';
import { ingestFixture } from './helpers';
import { mkdirSync } from 'node:fs';

const OUT = '/tmp/mri-shots';
mkdirSync(OUT, { recursive: true });

test('capture redesigned app', async ({ page }) => {
  await page.setViewportSize({ width: 1500, height: 940 });

  await page.goto('/?e2e=1');
  await page.waitForFunction(() => '__mriIngest' in window);
  await page.screenshot({ path: `${OUT}/r01-empty-shell.png` });

  await ingestFixture(page, 'phantom-axial');
  await page.getByTestId('series-card').first().waitFor();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/r02-series-loaded.png` });

  await page.getByTestId('series-card').first().click();
  await page.getByTestId('orient-axial').waitFor();
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}/r03-viewer-dvr.png` });

  // Hot-iron ISO + a sagittal orientation.
  await page.selectOption('#cmap', 'hot-iron');
  await page.getByRole('button', { name: 'ISO', exact: true }).click();
  await page.getByTestId('orient-sagittal').click();
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/r04-iso-sagittal.png` });
});
