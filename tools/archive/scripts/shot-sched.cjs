const { chromium } = require('C:/dev/_cap/node_modules/playwright-core');
(async () => {
  const b = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const ctx = await b.newContext({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  await p.goto('http://localhost:6006/vehicle/365%EC%A3%BC3303', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(3500);
  await p.evaluate(() => document.getElementById('v-schedule')?.scrollIntoView({ block: 'start' }));
  await p.waitForTimeout(700);
  await p.screenshot({ path: 'C:/dev/jpkerp6-app/docs/sched.png' }); console.log('sched');
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
