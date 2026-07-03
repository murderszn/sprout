/**
 * Phase 5 — Hard safety guardrails.
 *
 * Every command the model proposes passes through {@link checkCommand} BEFORE
 * any confirmation prompt is shown. A "block" verdict is final: no flag
 * (including --yes) can override it. A "review-script" verdict is the
 * curl|bash case — the command is refused as written and the agent is told to
 * download, display, and get the script itself confirmed instead.
 *
 * Commands run via execa argv arrays (no shell), so pipes/substitutions only
 * exist when the model explicitly wraps them in `sh -c` / `bash -c`. We still
 * scan the joined string so those wrapped forms are caught.
 *
 * Platform support: Unix (macOS / Linux) and Windows. Windows-specific
 * patterns cover cmd.exe builtins (format, diskpart, rmdir /s) and PowerShell
 * cmdlets (Remove-Item -Recurse, Invoke-Expression, etc.).
 */

import os from "node:os";
import path from "node:path";

export type GuardrailVerdict =
  | { verdict: "allow" }
  | { verdict: "block"; reason: string }
  | { verdict: "review-script"; reason: string };

/** Directory prefixes where recursive deletes are tolerated (installer scratch space). */
const DELETE_ALLOWED_PREFIXES: string[] = [
  ...(process.platform !== "win32" ? [
    "/tmp/",
    "/private/tmp/",
    "/private/var/folders/",
    "/var/folders/",
  ] : []),
  ...(process.platform === "win32" ? [
    path.join(process.env.TEMP ?? path.join(os.homedir(), "AppData", "Local", "Temp"), "").replace(/\\$/, "") + path.sep,
    path.join(process.env.LOCALAPPDATA ?? path.join(os.homedir(), "AppData", "Local"), "Temp") + path.sep,
  ] : []),
  os.tmpdir().endsWith(path.sep) ? os.tmpdir() : os.tmpdir() + path.sep,
];

/** Patterns that are destructive no matter what the surrounding install story is. */
const HARD_BLOCK_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /\bmkfs(\.\w+)?\b/, reason: "filesystem formatting (mkfs)" },
  { pattern: /\bdiskutil\s+(erase|partition|reformat)/i, reason: "disk erase/partition (diskutil)" },
  { pattern: /\bdd\b[^|;]*\bof=\/dev\//, reason: "raw write to a block device (dd of=/dev/...)" },
  { pattern: /\b(fdisk|parted|gdisk)\b/, reason: "disk partitioning tool" },
  { pattern: /\/etc\/(passwd|shadow|sudoers|sudoers\.d)/, reason: "system auth files (/etc/passwd, shadow, sudoers)" },
  { pattern: /:\(\)\s*\{.*\}\s*;?\s*:/, reason: "fork bomb" },
  { pattern: /\b(shutdown|reboot|halt|poweroff)\b/, reason: "system power control" },
  { pattern: /\bchmod\b.*-[a-zA-Z]*R[a-zA-Z]*\s+[0-7]+\s+\/(\s|$)/, reason: "recursive chmod of /" },
  { pattern: /\b(chown|chmod)\b.*\s-[a-zA-Z]*R[a-zA-Z]*\s.*\s\/(usr|etc|var|bin|sbin|lib|System|Library)\b/, reason: "recursive ownership/permission change of a system directory" },
  { pattern: />\s*\/dev\/sd[a-z]\b/, reason: "redirect onto a block device" },
  { pattern: /\bkill(all)?\s+-9\s+-1\b/, reason: "killing all processes" },
  { pattern: /\bhistory\s+-c\b/, reason: "shell history clearing (nothing about an install needs this)" },
  // Windows-specific destructive patterns
  { pattern: /\bformat\s+[a-zA-Z]:/, reason: "disk formatting (format drive:)" },
  { pattern: /\bdiskpart\b/, reason: "disk partitioning tool (diskpart)" },
  { pattern: /\breg\b.*\b(delete|add)\b.*\bHKLM\b/i, reason: "system registry modification (HKLM)" },
  { pattern: /\bRemove-Item\b[^|;]*-Recurse[^|;]*\b[A-Z]:\\(Windows|Program Files|Users)\b/i, reason: "recursive delete of Windows system directory" },
  { pattern: /\bbcdedit\b/, reason: "boot configuration editing" },
  { pattern: /\bsfc\s+\/scannow\b/i, reason: "system file checker — not an install operation" },
];

