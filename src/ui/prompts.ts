/**
 * Terminal interaction and rendering.
 *
 * The pieces of the experience:
 *   banner()            — rounded-box header shown once per run
 *   confirm()           — arrow-key Yes/No menu (y/n/esc shortcuts, [y/N]
 *                         fallback when stdin isn't a TTY)
 *   Thinker             — dim spinner with elapsed time while inference runs
 *   ProseStream         — styles model prose line-by-line as it streams
 *   printToolCard/…     — `⏺` tool-use cards with `⎿` result connectors
 *   renderDiff()        — minimal +/- line diff for rc-file edits
 */

import readline from "node:readline";
import chalk from "chalk";
import type { Command, Help } from "commander";
import { maskKey } from "../config/store.js";
import { color, glyph, wrap, styleProseLine, box, termWidth } from "./theme.js";

const interactive = (): boolean => Boolean(process.stdin.isTTY && process.stdout.isTTY);

/* ---------------------------------------------------------------- prompts */

function askLine(question: string, hidden = false): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  if (hidden) {
    const output = process.stdout;
    const origWrite = output.write.bind(output);
    let muted = false;
    (output as unknown as { write: typeof origWrite }).write = ((chunk: string | Uint8Array, ...rest: unknown[]) => {
      if (muted && typeof chunk === "string" && chunk !== "\n" && chunk !== "\r\n") return true;
      // @ts-expect-error variadic passthrough
      return origWrite(chunk, ...rest);
    }) as typeof origWrite;
    return new Promise((resolve) => {
      rl.question(question, (answer) => {
        (output as unknown as { write: typeof origWrite }).write = origWrite;
        rl.close();
        process.stdout.write("\n");
        resolve(answer.trim());
      });
      muted = true;
    });
  }
  return new Promise((resolve) => rl.question(question, (a) => { rl.close(); resolve(a.trim()); }));
}

/**
 * Yes/No as a two-item arrow-key menu. Enter selects; y/n jump straight to an
 * answer; Esc means No. Collapses to one line once answered so transcripts
 * stay clean. Defaults to No everywhere a default exists.
 */
export async function confirm(question: string): Promise<boolean> {
  if (!interactive()) {
    const answer = await askLine(`${question} ${color.dim("[y/N]")} `);
    return /^y(es)?$/i.test(answer);
  }

  const options = ["Yes", "No"] as const;
  return new Promise<boolean>((resolve) => {
    let idx = 1; // default focus on No — matches the [y/N] default
    const lineCount = options.length + 1;

    const paint = (first: boolean) => {
      if (!first) process.stdout.write(`\x1b[${lineCount}A`);
      process.stdout.write("\r\x1b[J");
      process.stdout.write(`  ${chalk.bold(question)} ${color.dim("(↑↓ + enter, or y/n)")}\n`);
      options.forEach((opt, i) => {
        process.stdout.write(
          i === idx
            ? `  ${color.brand(glyph.pointer)} ${color.brand.bold(opt)}\n`
            : `    ${color.dim(opt)}\n`
        );
      });
    };

    const finish = (yes: boolean) => {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.off("keypress", onKey);
      process.stdout.write(`\x1b[${lineCount}A\r\x1b[J`);
      process.stdout.write(`  ${chalk.bold(question)} ${yes ? color.brand("yes") : color.warn("no")}\n`);
      resolve(yes);
    };

    const onKey = (str: string | undefined, key: { name?: string; ctrl?: boolean }) => {
      if (key.ctrl && key.name === "c") {
        process.stdin.setRawMode(false);
        process.stdout.write("\n");
        process.exit(130);
      }
      if (key.name === "up" || str === "k") idx = (idx + options.length - 1) % options.length;
      else if (key.name === "down" || key.name === "tab" || str === "j") idx = (idx + 1) % options.length;
      else if (str === "y" || str === "Y") return finish(true);
      else if (str === "n" || str === "N" || key.name === "escape") return finish(false);
      else if (key.name === "return") return finish(idx === 0);
      paint(false);
    };

    readline.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on("keypress", onKey);
    paint(true);
  });
}

export async function promptYesNo(question: string): Promise<boolean> {
  return confirm(question);
}

