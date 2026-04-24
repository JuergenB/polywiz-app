// Backfill The Intersect posts: rewrite Curated.co `twenty_by_nine_*` image URLs
// in Airtable to `original_ratio_extra_large`. Skips any post whose Image URL is
// no longer a Curated pattern (i.e., already enriched — slides applied, blob
// replacement from scheduling, or a manual image swap).
//
// Usage: node --env-file=.env.local scripts/backfill-intersect-curated-originals.mjs [--dry-run]

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const BASE_ID = "app5FPCG06huzh7hX";
const POSTS_TABLE = "tblyUEPOJXxpQDZNL";
const CAMPAIGNS_TABLE = "tbl4S3vdDR4JgBT1d";
const INTERSECT_BRAND_ID = "recQ69SHPps9W5z0U";

const DRY_RUN = process.argv.includes("--dry-run");

const CURATED_IMAGE_PATTERN =
  /^(https?:\/\/[^/]+\/production\/link\/image\/\d+\/)(?:twenty_by_nine|sixteen_by_nine|four_by_three|three_by_four|four_by_five|square)_(?:extra_large|large|medium|small|thumb)_([a-f0-9-]+\.(?:jpe?g|png))$/i;

function rewriteCuratedUrl(url) {
  const m = url.match(CURATED_IMAGE_PATTERN);
  if (!m) return null;
  return `${m[1]}original_ratio_extra_large_${m[2]}`;
}

async function preferUncroppedVariant(url) {
  const rewritten = rewriteCuratedUrl(url);
  if (!rewritten || rewritten === url) return url;
  try {
    const res = await fetch(rewritten, { method: "HEAD" });
    return res.ok ? rewritten : url;
  } catch {
    return url;
  }
}

async function at(path) {
  const r = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${path}`, {
    headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` },
  });
  if (!r.ok) throw new Error(`Airtable ${r.status}: ${await r.text()}`);
  return r.json();
}
async function atAll(path) {
  const out = []; let offset;
  do {
    const sep = path.includes("?") ? "&" : "?";
    const url = offset ? `${path}${sep}offset=${offset}` : path;
    const data = await at(url);
    out.push(...data.records);
    offset = data.offset;
  } while (offset);
  return out;
}
async function patch(table, id, fields) {
  const r = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${table}/${id}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ fields }),
  });
  if (!r.ok) throw new Error(`Airtable PATCH ${r.status}: ${await r.text()}`);
  return r.json();
}

// ── Gather Intersect campaigns + their posts ───────────────────────────────
const campaigns = await atAll(`${CAMPAIGNS_TABLE}?pageSize=100`);
const intersectCampaigns = campaigns.filter((c) => (c.fields.Brand || []).includes(INTERSECT_BRAND_ID));
const campaignIds = new Set(intersectCampaigns.map((c) => c.id));
console.log(`Intersect campaigns: ${intersectCampaigns.length}`);

const allPosts = await atAll(`${POSTS_TABLE}?pageSize=100`);
const intersectPosts = allPosts.filter((p) => campaignIds.has((p.fields.Campaign || [])[0]));
console.log(`Intersect posts total: ${intersectPosts.length}`);

// ── For each post: rewrite any Curated pattern URLs in Image URL + Media URLs ──
// Skip gates (post is considered "enriched" and left alone):
//   - Status = Published (live on social media)
//   - Image URL no longer matches Curated pattern (already blob, already swapped, slides applied)
let scanned = 0, needsUpdate = 0, updated = 0, skipped = 0, scheduledUpdated = 0;
for (const p of intersectPosts) {
  scanned++;
  const f = p.fields;

  if (f.Status === "Published") { skipped++; continue; }

  const imageUrl = f["Image URL"] || "";
  const mediaUrls = (f["Media URLs"] || "").split("\n").map((s) => s.trim()).filter(Boolean);

  // Check: is Image URL on the Curated pattern? Anything else (blob, outpainted, replaced) skip.
  const imageNeedsRewrite = CURATED_IMAGE_PATTERN.test(imageUrl);
  const mediaToRewrite = mediaUrls.filter((u) => CURATED_IMAGE_PATTERN.test(u));

  if (!imageNeedsRewrite && mediaToRewrite.length === 0) {
    skipped++;
    continue;
  }
  needsUpdate++;

  // Rewrite with HEAD verification
  const newImageUrl = imageNeedsRewrite ? await preferUncroppedVariant(imageUrl) : imageUrl;
  const newMediaArr = await Promise.all(mediaUrls.map((u) => CURATED_IMAGE_PATTERN.test(u) ? preferUncroppedVariant(u) : Promise.resolve(u)));
  const newMediaStr = newMediaArr.join("\n");

  const imageChanged = newImageUrl !== imageUrl;
  const mediaChanged = newMediaStr !== (f["Media URLs"] || "");

  if (!imageChanged && !mediaChanged) {
    console.log(`[${p.id}] HEAD checks failed on all Curated URLs — leaving unchanged`);
    continue;
  }

  const updates = {};
  if (imageChanged) updates["Image URL"] = newImageUrl;
  if (mediaChanged) updates["Media URLs"] = newMediaStr;

  console.log(`[${p.id}] ${f.Platform} | ${f.Status} | ${imageChanged ? "Image ✓" : ""} ${mediaChanged ? `Media ✓ (${mediaToRewrite.length})` : ""}`);
  if (!DRY_RUN) {
    await patch("Posts", p.id, updates);
    updated++;
    if (f.Status === "Scheduled") scheduledUpdated++;
  }
}

console.log(`\n━━ Summary ━━`);
console.log(`Scanned: ${scanned}`);
console.log(`Already enriched or Published (skipped): ${skipped}`);
console.log(`Needed rewrite: ${needsUpdate}`);
console.log(`Updated: ${DRY_RUN ? "(dry run — nothing written)" : updated}`);
if (scheduledUpdated > 0) {
  console.log(`\n⚠  ${scheduledUpdated} Scheduled posts updated in Airtable.`);
  console.log(`   Zernio still has the old cropped URL for these posts.`);
  console.log(`   Unschedule + reschedule each to propagate the new URL to Zernio`);
  console.log(`   (or wait until natural next edit — /api/posts/[id] PATCH syncs to Zernio).`);
}
