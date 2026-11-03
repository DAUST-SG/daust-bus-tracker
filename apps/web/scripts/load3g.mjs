// Usage: node scripts/load3g.mjs [pageUrl]   (needs Google Chrome; CHROME_PATH to override)
// First visit (empty cache) under Chrome DevTools' network presets, 360x800 phone viewport.
// Measures: first paint, and "buses visible" = first .bus card rendered from live Convex data.
import puppeteer from "puppeteer-core";
const URL = process.argv[2] ?? "http://localhost:3001/";
const PRESETS = {
  "Fast 3G": { latency: 562.5, downloadThroughput: 180000, uploadThroughput: 84375 },
  "Slow 3G": { latency: 2000, downloadThroughput: 50000, uploadThroughput: 50000 },
};
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
for (const [name, cond] of Object.entries(PRESETS)) {
  const runs = [];
  for (let i = 0; i < 3; i++) {
    const ctx = await browser.createBrowserContext(); // fresh cache each run
    const page = await ctx.newPage();
    await page.setViewport({ width: 360, height: 800, isMobile: true, deviceScaleFactor: 2 });
    const cdp = await page.createCDPSession();
    await cdp.send("Network.enable");
    await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
    await cdp.send("Network.emulateNetworkConditions", { offline: false, ...cond });
    let bytes = 0;
    cdp.on("Network.loadingFinished", (e) => (bytes += e.encodedDataLength));
    const t0 = Date.now();
    await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForSelector(".bus", { timeout: 60000 });
    // "buses visible" = first paint that includes a bus card (cards present at FCP if server-rendered).
    await page.waitForFunction(() => performance.getEntriesByName("first-contentful-paint").length > 0, { timeout: 60000 });
    const fcp = await page.evaluate(() => performance.getEntriesByName("first-contentful-paint")[0].startTime);
    const busesMs = Date.now() - t0; // first .bus card in the DOM, or FCP if it was already in the HTML
    await page.waitForFunction(() => document.readyState === "complete", { timeout: 60000 });
    await new Promise((r) => setTimeout(r, 3000)); // let JS chunks + websocket settle
    const loadMs = Math.round(await page.evaluate(() => performance.getEntriesByType("navigation")[0].loadEventEnd));
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    runs.push({ fcp: Math.round(fcp), busesMs: Math.max(Math.round(fcp), busesMs), loadMs, kb: Math.round(bytes / 1024), overflow });
    await ctx.close();
  }
  console.log(name, JSON.stringify(runs));
}
await browser.close();
