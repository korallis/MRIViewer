import { test } from '@playwright/test';
import { ingestFixture } from './helpers';
import { mkdirSync } from 'node:fs';

const OUT = '/tmp/mri-shots';
mkdirSync(OUT, { recursive: true });

test('capture screenshots of the working app', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });

  // 1. Landing / drop zone
  await page.goto('/?e2e=1');
  await page.waitForFunction(() => '__mriIngest' in window);
  await page.screenshot({ path: `${OUT}/01-dropzone.png` });

  // 2. Series browser
  await ingestFixture(page, 'phantom-dual-echo');
  await page.getByTestId('series-card').first().waitFor();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/02-series-browser.png` });

  // 3. Viewer — DVR + MPR quad, mid volume
  await page.getByTestId('series-card').first().click();
  await page.getByRole('toolbar', { name: 'Viewer tools' }).waitFor();
  await page.evaluate(() =>
    (window as unknown as { __mriSetState: (p: unknown) => void }).__mriSetState({
      crosshairTex: [0.5, 0.5, 18.5 / 24],
    }),
  );
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/03-viewer-dvr.png` });

  // 4. MIP mode
  await page.getByRole('button', { name: 'MIP', exact: true }).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/04-viewer-mip.png` });

  // 5. ISO + hot-iron colormap
  await page.getByRole('button', { name: 'ISO', exact: true }).click();
  await page.selectOption('select[aria-label="Colormap"]', 'hot-iron');
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/05-viewer-iso-hotiron.png` });

  // 6. Oblique study in viridis DVR to show orientation handling
  await page.getByRole('button', { name: '← Series' }).click();
  await ingestFixture(page, 'phantom-oblique');
  await page.getByTestId('series-card').first().click();
  await page.getByRole('toolbar', { name: 'Viewer tools' }).waitFor();
  await page.getByRole('button', { name: 'DVR', exact: true }).click();
  await page.selectOption('select[aria-label="Colormap"]', 'viridis');
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/06-oblique-viridis.png` });
});
