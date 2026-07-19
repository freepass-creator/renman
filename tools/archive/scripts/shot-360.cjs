const { chromium } = require('C:/dev/_cap/node_modules/playwright-core');
(async () => {
  const b = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const ctx = await b.newContext({ viewport: { width: 1460, height: 1000 } });
  const p = await ctx.newPage();
  await p.goto('http://localhost:6006/', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(3500); // 자동시드
  for (const plate of (process.argv.slice(2).length ? process.argv.slice(2) : ['365주3303'])) {
    await p.goto('http://localhost:6006/vehicle/' + encodeURIComponent(plate), { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(2200);
    await p.screenshot({ path: 'C:/dev/jpkerp6-app/docs/shot-360.png' });
    console.log('360', plate);
  }
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
