const { chromium } = require('C:/dev/_cap/node_modules/playwright-core');
(async () => {
  const b = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const p = await b.newPage({ viewport: { width: 1460, height: 900 } });
  await p.goto('http://localhost:6006/', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(1500);
  // 시드: 아바타 메뉴 → 샘플 데이터 채우기
  try {
    await p.click('button[title="운영자 (수탁사)"]', { timeout: 4000 });
    await p.getByRole('button', { name: '샘플 데이터 채우기' }).click({ timeout: 4000 });
    await p.waitForTimeout(4500);
  } catch (e) { console.log('seed click skipped:', e.message); }
  const pages = { home: '/', ops: '/ops', risk: '/integrity', contract: '/contract' };
  for (const [name, path] of Object.entries(pages)) {
    await p.goto('http://localhost:6006' + path, { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(2600);
    await p.screenshot({ path: 'C:/dev/jpkerp6-app/docs/shot-' + name + '.png' });
    console.log('shot', name);
  }
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
