const { chromium } = require('C:/dev/_cap/node_modules/playwright-core');
(async () => {
  const b = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const ctx = await b.newContext({ viewport: { width: 1460, height: 900 } });
  const p = await ctx.newPage();
  await p.goto('http://localhost:6006/', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(3500);
  await p.click('button:has-text("고객현황")');
  await p.waitForTimeout(1000);
  // 첫 섹션(미수 고객) 접기
  await p.locator('button:has-text("미수 고객")').first().click();
  await p.waitForTimeout(600);
  await p.screenshot({ path: 'C:/dev/jpkerp6-app/docs/drag-proof.png', clip: { x: 0, y: 100, width: 1460, height: 320 } });
  console.log('drag-proof shot');
  await b.close();
})().catch((e) => { console.error(e.message); process.exit(1); });
