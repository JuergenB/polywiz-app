#!/usr/bin/env node
/**
 * Tests for resolvePublicationUrl — the pure helper in src/lib/publication-url.ts.
 * Logic mirrored inline below to avoid a .ts loader dependency.
 * Run: node scripts/test-publication-url.mjs
 */

import assert from "node:assert/strict";

// Mirror of src/lib/publication-url.ts — keep in sync if the helper changes.
function resolvePublicationUrl(originalUrl, ogUrl) {
  if (ogUrl && ogUrl !== originalUrl) {
    try {
      new URL(ogUrl);
      return ogUrl;
    } catch {
      /* fall through */
    }
  }
  const previewMatch = originalUrl.match(
    /^(https?:\/\/[^/]+)\/issues\/(\d+)\/preview\/[a-f0-9]+\/?(\?.*)?$/
  );
  if (previewMatch) {
    const [, base, issueNum, qs] = previewMatch;
    return `${base}/issues/${issueNum}${qs ?? ""}`;
  }
  return originalUrl;
}

let passed = 0;
function t(label, actual, expected) {
  assert.equal(actual, expected, `${label}\n  expected: ${expected}\n  actual:   ${actual}`);
  passed++;
  console.log(`  OK — ${label}`);
}

console.log("resolvePublicationUrl tests:");

t(
  "1. Preview URL pattern (Intersect)",
  resolvePublicationUrl(
    "https://theintersect.art/issues/74/preview/d867aec72fcee192b09b44f5078d6871188a4dbe"
  ),
  "https://theintersect.art/issues/74"
);

t(
  "2. Preview URL pattern (Not Real Art)",
  resolvePublicationUrl("https://notrealart.com/issues/12/preview/abc123def456"),
  "https://notrealart.com/issues/12"
);

t(
  "3. og:url takes precedence",
  resolvePublicationUrl(
    "https://theintersect.art/issues/74/preview/xxx",
    "https://theintersect.art/issues/74"
  ),
  "https://theintersect.art/issues/74"
);

t(
  "4. Normal URL passes through",
  resolvePublicationUrl("https://example.com/blog/my-post"),
  "https://example.com/blog/my-post"
);

t(
  "5. og:url matching originalUrl does NOT cause a change",
  resolvePublicationUrl(
    "https://example.com/blog/my-post",
    "https://example.com/blog/my-post"
  ),
  "https://example.com/blog/my-post"
);

console.log(`\n${passed}/5 assertions passed.`);
