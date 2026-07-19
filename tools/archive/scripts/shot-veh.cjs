const { chromium } = require('C:/dev/_cap/node_modules/playwright-core');
(async () => {
  const b = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const p = await b.newPage({ viewport: { width: 1460, height: 1000 } });
  await p.goto('http://localhost:6006/', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(1500);
  try { await p.click('button[title="운영자 (수탁사)"]', { timeout: 4000 }); await p.getByRole('button', { name: '샘플 데이터 채우기' }).click({ timeout: 4000 }); await p.waitForTimeout(3500); } catch(e){ console.log('seed:', e.message.slice(0,50)); }
  await p.goto('http://localhost:6006/vehicle/' + encodeURIComponent('12가3456'), { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(2600);
  await p.screenshot({ path: 'C:/dev/jpkerp6-app/docs/shot-veh.png' });
  console.log('shot veh');
  await b.close();
})().catch(e=>{console.error(e.message);process.exit(1);});
