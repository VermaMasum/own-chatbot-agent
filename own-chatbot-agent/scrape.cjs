const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('https://masum-portfolio-green.vercel.app/', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);
  
  // click Experience
  await page.click('text="Experience"');
  await page.waitForTimeout(2000);
  
  const text = await page.evaluate(() => document.body.innerText);
  console.log('---TEXT---');
  console.log(text.slice(0, 1500));
  console.log('----------');
  await browser.close();
})();
