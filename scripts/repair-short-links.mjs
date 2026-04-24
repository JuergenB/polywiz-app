#!/usr/bin/env node
// Repair broken Short.io links by recreating them at their original path.
// Short.io dedupes on originalURL, so the fix is non-destructive: the existing
// URL string in Airtable and in already-published post text keeps working.
//
// Usage:
//   node --env-file=.env.local scripts/repair-short-links.mjs          # dry-run
//   node --env-file=.env.local scripts/repair-short-links.mjs --execute
//   node --env-file=.env.local scripts/repair-short-links.mjs --campaign recZB17eRt4LOx5Vb
//
// Strategy per broken post:
//  1. HTTP-probe the Short URL. If it 200s, skip.
//  2. If 404, reconstruct originalURL from:
//       base = post.Link URL (campaign root)
//       anchor = matched Scraped Images entry (by storyTitle vs post.Content / First Comment)
//       UTMs = utm_source=<platform>, utm_medium=social, utm_campaign=<campaign slug>
//  3. POST to Short.io with that originalURL + path = existing path.

const EXECUTE = process.argv.includes("--execute");
const CAMPAIGN_FILTER = (() => {
  const i = process.argv.indexOf("--campaign");
  return i >= 0 ? process.argv[i + 1] : null;
})();

// Manual anchor overrides (map of short URL path → story anchor).
// Used when the keyword matcher can't confidently map a post to a story —
// confirmed by a human eye on the post's content.
const MANUAL_ANCHOR_OVERRIDES = {
  fzoFz1: "wGCTr0x", // Intersect 74 — When the Body Becomes the Brush
  eZB12G: "wGCTr0x", // Intersect 74 — When the Body Becomes the Brush
  W8vEt6: "KuIH7g2", // Intersect 74 — A Shining Example of How Not to Use AI
  EmtisO: "KuIH7g2", // Intersect 74 — A Shining Example of How Not to Use AI
};

const AIRTABLE_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE = "app5FPCG06huzh7hX";

const SHORT_IO_DEFAULT_KEY = process.env.SHORT_IO_API_KEY;
const PER_BRAND_KEY = {
  "The Intersect": process.env.SHORT_IO_KEY_INTERSECT,
  "Not Real Art": process.env.SHORT_IO_KEY_ARTERIAL,
  "Artsville USA": process.env.SHORT_IO_KEY_ARTERIAL,
  "Sugar Press Art": process.env.SHORT_IO_KEY_ARTERIAL,
};

const airtableGet = async (path) => {
  const res = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE}${path}`, {
    headers: { Authorization: `Bearer ${AIRTABLE_KEY}` },
  });
  if (!res.ok) throw new Error(`Airtable ${res.status}: ${await res.text()}`);
  return res.json();
};

const listPosts = async (filterFormula) => {
  const all = [];
  let offset;
  do {
    const qs = new URLSearchParams();
    if (filterFormula) qs.set("filterByFormula", filterFormula);
    qs.set("pageSize", "100");
    if (offset) qs.set("offset", offset);
    const data = await airtableGet(`/Posts?${qs}`);
    all.push(...(data.records || []));
    offset = data.offset;
  } while (offset);
  return all;
};

const probe = async (url) => {
  try {
    const res = await fetch(url, { method: "HEAD", redirect: "follow", signal: AbortSignal.timeout(5000) });
    return res.status;
  } catch {
    return 0;
  }
};

const slugify = (name) =>
  (name || "campaign").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);

const buildTarget = (linkUrl, anchor, platform, campaignSlug) => {
  const u = new URL(linkUrl);
  u.hash = ""; // strip any pre-existing fragment; we'll set our own below
  u.searchParams.set("utm_source", platform.toLowerCase());
  u.searchParams.set("utm_medium", "social");
  u.searchParams.set("utm_campaign", campaignSlug);
  let s = u.toString();
  if (anchor) s = `${s}#${anchor}`;
  return s;
};

// Find the best-matching story anchor from a campaign's Scraped Images
// by word-overlap between each entry's storyTitle and the post text.
const matchStory = (scrapedImages, postText) => {
  if (!Array.isArray(scrapedImages) || !postText) return null;
  const text = postText.toLowerCase();
  let best = null;
  let bestScore = 0;
  for (const img of scrapedImages) {
    if (!img?.anchor || !img?.storyTitle) continue;
    const words = img.storyTitle.toLowerCase().split(/\W+/).filter((w) => w.length >= 4);
    if (!words.length) continue;
    const hits = words.filter((w) => text.includes(w)).length;
    const score = hits / words.length;
    if (score > bestScore && score >= 0.35) {
      bestScore = score;
      best = img;
    }
  }
  return best;
};

const recreateShort = async (path, originalURL, apiKey, domain, title) => {
  const res = await fetch("https://api.short.io/links", {
    method: "POST",
    headers: {
      Authorization: apiKey,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ domain, originalURL, path, title, allowDuplicates: false }),
  });
  const body = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, body };
};

