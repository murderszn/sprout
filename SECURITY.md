# Security

Sprout runs shell commands on your machine with your confirmation. Treat it like any tool that can modify your system.

## Reporting a vulnerability

Please **do not** open a public issue for security problems.

Report privately via GitHub Security Advisories on this repository, or contact **@murderszn** on Discord once the community server is live.

## What we consider in scope

- Guardrail bypasses (commands that should be blocked but execute)
- API key leakage in logs, config, or error output
- Unauthorized network calls beyond the configured Pollinations endpoint
- Path traversal or arbitrary file write outside intended rc/backup flows

## Out of scope

- Social engineering of the confirmation prompts (the user is the trust boundary)
- Model hallucinations that propose bad commands — report as a product issue, not CVE
- Issues in third-party package managers Sprout orchestrates (brew, apt, npm, etc.)

## Safe defaults

- API keys are masked in output and stored with `chmod 600`
- Hard-blocked destructive patterns cannot be overridden with `--yes`
- `sudo`, system package managers, and rc-file edits require explicit confirmation