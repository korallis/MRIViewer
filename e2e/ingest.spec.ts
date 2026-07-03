import { test, expect } from '@playwright/test';
import { ingestFixture, fixtureFiles } from './helpers';

test('ingests a folder and lists a reconstructable series', async ({ page }) => {
  await page.goto('/?e2e=1');
  await ingestFixture(page, 'phantom-axial');
  const card = page.getByTestId('series-card').first();
  await expect(card).toBeVisible();
  await expect(card).toHaveAttribute('data-reconstructable', 'true');
  await expect(card).toContainText('64×64×24');
});

test('skips non-DICOM files and reports the count', async ({ page }) => {
  await page.goto('/?e2e=1');
  const files = fixtureFiles('phantom-axial');
  files.push({ name: 'notes.txt', bytes: Array.from(new TextEncoder().encode('not dicom'.repeat(40))) });
  await page.evaluate(
    (payload) => (window as unknown as { __mriIngest: (f: unknown) => Promise<void> }).__mriIngest(payload),
    files,
  );
  await expect(page.getByTestId('series-card').first()).toBeVisible();
  await expect(page.getByText(/1 skipped/)).toBeVisible();
});

test('splits a dual-echo series into two candidates', async ({ page }) => {
  await page.goto('/?e2e=1');
  await ingestFixture(page, 'phantom-dual-echo');
  await expect(page.getByTestId('series-card')).toHaveCount(2);
});

test('empty / non-DICOM folder shows a helpful error', async ({ page }) => {
  await page.goto('/?e2e=1');
  await page.evaluate(
    (payload) => (window as unknown as { __mriIngest: (f: unknown) => Promise<void> }).__mriIngest(payload),
    [{ name: 'a.txt', bytes: Array.from(new TextEncoder().encode('x'.repeat(300))) }],
  );
  await expect(page.getByText(/No DICOM files found/)).toBeVisible();
});
