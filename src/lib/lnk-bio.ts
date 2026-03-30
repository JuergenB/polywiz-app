/**
 * lnk.bio API client — link-in-bio management for Instagram posts
 *
 * Currently hardcoded for The Intersect brand (group_id: 68052).
 * Will be parameterized per-brand in issue #52.
 *
 * API: https://lnk.bio/oauth/v1
 * Auth: OAuth2 client_credentials grant (auto-refreshing Bearer token)
 * Content-Type: application/x-www-form-urlencoded
 */

const API_BASE = "https://lnk.bio/oauth/v1";
const TOKEN_URL = "https://lnk.bio/oauth/token";
const INTERSECT_GROUP_ID = "68052";

// In-memory token cache (refreshed when expired)
let cachedToken: { accessToken: string; expiresAt: number } | null = null;

function getCredentials(): { clientId: string; clientSecret: string } {
  const clientId = process.env.LNKBIO_CLIENT_ID;
  const secretB64 = process.env.LNKBIO_CLIENT_SECRET_B64;
  if (!clientId || !secretB64) {
    throw new Error("LNKBIO_CLIENT_ID and LNKBIO_CLIENT_SECRET_B64 must be set");
  }
  const clientSecret = Buffer.from(secretB64, "base64").toString("utf-8");
  return { clientId, clientSecret };
}

async function getAccessToken(): Promise<string> {
  // Return cached token if still valid (with 60s buffer)
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.accessToken;
  }

  const { clientId, clientSecret } = getCredentials();
  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`lnk.bio token exchange failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  cachedToken = {
    accessToken: data.access_token,
    expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
  };

  return cachedToken.accessToken;
}

async function lnkBioRequest(
  path: string,
  method: "GET" | "POST",
  data?: Record<string, string>
): Promise<Record<string, unknown>> {
  const token = await getAccessToken();

  const options: RequestInit = {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  };

  if (data && method === "POST") {
    (options.headers as Record<string, string>)["Content-Type"] =
      "application/x-www-form-urlencoded";
    options.body = new URLSearchParams(data).toString();
  }

  const res = await fetch(`${API_BASE}${path}`, options);

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`lnk.bio API ${res.status}: ${text}`);
  }

  return res.json();
}

export interface CreateLnkBioEntryOptions {
  title: string;
  link: string;
  image?: string;
  scheduledDate?: string;
  groupId?: string;
}

/**
 * Create a lnk.bio entry (link-in-bio item).
 * Returns the entry ID for later cleanup.
 */
export async function createLnkBioEntry(
  options: CreateLnkBioEntryOptions
): Promise<string | null> {
  const params: Record<string, string> = {
    title: options.title,
    link: options.link,
    group_id: options.groupId || INTERSECT_GROUP_ID,
  };

  if (options.image) {
    params.image = options.image;
  }

  if (options.scheduledDate) {
    // lnk.bio requires strict RFC 3339 without milliseconds: YYYY-MM-DDTHH:MM:SS±HH:MM
    const d = new Date(options.scheduledDate);
    const pad = (n: number) => String(n).padStart(2, "0");
    params.schedule_from =
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}-04:00`;
  }

  const result = await lnkBioRequest("/lnk/add", "POST", params);
  console.log("[lnk-bio] Entry created:", JSON.stringify(result));

  // Extract entry ID from response — actual shape: { data: { id: 12855662 } }
  const responseData = result.data as Record<string, unknown> | undefined;
  const entryId = responseData?.id || (result.info as Record<string, unknown>)?.lnk_id;
  return entryId ? String(entryId) : null;
}

/**
 * Delete a lnk.bio entry by ID.
 */
export async function deleteLnkBioEntry(entryId: string): Promise<boolean> {
  if (!entryId) return false;
  try {
    await lnkBioRequest("/lnk/delete", "POST", { link_id: entryId });
    return true;
  } catch (err) {
    console.warn(`[lnk-bio] Failed to delete entry ${entryId}:`, err);
    return false;
  }
}

/**
 * List all groups (useful for finding group IDs).
 */
export async function listGroups(): Promise<Record<string, unknown>> {
  return lnkBioRequest("/group/list", "GET");
}