/** curl/wget output piped or substituted straight into a shell. */
const PIPE_TO_SHELL_PATTERNS: RegExp[] = [
  /\b(curl|wget)\b[^|;&]*\|\s*(sudo\s+)?(ba|z|fi|da)?sh\b/,
  /\b(ba|z)?sh\s+-c\s+["']?\$\((curl|wget)\b/,
  /\b(ba|z)?sh\s+<\((curl|wget)\b/,
  /\beval\s+["']?\$\((curl|wget)\b/,
  // PowerShell equivalents
  /\bInvoke-Expression\b[^|;]*\b(Invoke-WebRequest|Invoke-RestMethod|iwr|irm)\b/i,
  /\biex\b[^|;]*\b(iwr|irm|Invoke-WebRequest)\b/i,
  /\b(iwr|Invoke-WebRequest|irm|Invoke-RestMethod)\b[^|]*\|\s*(Invoke-Expression|iex)\b/i,
];

const UNIX_SYSTEM_DIRS = ["/", "/usr", "/etc", "/var", "/bin", "/sbin", "/lib", "/lib64", "/opt", "/boot", "/home", "/System", "/Library", "/Applications", "/dev", "/proc"];
const WINDOWS_SYSTEM_DIRS = ["C:\\Windows", "C:\\Program Files", "C:\\Program Files (x86)", "C:\\ProgramData"];
const SYSTEM_DIR_PREFIXES = [...UNIX_SYSTEM_DIRS, ...WINDOWS_SYSTEM_DIRS];

/**
 * Detect recursive rm targeting anything outside tolerated scratch prefixes.
 * Works on the argv directly (not the joined string) so quoting can't hide a
 * target; also applied to `sudo rm ...`.
 */
function checkRecursiveDelete(argv: string[]): GuardrailVerdict | null {
  let args = argv;
  while (args[0] === "sudo" || args[0] === "env") args = args.slice(1);
  if (args[0] !== "rm") return null;

  const flags = args.filter((a) => a.startsWith("-"));
  const recursive = flags.some((f) => /^-[a-zA-Z]*[rR]/.test(f) || f === "--recursive");
  if (!recursive) return null;

  const targets = args.slice(1).filter((a) => !a.startsWith("-"));
  if (targets.length === 0) return { verdict: "block", reason: "recursive rm with no explicit target" };

  const home = os.homedir();
  for (const target of targets) {
    const resolved = path.resolve(target.replace(/^~(?=\/|$)/, home));
    const tolerated = DELETE_ALLOWED_PREFIXES.some((prefix) => resolved.startsWith(prefix));
    if (!tolerated) {
      return {
        verdict: "block",
        reason: `recursive delete of '${target}' — outside temp/installer scratch space (${resolved})`,
      };
    }
    if (resolved === home || SYSTEM_DIR_PREFIXES.includes(resolved) || target.includes("*") && path.dirname(resolved) === "/") {
      return { verdict: "block", reason: `recursive delete of protected path '${target}'` };
    }
  }
  return null;
}

/**
 * Detect Windows-style recursive deletes: PowerShell Remove-Item -Recurse
 * and cmd.exe rmdir /s.
 */
function checkWindowsRecursiveDelete(argv: string[]): GuardrailVerdict | null {
  const joined = argv.join(" ");
  // PowerShell Remove-Item -Recurse
  if (/\bRemove-Item\b/i.test(joined) && /-(Recurse|r)\b/i.test(joined)) {
    // Extract the path argument (crude but effective for guardrail purposes)
    const pathMatch = joined.match(/Remove-Item\s+(?:-[a-zA-Z]+\s+)*['"]?([^'"\s]+)/i);
    if (pathMatch) {
      const target = pathMatch[1]!;
      const resolved = path.resolve(target);
      const home = os.homedir();
      const tolerated = DELETE_ALLOWED_PREFIXES.some((prefix) => resolved.startsWith(prefix));
      if (!tolerated) {
        return { verdict: "block", reason: `recursive delete of '${target}' via Remove-Item` };
      }
    }
  }
  // cmd rmdir /s
  if (/\brmdir\b/i.test(joined) && /\/s\b/i.test(joined)) {
    return { verdict: "block", reason: "recursive directory removal (rmdir /s) — use a safer approach" };
  }
  return null;
}

/**
 * Gate a proposed shell command. Called on every run_shell tool call before
 * the confirmation prompt; also called again immediately before execution as
 * a belt-and-braces check.
 */
export function checkCommand(argv: string[]): GuardrailVerdict {
  if (argv.length === 0) return { verdict: "block", reason: "empty command" };
  const joined = argv.join(" ");

  for (const p of PIPE_TO_SHELL_PATTERNS) {
    if (p.test(joined)) {
      return {
        verdict: "review-script",
        reason:
          "This pipes a remote script straight into a shell. Download it to a file first, show its contents, and get the script itself confirmed before running it.",
      };
    }
  }

  const rmVerdict = checkRecursiveDelete(argv);
  if (rmVerdict) return rmVerdict;

  const winRmVerdict = checkWindowsRecursiveDelete(argv);
  if (winRmVerdict) return winRmVerdict;

  for (const { pattern, reason } of HARD_BLOCK_PATTERNS) {
    if (pattern.test(joined)) {
      return { verdict: "block", reason };
    }
  }

  return { verdict: "allow" };
}

/**
 * Gate write_file targets: rc files and tool config only, meaning inside the
 * user's home or the temp dir — and never credentials/SSH material even there.
 */
export function checkWritePath(filePath: string): GuardrailVerdict {
  const home = os.homedir();
  const resolved = path.resolve(filePath.replace(/^~(?=\/|$)/, home));

  const inHome = resolved.startsWith(home + path.sep);
  const inTmp = DELETE_ALLOWED_PREFIXES.some((prefix) => resolved.startsWith(prefix));
  if (!inHome && !inTmp) {
    return { verdict: "block", reason: `write_file may only touch files under ${home} or the temp dir (got ${resolved})` };
  }
  const forbidden = [
    ".ssh", ".gnupg", ".aws/credentials", ".config/gcloud", ".kube/config",
    // Windows credential stores
    ".azure", "AppData/Roaming/gcloud",
  ];
  for (const frag of forbidden) {
    if (resolved.startsWith(path.join(home, frag))) {
      return { verdict: "block", reason: `write_file will not touch credential material (${frag})` };
    }
  }
  return { verdict: "allow" };
}
