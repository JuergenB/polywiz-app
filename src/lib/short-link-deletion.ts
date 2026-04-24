import { listRecords } from "@/lib/airtable/client";
import { deleteShortLink } from "@/lib/short-io";

interface BrandShortConfig {
  shortDomain?: string | null;
  shortApiKeyLabel?: string | null;
}

interface PostShortUrlFields {
  "Short URL": string;
}

// Short.io dedupes on originalURL — multiple Posts may share one Short.io record.
// Deleting that record breaks every post still pointing to it.

async function findOtherPostsReferencing(
  shortUrl: string,
  excludePostIds: string[]
): Promise<string[]> {
  if (!shortUrl) return [];
  const safeUrl = shortUrl.replace(/"/g, '\\"');
  const records = await listRecords<PostShortUrlFields>("Posts", {
    filterByFormula: `{Short URL} = "${safeUrl}"`,
    fields: ["Short URL"],
  });
  const exclude = new Set(excludePostIds);
  return records.filter((r) => !exclude.has(r.id)).map((r) => r.id);
}

export interface ShortLinkDeleteResult {
  deleted: boolean;
  skipped: boolean;
  otherRefs: number;
}

export async function deleteShortLinkIfUnreferenced(
  shortUrl: string,
  excludePostIds: string[],
  brand?: BrandShortConfig
): Promise<ShortLinkDeleteResult> {
  if (!shortUrl) return { deleted: false, skipped: false, otherRefs: 0 };
  const others = await findOtherPostsReferencing(shortUrl, excludePostIds);
  if (others.length > 0) {
    console.log(
      `[short-io] Skipping delete of ${shortUrl} — still referenced by ${others.length} other post(s): ${others.join(", ")}`
    );
    return { deleted: false, skipped: true, otherRefs: others.length };
  }
  const deleted = await deleteShortLink(shortUrl, brand);
  return { deleted, skipped: false, otherRefs: 0 };
}

export async function deleteShortLinksIfUnreferenced(
  shortUrls: string[],
  excludePostIds: string[],
  brand?: BrandShortConfig
): Promise<{ attempted: number; deleted: number; skipped: number }> {
  const unique = Array.from(new Set(shortUrls.filter(Boolean)));
  let deleted = 0;
  let skipped = 0;
  for (const url of unique) {
    const result = await deleteShortLinkIfUnreferenced(url, excludePostIds, brand);
    if (result.deleted) deleted++;
    else if (result.skipped) skipped++;
  }
  return { attempted: unique.length, deleted, skipped };
}
