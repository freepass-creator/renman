const { chromium } = require('C:/dev/_cap/node_modules/playwright-core');
(async () => {
  const b = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const p = await b.newPage({ viewport: { width: 1460, height: 900 } });
  for (const [name, path] of Object.entries({ home: '/', dash: '/dashboard', asset: '/asset', contract: '/contract' })) {
    try {
      await p.goto('http://localhost:7502' + path, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await p.waitForTimeout(2500);
      await p.screenshot({ path: 'C:/dev/jpkerp6-app/docs/j5-' + name + '.png' });
      console.log('shot', name, '→', p.url());
    } catch (e) { console.log('fail', name, e.message.slice(0,80)); }
  }
  await b.close();
})().catch((e) => { console.error(e.message); process.exit(1); });
