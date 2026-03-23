# Zernio MCP Server Reference

Enables scheduling and publishing social media posts from Claude Desktop via natural language using Model Context Protocol.

## Setup

### Install uv
```bash
# macOS/Linux
curl -LsSf https://astral.sh/uv/install.sh | sh
```

### Get API Key
From `zernio.com/dashboard/api-keys`

### Configure Claude Desktop
Settings → Developer → Edit Config → Add Zernio MCP server with API key → Restart

Alternative: `pip install zernio-sdk[mcp]`

## Available MCP Tools

### Account Management
- `accounts_list` — Display all connected social accounts
- `accounts_get` — Retrieve specific platform account details

### Profile Operations
- `profiles_list`, `profiles_get`, `profiles_create`, `profiles_update`, `profiles_delete`

### Post Management
- `posts_create` — Draft/scheduled/immediate modes
- `posts_list`, `posts_get`, `posts_update`, `posts_delete`
- `posts_cross_post` — Simultaneous multi-platform posting
- `posts_retry`, `posts_list_failed`, `posts_retry_all_failed`

### Media Handling
- `media_generate_upload_link` — Browser-based file uploads
- `media_check_upload_status` — Monitor upload completion

## Post Creation Modes

| Mode | Parameter | Behavior |
|------|-----------|----------|
| DRAFT | `is_draft=true` | Saves without publishing |
| IMMEDIATE | `publish_now=true` | Posts instantly |
| SCHEDULED | `schedule_minutes` | Future publication |

## Media Upload Workflow
1. Request upload link
2. Open browser URL
3. Drag and drop files (up to 5GB)
4. Confirm completion
5. Attach media URLs to post

## Supported Platforms
Twitter/X, Instagram, Facebook, LinkedIn, TikTok, YouTube, Pinterest, Reddit, Bluesky, Threads, Google Business, Telegram, Snapchat, WhatsApp
