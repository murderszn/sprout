#!/usr/bin/env node
/**
 * Phase 6 — CLI surface.
 *
 *   sprout install <tool>        main flow: detect → plan → confirm/execute → verify
 *   sprout diagnose              paste/pipe a broken install log, get a fix plan
 *   sprout login                 authorize Sprout via Pollinations BYOP (your Pollen)
 *   sprout config                view (masked) / set / clear the stored key + default model
 *   sprout status                verify the key works and the model is awake
 *   sprout env                   print the environment snapshot (Phase 1 debugging aid)
 *
 * Global flags: --dry-run (exact command list, zero side effects),
 * --yes (skip per-step confirmations; hard guardrails still block),
 * --model <id> (one-off model override).
 */

import "dotenv/config";
import { Command } from "commander";
import chalk from "chalk";
import { detectEnvironment } from "./env/detect.js";
import { lookupTool, seededToolNames } from "./knowledge/index.js";
import { createClient, checkModelStatus, POLLINATIONS_BASE_URL } from "./agent/pollinations.js";
import { resolveByopClientId, runByopLogin } from "./agent/byop.js";
import { runAgent, runVerification } from "./agent/plan.js";
import {
  resolveApiKey,
  resolveModel,
  readConfig,
  writeConfig,
  maskKey,
  configFilePath,
  DEFAULT_MODEL,
} from "./config/store.js";
import { promptForApiKey, promptYesNo, banner, formatCustomHelp } from "./ui/prompts.js";
import { box, color, glyph } from "./ui/theme.js";
import type { EnvironmentSnapshot } from "./env/detect.js";
import type { ExecutorOptions, ExecutedStep } from "./agent/tools.js";
import { VERSION } from "./version.js";

const program = new Command();

program
  .name("sprout")
  .description("Diagnose and fix local install/config/PATH problems for developer tools.\nNot a general coding agent — its whole world is package managers, PATH, and shell rc files.")
  .version(VERSION)
  .option("--dry-run", "show the exact commands that would run, execute nothing", false)
  .option("--yes", "skip per-step confirmation prompts (hard guardrails still block)", false)
  .option("--model <id>", "override the model for this run")
  .configureHelp({
    formatHelp: formatCustomHelp,
  });

interface GlobalOpts {
  dryRun: boolean;
  yes: boolean;
  model?: string;
}

const interactive = (): boolean => Boolean(process.stdin.isTTY && process.stdout.isTTY);

async function performByopLogin(save = true): Promise<string> {
  const clientId = resolveByopClientId();
  if (!clientId) {
    throw new Error("BYOP is not configured — set POLLINATIONS_BYOP_KEY or ship a publishable pk_ App Key.");
  }

  console.log("\n" + chalk.bold("Sign in with Pollen"));
  console.log(chalk.dim("Sprout will use your Pollinations balance for inference — nothing is charged to the app author.\n"));

  const key = await runByopLogin(clientId, {
    onDeviceCode: ({ userCode, verifyUrl, opened }) => {
      console.log(`  ${color.brand(glyph.dot)} ${chalk.bold("Enter this code")} at ${color.accent(verifyUrl)}`);
      console.log(`  ${color.dim(glyph.elbow)} ${chalk.bold(userCode)}\n`);
      if (opened) {
        console.log(chalk.dim("  Opened your browser — approve access, then come back here.\n"));
      } else {
        console.log(chalk.dim("  Could not open a browser automatically — visit the URL above.\n"));
      }
    },
    onWaiting: (elapsedMs) => {
      const secs = Math.round(elapsedMs / 1000);
      process.stdout.write(`\r  ${color.dim(glyph.elbow)} waiting for approval… ${secs}s`);
    },
    onAuthorized: ({ user }) => {
      process.stdout.write("\n");
      if (user?.preferred_username) {
        console.log(chalk.green(`  ${glyph.ok} authorized as ${user.preferred_username}`));
      } else {
        console.log(chalk.green(`  ${glyph.ok} authorized`));
      }
    },
  });

  if (save) {
    writeConfig({ apiKey: key, apiKeyKind: "byop" });
    console.log(chalk.green(`\nSaved (masked: ${maskKey(key)}) to ${configFilePath()}`));
  }

  return key;
}

