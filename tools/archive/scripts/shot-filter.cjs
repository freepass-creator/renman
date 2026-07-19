const { chromium } = require('C:/dev/_cap/node_modules/playwright-core');
(async () => {
  const b = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const ctx = await b.newContext({ viewport: { width: 1460, height: 950 } });
  const p = await ctx.newPage();
  await p.goto('http://localhost:6006/', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(3500);
  // 자산현황 렌즈로(회사뱃지 잘 보임)
  await p.click('button:has-text("자산현황")');
  await p.waitForTimeout(800);
  await p.screenshot({ path: 'C:/dev/jpkerp6-app/docs/flt-all.png', clip: { x: 0, y: 40, width: 1460, height: 320 } });
  console.log('flt-all');
  // 회사 스위처 열기 → 웰릭스 선택
  await p.click('button[title="보는 회사"]');
  await p.waitForTimeout(400);
  await p.click('button:has-text("웰릭스모빌리티")');
  await p.waitForTimeout(1200);
  await p.screenshot({ path: 'C:/dev/jpkerp6-app/docs/flt-welrix.png', clip: { x: 0, y: 40, width: 1460, height: 320 } });
  console.log('flt-welrix');
  await b.close();
})().catch((e) => { console.error(e.message); process.exit(1); });
