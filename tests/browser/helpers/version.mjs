import { readFile } from 'node:fs/promises';

/** Keep existing-user fixtures current as build numbers advance automatically. */
export async function markCurrentReleaseSeen(browser) {
  const { version } = JSON.parse(await readFile(new URL('../../../version.json', import.meta.url)));
  await browser.addInitScript(
    (value) => localStorage.setItem('admiral_app:seenVersion', value),
    version,
  );
}
