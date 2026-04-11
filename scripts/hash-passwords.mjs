#!/usr/bin/env node
/**
 * One-time migration: Hash current AUTH_USERS passwords and store in Airtable.
 *
 * Reads AUTH_USERS from .env.local, hashes each password with bcrypt,
 * and writes the hash to the "Password Hash" field on each user's
 * Airtable Users table record (matched by email).
 *
 * Usage: node scripts/hash-passwords.mjs
 *
 * Prerequisites: .env.local must exist with AUTH_USERS and AIRTABLE_API_KEY
 */

import { readFileSync } from "fs";
import { resolve } from "path";
import bcrypt from "bcryptjs";

// Load .env.local manually (no dotenv dependency needed)
const envPath = resolve(process.cwd(), ".env.local");
const envContent = readFileSync(envPath, "utf-8");
const env = {};
for (const line of envContent.split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eqIdx = trimmed.indexOf("=");
  if (eqIdx === -1) continue;
  const key = trimmed.slice(0, eqIdx).trim();
  const value = trimmed.slice(eqIdx + 1).trim();
  env[key] = value;
}

const AIRTABLE_PAT = env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = env.AIRTABLE_BASE_ID;
const AUTH_USERS = env.AUTH_USERS;

if (!AIRTABLE_PAT || !AIRTABLE_BASE_ID || !AUTH_USERS) {
  console.error("Missing AIRTABLE_API_KEY, AIRTABLE_BASE_ID, or AUTH_USERS in .env.local");
  process.exit(1);
}

// Parse AUTH_USERS: id:email:password:displayName:role,…
const users = AUTH_USERS.split(",").map((entry) => {
  const [id, email, password, displayName, role] = entry.split(":");
  return { id, email, password, displayName, role };
});

console.log(`Found ${users.length} users to migrate:\n`);

for (const user of users) {
  console.log(`Processing ${user.email}...`);

  // 1. Hash the password
  const hash = await bcrypt.hash(user.password, 10);
  console.log(`  Hashed: ${hash.slice(0, 20)}...`);

  // 2. Find the Airtable record by email
  const searchUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Users?filterByFormula=${encodeURIComponent(`{Email} = "${user.email}"`)}`;
  const searchRes = await fetch(searchUrl, {
    headers: { Authorization: `Bearer ${AIRTABLE_PAT}` },
  });
  const searchData = await searchRes.json();

  if (!searchData.records || searchData.records.length === 0) {
    console.log(`  ⚠ No Airtable record found for ${user.email} — skipping`);
    continue;
  }

  const recordId = searchData.records[0].id;
  console.log(`  Found record: ${recordId}`);

  // 3. Update the Password Hash field
  const updateUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Users/${recordId}`;
  const updateRes = await fetch(updateUrl, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${AIRTABLE_PAT}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ fields: { "Password Hash": hash } }),
  });

  if (updateRes.ok) {
    console.log(`  ✓ Password hash saved to Airtable`);
  } else {
    const err = await updateRes.json();
    console.error(`  ✗ Failed to update: ${JSON.stringify(err)}`);
  }
}

console.log("\nMigration complete.");
