const { chromium } = require('C:/dev/_cap/node_modules/playwright-core');
(async () => {
  const b = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const ctx = await b.newContext({ viewport: { width: 1460, height: 940 } });
  const p = await ctx.newPage();
  await p.goto('http://localhost:6006/', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(3800); // 자동시드
  await p.screenshot({ path: 'C:/dev/jpkerp6-app/docs/surf-cockpit.png' }); console.log('cockpit');
  for (const [name, label] of [['asset', '자산 흐름'], ['money', '돈 흐름']]) {
    try { await p.getByRole('button', { name: label }).click({ timeout: 3000 }); await p.waitForTimeout(1500);
      await p.screenshot({ path: 'C:/dev/jpkerp6-app/docs/surf-' + name + '.png' }); console.log(name); } catch (e) { console.log(name, 'skip', e.message); }
  }
  // 자산 흐름에서 첫 행 더블클릭 → 360 드로어
  try {
    await p.getByRole('button', { name: '자산 흐름' }).click({ timeout: 3000 }); await p.waitForTimeout(1200);
    await p.locator('table tbody tr').first().click(); await p.waitForTimeout(1800);
    await p.screenshot({ path: 'C:/dev/jpkerp6-app/docs/surf-drawer.png' }); console.log('drawer');
  } catch (e) { console.log('drawer skip', e.message); }
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
