import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  
  try {
    await page.goto("https://masum-portfolio-green.vercel.app/", {waitUntil: 'networkidle0', timeout: 30000});
    await new Promise(r => setTimeout(r, 2000));
    
    // Attempt to click Experience
    await page.evaluate(() => {
        const els = Array.from(document.querySelectorAll('a, button, li, span, div'));
        for (const el of els) {
            if (el.textContent.trim().toLowerCase() === 'experience') {
                el.click();
                console.log("Clicked experience");
                return;
            }
        }
    });

    await new Promise(r => setTimeout(r, 4000)); // wait for scroll/render
    
    const text = await page.evaluate(() => document.body.innerText);
    console.log("--- BODY INNER TEXT AFTER CLICK ---");
    console.log(text.substring(0, 1000));
    
  } catch (err) {
    console.error("Error scraping:", err);
  } finally {
    await browser.close();
  }
})();
