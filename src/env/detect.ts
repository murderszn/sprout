/**
 * Phase 1 — Environment detection.
 *
 * Produces a single typed {@link EnvironmentSnapshot} that every later phase
 * consumes. Nothing outside this module re-detects on its own; if state may
 * have changed mid-plan (e.g. after an rc-file edit), the agent calls the
 * `detect_environment` tool, which re-runs {@link detectEnvironment}.
 *
 * Supports macOS, Linux, and Windows.
 */

import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { execa } from "execa";

export type SupportedShell = "bash" | "zsh" | "fish" | "sh" | "powershell" | "pwsh" | "cmd" | "unknown";

export interface PackageManagerInfo {
  name: string;
  /** Absolute path to the executable. */
  path: string;
  /** Version string if it could be determined cheaply, else null. */
  version: string | null;
}

export interface EnvironmentSnapshot {
  /** `darwin` or `linux` in v1. */
  platform: NodeJS.Platform;
  /** Human-readable OS name + version, e.g. "macOS 15.6" or "Ubuntu 24.04". */
  osVersion: string;
  /** Linux distro ID from /etc/os-release (e.g. "ubuntu"), null elsewhere. */
  linuxDistro: string | null;
  arch: string;
  shell: {
    name: SupportedShell;
    /** The user's login shell binary, e.g. /bin/zsh. */
    binary: string;
    /**
     * The rc/profile file new interactive shells read — where PATH edits
     * belong. Existence is reported separately so the agent knows whether a
     * write creates the file.
     */
    rcFile: string;
    rcFileExists: boolean;
  };
  /** Package managers actually present on this machine. */
  packageManagers: PackageManagerInfo[];
  /** Current PATH, split into entries, order preserved, duplicates kept. */
  pathEntries: string[];
  homeDir: string;
  detectedAt: string;
}

const UNIX_PACKAGE_MANAGERS = ["brew", "apt-get", "dnf", "yum", "pacman", "apk", "npm", "pip3", "pipx", "cargo"] as const;

const WINDOWS_PACKAGE_MANAGERS = ["winget", "choco", "scoop", "npm", "pip3", "pipx", "cargo"] as const;

function shellNameFromBinary(binary: string): SupportedShell {
  const base = path.basename(binary).replace(/\.exe$/i, "");
  if (base === "bash" || base === "zsh" || base === "fish" || base === "sh") return base;
  if (base === "powershell" || base === "pwsh") return base;
  if (base === "cmd") return "cmd";
  return "unknown";
}

/**
 * The file where PATH changes should land for this shell. For bash we prefer
 * ~/.bashrc but fall back to ~/.bash_profile on macOS, where login shells
 * skip .bashrc by default.
 */
function rcFileForShell(shell: SupportedShell, home: string, platform: NodeJS.Platform): string {
  if (platform === "win32") {
    switch (shell) {
      case "pwsh":
        return path.join(home, "Documents", "PowerShell", "Microsoft.PowerShell_profile.ps1");
      case "powershell":
        return path.join(home, "Documents", "WindowsPowerShell", "Microsoft.PowerShell_profile.ps1");
      case "bash":
        return path.join(home, ".bashrc");
      default:
        // cmd has no rc file; use PowerShell profile as a best-effort
        return path.join(home, "Documents", "PowerShell", "Microsoft.PowerShell_profile.ps1");
    }
  }
  switch (shell) {
    case "zsh":
      return path.join(home, ".zshrc");
    case "fish":
      return path.join(home, ".config", "fish", "config.fish");
    case "bash":
      if (platform === "darwin") {
        const bashrc = path.join(home, ".bashrc");
        return fs.existsSync(bashrc) ? bashrc : path.join(home, ".bash_profile");
      }
      return path.join(home, ".bashrc");
    default:
      return path.join(home, ".profile");
  }
}

