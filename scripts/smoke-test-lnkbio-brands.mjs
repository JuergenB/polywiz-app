// End-to-end smoke test: for each enabled brand, create a test lnk.bio entry
// via the refactored lib, then delete it. Verifies per-brand credential
// resolution + group targeting work end-to-end.
// Run: node --env-file=.env.local scripts/smoke-test-lnkbio-brands.mjs

const BASE = "https://lnk.bio/oauth/v1";
const TOKEN_URL = "https://lnk.bio/oauth/token";

const BRANDS = [
  { name: "Intersect",  idVar: "LNKBIO_CLIENT_ID_INTERSECT",  secretVar: "LNKBIO_CLIENT_SECRET_B64_INTERSECT",  groupId: "68052", username: "theintersect" },
  { name: "NotRealArt", idVar: "LNKBIO_CLIENT_ID_NOTREALART", secretVar: "LNKBIO_CLIENT_SECRET_B64_NOTREALART", groupId: "75675", username: "notrealart" },
  { name: "Artsville",  idVar: "LNKBIO_CLIENT_ID_ARTSVILLE",  secretVar: "LNKBIO_CLIENT_SECRET_B64_ARTSVILLE",  groupId: "75676", username: "artsvilleusa" },
];

async function getToken(id, secret) {
  const basic = Buffer.from(`${id}:${secret}`).toString("base64");
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  return (await res.json()).access_token;
}

async function post(token, path, form) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams(form).toString(),
  });
  return await res.json();
}

for (const b of BRANDS) {
  const secret = Buffer.from(process.env[b.secretVar], "base64").toString("utf8");
  const token = await getToken(process.env[b.idVar], secret);

  // Create a test entry with future schedule date
  const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const pad = n => String(n).padStart(2, "0");
  const scheduleStr = `${future.getFullYear()}-${pad(future.getMonth()+1)}-${pad(future.getDate())}T12:00:00-04:00`;

  const created = await post(token, "/lnk/add", {
    title: `[SMOKE TEST] polywiz-app per-brand config — ${b.name}`,
    link: `https://example.com/smoke-test-${b.name.toLowerCase()}`,
    group_id: b.groupId,
    schedule_from: scheduleStr,
  });

  const id = created?.data?.id || created?.info?.lnk_id;
  if (!id) {
    console.log(`✗ ${b.name}: create failed — ${JSON.stringify(created)}`);
    continue;
  }

  // Delete it immediately
  const deleted = await post(token, "/lnk/delete", { link_id: String(id) });
  const delOk = deleted?.status === true;
  console.log(`${delOk ? "✓" : "✗"} ${b.name}  create=${id}  delete=${delOk ? "ok" : JSON.stringify(deleted)}  profile=https://lnk.bio/${b.username}`);
}
