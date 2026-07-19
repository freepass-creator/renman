const { chromium } = require('C:/dev/_cap/node_modules/playwright-core');
(async () => {
  const b = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const p = await (await b.newContext({ viewport: { width: 1600, height: 1000 } })).newPage();
  await p.goto('http://localhost:7502/', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(1500);
  await p.getByPlaceholder('name@company.com').fill('pyh@teamjpk.com');
  await p.getByPlaceholder('비밀번호 입력').fill('000000');
  await p.getByRole('button', { name: '로그인' }).click();
  await p.waitForTimeout(5000);
  // 온보딩 건너뛰기
  for (let i = 0; i < 3; i++) {
    try { await p.getByRole('button', { name: '건너뛰기' }).click({ timeout: 2500 }); await p.waitForTimeout(600); } catch (e) { break; }
  }
  await p.waitForTimeout(1000);
  const pages = { ops: '/', dashboard: '/dashboard', asset: '/asset', contract: '/contract', receivables: '/receivables', finance: '/finance' };
  for (const [name, path] of Object.entries(pages)) {
    try {
      await p.goto('http://localhost:7502' + path, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await p.waitForTimeout(3000);
      try { await p.getByRole('button', { name: '건너뛰기' }).click({ timeout: 800 }); } catch (e) {}
      await p.screenshot({ path: 'C:/dev/jpkerp6-app/docs/j5-' + name + '.png' });
      console.log('shot', name);
    } catch (e) { console.log('fail', name, e.message.slice(0,60)); }
  }
  // 자산 상세 다이얼로그
  try {
    await p.goto('http://localhost:7502/asset', { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(3500);
    await p.locator('table tbody tr').first().dblclick({ timeout: 6000 });
    await p.waitForTimeout(2500);
    await p.screenshot({ path: 'C:/dev/jpkerp6-app/docs/j5-detail.png' });
    console.log('shot detail');
  } catch (e) { console.log('detail fail:', e.message.slice(0,70)); }
  await b.close();
})().catch(e => { console.error(e.message); process.exit(1); });
