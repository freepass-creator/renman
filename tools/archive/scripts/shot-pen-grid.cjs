const { chromium } = require('C:/dev/_cap/node_modules/playwright-core');
(async () => {
  const b = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const ctx = await b.newContext({ viewport: { width: 1460, height: 950 } });
  const p = await ctx.newPage();
  await p.goto('http://localhost:6006/penalty', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(3500);
  await p.click('button:has-text("고지서 등록")');
  await p.waitForTimeout(700);
  await p.setInputFiles('input[type=file]', ['C:/dev/jpkerp6-app/docs/_test-notice.png', 'C:/dev/jpkerp6-app/docs/_test-notice.png']);
  await p.waitForTimeout(5000); // OCR 시도(키 없으면 실패→오류 행)
  await p.screenshot({ path: 'C:/dev/jpkerp6-app/docs/pen-grid.png' });
  console.log('pen-grid');
  await b.close();
})().catch((e) => { console.error(e.message); process.exit(1); });
