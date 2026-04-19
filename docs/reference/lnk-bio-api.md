# lnk.bio API Reference

Unofficial API docs captured from live probing. lnk.bio powers the link-in-bio page we sync to after every scheduled/published Instagram post.

**Official docs:** none public — this file is the source of truth for our integration.
**Last verified:** 2026-04-19

> Note: "Last verified: 2026-04-19" reflects the most recent end-to-end probing, which surfaced the `/lnk/list` scheduled-entry omission and delete propagation delay (see Gotchas #10 and #11).

## Connection

- **API Base:** `https://lnk.bio/oauth/v1`
- **Token URL:** `https://lnk.bio/oauth/token`
- **Auth:** OAuth2 `client_credentials` grant; exchange client credentials for a short-lived bearer token.
- **Content-Type:** `application/x-www-form-urlencoded` on every write (despite JSON responses).

## Credentials — Per-Brand Pattern

lnk.bio issues **one OAuth app per profile** — there is no agency-style multi-profile access via a single key. Every brand whose lnk.bio we sync must have its own app with its own client ID/secret.

Raw secrets contain `$` which breaks shell expansion and `.env` parsing, so secrets are always stored **base64-encoded** under a `_B64` suffixed env var and decoded at runtime.

### Env var naming convention

```
LNKBIO_CLIENT_ID_<BRAND>
LNKBIO_CLIENT_SECRET_B64_<BRAND>
```

Current brands:

| Brand | Env var suffix | Group ID |
|-------|----------------|----------|
| The Intersect | `_INTERSECT` | 68052 |
| Not Real Art | `_NOTREALART` | 75675 |
| Artsville USA | `_ARTSVILLE` | 75676 |

Unscoped `LNKBIO_CLIENT_ID` / `LNKBIO_CLIENT_SECRET_B64` remain as legacy fallback.

### Airtable wiring

Brand records (`tblK6tDXvx8Qt0CXh`) name the env vars via label fields — Airtable never stores the secret itself, only the name of the env var that holds it:

| Brand field | Purpose |
|-------------|---------|
| `Lnk.Bio Enabled` (checkbox) | Feature flag — gates all sync behavior |
| `Lnk.Bio Group ID` | Target group for entries created by this brand |
| `Lnk.Bio Username` | Public profile slug (used to build `https://lnk.bio/<username>`) |
| `Lnk.Bio Client ID Label` | Env var name containing the OAuth client ID |
| `Lnk.Bio Client Secret Label` | Env var name containing the base64-encoded secret |

Resolution is centralized in `resolveConfig` / `resolveCredentials` in `src/lib/lnk-bio.ts`.

## Token Exchange

```
POST https://lnk.bio/oauth/token
Authorization: Basic <base64(clientId:clientSecret)>
Content-Type: application/x-www-form-urlencoded

grant_type=client_credentials
```

Response:

```json
{
  "access_token": "eyJ...",
  "token_type": "Bearer",
  "expires_in": 3600
}
```

Tokens are cached in-memory keyed by `clientId` (so per-brand refreshes don't collide), with a 60-second early-refresh buffer to avoid race conditions.

## Endpoints We Use

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/lnk/add` | Create an entry (we call this on post schedule/publish) |
| POST | `/lnk/edit` | Update an entry; accepts `group_id` to move between groups |
| POST | `/lnk/delete` | Delete an entry by `link_id` |
| GET | `/lnk/list[?group_id=X]` | List entries; scope via query param |
| GET | `/group/list` | List groups on the authenticated profile |

### Create — `POST /lnk/add`

```
POST https://lnk.bio/oauth/v1/lnk/add
Authorization: Bearer <token>
Content-Type: application/x-www-form-urlencoded

title=Opening+Friday+at+The+Intersect
&link=https://theintersect.example/exhibitions/now-showing
&group_id=68052
&image=https://public.blob.vercel-storage.com/posts/abc123.jpg
&schedule_from=2026-04-25T17:00:00-04:00
```

Response:

```json
{
  "status": "ok",
  "data": { "id": "ln_9f1a2b" }
}
```

Or (response shape varies):

```json
{
  "status": "ok",
  "info": { "lnk_id": "ln_9f1a2b" }
}
```

Extract the entry ID with `data?.id ?? info?.lnk_id` — one or the other is populated.

### Edit — `POST /lnk/edit`

```
POST https://lnk.bio/oauth/v1/lnk/edit
Authorization: Bearer <token>
Content-Type: application/x-www-form-urlencoded

link_id=ln_9f1a2b&group_id=75675
```

Moves the entry to a different group. Position-field behavior under `/lnk/edit` is **unverified** — we don't currently use it, and content/image edits go through delete-then-recreate instead.

### Delete — `POST /lnk/delete`

```
POST https://lnk.bio/oauth/v1/lnk/delete
Authorization: Bearer <token>
Content-Type: application/x-www-form-urlencoded

link_id=ln_9f1a2b
```

Silently succeeds if the entry doesn't exist. Callers treat this as best-effort cleanup and don't throw on failure.

### List — `GET /lnk/list`

```
GET https://lnk.bio/oauth/v1/lnk/list?group_id=68052
Authorization: Bearer <token>
```

Response:

```json
{
  "status": "ok",
  "data": [
    {
      "link_id": "ln_9f1a2b",
      "created_at": "2026-04-19T10:00:00",
      "title": "Opening Friday at The Intersect",
      "image": "https://...",
      "link": "https://theintersect.example/exhibitions/now-showing",
      "position": 1,
      "meta": {}
    }
  ]
}
```

**Gotcha:** the response does **not** include `group_id` on each entry. You cannot tell which group an entry belongs to from the list response — you must scope with the `?group_id=` query param.

### Groups — `GET /group/list`

```
GET https://lnk.bio/oauth/v1/group/list
Authorization: Bearer <token>
```

Response:

```json
{
  "status": "ok",
  "data": [
    { "id": 68052, "name": "Campaigns" },
    { "id": 75675, "name": "Press" }
  ]
}
```

Used by admin/configuration tooling to look up group IDs when onboarding a new brand.

## Gotchas

1. **Secrets contain `$`** — always store and read as base64 (`_B64` suffix).
2. **Form-encoded bodies** — the API returns JSON but all writes must be `application/x-www-form-urlencoded`. Sending JSON bodies returns an error.
3. **RFC 3339 date format, strict:** `YYYY-MM-DDTHH:MM:SS-04:00`. No milliseconds. Eastern offset (`-04:00` or `-05:00` depending on DST).
4. **Response entry ID shape varies** — `data.id` on some calls, `info.lnk_id` on others. Always check both.
5. **`/lnk/list` omits `group_id`** — not usable for group-membership detection. Scope with `?group_id=` instead.
6. **`/lnk/edit` accepts `{link_id, group_id}` to move** entries between groups; position-update behavior is unverified, so mutations in our code use delete-then-recreate.
7. **One OAuth app per profile** — agency accounts do NOT grant cross-profile access through a single key. Each brand needs its own app and its own env vars.
8. **Delete is idempotent** — calling `/lnk/delete` on a non-existent ID returns success. Don't treat a successful response as proof the entry existed.
9. **Token cache collisions** — cache must be keyed by `clientId`, not globally, or a brand's token will get overwritten by another brand's refresh.
10. **`/lnk/list` excludes scheduled entries** — `GET /lnk/list` (and `?group_id=X`) only returns published entries; entries with a future `schedule_from` are hidden from the API even though they appear in the lnk.bio dashboard for the profile owner. Probed 8 filter variants (`?include_scheduled=1`, `?status=scheduled`, `?status=all`, `?show=all`, `?type=scheduled`, `?scheduled=1`, `?include_unpublished=1`, `?draft=1`) — none expose them. Endpoints `/lnk/scheduled`, `/lnk/queue`, `/lnk/drafts` all return 403. **Implication:** scheduled entries cannot be enumerated programmatically for orphan detection / reconciliation; verification requires the user to check their lnk.bio dashboard manually. This kills Option B (background reconciliation) of [#142](https://github.com/polymash/polywiz-app/issues/142).
11. **Delete propagation delay (eventual consistency)** — `POST /lnk/delete` returns `status: true` immediately, but the entry can remain visible on the lnk.bio dashboard / public profile for **several seconds to ~1 minute** before disappearing (observed ~30s during testing). **Implication:** don't trust immediate visual verification after a delete; allow at least a 30-second polling window for any automated test or reconciliation flow. See [`src/lib/lnk-bio.ts`](../../src/lib/lnk-bio.ts) `deleteEntry`.

## Known Failures & Workarounds

| Symptom | Cause | Fix |
|---------|-------|-----|
| 401 on every token exchange | Secret contains literal `$` which shell/`.env` mangled | Store as base64, decode with `Buffer.from(x, "base64").toString("utf-8")` |
| `data.id` is `undefined` after create | Response used `info.lnk_id` shape on this call | Check both: `data?.id ?? info?.lnk_id` |
| Entry created under wrong group | Forgot `group_id` — defaults to profile root | Always pass `group_id` from `resolveConfig()` — throw if `lnkBioGroupId` absent on brand |
| Scheduled entry appears immediately | `schedule_from` formatted with milliseconds or `Z` | Use strict RFC 3339 with `-04:00`/`-05:00` offset; no milliseconds |
| One brand's calls start 401-ing after another brand runs | Token cache keyed globally, got overwritten | Cache by `clientId` (fixed in `src/lib/lnk-bio.ts`) |
| `/lnk/list` returns entries but no `group_id` visible per entry | API just doesn't return it | Filter via `?group_id=X` query param instead of trying to post-filter |

## Lifecycle Sync

The app keeps lnk.bio in sync with Instagram posts across **7 transitions**. Mutations are implemented as delete-then-recreate because `/lnk/edit`'s field-update behavior is only partially verified.

| Transition | Handler | Action |
|------------|---------|--------|
| Post scheduled to Zernio | `src/app/api/posts/[id]/publish/route.ts` | Create entry |
| Post published | `src/app/api/posts/[id]/publish/route.ts` | Create entry (if not already created at schedule time) |
| Post deleted | `src/app/api/posts/[id]/route.ts` (DELETE) | Delete entry |
| Post reverted to draft (manual) | `src/app/api/posts/[id]/route.ts` (PATCH) | Delete entry |
| Post rescheduled | `src/app/api/posts/[id]/route.ts` (PATCH) | Delete + recreate |
| Post content/image edited | `src/app/api/posts/[id]/route.ts` (PATCH) | Delete + recreate |
| Campaign deleted or reset | Campaign delete/reset routes | Delete entries for all posts |
| Zernio `post.failed` webhook | `src/app/api/webhooks/zernio/route.ts` | Delete entry |

**Architectural gap:** Zernio does **not** emit a webhook when a scheduled post is reverted to draft by the user in Zernio's UI. Our lnk.bio entry can drift out of sync in that case. Tracked in [#142](https://github.com/polymash/polywiz-app/issues/142).

## Proven Implementation References

- **Client:** [`src/lib/lnk-bio.ts`](../../src/lib/lnk-bio.ts) — all HTTP, token caching, credential resolution
- **Create flow:** [`src/app/api/posts/[id]/publish/route.ts`](../../src/app/api/posts/[id]/publish/route.ts)
- **Delete + recreate flow:** [`src/app/api/posts/[id]/route.ts`](../../src/app/api/posts/[id]/route.ts)
- **Webhook cleanup:** [`src/app/api/webhooks/zernio/route.ts`](../../src/app/api/webhooks/zernio/route.ts)