/** First-run key flow: env var → config file → BYOP login or interactive paste. */
async function requireApiKey(): Promise<string> {
  const resolved = resolveApiKey();
  if (resolved) return resolved.key;

  const clientId = resolveByopClientId();
  if (clientId && interactive()) {
    const useByop = await promptYesNo(
      "Sign in with Pollen at enter.pollinations.ai? (uses your balance — recommended)"
    );
    if (useByop) {
      return performByopLogin(true);
    }
  }

  const key = await promptForApiKey();
  const save = await promptYesNo(`Save it to ${configFilePath()} (chmod 600)? Otherwise export SPROUT_API_KEY each run.`);
  if (save) {
    writeConfig({ apiKey: key, apiKeyKind: "manual" });
    console.log(chalk.green(`Saved to ${configFilePath()}`));
  }
  return key;
}

function executorOptions(opts: GlobalOpts): ExecutorOptions {
  return { dryRun: opts.dryRun, autoYes: opts.yes };
}

function printRunSummary(steps: ExecutedStep[], dryRun: boolean): void {
  if (steps.length === 0) return;
  const title = dryRun ? `${glyph.sprout} dry run — commands that WOULD run` : `${glyph.sprout} run summary`;
  const rows = steps.map((s) => {
    const badge =
      s.outcome === "ran" ? (s.exitCode === 0 ? color.brand(` ${glyph.ok} `) : color.danger(` ${glyph.fail} `)) :
      s.outcome === "dry-run" ? color.magic(" ⧗ ") :
      s.outcome === "declined" ? color.warn(" ⤳ ") : color.danger(" ⛔");
    const note =
      s.outcome === "ran" && s.exitCode !== 0 ? color.dim(` (exit ${s.exitCode})`) :
      s.outcome === "declined" ? color.dim(" (skipped)") :
      s.outcome === "blocked" ? color.danger(" (blocked)") : "";
    return `${badge} ${s.command.join(" ")}${note}`;
  });
  console.log("\n" + box([color.brand.bold(title), ...rows]));
}

function printDetection(snapshot: EnvironmentSnapshot, kbNote: string, dryRun: boolean): void {
  console.log(`${color.brand(glyph.dot)} ${chalk.bold("environment")}`);
  console.log(`  ${color.dim(glyph.elbow)} ${snapshot.osVersion} (${snapshot.arch}) ${color.dim("·")} ${snapshot.shell.name} ${color.dim("·")} rc ${snapshot.shell.rcFile.replace(snapshot.homeDir, "~")}`);
  console.log(`  ${color.dim(glyph.elbow)} managers: ${snapshot.packageManagers.length ? snapshot.packageManagers.map((m) => m.name).join(", ") : color.warn("none found")}`);
  console.log(`  ${color.dim(glyph.elbow)} ${color.dim(kbNote)}`);
  if (dryRun) console.log(`  ${color.magic(glyph.elbow)} ${color.magic("dry run — nothing will execute")}`);
}

program
  .command("login")
  .description("authorize Sprout with your Pollinations account (BYOP device flow — uses your Pollen balance)")
  .option("--no-save", "authorize but do not write the key to ~/.sprout/config.json")
  .action(async (cmdOpts: { noSave?: boolean }) => {
    if (!interactive()) {
      console.error(chalk.red("sprout login requires an interactive terminal."));
      process.exitCode = 1;
      return;
    }
    await performByopLogin(!cmdOpts.noSave);
  });

program
  .command("install <tool>")
  .description(`install or repair a developer tool (seeded: ${seededToolNames().join(", ")}; anything else is reasoned live)`)
  .action(async (tool: string) => {
    const opts = program.opts<GlobalOpts>();
    const apiKey = await requireApiKey();
    const model = resolveModel(opts.model);

    banner(`install ${tool}`, [`model ${model} · gen.pollinations.ai`]);
    const snapshot = await detectEnvironment();
    const kbEntry = lookupTool(tool);
    printDetection(
      snapshot,
      kbEntry ? `knowledge base: curated entry for ${kbEntry.displayName}` : `knowledge base: no entry for '${tool}' — the model reasons live and says so`,
      opts.dryRun
    );

    const { steps } = await runAgent({
      client: createClient(apiKey),
      model,
      goal: `Install (or repair the installation of) "${tool}" on this machine.`,
      mode: "install",
      snapshot,
      kbEntry,
      options: executorOptions(opts),
    });

    // Ground-truth verify, independent of the model's own claims.
    if (kbEntry) await runVerification(kbEntry, opts.dryRun);
    printRunSummary(steps, opts.dryRun);
  });