/** Hidden-input prompt for the Pollinations key; echoes only a masked form. */
export async function promptForApiKey(): Promise<string> {
  console.log("\n" + chalk.bold("Sprout needs a Pollinations API key."));
  console.log(`Paste an existing ${color.dim("sk_...")} key, or run ${color.accent("sprout login")} to authorize with your Pollen balance.\n`);
  const key = await askLine("Paste your key (input hidden): ", true);
  if (!key) throw new Error("No API key entered.");
  console.log(`Received ${color.dim(maskKey(key))}`);
  return key;
}

/* ----------------------------------------------------------------- banner */

export function banner(title: string, meta: string[]): void {
  const lines = [
    `${glyph.sprout} ${color.brand.bold("sprout")} ${color.dim("·")} ${chalk.bold(title)}`,
    ...meta.map((m) => color.dim(m)),
  ];
  console.log("\n" + box(lines) + "\n");
}

/* ---------------------------------------------------------------- thinker */

/** Dim spinner + elapsed seconds while a model turn is in flight. */
export class Thinker {
  private timer: NodeJS.Timeout | null = null;
  private started = 0;
  private frame = 0;
  private static frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

  start(label = "thinking"): void {
    if (!process.stdout.isTTY) return;
    this.started = Date.now();
    this.timer = setInterval(() => {
      const s = ((Date.now() - this.started) / 1000).toFixed(1);
      const f = Thinker.frames[this.frame++ % Thinker.frames.length];
      process.stdout.write(`\r\x1b[K${color.brand(f!)} ${color.dim(`${label}… ${s}s`)}`);
    }, 90);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      process.stdout.write("\r\x1b[K");
    }
  }
}

/* ------------------------------------------------------------ prose stream */

/**
 * Buffers streamed deltas and prints each line the moment it completes, with
 * markdown-lite styling — so model prose renders live without ever styling a
 * half-arrived line.
 */
export class ProseStream {
  private buffer = "";
  private startedBlock = false;
  private wrote = false;

  feed(delta: string): void {
    this.buffer += delta;
    let nl: number;
    while ((nl = this.buffer.indexOf("\n")) !== -1) {
      this.emit(this.buffer.slice(0, nl));
      this.buffer = this.buffer.slice(nl + 1);
    }
  }

  /** Flush the trailing partial line; returns whether anything was printed. */
  end(): boolean {
    if (this.buffer.trim()) this.emit(this.buffer);
    this.buffer = "";
    const wrote = this.wrote;
    this.wrote = false;
    this.startedBlock = false;
    return wrote;
  }

  private emit(line: string): void {
    if (!this.startedBlock) {
      process.stdout.write("\n");
      this.startedBlock = true;
    }
    this.wrote = true;
    console.log(wrap(styleProseLine(line.trimEnd()), ""));
  }
}

/* -------------------------------------------------------------- tool cards */

const INDENT = "  ";
const RESULT_INDENT = "    ";

/** `⏺ run_shell · step 3  [sudo]` header plus command and reason lines. */
export function printProposedStep(index: number, command: string[], reason: string, requiresSudo: boolean): void {
  console.log("");
  console.log(`${color.brand(glyph.dot)} ${chalk.bold("run_shell")} ${color.dim(`· step ${index}`)}${requiresSudo ? "  " + color.warn("[sudo]") : ""}`);
  console.log(`${INDENT}${color.accent("$")} ${color.accent.bold(command.join(" "))}`);
  console.log(color.dim(wrap(`↳ ${reason}`, INDENT)));
}

export function printFileCard(index: number, filePath: string, reason: string, isNew: boolean): void {
  console.log("");
  console.log(`${color.brand(glyph.dot)} ${chalk.bold("write_file")} ${color.dim(`· step ${index}`)}  ${color.warn(isNew ? "[new file]" : "[edit]")}`);
  console.log(`${INDENT}${color.accent("✎")} ${color.accent.bold(filePath)}`);
  console.log(color.dim(wrap(`↳ ${reason}`, INDENT)));
}

