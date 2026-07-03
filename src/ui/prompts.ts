/**
 * Terminal interaction: confirmation prompts, hidden key entry, and shared
 * output formatting. All user-facing colour/format decisions live here so the
 * agent loop stays plain logic.
 */

import readline from "node:readline";
import chalk from "chalk";
import { maskKey } from "../config/store.js";

function ask(question: string, hidden = false): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  if (hidden) {
    // Mute echo: readline writes the prompt, then we swallow keystroke output.
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
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/** [y/N] prompt — defaults to NO. Returns false on EOF/ctrl-d too. */
export async function confirm(question: string): Promise<boolean> {
  const answer = await ask(`${question} ${chalk.dim("[y/N]")} `);
  return /^y(es)?$/i.test(answer);
}

/** Hidden-input prompt for the Pollinations key; echoes only a masked form afterwards. */
export async function promptForApiKey(): Promise<string> {
  console.log(chalk.bold("\nSprout needs a Pollinations API key (bring your own)."));
  console.log(`Get one at ${chalk.cyan("https://enter.pollinations.ai")} — it looks like ${chalk.dim("sk_...")}\n`);
  const key = await ask("Paste your key (input hidden): ", true);
  if (!key) throw new Error("No API key entered.");
  console.log(`Received ${chalk.dim(maskKey(key))}`);
  return key;
}

export async function promptYesNo(question: string): Promise<boolean> {
  return confirm(question);
}

/** A proposed step, exactly as it will run, plus the model's reason. */
export function printProposedStep(index: number, command: string[], reason: string, requiresSudo: boolean): void {
  console.log("");
  console.log(chalk.bold(`Step ${index}`) + (requiresSudo ? chalk.yellow("  [uses sudo]") : ""));
  console.log(`  ${chalk.cyan("$")} ${chalk.cyan(command.join(" "))}`);
  console.log(`  ${chalk.dim("why:")} ${reason}`);
}

export function printBlocked(reason: string): void {
  console.log(chalk.red.bold("  ✗ BLOCKED by guardrail: ") + chalk.red(reason));
  console.log(chalk.dim("    Hard-blocked patterns cannot be confirmed past, including with --yes."));
}

export function printCommandResult(exitCode: number, stdout: string, stderr: string): void {
  const trimmedOut = stdout.trim();
  const trimmedErr = stderr.trim();
  if (trimmedOut) console.log(chalk.dim(indent(clip(trimmedOut))));
  if (trimmedErr) console.log(chalk.dim(indent(clip(trimmedErr))));
  if (exitCode === 0) console.log(chalk.green("  ✓ exit 0"));
  else console.log(chalk.red(`  ✗ exit ${exitCode}`));
}

function indent(text: string): string {
  return text
    .split("\n")
    .map((line) => "    " + line)
    .join("\n");
}

/** Keep terminal output readable; the model still receives the fuller version. */
function clip(text: string, maxLines = 15): string {
  const lines = text.split("\n");
  if (lines.length <= maxLines) return text;
  return [...lines.slice(0, maxLines), `… (${lines.length - maxLines} more lines)`].join("\n");
}

export function heading(text: string): void {
  console.log("\n" + chalk.bold.green("🌱 " + text));
}
