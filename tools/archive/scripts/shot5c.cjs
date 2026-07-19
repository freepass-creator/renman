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
  // 온보딩 닫기: Esc 여러번 + 텍스트 클릭 시도
  for (let i = 0; i < 6; i++) {
    await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  }
  try { await p.getByText('건너뛰기', { exact: true }).click({ timeout: 1500, force: true }); } catch (e) {}
  await p.waitForTimeout(1500);
  const bodytext = (await p.locator('body').innerText()).replace(/\s+/g,' ').slice(0,120);
  console.log('body after close:', bodytext);
  const pages = { ops: '/', asset: '/asset', contract: '/contract', receivables: '/receivables' };
  for (const [name, path] of Object.entries(pages)) {
    await p.goto('http://localhost:7502' + path, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await p.waitForTimeout(3000);
    for (let i=0;i<3;i++){ await p.keyboard.press('Escape'); await p.waitForTimeout(200);}
    await p.screenshot({ path: 'C:/dev/jpkerp6-app/docs/j5-' + name + '.png' });
    console.log('shot', name);
  }
  await b.close();
})().catch(e => { console.error(e.message); process.exit(1); });
