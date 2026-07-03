import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Page } from '@playwright/test';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');

export function fixtureFiles(name: string): Array<{ name: string; bytes: number[] }> {
  const dir = join(FIXTURES, name);
  return readdirSync(dir).map((f) => ({
    name: f,
    bytes: Array.from(new Uint8Array(readFileSync(join(dir, f)))),
  }));
}

export async function ingestFixture(page: Page, name: string): Promise<void> {
  const files = fixtureFiles(name);
  await page.evaluate(
    (payload) => (window as unknown as { __mriIngest: (f: unknown) => Promise<void> }).__mriIngest(payload),
    files,
  );
}
