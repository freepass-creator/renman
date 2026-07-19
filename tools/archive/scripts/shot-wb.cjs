const { chromium } = require('C:/dev/_cap/node_modules/playwright-core');
(async () => {
  const b = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const p = await b.newPage({ viewport: { width: 1100, height: 500 } });
  await p.goto('http://localhost:6006/dev/workbench', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(2500);
  await p.screenshot({ path: 'C:/dev/jpkerp6-app/docs/shot-wb.png' });
  console.log('shot wb');
  await b.close();
})().catch(e=>{console.error(e.message);process.exit(1);});