export function printBlocked(reason: string): void {
  console.log(`${INDENT}${color.danger(glyph.elbow)} ${color.danger.bold("BLOCKED")} ${color.danger(reason)}`);
  console.log(color.dim(`${RESULT_INDENT}hard-blocked patterns cannot be confirmed past, including with --yes`));
}

export function printDryRun(): void {
  console.log(`${INDENT}${color.magic(glyph.elbow)} ${color.magic("dry-run — recorded, not executed")}`);
}

export function printSkipped(): void {
  console.log(`${INDENT}${color.warn(glyph.elbow)} ${color.warn("skipped by user")}`);
}

export function printNote(text: string): void {
  console.log(color.dim(`${INDENT}${glyph.elbow} ${text}`));
}

export function printCommandResult(exitCode: number, stdout: string, stderr: string, durationMs?: number): void {
  const body = clip(`${stdout.trim()}${stdout.trim() && stderr.trim() ? "\n" : ""}${stderr.trim()}`);
  const status =
    exitCode === 0
      ? color.brand(`${glyph.ok} exit 0`)
      : color.danger(`${glyph.fail} exit ${exitCode}`);
  const time = durationMs != null ? color.dim(` · ${(durationMs / 1000).toFixed(1)}s`) : "";
  if (body) {
    const lines = body.split("\n");
    console.log(`${INDENT}${color.dim(glyph.elbow)} ${color.dim(lines[0] ?? "")}`);
    for (const line of lines.slice(1)) console.log(color.dim(`${RESULT_INDENT}${line}`));
  }
  console.log(`${INDENT}${body ? color.dim(glyph.elbow) : color.dim(glyph.elbow)} ${status}${time}`);
}

/* --------------------------------------------------------------------- diff */

/** Minimal LCS line diff for rc/config files (they're small). */
export function renderDiff(oldText: string | null, newText: string): string {
  const a = oldText === null ? [] : oldText.split("\n");
  const b = newText.split("\n");
  if (a.length + b.length > 800) {
    // Too big to diff nicely — show the head of the new content instead.
    return b.slice(0, 20).map((l) => `${RESULT_INDENT}${color.dim("│")} ${l}`).join("\n") + (b.length > 20 ? `\n${RESULT_INDENT}${color.dim("│ …")}` : "");
  }
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      dp[i]![j] = a[i] === b[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);

  type Row = { sign: " " | "+" | "-"; text: string };
  const rows: Row[] = [];
  let i = 0, j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { rows.push({ sign: " ", text: a[i]! }); i++; j++; }
    else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) { rows.push({ sign: "-", text: a[i]! }); i++; }
    else { rows.push({ sign: "+", text: b[j]! }); j++; }
  }
  while (i < a.length) rows.push({ sign: "-", text: a[i++]! });
  while (j < b.length) rows.push({ sign: "+", text: b[j++]! });

  // Collapse long unchanged runs to context around the changes.
  const keep = new Set<number>();
  rows.forEach((r, idx) => {
    if (r.sign !== " ") for (let k = idx - 2; k <= idx + 2; k++) keep.add(k);
  });
  const out: string[] = [];
  let skipping = false;
  rows.forEach((r, idx) => {
    if (r.sign === " " && !keep.has(idx)) {
      if (!skipping) { out.push(color.dim(`${RESULT_INDENT}·· ${glyph.bullet} ··`)); skipping = true; }
      return;
    }
    skipping = false;
    const line =
      r.sign === "+" ? color.brand(`+ ${r.text}`) :
      r.sign === "-" ? color.danger(`- ${r.text}`) :
      color.dim(`  ${r.text}`);
    out.push(RESULT_INDENT + line);
  });
  return out.length ? out.join("\n") : color.dim(`${RESULT_INDENT}(no textual change)`);
}

/* ------------------------------------------------------------------ misc */

export function heading(text: string): void {
  console.log("\n" + color.brand.bold(`${glyph.sprout} ${text}`));
}

export function hr(): void {
  console.log(color.dim("─".repeat(Math.min(termWidth(), 60))));
}

function clip(text: string, maxLines = 12): string {
  const lines = text.split("\n");
  if (lines.length <= maxLines) return text;
  return [...lines.slice(0, maxLines), `… (${lines.length - maxLines} more lines)`].join("\n");
}

