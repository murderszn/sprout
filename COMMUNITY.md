# Community

Sprout is built for people who are tired of copy-pasting install scripts that assume the wrong OS, shell, or package manager. The community is where installs go wrong in the wild — and where we turn those failures into knowledge-base entries.

## Discord

**Invite link:** _add your permanent invite here once the server is live_

```text
https://discord.gg/YOUR_INVITE_CODE
```

Replace the placeholder in three places after you create the server:

1. This file (above)
2. [README.md](README.md) — Discord badge row
3. [docs/index.html](docs/index.html) — footer and nav community link (`data-discord-invite`)

### Suggested server layout

| Channel | Purpose |
|---------|---------|
| `#welcome` | Rules, links to README, install, Pollinations key setup |
| `#announcements` | Releases, knowledge-base additions, site updates (read-only) |
| `#general` | Questions, show-and-tell installs |
| `#help` | Broken installs — paste logs, get `sprout diagnose` tips |
| `#knowledge-base` | Propose or discuss new `src/knowledge/tools/*.json` entries |
| `#feedback` | UX, guardrails, model behavior |

### Roles (starter set)

- **@sprout** — maintainer (you)
- **@contributor** — merged a knowledge-base or docs PR
- **@early** — joined during launch window

### Bot ideas (optional, later)

- Pin the latest `npm` version and docs link in `#welcome`
- GitHub webhook → `#announcements` on release / merged PR to `src/knowledge/tools/`

### Launch checklist

- [ ] Create Discord server with Sprout branding (icon = `docs/public/favicon.svg` or `apple-touch-icon.png`)
- [ ] Set a **permanent** invite (Server Settings → Invites → never expire)
- [ ] Paste invite into README, COMMUNITY.md, and `docs/index.html`
- [ ] Add [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) link in `#welcome`
- [ ] Post a short intro: what Sprout is, what it is *not*, link to https://murderszn.github.io/sprout/

## Other ways to participate

- **Knowledge base** — add a JSON file under `src/knowledge/tools/` ([CONTRIBUTING.md](CONTRIBUTING.md))
- **Issues** — bugs, feature ideas, or install recipes you want seeded
- **Discussions** — enable GitHub Discussions on the repo for long-form threads if you prefer keeping support on GitHub

## Branding assets

| Asset | Path |
|-------|------|
| Site | https://murderszn.github.io/sprout/ |
| Favicon | `docs/public/favicon.svg` |
| Social card | `docs/public/og-image.png` |
| App icon | `docs/public/apple-touch-icon.png` |
| Palette | Matcha Latte — `#65A30D`, `#84CC16`, `#A3E635`, `#D9F99D`, `#1A1D13` |

Use the 🌱 sprout emoji and **Sprout** wordmark consistently. Tagline: _Install-fixer CLI for developer tools._