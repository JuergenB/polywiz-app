# Social Media Promo Scheduler

Automated social media campaign generator and scheduler. Given a URL (exhibition page, blog post, artist profile), the system generates a multi-platform promotional campaign with tapering frequency over up to six months — then schedules it for publishing.

Built for [Not Real Art](https://notrealart.com) and [Artsville USA](https://artsvilleusa.com). Designed to be brand-agnostic so it can serve multiple organizations and content types.

## The Problem

Exhibitions, blog posts, and artist features currently get a single social media post and are forgotten. Effective promotion requires sustained, multi-platform campaigns that start strong and taper over time — but nobody has the bandwidth to manually create and schedule 30+ posts across 7 platforms for every piece of content.

## What This Does

1. **Input a URL** — Exhibition page, blog post, artist profile, or any content worth promoting
2. **Scrape and enrich** — Extract text, images, metadata. Classify the content type. Research context (artist bios, exhibition details)
3. **Generate a campaign** — AI creates platform-specific post variants (IG carousels, X threads, LinkedIn articles, etc.) with appropriate tone, length, and media for each platform
4. **Review and approve** — All generated posts land in an approval queue. Dismiss, modify, or approve each one
5. **Schedule with tapering frequency** — Approved posts are distributed across a configurable timeline (e.g., 6 months), with aggressive posting in the first 1-2 weeks that gradually tapers off
6. **Publish via Zernio API** — Approved, scheduled posts are sent to connected social media accounts across 14 supported platforms

## Campaign Types

| Type | Source | Example |
|------|--------|---------|
| **Exhibition** | Gallery/museum URL | First Fridays at Artwork Archive — scrape exhibition details, artworks, artists |
| **Blog Post** | Article URL | Newsletter issue, thought piece, announcement |
| **Artist Profile** | Artist page URL | Featured artist spotlight across platforms |
| **Custom** | Manual entry | Event promotion, product launch, anything else |

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Next.js App (this repo)               │
│                                                          │
│  ┌──────────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │ Campaign  │  │  Approval    │  │  Scheduling       │  │
│  │ Generator │→ │  Queue       │→ │  Dashboard        │  │
│  │           │  │              │  │  (from LateWiz)   │  │
│  └────┬─────┘  └──────────────┘  └────────┬──────────┘  │
│       │                                    │             │
│  ┌────▼─────┐                        ┌─────▼──────┐     │
│  │ Firecrawl │                       │ Zernio API │     │
│  │ (scrape)  │                       │ (schedule) │     │
│  └──────────┘                        └────────────┘     │
└─────────────────────────────────────────────────────────┘
                          │
                    ┌─────▼─────┐
                    │  Airtable  │
                    │            │
                    │ Campaigns  │
                    │ Posts      │
                    │ Brands     │
                    │ Settings   │
                    └────────────┘
```

### Data Flow

1. **Campaign creation** — User provides a URL and selects a campaign type + brand. Configuration is stored in Airtable.
2. **Content extraction** — Firecrawl scrapes the URL. Images are downloaded and stored (Airtable attachment URLs are temporary; files must be persisted for scheduling).
3. **Post generation** — AI generates platform-specific content variants using brand voice guidelines, platform best practices, and the extracted content.
4. **Approval queue** — Generated posts are stored in Airtable with status `pending`. The approval UI shows each post with its target platform, scheduled date, and media preview.
5. **Scheduling** — Approved posts are uploaded to Zernio via API with their scheduled timestamps. Media files are uploaded via presigned URLs.
6. **Publishing** — Zernio handles the actual posting at the scheduled times. Webhooks notify the app of success/failure.

### Tapering Schedule

Campaigns use a configurable frequency curve. Example for a 6-month exhibition campaign:

| Period | Frequency | Typical Posts |
|--------|-----------|---------------|
| Week 1 (launch) | Daily | 7-10 posts across platforms |
| Weeks 2-4 | 3-4x/week | 10-15 posts |
| Month 2 | 2x/week | 8 posts |
| Month 3 | 1x/week | 4 posts |
| Months 4-6 | 1-2x/month | 4-6 posts |

Frequency presets and custom curves are controlled via the campaign settings UI (slider controls).

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS v4 + shadcn/ui |
| State | Zustand + TanStack Query |
| Social API | Zernio (14 platforms) |
| Data | Airtable |
| Scraping | Firecrawl |
| AI | OpenAI (content generation) |
| Image Templates | Orshot (Instagram carousels) |
| Deployment | Vercel |

> **Foundation:** The scheduling UI is based on [LateWiz](https://github.com/zernio-dev/latewiz) (MIT licensed), an open-source social media scheduler by Zernio. Campaign generation, approval workflows, Airtable integration, and the tapering schedule system are original additions.

## Supported Platforms

Instagram, TikTok, YouTube, LinkedIn, Pinterest, X/Twitter, Facebook, Threads, Bluesky, Snapchat, Google Business, Reddit, Telegram

## Multi-Brand Support

The system supports multiple brands via Zernio Profiles. Each brand has its own:
- Connected social accounts
- API key (scoped to its profile)
- Brand voice guidelines
- Campaign history

| Brand | Status |
|-------|--------|
| The Intersect of Art and Tech | Active (7 accounts connected) |
| Not Real Art / Arterial | Planned |
| Artsville USA | Planned |

## Airtable Schema (Planned)

| Table | Purpose |
|-------|---------|
| **Campaigns** | Campaign definition: URL, type, brand, frequency settings, status |
| **Posts** | Generated posts: content, platform, media refs, scheduled date, approval status |
| **Brands** | Brand profiles: name, voice guidelines, connected Zernio profile ID |
| **Platform Settings** | Per-platform config: character limits, best practices, posting rules |
| **Media Assets** | Downloaded images/videos with permanent URLs for scheduling |

## Getting Started

### Prerequisites
- Node.js 18+
- Zernio API key ([get one here](https://zernio.com/dashboard/api-keys))
- Airtable account + API key

### Local Development

```bash
# Clone the repository
git clone https://github.com/JuergenB/social-media-promo-scheduler.git
cd social-media-promo-scheduler

# Install dependencies
npm install

# Create environment file
cp .env.example .env.local
# Edit .env.local with your API keys

# Start the development server (runs on port 3025)
npm run dev
```

Open [http://localhost:3025](http://localhost:3025) in your browser.

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `LATE_API_KEY` | Yes | Zernio API key (`sk_` prefix) |
| `NEXT_PUBLIC_APP_URL` | No | App URL (default: `http://localhost:3025`) |
| `NEXT_PUBLIC_APP_NAME` | No | App name (default: Social Media Promo Scheduler) |
| `AIRTABLE_API_KEY` | Yes* | Airtable Personal Access Token |
| `AIRTABLE_BASE_ID` | Yes* | Airtable base ID |
| `FIRECRAWL_API_KEY` | Yes* | Firecrawl API key for web scraping |
| `OPENAI_API_KEY` | Yes* | OpenAI API key for content generation |

*Required for campaign features (not needed for basic scheduling UI).

## Project Status

- [x] Scheduling UI (LateWiz foundation)
- [x] Zernio API integration (14 platforms)
- [x] Auto-authentication for self-hosted instances
- [ ] Campaign creation UI
- [ ] Airtable integration
- [ ] Content scraping (Firecrawl)
- [ ] AI post generation
- [ ] Approval queue
- [ ] Tapering schedule engine
- [ ] Media asset management
- [ ] Multi-brand support

## Related Work

This project builds on prior work with n8n workflows for exhibition data extraction and promo pack generation. Those workflows served as proof-of-concept for the scraping, AI enrichment, and content generation pipeline that is now being rebuilt as a standalone application.

## License

MIT — see [LICENSE](./LICENSE) for details.
