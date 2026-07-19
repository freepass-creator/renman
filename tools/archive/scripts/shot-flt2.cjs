const { chromium } = require('C:/dev/_cap/node_modules/playwright-core');
(async () => {
  const b = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const ctx = await b.newContext({ viewport: { width: 1460, height: 950 } });
  const p = await ctx.newPage();
  await p.goto('http://localhost:6006/', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(3500);
  await p.click('button[title="보는 회사"]');
  await p.waitForTimeout(400);
  await p.click('button:has-text("웰릭스모빌리티")');
  await p.waitForTimeout(1000);
  // 워크스페이스로 이동(세션 companyId=welrix 유지되는지)
  await p.goto('http://localhost:6006/penalty', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(2500);
  await p.screenshot({ path: 'C:/dev/jpkerp6-app/docs/flt-penalty.png', clip: { x: 0, y: 0, width: 1460, height: 640 } });
  console.log('flt-penalty');
  await b.close();
})().catch((e) => { console.error(e.message); process.exit(1); });
