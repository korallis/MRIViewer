import { test, expect } from '@playwright/test';
import { ingestFixture } from './helpers';

/**
 * The local-only guarantee is a TESTED property (PLAN §9): abort every request
 * whose host is not the local dev server, ingest + render a study, and assert
 * nothing tried to leave the machine.
 */
test('makes zero requests to any non-local host', async ({ page }) => {
  const violations: string[] = [];
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
      violations.push(url.href);
      return route.abort();
    }
    return route.continue();
  });

  await page.goto('/?e2e=1');
  await page.waitForFunction(() => '__mriIngest' in window);
  await ingestFixture(page, 'phantom-axial');
  await page.getByTestId('series-card').first().click();
  await page.getByTestId('orient-axial').waitFor();
  await page.waitForTimeout(600);

  expect(violations, `External requests attempted:\n${violations.join('\n')}`).toEqual([]);
});

test('recovers from a simulated WebGL context loss', async ({ page }) => {
  await page.goto('/?e2e=1');
  await page.waitForFunction(() => '__mriIngest' in window);
  await ingestFixture(page, 'phantom-axial');
  await page.getByTestId('series-card').first().click();
  await page.getByTestId('orient-axial').waitFor();
  await page.waitForTimeout(400);

  // Force context loss + restore via WEBGL_lose_context, then confirm the app
  // rebuilds GPU resources and keeps rendering.
  await page.evaluate(async () => {
    const canvas = document.querySelector('canvas') as HTMLCanvasElement;
    const gl = canvas.getContext('webgl2')!;
    const ext = gl.getExtension('WEBGL_lose_context');
    ext?.loseContext();
    await new Promise((r) => setTimeout(r, 100));
    ext?.restoreContext();
    await new Promise((r) => setTimeout(r, 400));
  });
  // App is still interactive after restore.
  await page.getByTestId('orient-axial').waitFor();
  await page.getByRole('button', { name: 'MIP', exact: true }).click();
  await expect(page.getByRole('button', { name: 'MIP', exact: true })).toHaveClass(/active/);
});
