const { chromium } = require('C:/dev/_cap/node_modules/playwright-core');
(async () => {
  const b = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const ctx = await b.newContext({ viewport: { width: 1460, height: 1000 } });
  const p = await ctx.newPage();
  await p.goto('http://localhost:6006/', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(3500);
  // 1) 버튼 정렬(메뉴 닫힘) — 톱바 크롭
  await p.screenshot({ path: 'C:/dev/jpkerp6-app/docs/nav-bar.png', clip: { x: 0, y: 0, width: 1460, height: 130 } });
  console.log('nav-bar shot');
  // 2) 클릭으로 메뉴 열기
  await p.click('button[aria-label="메뉴"]');
  await p.waitForTimeout(500);
  await p.screenshot({ path: 'C:/dev/jpkerp6-app/docs/nav-menu.png' });
  console.log('nav-menu shot (click)');
  await b.close();
})().catch((e) => { console.error(e.message); process.exit(1); });
