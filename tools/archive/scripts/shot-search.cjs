const { chromium } = require('C:/dev/_cap/node_modules/playwright-core');
(async () => {
  const b = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const ctx = await b.newContext({ viewport: { width: 1460, height: 760 }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  await p.goto('http://localhost:6006/', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(3500);
  await p.getByPlaceholder('차량번호·차명 검색').fill('카니발');
  await p.waitForTimeout(600);
  await p.screenshot({ path: 'C:/dev/jpkerp6-app/docs/search.png' }); console.log('search');
  await b.close();
})().catch((e) => { console.error(e.message); process.exit(1); });
