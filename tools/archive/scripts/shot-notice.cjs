const { chromium } = require('C:/dev/_cap/node_modules/playwright-core');
(async () => {
  const b = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const ctx = await b.newContext({ viewport: { width: 900, height: 1200 }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  await p.goto('http://localhost:6006/doc/notice/365%EC%A3%BC3303', { waitUntil: 'networkidle', timeout: 30000 });
  await p.waitForTimeout(2500);
  await p.reload({ waitUntil: 'networkidle', timeout: 30000 });
  await p.waitForTimeout(2500);
  await p.screenshot({ path: 'C:/dev/jpkerp6-app/docs/notice.png', fullPage: true }); console.log('notice done');
  await b.close();
})().catch((e) => { console.error(e.message); process.exit(1); });
