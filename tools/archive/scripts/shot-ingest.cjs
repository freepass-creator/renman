const { chromium } = require('C:/dev/_cap/node_modules/playwright-core');
(async () => {
  const b = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const ctx = await b.newContext({ viewport: { width: 1460, height: 940 } });
  const p = await ctx.newPage();
  await p.goto('http://localhost:6006/', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(3800);
  await p.getByRole('button', { name: '+ 담기' }).click({ timeout: 4000 }); await p.waitForTimeout(900);
  await p.screenshot({ path: 'C:/dev/jpkerp6-app/docs/ingest-pick.png' }); console.log('pick');
  await p.getByRole('button', { name: /차량 등록/ }).click({ timeout: 4000 }); await p.waitForTimeout(900);
  await p.screenshot({ path: 'C:/dev/jpkerp6-app/docs/ingest-form.png' }); console.log('form');
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
