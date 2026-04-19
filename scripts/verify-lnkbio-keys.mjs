// Verify all lnk.bio brand keys work by hitting /group/list for each.
// Run with: node --env-file=.env.local scripts/verify-lnkbio-keys.mjs

const BRANDS = [
  { name: "(unscoped baseline)", idVar: "LNKBIO_CLIENT_ID", secretVar: "LNKBIO_CLIENT_SECRET_B64" },
  { name: "Intersect", idVar: "LNKBIO_CLIENT_ID_INTERSECT", secretVar: "LNKBIO_CLIENT_SECRET_B64_INTERSECT" },
  { name: "NotRealArt", idVar: "LNKBIO_CLIENT_ID_NOTREALART", secretVar: "LNKBIO_CLIENT_SECRET_B64_NOTREALART" },
  { name: "Artsville", idVar: "LNKBIO_CLIENT_ID_ARTSVILLE", secretVar: "LNKBIO_CLIENT_SECRET_B64_ARTSVILLE" },
];

async function getToken(clientId, clientSecret) {
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetch("https://lnk.bio/oauth/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`token ${res.status}: ${JSON.stringify(body)}`);
  return body.access_token;
}

async function listGroups(token) {
  const res = await fetch("https://lnk.bio/oauth/v1/group/list", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`group/list ${res.status}: ${JSON.stringify(body)}`);
  return body;
}

for (const brand of BRANDS) {
  const clientId = process.env[brand.idVar];
  const secretB64 = process.env[brand.secretVar];
  if (!clientId || !secretB64) {
    console.log(`[${brand.name}] MISSING env vars`);
    continue;
  }
  const clientSecret = Buffer.from(secretB64, "base64").toString("utf8");
  try {
    const token = await getToken(clientId, clientSecret);
    const groups = await listGroups(token);
    const list = groups?.info?.groups ?? [];
    console.log(`[${brand.name}] OK — ${list.length} group(s):`);
    for (const g of list) console.log(`    group_id=${g.group_id}  name="${g.group_name}"`);
  } catch (err) {
    console.log(`[${brand.name}] FAIL — ${err.message}`);
  }
}
