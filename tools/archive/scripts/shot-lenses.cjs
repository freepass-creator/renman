const { chromium } = require('C:/dev/_cap/node_modules/playwright-core');
(async () => {
  const b = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const ctx = await b.newContext({ viewport: { width: 1460, height: 1000 } });
  const p = await ctx.newPage();
  await p.goto('http://localhost:6006/', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(3500);
  for (const [label, file] of [['자산현황', 'lens-asset'], ['자금현황', 'lens-money'], ['고객현황', 'lens-customer']]) {
    const btn = p.locator('button', { hasText: label }).first();
    await btn.click();
    await p.waitForTimeout(1400);
    await p.screenshot({ path: 'C:/dev/jpkerp6-app/docs/' + file + '.png' });
    console.log('shot', label);
  }
  await b.close();
})().catch((e) => { console.error(e.message); process.exit(1); });
