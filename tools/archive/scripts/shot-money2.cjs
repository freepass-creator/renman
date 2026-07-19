const { chromium } = require('C:/dev/_cap/node_modules/playwright-core');
(async () => {
  const b = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const ctx = await b.newContext({ viewport: { width: 1460, height: 940 } });
  const p = await ctx.newPage();
  await p.goto('http://localhost:6006/', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(3800);
  await p.getByRole('button', { name: '돈 흐름' }).click({ timeout: 4000 }); await p.waitForTimeout(1200);
  // 계좌 거래 첫 행 클릭 → 거래 상세 드로어
  await p.locator('table tbody tr').first().click(); await p.waitForTimeout(1500);
  await p.screenshot({ path: 'C:/dev/jpkerp6-app/docs/money-txdrawer.png' }); console.log('txdrawer');
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
