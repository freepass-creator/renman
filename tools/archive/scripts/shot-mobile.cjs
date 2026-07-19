const { chromium } = require('C:/dev/_cap/node_modules/playwright-core');
(async () => {
  const b = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const ctx = await b.newContext({ viewport: { width: 402, height: 860 }, isMobile: true, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  await p.goto('http://localhost:6006/', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(3800);
  await p.screenshot({ path: 'C:/dev/jpkerp6-app/docs/m-cockpit.png' }); console.log('cockpit');
  try { await p.getByRole('button', { name: '자산 흐름' }).click({ timeout: 4000 }); await p.waitForTimeout(1200);
    await p.screenshot({ path: 'C:/dev/jpkerp6-app/docs/m-asset.png' }); console.log('asset'); } catch (e) { console.log('asset skip', e.message); }
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
