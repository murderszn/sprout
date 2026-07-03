/**
 * Phase 3/4 — The agent/tool-calling boundary.
 *
 * This file is the entire contract between the model and the machine. The
 * model can do exactly four things:
 *
 *   run_shell({ command: string[], reason, requiresConfirmation }) — execute
 *     one argv array via execa. NO SHELL is involved: pipes, globs, `&&`,
 *     redirects and env expansion do not work unless the model explicitly
 *     wraps them in `sh -c`, and wrapped forms are still guardrail-scanned.
 *   read_file({ path }) — read a text file (rc files, downloaded scripts,
 *     install logs). Capped at 64 KiB fed back to the model.
 *   write_file({ path, content, reason }) — rc/config files only; path is
 *     gated by checkWritePath (under $HOME or tmp, never credentials), always
 *     confirmed, and the previous version is backed up next to the file.
 *   detect_environment() — re-run Phase 1 detection when state may have
 *     changed (e.g. after an rc edit or a PATH-affecting install).
 *
 * Execution-order guarantees, enforced HERE and not left to the model:
 *   1. checkCommand/checkWritePath guardrails run BEFORE any confirmation
 *      prompt. A blocked step is never even offered to the user.
 *   2. Anything involving sudo, a system package manager, or an rc-file write
 *      is confirmed even if the model set requiresConfirmation=false.
 *   3. --dry-run records the exact argv and executes nothing, and tells the
 *      model so, so it keeps narrating the remaining plan.
 *
 * Every tool returns a plain string (JSON for structured results) — that
 * string is exactly what the model sees as the tool result on the next turn.
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execa } from "execa";
import type OpenAI from "openai";
import { detectEnvironment } from "../env/detect.js";
import { checkCommand, checkWritePath } from "../guardrails/patterns.js";
import {
  confirm,
  printProposedStep,
  printFileCard,
  printBlocked,
  printCommandResult,
  printDryRun,
  printSkipped,
  printNote,
  renderDiff,
} from "../ui/prompts.js";
import { color, glyph } from "../ui/theme.js";

export const TOOL_DEFINITIONS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "run_shell",
      description:
        "Run ONE command as an argv array (no shell: no pipes/&&/globs unless you explicitly use ['sh','-c',...], which is discouraged). The user sees the exact command and your reason, and must confirm risky steps. Never propose piping curl/wget into a shell — download to a file, read_file it, and run the file after the user confirms its contents.",
      parameters: {
        type: "object",
        properties: {
          command: {
            type: "array",
            items: { type: "string" },
            description: "argv array, e.g. [\"brew\",\"install\",\"gh\"]. First element is the executable.",
          },
          reason: {
            type: "string",
            description: "One plain-English sentence shown to the user: why this step is needed. If the step uses sudo, this MUST say why elevation is required.",
          },
          requiresConfirmation: {
            type: "boolean",
            description: "Default true. May be false ONLY for read-only checks (e.g. `which git`, `--version` probes). sudo/package-manager/rc-file steps are always confirmed regardless of this flag.",
          },
        },
        required: ["command", "reason"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Read a text file — shell rc files, a downloaded install script before running it, logs. Returns the content (truncated at 64KiB).",
      parameters: {
        type: "object",
        properties: { path: { type: "string", description: "Absolute path, or ~-prefixed." } },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "write_file",
      description:
        "Overwrite a file with new content. ONLY for shell rc/profile files and tool config under the user's home (or temp files). Always user-confirmed; the existing file is backed up first. To append a PATH line, read_file first and write back the full new content.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string" },
          content: { type: "string", description: "Complete new file content (not a diff)." },
          reason: { type: "string", description: "Shown to the user: what changed and why." },
        },
        required: ["path", "content", "reason"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "detect_environment",
      description: "Re-run environment detection (OS, shell, rc file, package managers, PATH). Use after a step that may have changed PATH or installed a package manager. The initial snapshot is already in your context — only call this when state may have changed.",
      parameters: { type: "object", properties: {} },
    },
  },
];

export interface ExecutorOptions {
  /** --dry-run: print/record every proposed command, execute nothing. */
  dryRun: boolean;
  /** --yes: skip per-step confirmation prompts. Guardrail blocks still apply. */
  autoYes: boolean;
}

