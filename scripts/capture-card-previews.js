#!/usr/bin/env node
/**
 * Capture card template previews from the running app.
 * Logs in, opens a temp post, clicks through each template in the Cards designer,
 * and screenshots the rendered preview image.
 */
const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");

const TEST_EMAIL = process.env.TEST_EMAIL;
if (!TEST_EMAIL) { console.error("TEST_EMAIL env var required"); process.exit(1); }

const BASE_URL = "http://localhost:3025";
const CAMPAIGN_ID = "recws3TFlRAxXgGf6"; // Temp preview campaign
const OUT_DIR = path.join(process.cwd(), "docs", "template-previews");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 900, deviceScaleFactor: 2 });

  // Login
  console.log("Logging in...");
  await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle2", timeout: 15000 });
  await page.type('input[name="email"]', TEST_EMAIL);
  await page.type('input[name="password"]', process.env.POLYWIZ_APP_PASSWORD);
  await page.click('button[type="submit"]');
  await sleep(3000);

  // Navigate to campaign
  console.log("Opening campaign...");
  await page.goto(`${BASE_URL}/dashboard/campaigns/${CAMPAIGN_ID}`, {
    waitUntil: "networkidle2",
    timeout: 30000,
  });
  await sleep(5000);

  // Click first post
  const postRows = await page.$$('[role="button"]');
  if (postRows.length === 0) {
    console.error("No posts found");
    await page.screenshot({ path: path.join(OUT_DIR, "debug.png") });
    await browser.close();
    return;
  }
  await postRows[0].click();
  console.log("Opened post detail");
  await sleep(2000);

  // Click Cards button
  let cardsBtn = null;
  for (const btn of await page.$$("button")) {
    const text = await page.evaluate((el) => el.textContent, btn);
    if (text && text.includes("Cards")) { cardsBtn = btn; break; }
  }
  if (!cardsBtn) {
    console.error("Cards button not found");
    await page.screenshot({ path: path.join(OUT_DIR, "debug-no-cards.png") });
    await browser.close();
    return;
  }
  await cardsBtn.click();
  console.log("Opened card gallery");
  await sleep(2000);

  // Find template buttons
  const templateCards = await page.$$("button.group");
  console.log(`Found ${templateCards.length} templates`);

  for (let i = 0; i < templateCards.length; i++) {
    const cards = await page.$$("button.group");
    if (i >= cards.length) break;

    const name = await page.evaluate((el) => {
      const p = el.querySelector("p");
      return p ? p.textContent.trim() : "unknown";
    }, cards[i]);

    console.log(`\n--- Template ${i + 1}: ${name} ---`);
    await cards[i].click();

    // Wait for AI generation + render
    console.log("  Waiting for generation + render...");
    await sleep(15000);

    // Find the preview image
    const previewImg = await page.$('img[alt="Cover slide preview"]');
    if (previewImg) {
      const box = await previewImg.boundingBox();
      if (box && box.width > 50) {
        const slug = name.toLowerCase().replace(/[·\s]+/g, "-").replace(/--+/g, "-").replace(/^-|-$/g, "");

        // Screenshot just the preview image
        const outPath = path.join(OUT_DIR, `${slug}.png`);
        await page.screenshot({
          path: outPath,
          clip: { x: box.x, y: box.y, width: box.width, height: box.height },
        });
        console.log(`  Saved: ${slug}.png (${Math.round(box.width)}x${Math.round(box.height)})`);

        // Also take a full-page screenshot for context
        await page.screenshot({ path: path.join(OUT_DIR, `${slug}-full.png`) });
      } else {
        console.log("  Preview too small or not rendered");
        await page.screenshot({ path: path.join(OUT_DIR, `debug-${i}.png`) });
      }
    } else {
      console.log("  No preview image found");
      await page.screenshot({ path: path.join(OUT_DIR, `debug-${i}.png`) });
    }

    // Back to gallery
    const backBtn = await page.$('button[title="Back to templates"]');
    if (backBtn) {
      await backBtn.click();
      await sleep(1500);
    }
  }

  await browser.close();
  console.log("\nDone! Check:", OUT_DIR);
}

main().catch((err) => { console.error("Fatal:", err); process.exit(1); });
