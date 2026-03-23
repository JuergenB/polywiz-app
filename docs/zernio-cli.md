# Zernio CLI Reference

Lets developers and AI agents schedule and manage social media posts across 14 platforms from the terminal. Outputs JSON by default.

## Installation

```bash
npm install -g @zernio/cli
```

## Authentication

```bash
# Browser login (recommended)
zernio auth:login

# Manual API key
zernio auth:set --key "sk_your-api-key"

# Verify
zernio auth:check
```

Config stored in `~/.zernio/config.json`. Env var `ZERNIO_API_KEY` overrides config.

## Commands

### Auth
- `auth:login` — Opens browser, saves API key
- `auth:set --key "sk_..."` — Manual key entry
- `auth:check` — Verify authentication

### Profiles
- `profiles:list`
- `profiles:get <id>`
- `profiles:create --name <name>`
- `profiles:update <id>`
- `profiles:delete <id>`

### Accounts
- `accounts:list`
- `accounts:get <id>`
- `accounts:health`

### Posts
- `posts:create --text "..." --accounts <id1>,<id2> --scheduledAt "2025-06-01T09:00:00Z"`
- `posts:list`
- `posts:get <id>`
- `posts:delete <id>`
- `posts:retry <id>`

### Analytics
- `analytics:posts`
- `analytics:daily`
- `analytics:best-time`

### Media
- `media:upload <file>`

## Links
- GitHub: https://github.com/zernio-dev/zernio-cli
- npm: https://www.npmjs.com/package/@zernio/cli