export interface ExecutedStep {
  command: string[];
  reason: string;
  outcome: "ran" | "dry-run" | "declined" | "blocked";
  exitCode?: number;
}

/** Commands that always require confirmation no matter what the model claims. */
function isInherentlyRisky(argv: string[]): boolean {
  const head = argv[0] ?? "";
  if (head === "sudo") return true;
  const managers = new Set(["brew", "apt", "apt-get", "dnf", "yum", "pacman", "apk", "npm", "pip", "pip3", "pipx", "cargo", "xcode-select"]);
  if (managers.has(head)) {
    // Read-only manager subcommands stay unprompted (list, --version, info…).
    const readOnly = new Set(["--version", "-v", "list", "ls", "info", "search", "outdated", "doctor", "config"]);
    const sub = argv[1] ?? "";
    return !readOnly.has(sub);
  }
  return false;
}

/**
 * Executes one model tool call and returns the string fed back to the model.
 * Also records what happened into `steps` for the end-of-run summary.
 */
export async function executeToolCall(
  name: string,
  args: Record<string, unknown>,
  options: ExecutorOptions,
  steps: ExecutedStep[]
): Promise<string> {
  switch (name) {
    case "run_shell":
      return runShell(args as { command: string[]; reason: string; requiresConfirmation?: boolean }, options, steps);
    case "read_file":
      return readFileTool(String(args.path ?? ""));
    case "write_file":
      return writeFileTool(args as { path: string; content: string; reason: string }, options, steps);
    case "detect_environment": {
      const snapshot = await detectEnvironment();
      printNote("re-ran environment detection");
      return JSON.stringify(snapshot);
    }
    default:
      return `ERROR: unknown tool '${name}'.`;
  }
}

async function runShell(
  args: { command: string[]; reason: string; requiresConfirmation?: boolean },
  options: ExecutorOptions,
  steps: ExecutedStep[]
): Promise<string> {
  const command = (args.command ?? []).map(String);
  const reason = args.reason ?? "(no reason given)";
  const stepNo = steps.length + 1;
  const usesSudo = command[0] === "sudo";

  printProposedStep(stepNo, command, reason, usesSudo);

  // Guardrails come BEFORE any prompt — a blocked command is never offered.
  const verdict = checkCommand(command);
  if (verdict.verdict === "block") {
    printBlocked(verdict.reason);
    steps.push({ command, reason, outcome: "blocked" });
    return `BLOCKED by hard guardrail (${verdict.reason}). This cannot be confirmed past. Propose a safer alternative or explain to the user why the goal can't proceed.`;
  }
  if (verdict.verdict === "review-script") {
    printBlocked(verdict.reason);
    steps.push({ command, reason, outcome: "blocked" });
    return `REFUSED: ${verdict.reason} Split this into: (1) run_shell curl -fsSL <url> -o /tmp/<name>.sh, (2) read_file the script and summarize what it does for the user, (3) run_shell the downloaded file — the user will confirm the script itself.`;
  }

  if (options.dryRun) {
    printDryRun();
    steps.push({ command, reason, outcome: "dry-run" });
    return "DRY RUN: step recorded, not executed (no real output exists). Move on to the NEXT step in your plan — do not repeat this one. End with the verify command, then a summary.";
  }

  const mustConfirm = args.requiresConfirmation !== false || isInherentlyRisky(command);
  if (mustConfirm && !options.autoYes) {
    const ok = await confirm("Run this step?");
    if (!ok) {
      printSkipped();
      steps.push({ command, reason, outcome: "declined" });
      return "USER DECLINED this step. Ask what they'd prefer, or adapt the plan without it. Do not retry the identical command.";
    }
  }

  try {
    const result = await execa(command[0]!, command.slice(1), {
      reject: false,
      timeout: 600_000,
      env: process.env,
      stdin: "inherit", // lets sudo/interactive installers prompt on the tty
    });
    const exitCode = result.exitCode ?? -1;
    printCommandResult(exitCode, result.stdout ?? "", result.stderr ?? "", (result as { durationMs?: number }).durationMs);
    steps.push({ command, reason, outcome: "ran", exitCode });
    return JSON.stringify({
      exitCode,
      stdout: clipForModel(result.stdout ?? ""),
      stderr: clipForModel(result.stderr ?? ""),
    });
  } catch (err) {
    const message = (err as Error).message;
    console.log(color.danger(`  ${glyph.elbow} ${glyph.fail} failed to launch: ${message}`));
    steps.push({ command, reason, outcome: "ran", exitCode: -1 });
    return JSON.stringify({ exitCode: -1, error: message });
  }
}

