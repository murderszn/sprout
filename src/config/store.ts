/**
 * ~/.sprout/config.json read/write, plus API-key resolution.
 *
 * Resolution order (spec-fixed): SPROUT_API_KEY env var -> config file ->
 * interactive prompt (handled by the caller in ui/prompts.ts, which then
 * offers to save here). The config file is chmod 600 and the key is never
 * echoed back unmasked.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const DEFAULT_MODEL = "gpt-5.4-mini";

export interface SproutConfig {
  apiKey?: string;
  model?: string;
}

const configDir = path.join(os.homedir(), ".sprout");
const configPath = path.join(configDir, "config.json");

export function configFilePath(): string {
  return configPath;
}

export function readConfig(): SproutConfig {
  try {
    return JSON.parse(fs.readFileSync(configPath, "utf8")) as SproutConfig;
  } catch {
    return {};
  }
}

export function writeConfig(update: Partial<SproutConfig>): void {
  const merged = { ...readConfig(), ...update };
  // Drop keys explicitly set to undefined (used by `sprout config --clear-key`).
  for (const k of Object.keys(merged) as (keyof SproutConfig)[]) {
    if (merged[k] === undefined) delete merged[k];
  }
  fs.mkdirSync(configDir, { recursive: true, mode: 0o700 });
  fs.writeFileSync(configPath, JSON.stringify(merged, null, 2) + "\n", { mode: 0o600 });
  fs.chmodSync(configPath, 0o600);
}

/** Key from env or config file; null means the caller should prompt interactively. */
export function resolveApiKey(): { key: string; source: "env" | "config" } | null {
  const envKey = process.env.SPROUT_API_KEY?.trim();
  if (envKey) return { key: envKey, source: "env" };
  const fileKey = readConfig().apiKey?.trim();
  if (fileKey) return { key: fileKey, source: "config" };
  return null;
}

export function resolveModel(cliOverride?: string): string {
  return cliOverride ?? process.env.SPROUT_MODEL ?? readConfig().model ?? DEFAULT_MODEL;
}

/** sk_abc...xyz -> sk_a****xyz — the only form in which a stored key is ever printed. */
export function maskKey(key: string): string {
  if (key.length <= 8) return "*".repeat(key.length);
  return `${key.slice(0, 4)}${"*".repeat(Math.min(key.length - 7, 20))}${key.slice(-3)}`;
}