async function detectOsVersion(platform: NodeJS.Platform): Promise<{ osVersion: string; linuxDistro: string | null }> {
  if (platform === "darwin") {
    try {
      const { stdout } = await execa("sw_vers", ["-productVersion"]);
      return { osVersion: `macOS ${stdout.trim()}`, linuxDistro: null };
    } catch {
      return { osVersion: `macOS (Darwin ${os.release()})`, linuxDistro: null };
    }
  }
  if (platform === "linux") {
    try {
      const release = fs.readFileSync("/etc/os-release", "utf8");
      const get = (key: string) => release.match(new RegExp(`^${key}="?([^"\n]+)"?`, "m"))?.[1] ?? null;
      const pretty = get("PRETTY_NAME") ?? `Linux ${os.release()}`;
      return { osVersion: pretty, linuxDistro: get("ID") };
    } catch {
      return { osVersion: `Linux ${os.release()}`, linuxDistro: null };
    }
  }
  if (platform === "win32") {
    try {
      const { stdout } = await execa("cmd", ["/c", "ver"], { timeout: 5000 });
      const match = stdout.match(/\d+\.\d+\.\d+/);
      return { osVersion: match ? `Windows ${match[0]}` : `Windows ${os.release()}`, linuxDistro: null };
    } catch {
      return { osVersion: `Windows ${os.release()}`, linuxDistro: null };
    }
  }
  return { osVersion: `${platform} ${os.release()}`, linuxDistro: null };
}

async function findExecutable(name: string): Promise<string | null> {
  try {
    if (process.platform === "win32") {
      const { stdout } = await execa("where.exe", [name], { timeout: 5000 });
      const first = stdout.trim().split(/\r?\n/)[0];
      return first && first.length > 0 ? first : null;
    }
    // `command -v` resolves through PATH the way the user's shell would.
    const { stdout } = await execa("/bin/sh", ["-c", `command -v ${name}`]);
    const resolved = stdout.trim();
    return resolved.length > 0 ? resolved : null;
  } catch {
    return null;
  }
}

async function packageManagerVersion(name: string, execPath: string): Promise<string | null> {
  try {
    const { stdout } = await execa(execPath, ["--version"], { timeout: 5000 });
    // First line is enough; brew/npm/pip print multi-line banners.
    return stdout.split("\n")[0]?.trim() ?? null;
  } catch {
    return null;
  }
}

/** Run full detection and return a fresh snapshot. Never throws; missing pieces degrade to nulls. */
export async function detectEnvironment(): Promise<EnvironmentSnapshot> {
  const platform = process.platform;
  const home = os.homedir();
  const { osVersion, linuxDistro } = await detectOsVersion(platform);

  let shellBinary: string;
  if (platform === "win32") {
    // Prefer pwsh (PowerShell 7+) if available, fall back to powershell.exe, then COMSPEC (cmd)
    const pwsh = await findExecutable("pwsh");
    if (pwsh) {
      shellBinary = pwsh;
    } else {
      shellBinary = process.env.COMSPEC ?? "C:\\Windows\\System32\\cmd.exe";
    }
  } else {
    shellBinary = process.env.SHELL ?? "/bin/sh";
  }
  const shellName = shellNameFromBinary(shellBinary);
  const rcFile = rcFileForShell(shellName, home, platform);

  const packageManagerList = platform === "win32" ? WINDOWS_PACKAGE_MANAGERS : UNIX_PACKAGE_MANAGERS;
  const managers: PackageManagerInfo[] = [];
  await Promise.all(
    packageManagerList.map(async (name) => {
      const execPath = await findExecutable(name);
      if (!execPath) return;
      managers.push({ name, path: execPath, version: await packageManagerVersion(name, execPath) });
    })
  );
  managers.sort((a, b) => a.name.localeCompare(b.name));

  return {
    platform,
    osVersion,
    linuxDistro,
    arch: os.arch(),
    shell: {
      name: shellName,
      binary: shellBinary,
      rcFile,
      rcFileExists: fs.existsSync(rcFile),
    },
    packageManagers: managers,
    pathEntries: (process.env.PATH ?? "").split(path.delimiter).filter(Boolean),
    homeDir: home,
    detectedAt: new Date().toISOString(),
  };
}
