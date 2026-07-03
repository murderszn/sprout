/**
 * Phase 3 + 4 — Planning loop and confirm/execute/verify loop.
 *
 * Conversation shape:
 *   system  — Sprout's role, scope limits, safety rules, the environment
 *             snapshot, and the knowledge-base entry (or an explicit "no
 *             entry — you are reasoning live" marker).
 *   user    — the goal ("install gh" / a pasted broken-install log).
 *   loop    — assistant text is printed to the user (the model is required to
 *             state a plain-English plan before its first tool call);
 *             assistant tool calls are executed by agent/tools.ts (which owns
 *             guardrails + confirmation) and their string results are pushed
 *             back as `tool` messages. The model adapts to real exit codes —
 *             "already installed", "permission denied" — instead of replaying
 *             a fixed script.
 *   end     — when the model stops calling tools, and additionally (not
 *             trusting the model's word) runVerification() runs the
 *             knowledge base's verify command and prints the real output.
 */

import chalk from "chalk";
import ora from "ora";
import { execa } from "execa";
import type OpenAI from "openai";
import type { EnvironmentSnapshot } from "../env/detect.js";
import type { KnowledgeEntry } from "../knowledge/index.js";
import { TOOL_DEFINITIONS, executeToolCall, type ExecutorOptions, type ExecutedStep } from "./tools.js";
import { heading } from "../ui/prompts.js";

const MAX_TURNS = 30;

export interface AgentRunInput {
  client: OpenAI;
  model: string;
  /** "install <tool>" or a diagnose request with the pasted log. */
  goal: string;
  mode: "install" | "diagnose";
  snapshot: EnvironmentSnapshot;
  /** null → the model must announce it is reasoning live, not from the KB. */
  kbEntry: KnowledgeEntry | null;
  options: ExecutorOptions;
}

function buildSystemPrompt(input: AgentRunInput): string {
  const kbSection = input.kbEntry
    ? `KNOWLEDGE BASE ENTRY for this tool (curated, trust it over memory):\n${JSON.stringify(input.kbEntry, null, 2)}`
    : `NO KNOWLEDGE BASE ENTRY exists for this tool. You are reasoning live from general knowledge — SAY SO explicitly in your plan ("this isn't in my curated knowledge base, so I'm working from general knowledge") and be more conservative: prefer the platform's mainstream package manager and verify assumptions with read-only probes first.`;

  return `You are Sprout, a narrow CLI agent with exactly one job: diagnose and fix local install/configuration/PATH problems for developer tools on THIS machine. You are not a general assistant — if asked for anything outside installing/repairing developer tooling (writing code, opinions, unrelated questions), decline in one sentence and restate what you do.

CURRENT ENVIRONMENT (detected just now — trust this over assumptions):
${JSON.stringify(input.snapshot, null, 2)}

${kbSection}

OPERATING RULES (the harness also enforces these; violating them wastes a turn):
1. Before your FIRST tool call, output a short plain-English plan: what you'll check, what you'll install, with which package manager, and how you'll verify. The user reads this before anything runs.
2. One command per run_shell call, as an argv array. There is NO shell: no pipes, &&, globs, or $VARS. Chain by making separate calls and reacting to real results.
3. Start with cheap read-only probes (\`command -v X\`, \`X --version\`) with requiresConfirmation=false; the tool may already be installed or half-installed.
4. NEVER pipe a remote script into a shell. Download with curl -o to /tmp, read_file it, summarize what it does, then run the downloaded file. The harness hard-rejects pipe-to-shell forms.
5. Use sudo only when the step genuinely requires it, and your 'reason' must state why elevation is needed. Prefer user-local installs (brew, ~/.local) when equivalent.
6. PATH fixes go in the detected rc file (${input.snapshot.shell.rcFile}) via write_file: read_file the current content first, then write the complete new content with your addition. Note in your reason that a new shell (or source) is needed afterwards.
7. Adapt to real results. Non-zero exit codes, 'already installed', 'permission denied' — react to what actually happened; never re-run an identical failed command hoping for different output.
8. After the install steps, run the verify command and interpret its REAL output. Finish with a short summary: what was done, what (if anything) the user must do manually (e.g. restart the shell), and the verification result. If verification failed, say plainly that it failed and why.
9. If the user declines a step, do not sneak an equivalent command through; ask or adapt.
${input.mode === "diagnose" ? "\n10. DIAGNOSE MODE: the user pasted a broken install attempt. First interpret the log (what was being installed, what failed, why), state your diagnosis in plain English, THEN propose the fix plan. Use probes to confirm the diagnosis before fixing." : ""}`;
}

