const { chromium } = require('C:/dev/_cap/node_modules/playwright-core');
(async () => {
  const path = process.argv[2] || '/penalty';
  const name = process.argv[3] || 'page';
  const b = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const ctx = await b.newContext({ viewport: { width: 1460, height: 1000 } });
  const p = await ctx.newPage();
  await p.goto('http://localhost:6006' + path, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(3500);
  await p.screenshot({ path: 'C:/dev/jpkerp6-app/docs/' + name + '.png' });
  console.log(name, 'shot');
  await b.close();
})().catch((e) => { console.error(e.message); process.exit(1); });
