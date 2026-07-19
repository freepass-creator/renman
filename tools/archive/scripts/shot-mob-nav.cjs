const { chromium } = require('C:/dev/_cap/node_modules/playwright-core');
(async () => {
  const b = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const ctx = await b.newContext({ viewport: { width: 390, height: 800 }, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  await p.goto('http://localhost:6006/', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(3500);
  await p.screenshot({ path: 'C:/dev/jpkerp6-app/docs/mob-home.png' });
  console.log('mob-home');
  await p.click('button[aria-label="메뉴"]');
  await p.waitForTimeout(500);
  await p.screenshot({ path: 'C:/dev/jpkerp6-app/docs/mob-menu.png' });
  console.log('mob-menu');
  await b.close();
})().catch((e) => { console.error(e.message); process.exit(1); });
