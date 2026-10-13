import { test, expect } from '@playwright/test';

// Fail any test whose page logs a console error or throws.
test.beforeEach(async ({ page }, testInfo) => {
  const problems = [];
  page.on('console', (msg) => { if (msg.type() === 'error') problems.push(`console: ${msg.text()}`); });
  page.on('pageerror', (err) => problems.push(`pageerror: ${err.message}`));
  testInfo.problems = problems;
});

test.afterEach(async ({ page }, testInfo) => {
  expect(testInfo.problems, 'console errors / page errors').toEqual([]);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, 'horizontal overflow in px').toBeLessThanOrEqual(0);
});

test('landing page links to both demos', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Data Communication Demos' })).toBeVisible();
  for (const [name, href] of [[/Bit Stuffing/, 'bit_stuff.html'], [/Stop-and-Wait/, 'stop_and_wait.html']]) {
    const link = page.getByRole('link', { name });
    await expect(link).toHaveAttribute('href', href);
    const res = await page.request.get(href);
    expect(res.status(), href).toBe(200);
  }
});

test('bit stuffing: stuff 01111110, destuff it back, and reject bad input', async ({ page }) => {
  await page.goto('bit_stuff.html');
  await page.getByLabel('Data bits').fill('01111110');
  await page.getByRole('button', { name: 'Stuff', exact: true }).click();
  await expect(page.getByTestId('stuffed').first()).toHaveText('011111010');
  await expect(page.getByLabel('Stuffed bits (between the flags)')).toHaveValue('011111010');

  await page.getByRole('button', { name: 'Destuff' }).click();
  await expect(page.getByTestId('destuffed')).toHaveText('01111110');
  await expect(page.getByTestId('match')).toHaveText('Matches the original data.');

  // Bad input shows an error and clears the old result.
  await page.getByLabel('Data bits').fill('0120');
  await page.getByRole('button', { name: 'Stuff', exact: true }).click();
  await expect(page.locator('#send-error')).toContainText('Invalid character "2"');
  await expect(page.getByTestId('stuffed')).toHaveCount(0);

  // A corrupted stream (six 1s) is rejected by the receiver.
  await page.getByLabel('Stuffed bits (between the flags)').fill('0111111');
  await page.getByRole('button', { name: 'Destuff' }).click();
  await expect(page.locator('#recv-error')).toContainText('Six 1s in a row');

  // Example buttons work.
  await page.getByRole('button', { name: /Exactly five 1s/ }).click();
  await expect(page.getByTestId('stuffed').first()).toHaveText('111110');
});

test('stop-and-wait: paced walkthrough starting with frame 1, and bad input', async ({ page }) => {
  await page.goto('stop_and_wait.html');
  await page.getByLabel('Frames (comma-separated)').fill('1,2,3');
  await page.getByLabel('Loss probability (%)').fill('0');
  const started = Date.now();
  await page.getByRole('button', { name: 'Simulate' }).click();

  const lines = page.getByTestId('log-text');
  await expect(lines.nth(0)).toHaveText('Starting Stop-and-Wait Simulation');
  await expect(lines.nth(1)).toHaveText('Sending frame 1 (seq 0)');
  // Paced in real time: right after the start, the ACK for frame 1 has not arrived yet.
  await expect(page.getByTestId('logs').getByText('ACK for frame 1 received')).toHaveCount(0);
  await expect(page.getByTestId('logs').getByText('All frames sent successfully')).toBeVisible({ timeout: 15_000 });
  const elapsed = (Date.now() - started) / 1000;
  expect(elapsed, 'three 1 s round trips take at least ~3 s').toBeGreaterThanOrEqual(2.5);
  await expect(page.getByTestId('summary')).toContainText('3 of 3 frames delivered');
  const all = await lines.allTextContents();
  expect(all.join('\n')).not.toContain('undefined');

  await page.getByLabel('Frames (comma-separated)').fill('1,,2');
  await page.getByRole('button', { name: 'Simulate' }).click();
  await expect(page.getByRole('alert')).toContainText('Empty frame');

  await page.getByLabel('Frames (comma-separated)').fill('1,2');
  await page.getByLabel('Timeout (seconds)').fill('1');
  await page.getByRole('button', { name: 'Simulate' }).click();
  await expect(page.getByRole('alert')).toContainText('Timeout must be');
});
