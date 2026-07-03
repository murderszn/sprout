#!/usr/bin/env node
/**
 * Phase 6 — CLI surface.
 *
 *   sprout install <tool>        main flow: detect → plan → confirm/execute → verify
 *   sprout diagnose              paste/pipe a broken install log, get a fix plan
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
import { runAgent, runVerification } from "./agent/plan.js";
import { resolveApiKey, resolveModel, readConfig, writeConfig, maskKey, configFilePath, DEFAULT_MODEL } from "./config/store.js";
import { promptForApiKey, promptYesNo, heading } from "./ui/prompts.js";
import type { ExecutorOptions, ExecutedStep } from "./agent/tools.js";

const program = new Command();

program
  .name("sprout")
  .description("Diagnose and fix local install/config/PATH problems for developer tools.\nNot a general coding agent — its whole world is package managers, PATH, and shell rc files.")
  .version("0.1.0")
  .option("--dry-run", "show the exact commands that would run, execute nothing", false)
  .option("--yes", "skip per-step confirmation prompts (hard guardrails still block)", false)
  .option("--model <id>", "override the model for this run");

interface GlobalOpts {
  dryRun: boolean;
  yes: boolean;
  model?: string;
}

/** First-run key flow: env var → config file → interactive prompt + offer to save. */
async function requireApiKey(): Promise<string> {
  const resolved = resolveApiKey();
  if (resolved) return resolved.key;

  const key = await promptForApiKey();
  const save = await promptYesNo(`Save it to ${configFilePath()} (chmod 600)? Otherwise export SPROUT_API_KEY each run.`);
  if (save) {
    writeConfig({ apiKey: key });
    console.log(chalk.green(`Saved to ${configFilePath()}`));
  }
  return key;
}

function executorOptions(opts: GlobalOpts): ExecutorOptions {
  return { dryRun: opts.dryRun, autoYes: opts.yes };
}

function printRunSummary(steps: ExecutedStep[], dryRun: boolean): void {
  if (steps.length === 0) return;
  heading(dryRun ? "Dry run — commands that WOULD run:" : "Run summary");
  for (const s of steps) {
    const badge =
      s.outcome === "ran" ? (s.exitCode === 0 ? chalk.green("ok ") : chalk.red(`err(${s.exitCode})`)) :
      s.outcome === "dry-run" ? chalk.magenta("dry") :
      s.outcome === "declined" ? chalk.yellow("skip") : chalk.red("BLOCKED");
    console.log(`  ${badge}  ${s.command.join(" ")}`);
  }
}

program
  .command("install <tool>")
  .description(`install or repair a developer tool (seeded: ${seededToolNames().join(", ")}; anything else is reasoned live)`)
  .action(async (tool: string) => {
    const opts = program.opts<GlobalOpts>();
    const apiKey = await requireApiKey();
    const model = resolveModel(opts.model);

    heading(`Detecting environment…`);
    const snapshot = await detectEnvironment();
    console.log(`  ${snapshot.osVersion} (${snapshot.arch}) · shell: ${snapshot.shell.name} · rc: ${snapshot.shell.rcFile}`);
    console.log(`  package managers: ${snapshot.packageManagers.map((m) => m.name).join(", ") || chalk.yellow("none found")}`);

    const kbEntry = lookupTool(tool);
    console.log(kbEntry
      ? chalk.dim(`  knowledge base: found entry for ${kbEntry.displayName}`)
      : chalk.dim(`  knowledge base: no entry for '${tool}' — the model will reason live and say so`));
    if (opts.dryRun) console.log(chalk.magenta("  mode: DRY RUN — nothing will execute"));

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

    heading("Detecting environment…");
    const snapshot = await detectEnvironment();
    console.log(`  ${snapshot.osVersion} (${snapshot.arch}) · shell: ${snapshot.shell.name}`);

    const kbEntry = cmdOpts.tool ? lookupTool(cmdOpts.tool) : null;

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
      writeConfig({ apiKey: key });
      console.log(chalk.green(`Saved (masked: ${maskKey(key)}) to ${configFilePath()}`));
      return;
    }
    if (cmdOpts.clearKey) {
      writeConfig({ apiKey: undefined });
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
    console.log(chalk.bold("Sprout config") + chalk.dim(`  (${configFilePath()})`));
    console.log(`  api key (env):    ${envKey ? maskKey(envKey) : chalk.dim("not set")}`);
    console.log(`  api key (stored): ${cfg.apiKey ? maskKey(cfg.apiKey) : chalk.dim("not set")}`);
    console.log(`  model:            ${resolveModel()} ${cfg.model ? "" : chalk.dim(`(default: ${DEFAULT_MODEL})`)}`);
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
