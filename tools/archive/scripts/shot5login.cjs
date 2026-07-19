const { chromium } = require('C:/dev/_cap/node_modules/playwright-core');
(async () => {
  const b = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const ctx = await b.newContext({ viewport: { width: 1600, height: 1000 } });
  const p = await ctx.newPage();
  await p.goto('http://localhost:7502/', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(1500);
  // 로그인
  try {
    await p.getByPlaceholder('name@company.com').fill('pyh@teamjpk.com');
    await p.getByPlaceholder('비밀번호 입력').fill('000000');
    await p.getByRole('button', { name: '로그인' }).click();
    await p.waitForTimeout(5000);
    console.log('after login url:', p.url());
  } catch (e) { console.log('login err:', e.message.slice(0,120)); }

  const pages = { ops: '/', dashboard: '/dashboard', asset: '/asset', contract: '/contract', receivables: '/receivables', finance: '/finance', penalty: '/penalty', general: '/general' };
  for (const [name, path] of Object.entries(pages)) {
    try {
      await p.goto('http://localhost:7502' + path, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await p.waitForTimeout(2600);
      await p.screenshot({ path: 'C:/dev/jpkerp6-app/docs/j5-' + name + '.png' });
      console.log('shot', name, '→', p.url());
    } catch (e) { console.log('fail', name, e.message.slice(0,80)); }
  }
  // 상세 다이얼로그: 자산 첫 행 더블클릭
  try {
    await p.goto('http://localhost:7502/asset', { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(2500);
    const row = p.locator('tbody tr').first();
    await row.dblclick({ timeout: 4000 });
    await p.waitForTimeout(2000);
    await p.screenshot({ path: 'C:/dev/jpkerp6-app/docs/j5-detail.png' });
    console.log('shot detail');
  } catch (e) { console.log('detail fail:', e.message.slice(0,80)); }
  await b.close();
})().catch((e) => { console.error(e.message); process.exit(1); });
