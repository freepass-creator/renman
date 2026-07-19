const { chromium } = require('C:/dev/_cap/node_modules/playwright-core');
(async () => {
  const b = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const ctx = await b.newContext({ viewport: { width: 402, height: 860 }, isMobile: true, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  await p.goto('http://localhost:6006/vehicle/365%EC%A3%BC3303?do=unpaid', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(3800);
  await p.screenshot({ path: 'C:/dev/jpkerp6-app/docs/m-detail.png' }); console.log('m-detail');
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