program
  .command("diagnose")
  .description("paste or pipe a broken install attempt (command + error output) and get a fix plan\n  e.g.  sprout diagnose < broken.log   |   some-failing-install 2>&1 | sprout diagnose")
  .option("--tool <name>", "which tool the log is about, if known (enables the curated knowledge base)")
  .action(async (cmdOpts: { tool?: string }) => {
    const opts = program.opts<GlobalOpts>();

    let log: string;
    if (process.stdin.isTTY) {
      console.log(chalk.bold("Paste the broken install attempt (the command you ran plus its output)."));
      console.log(chalk.dim("Finish with Ctrl-D on an empty line.\n"));
      log = await readAll(process.stdin);
    } else {
      log = await readAll(process.stdin);
    }
    log = log.trim();
    if (!log) {
      console.error(chalk.red("Nothing to diagnose — pipe or paste the failing command and its output."));
      process.exitCode = 1;
      return;
    }

    const apiKey = await requireApiKey();
    const model = resolveModel(opts.model);

    banner("diagnose", [`model ${model} · gen.pollinations.ai`]);
    const snapshot = await detectEnvironment();
    const kbEntry = cmdOpts.tool ? lookupTool(cmdOpts.tool) : null;
    printDetection(
      snapshot,
      kbEntry ? `knowledge base: curated entry for ${kbEntry.displayName}` : "diagnosing from the pasted log",
      opts.dryRun
    );

    const { steps } = await runAgent({
      client: createClient(apiKey),
      model,
      goal: `Here is a broken install attempt from this machine. Diagnose what went wrong and fix it.\n\n--- PASTED LOG ---\n${log}\n--- END LOG ---`,
      mode: "diagnose",
      snapshot,
      kbEntry,
      options: executorOptions(opts),
    });

    if (kbEntry) await runVerification(kbEntry, opts.dryRun);
    printRunSummary(steps, opts.dryRun);
  });

program
  .command("config")
  .description("view (masked), set, or clear the stored API key and default model")
  .option("--set-key", "prompt for a new API key (input hidden) and store it")
  .option("--clear-key", "remove the stored API key")
  .option("--model <id>", "set the default model")
  .action(async (cmdOpts: { setKey?: boolean; clearKey?: boolean; model?: string }) => {
    if (cmdOpts.setKey) {
      const key = await promptForApiKey();
      writeConfig({ apiKey: key, apiKeyKind: "manual" });
      console.log(chalk.green(`Saved (masked: ${maskKey(key)}) to ${configFilePath()}`));
      return;
    }
    if (cmdOpts.clearKey) {
      writeConfig({ apiKey: undefined, apiKeyKind: undefined });
      console.log(chalk.green("Stored API key cleared."));
      return;
    }
    if (cmdOpts.model) {
      writeConfig({ model: cmdOpts.model });
      console.log(chalk.green(`Default model set to ${cmdOpts.model}`));
      return;
    }
    const cfg = readConfig();
    const envKey = process.env.SPROUT_API_KEY?.trim();
    const byopId = resolveByopClientId();
    console.log(chalk.bold("Sprout config") + chalk.dim(`  (${configFilePath()})`));
    console.log(`  api key (env):    ${envKey ? maskKey(envKey) : chalk.dim("not set")}`);
    console.log(`  api key (stored): ${cfg.apiKey ? maskKey(cfg.apiKey) : chalk.dim("not set")}${cfg.apiKeyKind ? chalk.dim(` · ${cfg.apiKeyKind}`) : ""}`);
    console.log(`  model:            ${resolveModel()} ${cfg.model ? "" : chalk.dim(`(default: ${DEFAULT_MODEL})`)}`);
    console.log(`  byop app key:     ${byopId ? maskKey(byopId) : chalk.dim("not configured")}`);
    if (!resolveApiKey() && byopId) {
      console.log(chalk.dim(`  → run ${color.accent("sprout login")} to authorize with your Pollen balance`));
    }
  });

program
  .command("status")
  .description("check the API key works and the configured model is awake")
  .action(async () => {
    const opts = program.opts<GlobalOpts>();
    const apiKey = await requireApiKey();
    const model = resolveModel(opts.model);
    console.log(chalk.dim(`endpoint: ${POLLINATIONS_BASE_URL} · model: ${model}`));
    const status = await checkModelStatus(apiKey, model);
    if (status.ok) {
      console.log(chalk.green("✓ ") + status.detail);
    } else {
      console.log(chalk.red("✗ ") + status.detail);
      process.exitCode = 1;
    }
  });

program
  .command("env")
  .description("print the detected environment snapshot (what the agent sees)")
  .action(async () => {
    console.log(JSON.stringify(await detectEnvironment(), null, 2));
  });

function readAll(stream: NodeJS.ReadStream): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    stream.setEncoding("utf8");
    stream.on("data", (chunk) => (data += chunk));
    stream.on("end", () => resolve(data));
    stream.on("error", reject);
  });
}

program.parseAsync().catch((err: Error) => {
  console.error(chalk.red("\n" + err.message));
  process.exit(1);
});