const main = async () => {
  if (!AIRTABLE_KEY) throw new Error("AIRTABLE_API_KEY missing");

  console.log(`Mode: ${EXECUTE ? "EXECUTE" : "DRY RUN"}${CAMPAIGN_FILTER ? ` | Campaign: ${CAMPAIGN_FILTER}` : ""}`);
  console.log("");

  // Campaign + brand cache
  const campaignCache = new Map();
  const brandCache = new Map();
  const getCampaign = async (id) => {
    if (!campaignCache.has(id)) campaignCache.set(id, (await airtableGet(`/Campaigns/${id}`)).fields);
    return campaignCache.get(id);
  };
  const getBrand = async (id) => {
    if (!brandCache.has(id)) brandCache.set(id, (await airtableGet(`/Brands/${id}`)).fields);
    return brandCache.get(id);
  };

  const filter = `NOT({Short URL}=BLANK())`;
  const posts = await listPosts(filter);
  console.log(`Loaded ${posts.length} posts with Short URLs`);

  const broken = [];
  let checked = 0;
  const CONCURRENCY = 8;
  for (let i = 0; i < posts.length; i += CONCURRENCY) {
    const slice = posts.slice(i, i + CONCURRENCY);
    await Promise.all(
      slice.map(async (p) => {
        const url = p.fields["Short URL"];
        const code = await probe(url);
        checked++;
        if (code === 404) broken.push(p);
      })
    );
    process.stdout.write(`\r  probed ${checked}/${posts.length}`);
  }
  console.log(`\nBroken short links: ${broken.length}`);
  console.log("");

  const filtered = CAMPAIGN_FILTER
    ? broken.filter((p) => (p.fields.Campaign || []).includes(CAMPAIGN_FILTER))
    : broken;
  if (CAMPAIGN_FILTER) console.log(`After campaign filter: ${filtered.length}`);

  let fixed = 0;
  let skipped = 0;
  for (const post of filtered) {
    const { fields } = post;
    const platform = fields.Platform || "";
    const shortUrl = fields["Short URL"];
    const campaignId = (fields.Campaign || [])[0];
    if (!shortUrl || !campaignId) {
      console.log(`  SKIP ${post.id}: no short URL or campaign`);
      skipped++;
      continue;
    }

    const campaign = await getCampaign(campaignId);
    const linkUrl = fields["Link URL"] || campaign.URL;
    if (!linkUrl) {
      console.log(`  SKIP ${post.id} (${platform}) ${shortUrl}: no Link URL on post or campaign`);
      skipped++;
      continue;
    }

    const brandId = (campaign.Brand || [])[0];
    const brand = brandId ? await getBrand(brandId) : null;
    const brandName = brand?.Name || "";
    const shortDomain = brand?.["Short Domain"] || process.env.SHORT_IO_DOMAIN || "jb9.me";
    const apiKey = PER_BRAND_KEY[brandName] || SHORT_IO_DEFAULT_KEY;

    const pathname = new URL(shortUrl).pathname.replace(/^\//, "");

    // Manual override wins over keyword matcher
    let scraped;
    try { scraped = campaign["Scraped Images"] ? JSON.parse(campaign["Scraped Images"]) : null; } catch {}
    let anchor = MANUAL_ANCHOR_OVERRIDES[pathname] || null;
    let story = null;
    if (anchor) {
      story = (scraped || []).find((s) => s?.anchor === anchor) || { anchor, storyTitle: "(manual override)" };
    } else {
      const text = `${fields.Content || ""} ${fields["First Comment"] || ""} ${fields.subject || ""}`;
      story = matchStory(scraped, text);
      anchor = story?.anchor || null;
    }

    const campaignSlug = slugify(campaign.Name);
    const originalURL = buildTarget(linkUrl, anchor, platform, campaignSlug);
    const title = `${campaignSlug} — ${platform.toLowerCase()}`;

    const label = `${shortUrl.padEnd(25)} ${platform.padEnd(10)} story=${(story?.storyTitle || "(root)").slice(0, 40)}`;
    console.log(`  ${EXECUTE ? "FIX " : "PLAN"} ${label}`);
    console.log(`       → ${originalURL}`);

    if (!EXECUTE) {
      fixed++;
      continue;
    }

    const result = await recreateShort(pathname, originalURL, apiKey, shortDomain, title);
    if (result.ok) {
      console.log(`       ✓ recreated (id=${(result.body?.idString || "").slice(-12)})`);
      fixed++;
    } else {
      console.log(`       ✗ failed: HTTP ${result.status} ${JSON.stringify(result.body)}`);
      skipped++;
    }
    await new Promise((r) => setTimeout(r, 300));
  }

  console.log("");
  console.log(`Summary: ${fixed} ${EXECUTE ? "recreated" : "would recreate"}, ${skipped} skipped`);
  if (!EXECUTE) console.log("Re-run with --execute to apply.");
};

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
