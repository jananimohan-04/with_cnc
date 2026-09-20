const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('BROWSER LOG:', msg.type(), msg.text()));
  page.on('pageerror', err => console.log('BROWSER ERROR (pageerror):', err.toString()));
  page.on('error', err => console.log('BROWSER ERROR (error):', err.toString()));
  
  // Try IPv6
  await page.goto('http://[::1]:5173/sales/pipeline');
  
  await new Promise(r => setTimeout(r, 5000));
  
  await browser.close();
})();