export function formatCustomHelp(cmd: Command, helper: Help): string {
  const parts: string[] = [];
  const isMain = cmd.parent === null;

  if (isMain) {
    parts.push("");
    parts.push(box([
      `${glyph.sprout} ${color.brand.bold("sprout")} ${color.dim("v0.1.0")}`,
      color.dim("Diagnose & fix local install, config, and PATH problems for developer tools."),
    ]));
    parts.push("");
  } else {
    parts.push("");
    parts.push(`  ${color.brand.bold(`${glyph.sprout} sprout`)} ${color.dim("·")} ${color.accent.bold(cmd.name())}`);
    if (cmd.description()) {
      parts.push(`  ${color.dim(cmd.description().split("\n")[0] || "")}`);
    }
    parts.push("");
  }

  // Usage
  parts.push(`  ${color.brandDim.bold("Usage:")}`);
  if (isMain) {
    parts.push(`    ${color.accent("$")} ${color.bold("sprout")} ${color.dim("<command> [options]")}`);
  } else {
    let cmdPath = cmd.name();
    let parent = cmd.parent;
    while (parent && parent.parent) {
      cmdPath = `${parent.name()} ${cmdPath}`;
      parent = parent.parent;
    }
    const args = cmd.usage() || "";
    parts.push(`    ${color.accent("$")} ${color.bold("sprout " + cmdPath)} ${color.dim(args)}`);
  }
  parts.push("");

  // Arguments
  const visibleArgs = helper.visibleArguments(cmd);
  if (visibleArgs.length > 0) {
    parts.push(`  ${color.brandDim.bold("Arguments:")}`);
    const maxArgLen = Math.max(...visibleArgs.map(a => a.name().length), 12);
    for (const arg of visibleArgs) {
      const nameCol = `<${arg.name()}>`.padEnd(maxArgLen + 4);
      parts.push(`    ${color.accent(nameCol)} ${color.dim(arg.description || "")}`);
    }
    parts.push("");
  }

  // Commands
  const visibleCmds = helper.visibleCommands(cmd);
  if (visibleCmds.length > 0) {
    parts.push(`  ${color.brandDim.bold("Commands:")}`);
    const maxCmdLen = Math.max(...visibleCmds.map(c => c.name().length), 12);
    for (const c of visibleCmds) {
      const nameCol = c.name().padEnd(maxCmdLen + 2);
      const desc = c.description() ? c.description().split("\n")[0] : "";
      parts.push(`    ${color.accent(nameCol)} ${color.dim(desc || "")}`);
    }
    parts.push("");
  }

  // Options
  const visibleOpts = helper.visibleOptions(cmd);
  if (visibleOpts.length > 0) {
    parts.push(`  ${color.brandDim.bold("Options:")}`);
    const maxOptLen = Math.max(...visibleOpts.map(o => o.flags.length), 18);
    for (const opt of visibleOpts) {
      const flagsCol = opt.flags.padEnd(maxOptLen + 2);
      parts.push(`    ${color.accent(flagsCol)} ${color.dim(opt.description)}`);
    }
    parts.push("");
  }

  // Seeded Tools & Examples
  if (isMain) {
    parts.push(`  ${color.brandDim.bold("Seeded Tools:")}`);
    parts.push(`    ${color.dim("git, node (nvm), python (pyenv), docker, gh, aws-cli, kubectl, brew, jq, rg, terraform")}`);
    parts.push("");
    parts.push(`  ${color.brandDim.bold("Examples:")}`);
    parts.push(`    ${color.dim("# Install a tool dynamically or using the knowledge base")}`);
    parts.push(`    ${color.accent("$")} ${color.bold("sprout install gh")}`);
    parts.push("");
    parts.push(`    ${color.dim("# Skip prompts (gates/guardrails still block malicious patterns)")}`);
    parts.push(`    ${color.accent("$")} ${color.bold("sprout --yes install jq")}`);
    parts.push("");
    parts.push(`    ${color.dim("# Diagnose a failing build or install output")}`);
    parts.push(`    ${color.accent("$")} ${color.bold("sprout diagnose < broken.log")}`);
    parts.push("");
  }

  return parts.join("\n") + "\n";
}
