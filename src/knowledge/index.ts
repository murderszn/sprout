/**
 * Phase 2 — Prerequisite knowledge base.
 *
 * Each tool is a self-contained JSON file in ./tools/ (reviewable
 * independently in a PR — see CONTRIBUTING.md). Files are discovered at
 * runtime by directory scan, so adding a tool requires no code change.
 *
 * When a requested tool has no entry here, the agent reasons it out live and
 * is instructed (in the system prompt) to say so explicitly rather than
 * pretending the answer came from the knowledge base.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface InstallOption {
  /** Package manager (or "official-installer" / "nvm"-style pseudo-manager) this option uses. */
  manager: string;
  /** argv array — executed without a shell, exactly as written. */
  command: string[];
  requiresSudo: boolean;
  /** Caveats, multi-step follow-ups, or reasons to prefer/avoid this option. */
  notes?: string;
}

export interface PlatformInstalls {
  preferredManager: string;
  installs: InstallOption[];
}

export interface KnowledgeEntry {
  /** Canonical binary/tool name, e.g. "gh". */
  name: string;
  displayName: string;
  aliases: string[];
  description: string;
  /** Command whose output must match expectedPattern for the install to count as verified. */
  verify: { command: string[]; expectedPattern: string };
  platforms: Partial<Record<"darwin" | "linux" | "win32", PlatformInstalls>>;
  commonFailures: string[];
}

const toolsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "tools");

let cache: KnowledgeEntry[] | null = null;

/** Load every tool JSON in ./tools/. Malformed files throw at load with the filename. */
export function loadKnowledgeBase(): KnowledgeEntry[] {
  if (cache) return cache;
  const entries: KnowledgeEntry[] = [];
  for (const file of fs.readdirSync(toolsDir).filter((f) => f.endsWith(".json")).sort()) {
    const raw = fs.readFileSync(path.join(toolsDir, file), "utf8");
    let parsed: KnowledgeEntry;
    try {
      parsed = JSON.parse(raw) as KnowledgeEntry;
    } catch (err) {
      throw new Error(`Knowledge base file ${file} is not valid JSON: ${(err as Error).message}`);
    }
    if (!parsed.name || !parsed.verify?.command?.length || !parsed.platforms) {
      throw new Error(`Knowledge base file ${file} is missing required fields (name, verify.command, platforms).`);
    }
    entries.push(parsed);
  }
  cache = entries;
  return entries;
}

/** Case-insensitive lookup by canonical name or alias. Returns null when the tool isn't seeded. */
export function lookupTool(query: string): KnowledgeEntry | null {
  const q = query.trim().toLowerCase();
  for (const entry of loadKnowledgeBase()) {
    if (entry.name.toLowerCase() === q) return entry;
    if (entry.displayName.toLowerCase() === q) return entry;
    if (entry.aliases.some((a) => a.toLowerCase() === q)) return entry;
  }
  return null;
}

export function seededToolNames(): string[] {
  return loadKnowledgeBase().map((e) => e.name);
}