export interface AgentRunResult {
  steps: ExecutedStep[];
  finalMessage: string;
}

/** Run the full plan→confirm→execute→adapt loop for one goal. */
export async function runAgent(input: AgentRunInput): Promise<AgentRunResult> {
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: buildSystemPrompt(input) },
    { role: "user", content: input.goal },
  ];

  const steps: ExecutedStep[] = [];
  let finalMessage = "";

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const spinner = ora({ text: "thinking…", discardStdin: false }).start();
    let response: OpenAI.Chat.Completions.ChatCompletion;
    try {
      response = await input.client.chat.completions.create({
        model: input.model,
        messages,
        tools: TOOL_DEFINITIONS,
        tool_choice: "auto",
      });
    } catch (err) {
      spinner.fail("inference request failed");
      throw new Error(`Pollinations request failed: ${(err as Error).message}`);
    }
    spinner.stop();

    const choice = response.choices[0];
    if (!choice) throw new Error("Pollinations returned no choices.");
    const msg = choice.message;

    // Whatever the model says out loud — the upfront plan, progress notes,
    // the final summary — goes straight to the user.
    if (msg.content?.trim()) {
      console.log("\n" + msg.content.trim());
      finalMessage = msg.content.trim();
    }

    messages.push(msg as OpenAI.Chat.Completions.ChatCompletionMessageParam);

    const toolCalls = msg.tool_calls ?? [];
    if (toolCalls.length === 0) break; // model is done (or refusing) — loop ends

    for (const call of toolCalls) {
      if (call.type !== "function") continue;
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(call.function.arguments || "{}") as Record<string, unknown>;
      } catch {
        messages.push({ role: "tool", tool_call_id: call.id, content: "ERROR: tool arguments were not valid JSON." });
        continue;
      }
      const result = await executeToolCall(call.function.name, args, input.options, steps);
      messages.push({ role: "tool", tool_call_id: call.id, content: result });
    }
  }

  return { steps, finalMessage };
}

/**
 * Ground-truth verification, independent of anything the model claimed.
 * Runs the knowledge base's verify command and shows the real output; the
 * "done" message the user trusts is this, not the model's summary.
 */
export async function runVerification(entry: KnowledgeEntry, dryRun: boolean): Promise<boolean> {
  heading(`Verifying: ${entry.verify.command.join(" ")}`);
  if (dryRun) {
    console.log(chalk.magenta("  ⧗ dry-run: verification skipped"));
    return false;
  }
  try {
    const result = await execa(entry.verify.command[0]!, entry.verify.command.slice(1), {
      reject: false,
      timeout: 30_000,
    });
    const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim();
    console.log(output.split("\n").map((l) => "  " + l).join("\n"));
    const passed = (result.exitCode ?? 1) === 0 && new RegExp(entry.verify.expectedPattern, "m").test(output);
    console.log(passed ? chalk.green.bold("  ✓ verified") : chalk.red.bold(`  ✗ output did not match expected pattern /${entry.verify.expectedPattern}/ (exit ${result.exitCode})`));
    return passed;
  } catch (err) {
    console.log(chalk.red(`  ✗ verify command failed to run: ${(err as Error).message}`));
    console.log(chalk.dim("  (If the install just changed PATH, a new shell may be required — try `exec $SHELL -l` and re-run the verify command.)"));
    return false;
  }
}
