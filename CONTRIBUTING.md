# Contributing to Sprout

The most useful contribution is a new knowledge-base entry. Each tool is one self-contained JSON file in `src/knowledge/tools/`, discovered at runtime by directory scan — no code changes, no registration list, reviewable independently in a PR.

## Adding a tool

Create `src/knowledge/tools/<tool>.json`:

```json
{
  "name": "gh",
  "displayName": "GitHub CLI",
  "aliases": ["github-cli"],
  "description": "GitHub's official command-line tool.",
  "verify": { "command": ["gh", "--version"], "expectedPattern": "gh version \\d+" },
  "platforms": {
    "darwin": {
      "preferredManager": "brew",
      "installs": [
        { "manager": "brew", "command": ["brew", "install", "gh"], "requiresSudo": false }
      ]
    },
    "linux": {
      "preferredManager": "apt-get",
      "installs": [
        { "manager": "apt-get", "command": ["sudo", "apt-get", "install", "-y", "gh"], "requiresSudo": true, "notes": "Only in Ubuntu 23.04+/Debian 12+ default repos." }
      ]
    }
  },
  "commonFailures": [
    "Installed fine but `gh auth login` was never run."
  ]
}
```

Rules — CI (`npm test`) enforces the mechanical ones:

- **`command` is an argv array**, never a shell string. No pipes, `&&`, globs, or `$VARS` — commands run without a shell.
- **Never encode `curl … | bash`.** If a tool installs via remote script, the command downloads it to `/tmp` with `curl -o`, and `notes` describes the review-then-run flow (see `node.json` or `homebrew.json` for the pattern).
- **`requiresSudo` must be honest** — the agent surfaces it to the user before the confirmation prompt, and the notes/reason should say *why* elevation is needed.
- **`verify.expectedPattern`** is a regex matched against the verify command's output; it's what makes "done" mean something. Test it against real output.
- **`commonFailures` earns its keep** — the entries the model benefits from most are the "PATH not updated until shell restart" / "package name differs from binary name" class of gotchas.
- The canonical `name` should be the **binary** name (`rg`, not `ripgrep`); put the package/colloquial names in `aliases`.

Then run `npm test` — the knowledge suite validates shape, regex compilation, argv arrays, and the no-pipe-to-shell rule for every file in the directory.

## Everything else

- `npm test` must pass; add tests for guardrail or loop changes.
- Keep scope narrow: Sprout orchestrates package managers and fixes PATH/rc problems. PRs adding general coding-assistant behavior will be declined regardless of quality.
- Safety guardrails (`src/guardrails/patterns.ts`) only ever get stricter in a minor version.
