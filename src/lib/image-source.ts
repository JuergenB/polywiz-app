/**
 * Upstream image-URL normalization. When a CMS serves a pre-cropped variant of an image,
 * rewrite the URL to point at the uncropped source variant instead so downstream post
 * generation has the maximum original detail to work with.
 *
 * Currently handles **Curated.co newsletter CDNs**. Curated hosts their images at
 * a CloudFront path like `/production/link/image/{id}/{aspect}_{size}_{uuid}.jpg` and
 * by default serves `twenty_by_nine_extra_large` — a 20:9 landscape crop — in newsletter
 * HTML. The uncropped original lives at `original_ratio_extra_large` at the same path,
 * preserving whatever aspect the user originally uploaded.
 *
 * Adapters for Ghost, Mailchimp, Beehiiv, etc. can be added as we encounter them — each
 * one just needs a URL pattern matcher and a rewrite rule.
 */

const CURATED_IMAGE_PATTERN =
  /^(https?:\/\/[^/]+\/production\/link\/image\/\d+\/)(?:twenty_by_nine|sixteen_by_nine|four_by_three|three_by_four|four_by_five|square)_(?:extra_large|large|medium|small|thumb)_([a-f0-9-]+\.(?:jpe?g|png))$/i;

function rewriteCuratedUrl(url: string): string | null {
  const m = url.match(CURATED_IMAGE_PATTERN);
  if (!m) return null;
  return `${m[1]}original_ratio_extra_large_${m[2]}`;
}

/**
 * Return a URL for the uncropped source variant of the given image, if one can be
 * identified. HEAD-checks the candidate and silently falls back to the original URL
 * on any non-2xx response or network error — so callers always get a usable URL.
 */
export async function preferUncroppedVariant(url: string): Promise<string> {
  const rewritten = rewriteCuratedUrl(url);
  if (!rewritten || rewritten === url) return url;
  try {
    const res = await fetch(rewritten, { method: "HEAD" });
    if (res.ok) return rewritten;
    console.warn(`[image-source] Rewrite HEAD ${res.status}, using original: ${url}`);
    return url;
  } catch (err) {
    console.warn(`[image-source] Rewrite HEAD failed, using original: ${url}`, err);
    return url;
  }
}

/** Convenience: apply `preferUncroppedVariant` to every item in an array in parallel. */
export async function preferUncroppedVariants<T extends { url: string }>(items: T[]): Promise<T[]> {
  return Promise.all(
    items.map(async (item) => {
      const url = await preferUncroppedVariant(item.url);
      return url === item.url ? item : { ...item, url };
    })
  );
}
