/**
 * Visual language for the whole CLI — palette, glyphs, wrapping, and the
 * markdown-lite renderer. Every color decision lives here; other modules
 * compose these pieces and never call chalk with ad-hoc colors.
 *
 * The look follows the agentic-CLI idiom (Claude Code et al.): assistant
 * prose streams as plain text, every tool use is a `⏺` card whose results
 * hang off a `⎿` connector, and prompts are arrow-key menus rather than
 * bare [y/N] reads.
 */

import chalk from "chalk";

/**
 * Sprout's terminal palette mirrors the website: forest, paper, pink, and
 * yellow on a near-black ground. `forestReadable` is the same forest family,
 * lifted for legibility in terminals with dark backgrounds.
 */
export const palette = {
  black: "#101512",
  paper: "#FFFDF8",
  forest: "#174B32",
  forestDeep: "#0D2E20",
  forestReadable: "#7EBD8A",
  pink: "#DF3F68",
  yellow: "#F1C94B",
} as const;

export const glyph = {
  dot: "⏺",
  elbow: "⎿",
  pointer: "❯",
  bullet: "•",
  ok: "✓",
  fail: "✗",
  sprout: "🌱",
} as const;

export const color = {
  /** Primary affirmative/status color: readable forest on dark terminals. */
  brand: chalk.hex(palette.forestReadable),
  /** Structural borders and headings retain Sprout's deep forest. */
  brandDim: chalk.hex(palette.forest),
  /** Commands and focus affordances use the yellow accent. */
  accent: chalk.hex(palette.yellow),
  warn: chalk.hex(palette.yellow),
  /** Errors and attention states use the site pink, not terminal red. */
  danger: chalk.hex(palette.pink),
  /** Dry-run / non-destructive states use the same pink family. */
  magic: chalk.hex(palette.pink),
  text: chalk.hex(palette.paper),
  dim: chalk.dim,
  bold: chalk.bold,
} as const;

const ANSI_RE = /\x1b\[[0-9;]*m/g;

export function visibleWidth(s: string): number {
  return s.replace(ANSI_RE, "").length;
}

/** Terminal width, clamped so prose never sets wider than ~100 columns. */
export function termWidth(): number {
  return Math.min(process.stdout.columns || 80, 100);
}

/** Word-wrap `text` to `width`, prefixing every line with `indent`. */
export function wrap(text: string, indent = "", width = termWidth()): string {
  const usable = Math.max(20, width - indent.length);
  const out: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      if (line && visibleWidth(line) + 1 + visibleWidth(word) > usable) {
        out.push(indent + line);
        line = word;
      } else {
        line = line ? line + " " + word : word;
      }
    }
    out.push(indent + line);
  }
  return out.join("\n");
}

/**
 * Markdown-lite for model prose: **bold**, `code`, # headings, - bullets.
 * Works line-by-line so it can style a stream as each line completes.
 */
export function styleProseLine(line: string): string {
  let s = line;
  const heading = s.match(/^\s{0,3}(#{1,4})\s+(.*)$/);
  if (heading) return color.brandDim.bold(heading[2]!);
  s = s.replace(/^(\s*)[-*]\s+/, `$1${color.brandDim(glyph.bullet)} `);
  s = s.replace(/^(\s*)(\d+)\.\s+/, (_m, sp: string, n: string) => `${sp}${color.brandDim(n + ".")} `);
  s = s.replace(/\*\*([^*]+)\*\*/g, (_m, inner: string) => chalk.bold(inner));
  s = s.replace(/`([^`]+)`/g, (_m, inner: string) => color.accent(inner));
  return s;
}

/** Rounded box used for the banner and end-of-run summary. */
export function box(lines: string[], borderColor = color.brandDim): string {
  const width = Math.max(...lines.map(visibleWidth));
  const top = borderColor("╭" + "─".repeat(width + 2) + "╮");
  const bottom = borderColor("╰" + "─".repeat(width + 2) + "╯");
  const body = lines.map((l) => `${borderColor("│")} ${l}${" ".repeat(width - visibleWidth(l))} ${borderColor("│")}`);
  return [top, ...body, bottom].join("\n");
}
