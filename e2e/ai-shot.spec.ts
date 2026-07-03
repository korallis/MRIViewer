import { test } from '@playwright/test';
import { ingestFixture } from './helpers';
import { mkdirSync } from 'node:fs';

const OUT = '/tmp/mri-shots';
mkdirSync(OUT, { recursive: true });

// Keyed smoke/screenshot — needs a real gateway key in the preview server's
// env. Skipped by default (CI has no key); run with MRIVIEWER_AI_SHOT=1.
test.skip(!process.env.MRIVIEWER_AI_SHOT, 'set MRIVIEWER_AI_SHOT=1 with a keyed preview');
test('capture AI companion with a real response', async ({ page }) => {
  await page.setViewportSize({ width: 1500, height: 940 });
  await page.goto('/?e2e=1');
  await page.waitForFunction(() => '__mriIngest' in window);
  await ingestFixture(page, 'phantom-axial');
  await page.getByTestId('series-card').first().click();
  await page.getByTestId('orient-axial').waitFor();
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: 'Enable AI analysis' }).click();
  await page.getByRole('button', { name: 'Analyze study' }).click();
  // Wait for streamed content in the companion.
  await page.waitForFunction(() => {
    const c = document.querySelector('.companion-panel');
    return !!c && /radiolog|sequence|contextual|study/i.test(c.textContent ?? '');
  }, { timeout: 60000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/r05-ai-companion.png` });
});
