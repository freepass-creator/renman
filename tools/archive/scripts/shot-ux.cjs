const { chromium } = require('C:/dev/_cap/node_modules/playwright-core');
(async () => {
  const b = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const ctx = await b.newContext({ viewport: { width: 1460, height: 940 } });
  const p = await ctx.newPage();
  await p.goto('http://localhost:6006/', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(3800);
  await p.screenshot({ path: 'C:/dev/jpkerp6-app/docs/ux-home.png' }); console.log('home');
  // ⌘K 팔레트
  await p.getByRole('button', { name: /차량·손님 검색/ }).click({ timeout: 4000 }); await p.waitForTimeout(700);
  await p.getByPlaceholder(/차량번호/).fill('쏘렌토'); await p.waitForTimeout(700);
  await p.screenshot({ path: 'C:/dev/jpkerp6-app/docs/ux-palette.png' }); console.log('palette');
  // Enter → 360 드로어 (전역)
  await p.keyboard.press('Enter'); await p.waitForTimeout(1800);
  await p.screenshot({ path: 'C:/dev/jpkerp6-app/docs/ux-drawer.png' }); console.log('drawer');
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
