const { chromium } = require('C:/dev/_cap/node_modules/playwright-core');
(async () => {
  const plate = process.argv[2] || '59가1616';
  const b = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const ctx = await b.newContext({ viewport: { width: 900, height: 1200 }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  await p.goto('http://localhost:6006/vehicle/' + encodeURIComponent(plate), { waitUntil: 'networkidle', timeout: 30000 });
  await p.waitForTimeout(3500);
  await p.evaluate((pl) => window.dispatchEvent(new CustomEvent('jpk:print-doc', { detail: { type: 'settlement', plate: pl } })), plate);
  await p.waitForTimeout(1800);
  await p.screenshot({ path: 'C:/dev/jpkerp6-app/docs/settlement.png', fullPage: true }); console.log('settlement', plate);
  await b.close();
})().catch((e) => { console.error(e.message); process.exit(1); });