function readFileTool(rawPath: string): string {
  const filePath = expandHome(rawPath);
  try {
    const content = fs.readFileSync(filePath, "utf8");
    printNote(`read ${filePath} (${content.length} bytes)`);
    return clipForModel(content, 65_536);
  } catch (err) {
    return `ERROR reading ${filePath}: ${(err as Error).message}`;
  }
}

async function writeFileTool(
  args: { path: string; content: string; reason: string },
  options: ExecutorOptions,
  steps: ExecutedStep[]
): Promise<string> {
  const filePath = expandHome(args.path);
  const pseudoCommand = ["write_file", filePath];
  const exists = fs.existsSync(filePath);

  printFileCard(steps.length + 1, filePath, args.reason, !exists);

  const verdict = checkWritePath(filePath);
  if (verdict.verdict !== "allow") {
    printBlocked(verdict.reason);
    steps.push({ command: pseudoCommand, reason: args.reason, outcome: "blocked" });
    return `BLOCKED: ${verdict.reason}`;
  }

  // Show the change as a diff against what's on disk, not a blind preview.
  const oldContent = exists ? fs.readFileSync(filePath, "utf8") : null;
  console.log(renderDiff(oldContent, args.content));

  if (options.dryRun) {
    printDryRun();
    steps.push({ command: pseudoCommand, reason: args.reason, outcome: "dry-run" });
    return "DRY RUN: file NOT written. Assume success and continue.";
  }

  // rc-file writes are always confirmed, even under --yes: an unwanted rc
  // edit outlives the session, and reviewing ~10 lines is cheap.
  const ok = await confirm("Write this file?");
  if (!ok) {
    printSkipped();
    steps.push({ command: pseudoCommand, reason: args.reason, outcome: "declined" });
    return "USER DECLINED the file write. Adapt or ask.";
  }

  let backup: string | null = null;
  if (exists) {
    backup = `${filePath}.sprout-bak-${Date.now()}`;
    fs.copyFileSync(filePath, backup);
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, args.content, "utf8");
  console.log(`  ${color.dim(glyph.elbow)} ${color.brand(`${glyph.ok} wrote ${filePath}`)}${backup ? color.dim(`  (backup: ${backup})`) : ""}`);
  steps.push({ command: pseudoCommand, reason: args.reason, outcome: "ran", exitCode: 0 });
  return `Wrote ${filePath}.${backup ? ` Previous version backed up to ${backup}.` : ""}`;
}

function expandHome(p: string): string {
  return path.resolve(p.replace(/^~(?=\/|$)/, os.homedir()));
}

/** Cap tool output fed to the model; keep head and tail since errors cluster at the end. */
function clipForModel(text: string, max = 8_000): string {
  if (text.length <= max) return text;
  const half = Math.floor(max / 2);
  return `${text.slice(0, half)}\n…[${text.length - max} bytes omitted]…\n${text.slice(-half)}`;
}
