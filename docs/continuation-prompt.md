# Continuation Prompt — Phase I Kickoff

Copy everything below this line and paste it to start the next session.

---

## Context

We're building the Social Media Promo Scheduler. The repo is at https://github.com/JuergenB/social-media-promo-scheduler (private). Read the README.md, GETTING_STARTED.md, and CLAUDE.md first — they contain all project decisions, phased plan, and standing rules.

The app is a Next.js 16 fork of LateWiz (Zernio social media scheduler) with Auth.js v5 already working. It runs on port 3025. The scheduling dashboard (compose, calendar, queue, accounts) is functional. We're now starting Phase I — the campaign system.

## What to do in this session

### 1. Set up Airtable schema (Issue #5)

The new base is `app5FPCG06huzh7hX` (empty). PAT is in `.env.local`. Create these tables via the Airtable Meta API (never manually):

**Tables to create:**
- **Brands** — id, name, zernioApiKey (text, not the actual key — just a reference label), zernioProfileId, voiceGuidelines (long text), newsletterUrl, status
- **Campaigns** — id, url, type (select: Newsletter, Blog Post, Exhibition, Artist Profile, Podcast Episode, Event, Public Art, Video/Film, Institutional, Custom), brand (linked to Brands), durationDays, distributionBias (select: Front-loaded, Balanced, Back-loaded), editorialDirection (long text), status (select: Draft, Scraping, Generating, Review, Active, Completed, Archived), createdAt, createdBy
- **Posts** — id, campaign (linked to Campaigns), platform (select), content (long text), mediaUrls (long text/JSON), scheduledDate (dateTime), status (select: Pending, Approved, Modified, Dismissed, Scheduled, Published, Failed), contentVariant (text), approvedBy, approvedAt, zernioPostId, notes
- **Platform Settings** — clone the 13 records from base `appa1MQoMsfZ0WCPu` table `tbl13Ql5e8mppoMQr` (Social Media Best Practices Lookup). Read them via API, create the table with matching fields, write the records.
- **Image Sizes** — clone all records from base `appa1MQoMsfZ0WCPu` table `tbl6EwP0xqAyk3oFD` (Image Size Lookup). Same approach.

Delete the default "Table 1" after creating the real tables.

Seed the Brands table with one record: The Intersect (zernioProfileId: `68dd94a97fca0cbc457aa18e`, newsletterUrl: `https://theintersect.art`).

### 2. Build the Brand Context Provider (Issue #15)

Create `src/lib/brand-context.tsx` with a React context that provides `currentBrand` to all components. In Phase I it loads the single brand from Airtable (or falls back to env config). Wire it into the Providers component.

### 3. Build demo-ready campaign UI screens (frontend-first)

The goal is to have something to show teammates. Build the UI shells even before the backend API routes are fully wired:

**Campaign list page** (`/dashboard/campaigns`) — add to sidebar nav. Shows campaigns in a card grid with status badges, brand tag, type icon, date. Empty state with "Create Campaign" button.

**Campaign creation form** (`/dashboard/campaigns/new`) — the main configuration screen:
- URL input field
- Campaign type selector (10 types with icons)
- Brand selector (shows current brand, Phase II will make this switchable)
- Duration preset buttons (Sprint 2wk, Standard 3mo, Evergreen 6mo, Marathon 12mo, Custom)
- Editorial direction textarea ("What should we emphasize?")
- "Generate Campaign" button (disabled until URL + type selected)

**Platform Settings browser** (`/dashboard/settings/platforms`) — read-only view of the cloned best practices data from Airtable. Table/card view showing each platform's character limits, URL handling, tone, hashtag rules. This demonstrates the system's platform awareness to the team.

Use shadcn/ui components throughout. The forms can submit to placeholder API routes that just log the data — the actual scraping/generation pipeline comes next.

### Important standing rules (read CLAUDE.md but especially):
- Port 3025 (never 3000)
- Use Perplexity API via curl for ALL research (never WebSearch/WebFetch). Key in ~/.claude/settings.json.
- Downplay AI in all team-facing copy. Lead with human control, editorial direction, artist service.
- Diagrams as committed PNG images (never Mermaid code blocks — GitHub mobile doesn't render them).
- Use Airtable Meta API for all schema changes (never ask user to create fields manually).
- Read code before answering. GitHub issues are source of truth.
