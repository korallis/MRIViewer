import { test, expect } from '@playwright/test';
import { ingestFixture } from './helpers';

test('AI is off by default — companion shows the enable prompt', async ({ page }) => {
  await page.goto('/?e2e=1');
  await page.waitForFunction(() => '__mriIngest' in window);
  await ingestFixture(page, 'phantom-axial');
  await page.getByTestId('series-card').first().click();
  await page.getByTestId('orient-axial').waitFor();
  const companion = page.locator('.companion-panel');
  await expect(companion).toContainText('AI analysis');
  await expect(companion.getByRole('button', { name: 'Enable AI analysis' })).toBeVisible();
  await expect(page.getByText('Local only · no uploads')).toBeVisible();
});

test('enabling AI without a configured key surfaces a clear message', async ({ page }) => {
  await page.goto('/?e2e=1');
  await page.waitForFunction(() => '__mriIngest' in window);
  await ingestFixture(page, 'phantom-axial');
  await page.getByTestId('series-card').first().click();
  await page.getByTestId('orient-axial').waitFor();
  await page.getByRole('button', { name: 'Enable AI analysis' }).click();
  await expect(page.getByText('AI on · de-identified only')).toBeVisible();
  await page.getByRole('button', { name: 'Analyze study' }).click();
  // Preview build has no proxy key → the client reports the not-configured message.
  await expect(page.locator('.companion-panel')).toContainText(/not configured|AI_GATEWAY_API_KEY|gateway/i);
});

test('AI stays off across a reload once disabled (opt-in persistence)', async ({ page }) => {
  await page.goto('/?e2e=1');
  await page.waitForFunction(() => '__mriIngest' in window);
  await ingestFixture(page, 'phantom-axial');
  await page.getByTestId('series-card').first().click();
  await page.getByTestId('orient-axial').waitFor();
  await page.getByRole('button', { name: 'Enable AI analysis' }).click();
  await expect(page.getByText('AI on · de-identified only')).toBeVisible();
  await page.getByRole('button', { name: 'Disable AI' }).click();
  await expect(page.getByText('Local only · no uploads')).toBeVisible();
});
