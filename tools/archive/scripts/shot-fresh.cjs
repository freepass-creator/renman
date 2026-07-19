// 자동시드 검증 — 깨끗한 컨텍스트에서 버튼 안 누르고 데이터가 뜨는지
const { chromium } = require('C:/dev/_cap/node_modules/playwright-core');
(async () => {
  const b = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const ctx = await b.newContext({ viewport: { width: 1460, height: 900 } }); // 새 컨텍스트=빈 localStorage
  const p = await ctx.newPage();
  for (const [name, path] of Object.entries({ home: '/', ops: '/ops' })) {
    await p.goto('http://localhost:6006' + path, { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(3500); // 자동시드 완료 대기
    await p.screenshot({ path: 'C:/dev/jpkerp6-app/docs/fresh-' + name + '.png' });
    console.log('fresh', name);
  }
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
