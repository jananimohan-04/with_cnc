const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({ headless: 'new', defaultViewport: { width: 1280, height: 1024 } });
  const page = await browser.newPage();
  await page.goto('http://localhost:5173/sales/pipeline');
  
  await page.waitForTimeout(2000);
  
  const cards = await page.$$('h4');
  let target = null;
  for (let c of cards) {
    const text = await page.evaluate(el => el.textContent, c);
    if (text.includes('SO-2026-8580')) { target = c; break; }
  }
  
  if (target) {
    await target.click();
    await page.waitForTimeout(2000);
    
    await page.evaluate(() => {
       const el = document.querySelectorAll('h4');
       for (const e of el) {
           if (e.textContent.toUpperCase().includes('SALES ORDER DETAILS')) {
               e.scrollIntoView();
           }
       }
    });
    
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'modal_bottom.png' });
    console.log('Screenshot saved to modal_bottom.png');
  } else {
    console.log('Card not found');
  }
  
  await browser.close();
})();
