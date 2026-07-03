import { test } from "node:test";
import assert from "node:assert/strict";
import { loadKnowledgeBase, lookupTool } from "../src/knowledge/index.js";

test("all seed entries load and have both unix platforms + verify patterns", () => {
  const entries = loadKnowledgeBase();
  assert.ok(entries.length >= 10, `expected >=10 seed tools, got ${entries.length}`);
  for (const e of entries) {
    assert.ok(e.verify.command.length > 0, `${e.name}: verify command`);
    assert.doesNotThrow(() => new RegExp(e.verify.expectedPattern), `${e.name}: verify pattern compiles`);
    assert.ok(e.platforms.darwin || e.platforms.linux || e.platforms.win32, `${e.name}: at least one platform`);
    for (const platform of ["darwin", "linux", "win32"] as const) {
      const p = e.platforms[platform];
      if (!p) continue;
      assert.ok(p.installs.length > 0, `${e.name}/${platform}: install options`);
      for (const opt of p.installs) {
        assert.ok(Array.isArray(opt.command) && opt.command.length > 0, `${e.name}/${platform}: argv array`);
        assert.equal(typeof opt.requiresSudo, "boolean", `${e.name}/${platform}: requiresSudo`);
        const joined = opt.command.join(" ");
        assert.ok(!/\|\s*(ba|z)?sh\b/.test(joined), `${e.name}/${platform}: no pipe-to-shell in seed data`);
      }
    }
  }
});

test("lookup resolves canonical names and aliases, case-insensitive", () => {
  assert.equal(lookupTool("gh")?.name, "gh");
  assert.equal(lookupTool("GitHub CLI")?.name, "gh");
  assert.equal(lookupTool("ripgrep")?.name, "rg");
  assert.equal(lookupTool("AWS-CLI")?.name, "aws");
  assert.equal(lookupTool("nvm")?.name, "node");
  assert.equal(lookupTool("Claude Code")?.name, "claude");
  assert.equal(lookupTool("OpenAI Codex")?.name, "codex");
  assert.equal(lookupTool("Antigravity")?.name, "agy");
  assert.equal(lookupTool("Memo Code")?.name, "mimo");
  assert.equal(lookupTool("definitely-not-seeded"), null);
});

test("darwin install commands prefer brew where sensible", () => {
  for (const name of ["gh", "jq", "git"]) {
    const entry = lookupTool(name)!;
    assert.equal(entry.platforms.darwin?.preferredManager, "brew", `${name} prefers brew on macOS`);
  }
});
