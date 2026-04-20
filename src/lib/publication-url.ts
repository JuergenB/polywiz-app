/**
 * Resolve the canonical publication URL to use for short links and Claude prompts.
 * Prefers og:url when it differs from the input; otherwise strips curated.co-style
 * preview tokens (/issues/{n}/preview/{hex}); otherwise returns the original.
 */
export function resolvePublicationUrl(originalUrl: string, ogUrl?: string): string {
  // 1. Primary — og:url from scrape metadata
  if (ogUrl && ogUrl !== originalUrl) {
    try {
      // Validate it's a proper URL before trusting it
      new URL(ogUrl);
      return ogUrl;
    } catch {
      // fall through to other strategies
    }
  }

  // 2. Fallback — strip curated.co-style preview token from custom-domain URLs
  //    https://theintersect.art/issues/74/preview/d867aec7... → https://theintersect.art/issues/74
  const previewMatch = originalUrl.match(
    /^(https?:\/\/[^/]+)\/issues\/(\d+)\/preview\/[a-f0-9]+\/?(\?.*)?$/
  );
  if (previewMatch) {
    const [, base, issueNum, qs] = previewMatch;
    return `${base}/issues/${issueNum}${qs ?? ""}`;
  }

  // 3. Default — unchanged
  return originalUrl;
}
