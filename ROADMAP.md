# Sprout roadmap

Living checklist for launch, distribution, and product work. Scope stays narrow: **install-fixer CLI** for developer tools — not a general coding agent.

**North star:** more eyes on Sprout, more real installs, and steady improvement to the CLI + knowledge base.

---

## Shipped (foundation)

- [x] **GitHub Pages site** — static docs at [murderszn.github.io/sprout](https://murderszn.github.io/sprout/) (no other hosting)
- [x] **npm package live** — `sprout-install` on the public registry (`v0.3.0`)
- [x] **Core CLI** — detect → plan → confirm → verify on macOS, Linux, and Windows
- [x] **BYOP auth** — `sprout login` + Pollinations key flow
- [x] **Seeded knowledge base** — 29 curated install recipes in `src/knowledge/tools/`
- [x] **Site demos** — hero terminal, interactive feature clips, install walkthrough
- [x] **10s commercial** — [docs/commercial.html](docs/commercial.html) (Google Veo / Omni)
- [x] **Pollinations listing** — featured in the [Pollinations app directory](https://pollinations.ai/apps) (Build / Greenhouse)
- [x] **Blog** — [Pollen ecosystem post](docs/blog/pioneering-the-pollen-ecosystem.html)
- [x] **CI + Pages deploy** — GitHub Actions on every push to `main`
- [x] **Reddit monitoring** — watching CLI / dev-tool subreddits for relevant threads

---

## Distribution & publicity

Get Sprout in front of people who actually fight broken installs.

- [ ] **Pin the commercial** — link or embed from the main site, README, and social bios
- [ ] **Short-form video push** — post the 10s cut on X, YouTube Shorts, TikTok, LinkedIn
- [ ] **Launch thread on X** — site + npm one-liner + commercial + “what it is / what it isn’t”
- [ ] **Reddit playbook** — keep engaging; prioritize `r/commandline`, `r/linux`, `r/devops`, `r/node`, `r/selfhosted`, `r/LocalLLaMA` (agentic CLI angle)
- [ ] **Show HN / Lobsters** — “Show” post when there’s a crisp hook (broken PATH, install logs, agentic CLI installs)
- [ ] **Dev.to or personal blog** — “I built an install-fixer, not a coding agent” walkthrough with real terminal output
- [ ] **Awesome-list PRs** — CLI tools, Node CLIs, AI dev tools, Pollinations ecosystem lists
- [ ] **Pollinations cross-promo** — ask for a shout-out in Greenhouse / Discord / newsletter when timing is right
- [ ] **npm discoverability** — tighten `keywords`, README install CTA, and registry description; track weekly downloads
- [ ] **GitHub discoverability** — topics on the repo (`cli`, `developer-tools`, `pollinations`, `homebrew`, etc.)
- [ ] **OG / share kit** — one link + one command + one GIF (`docs/public/social/sprout-tui-demo.gif`) for every post

---

## Community & support loop

Turn attention into feedback, then into issues and recipes.

- [ ] **Finish Discord launch** — branding, permanent invite, `#welcome` intro, CoC link ([COMMUNITY.md](COMMUNITY.md) checklist)
- [ ] **Enable GitHub Discussions** — long-form install help without cluttering Issues
- [ ] **Issue triage rhythm** — weekly pass on bugs, recipe requests, and `enhancement` labels
- [ ] **FAQ from the field** — add site FAQ entries from repeated Reddit / Discord questions
- [ ] **Contributor path** — make “missing tool?” → PR recipe flow obvious (site + README + Discord `#knowledge-base`)
- [ ] **Release notes habit** — GitHub Release per version with terminal screenshots or GIFs
- [ ] **@contributor recognition** — Discord role + thank-you in release notes for merged recipes

---

## Product — continuous improvement

Improve what people actually run, not the marketing surface.

### Knowledge base (highest leverage)

- [ ] **Top 10 recipe gaps** — tools people ask for in Reddit / Issues (track in a pinned issue)
- [ ] **Agentic CLI coverage** — keep recipes current as Claude Code, Codex, Gemini, OpenCode, etc. change install paths
- [ ] **Windows parity** — audit recipes for winget / choco / scoop coverage and PATH repair notes
- [ ] **Community recipes** — first external contributor merge + document the pattern in [CONTRIBUTING.md](CONTRIBUTING.md)

### CLI UX & reliability

- [ ] **`sprout diagnose` polish** — clearer output when users paste brew / npm / apt failures
- [ ] **Dry-run clarity** — make `--dry-run` output copy-paste friendly for support threads
- [ ] **Better verify failures** — actionable message when verify passes locally but PATH is wrong in a new shell
- [ ] **First-run experience** — smoother path from `npm install -g` → `sprout login` → first `sprout install`
- [ ] **Error messages** — audit top failure modes (no key, no network, unsupported shell) for plain-English fixes

### Site (still GitHub Pages only)

- [ ] **Commercial CTA on homepage** — “Watch 10s demo” without leaving the hero funnel
- [ ] **Mobile polish** — keep hero + install section tight on small screens (ongoing)
- [ ] **Analytics (privacy-light)** — optional: GitHub Pages doesn’t give much; consider Plausible / simple referer logging if needed
- [ ] **Changelog page** — `/changelog` or Releases section on the site linked from footer

---

## Release milestones

Rough sequencing — adjust as feedback arrives.

### v0.3.x — stabilize launch window

- [ ] Fix papercuts from first wave of installs (Issues + Reddit)
- [ ] Ship 3–5 high-demand knowledge recipes
- [ ] Discord + Discussions live
- [ ] One coordinated publicity push (X + Reddit + Pollinations)

### v0.4.0 — widen the funnel

- [ ] Windows install path audited end-to-end on a clean VM
- [ ] `diagnose` improvements shipped with tests
- [ ] 10+ new or updated recipes
- [ ] Site changelog + stronger install conversion (hero → `npm install -g`)

### v0.5.0 — depth over breadth

- [ ] Recipe contribution flow proven (multiple external PRs)
- [ ] Documented “supported vs reasoned live” boundary on the site
- [ ] Optional: shell-rc repair helpers or PATH diff summary (only if it stays in scope)

---

## Explicit non-goals

Keep saying no to scope creep:

- [ ] ~~General coding agent~~ — no code review, refactors, or unrelated chat
- [ ] ~~Hosted Sprout service~~ — stay CLI + static site; users bring their own Pollinations key
- [ ] ~~curl \| bash installers~~ — ever
- [ ] ~~Telemetry that phones home with keys or command output~~ — local-first trust

---

## How to use this doc

1. Check items off in PRs or direct commits (`- [ ]` → `- [x]`).
2. Link GitHub Issues to roadmap bullets when work starts (`roadmap` label optional).
3. Revisit monthly: what got installs, what got ignored, what broke in the wild.

**Links:** [Site](https://murderszn.github.io/sprout/) · [npm](https://www.npmjs.com/package/sprout-install) · [Issues](https://github.com/murderszn/sprout/issues) · [Contributing](CONTRIBUTING.md) · [Community](COMMUNITY.md)