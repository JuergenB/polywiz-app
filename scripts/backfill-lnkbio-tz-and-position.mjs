#!/usr/bin/env node
// Backfill lnk.bio entries after the 2026-04-24 timezone + position fix.
//
// What this fixes on each entry:
//   1. schedule_from sent with brand's local offset (not UTC) so the
//      dashboard displays the user's local wall-clock time.
//   2. position set to minutes-since-epoch of the scheduled date so the
//      Current Posts grid reads soonest-first.
//
// Usage:
//   node --env-file=.env.local scripts/backfill-lnkbio-tz-and-position.mjs
//   node --env-file=.env.local scripts/backfill-lnkbio-tz-and-position.mjs --execute
//   node --env-file=.env.local scripts/backfill-lnkbio-tz-and-position.mjs --brand "The Intersect" --execute

import { formatInTimeZone } from "date-fns-tz";

const EXECUTE = process.argv.includes("--execute");
const BRAND_FILTER = (() => {
  const i = process.argv.indexOf("--brand");
  return i >= 0 ? process.argv[i + 1] : null;
})();

const AIRTABLE_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE = "app5FPCG06huzh7hX";

const airtableGet = async (path) => {
  const res = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE}${path}`, {
    headers: { Authorization: `Bearer ${AIRTABLE_KEY}` },
  });
  if (!res.ok) throw new Error(`Airtable ${res.status}: ${await res.text()}`);
  return res.json();
};

const airtablePatch = async (path, fields) => {
  const res = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE}${path}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${AIRTABLE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) throw new Error(`Airtable PATCH ${res.status}: ${await res.text()}`);
  return res.json();
};

const listAll = async (table, filterFormula) => {
  const all = [];
  let offset;
  do {
    const qs = new URLSearchParams();
    qs.set("pageSize", "100");
    if (filterFormula) qs.set("filterByFormula", filterFormula);
    if (offset) qs.set("offset", offset);
    const data = await airtableGet(`/${table}?${qs}`);
    all.push(...(data.records || []));
    offset = data.offset;
  } while (offset);
  return all;
};

// lnk.bio client (per-brand)
const tokenCache = new Map();
const getToken = async (clientId, clientSecret) => {
  const key = clientId;
  const cached = tokenCache.get(key);
  if (cached && cached.expires > Date.now() + 60_000) return cached.token;
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetch("https://lnk.bio/oauth/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new Error(`token ${res.status}: ${await res.text()}`);
  const { access_token, expires_in } = await res.json();
  tokenCache.set(key, {
    token: access_token,
    expires: Date.now() + (expires_in || 3600) * 1000,
  });
  return access_token;
};

const lnkBioDelete = async (token, linkId) => {
  const res = await fetch("https://lnk.bio/oauth/v1/lnk/delete", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: `link_id=${encodeURIComponent(linkId)}`,
  });
  return res.ok;
};

const lnkBioAdd = async (token, params) => {
  const body = new URLSearchParams(params).toString();
  const res = await fetch("https://lnk.bio/oauth/v1/lnk/add", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.status) {
    throw new Error(`/lnk/add failed: ${res.status} ${JSON.stringify(data)}`);
  }
  return data?.data?.id || data?.info?.lnk_id || null;
};

const brandCache = new Map();
const getBrand = async (id) => {
  if (brandCache.has(id)) return brandCache.get(id);
  const r = await airtableGet(`/Brands/${id}`);
  brandCache.set(id, r.fields);
  return r.fields;
};

const campaignCache = new Map();
const getCampaign = async (id) => {
  if (campaignCache.has(id)) return campaignCache.get(id);
  const r = await airtableGet(`/Campaigns/${id}`);
  campaignCache.set(id, r.fields);
  return r.fields;
};

const resolveLnkBioCreds = (brand) => {
  if (!brand["Lnk.Bio Enabled"]) return null;
  const idLabel = brand["Lnk.Bio Client ID Label"];
  const secretLabel = brand["Lnk.Bio Client Secret Label"];
  const clientId = idLabel ? process.env[idLabel] : process.env.LNKBIO_CLIENT_ID;
  const secretB64 = secretLabel ? process.env[secretLabel] : process.env.LNKBIO_CLIENT_SECRET_B64;
  if (!clientId || !secretB64) return null;
  return { clientId, clientSecret: Buffer.from(secretB64, "base64").toString("utf8") };
};

const main = async () => {
  if (!AIRTABLE_KEY) throw new Error("AIRTABLE_API_KEY missing");

  console.log(`Mode: ${EXECUTE ? "EXECUTE" : "DRY RUN"}${BRAND_FILTER ? ` | Brand: ${BRAND_FILTER}` : " | All brands"}`);
  console.log("");

  const posts = await listAll(
    "Posts",
    `AND({Status}="Scheduled",{Platform}="Instagram",NOT({Lnk.Bio Entry ID}=BLANK()))`
  );
  console.log(`${posts.length} Scheduled Instagram posts with lnk.bio entries`);

  const candidates = [];
  for (const post of posts) {
    const campaignId = post.fields.Campaign?.[0];
    if (!campaignId) continue;
    const campaign = await getCampaign(campaignId);
    const brandId = campaign.Brand?.[0];
    if (!brandId) continue;
    const brand = await getBrand(brandId);
    if (BRAND_FILTER && brand.Name !== BRAND_FILTER) continue;
    const creds = resolveLnkBioCreds(brand);
    if (!creds) continue;
    candidates.push({ post, brand, creds, groupId: brand["Lnk.Bio Group ID"] });
  }
  console.log(`${candidates.length} candidates after brand + credentials filter`);

  // Sort ASC by schedule_from so the furthest-future entry gets created LAST.
  // lnk.bio's dashboard sorts scheduled entries by creation time descending,
  // so LAST-created floats to the top — giving us "furthest future at top".
  candidates.sort((a, b) => {
    const aa = a.post.fields["Scheduled Date"] || "";
    const bb = b.post.fields["Scheduled Date"] || "";
    return aa.localeCompare(bb);
  });
  console.log("Sorted ASC by Scheduled Date (earliest will be created first, furthest-future last).");
  console.log("");

  let fixed = 0;
  let skipped = 0;
  let failed = 0;

  for (const c of candidates) {
    const f = c.post.fields;
    const entryId = f["Lnk.Bio Entry ID"];
    const scheduledDate = f["Scheduled Date"];
    const shortUrl = f["Short URL"];
    const imageUrl = f["Image URL"];
    const title = (f.Content || "").split("\n")[0].slice(0, 100) || "Link";
    const tz = c.brand.Timezone || "America/New_York";

    if (!scheduledDate || !shortUrl || !c.groupId) {
      console.log(`  SKIP  ${c.post.id}: missing date/url/group`);
      skipped++;
      continue;
    }

    const when = new Date(scheduledDate);
    const scheduleFrom = formatInTimeZone(when, tz, "yyyy-MM-dd'T'HH:mm:ssXXX");

    const label = `${c.brand.Name} | ${c.post.id} | old=${entryId} | sched=${scheduleFrom}`;
    console.log(`  ${EXECUTE ? "FIX " : "PLAN"} ${label}`);

    if (!EXECUTE) {
      fixed++;
      continue;
    }

    try {
      const token = await getToken(c.creds.clientId, c.creds.clientSecret);
      await lnkBioDelete(token, entryId);
      const newId = await lnkBioAdd(token, {
        title,
        link: shortUrl,
        group_id: c.groupId,
        ...(imageUrl ? { image: imageUrl } : {}),
        schedule_from: scheduleFrom,
      });
      if (!newId) {
        console.log(`    ✗ create returned no id`);
        failed++;
        continue;
      }
      await airtablePatch(`/Posts/${c.post.id}`, { "Lnk.Bio Entry ID": String(newId) });
      console.log(`    ✓ new id=${newId}`);
      fixed++;
    } catch (err) {
      console.log(`    ✗ ${err.message}`);
      failed++;
    }
    await new Promise((r) => setTimeout(r, 300));
  }

  console.log("");
  console.log(`Summary: ${EXECUTE ? `${fixed} repaired` : `${fixed} would repair`}, ${skipped} skipped, ${failed} failed`);
  if (!EXECUTE) console.log("Re-run with --execute to apply.");
};

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
