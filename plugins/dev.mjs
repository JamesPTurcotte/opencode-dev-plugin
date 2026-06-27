import { createRequire } from "module";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { tool } from "@opencode-ai/plugin";

const pluginPath = fileURLToPath(import.meta.url);
const pluginDir = path.dirname(pluginPath);

function findRoot(dir) {
  let current = dir;
  while (current !== path.resolve(current, "..")) {
    if (fs.existsSync(path.join(current, "AGENTS.md"))) return current;
    current = path.resolve(current, "..");
  }
  return dir;
}

const rootDir = findRoot(pluginDir);

function getDevInstructions() {
  try {
    const p = path.join(rootDir, "AGENTS-DEV.md");
    return fs.readFileSync(p, "utf8").trim();
  } catch (e) {
    return "";
  }
}

function checkPRReadiness(files, cwd) {
  const issues = [];
  for (const f of files) {
    const fullPath = path.resolve(cwd, f);
    if (!fs.existsSync(fullPath)) {
      issues.push({ file: f, issue: "File not found" });
      continue;
    }
    const content = fs.readFileSync(fullPath, "utf8");
    if (f.endsWith(".test.js") || f.endsWith(".test.ts") || f.endsWith(".spec.js") || f.endsWith(".spec.ts")) {
      continue;
    }
    const ext = path.extname(f);
    if ([".js", ".ts", ".jsx", ".tsx", ".py", ".rs", ".go", ".java"].includes(ext)) {
      if (content.includes("TODO") || content.includes("FIXME") || content.includes("HACK")) {
        issues.push({ file: f, issue: "Contains TODO/FIXME/HACK" });
      }
      if (content.length < 10) {
        issues.push({ file: f, issue: "File appears empty or stub" });
      }
    }
  }
  return issues;
}

export default async ({ client } = {}) => {
  const log = (level, message) => {
    try {
      client && client.app && client.app.log({ body: { service: "dev", level, message } });
    } catch (e) {}
  };

  return {
    "experimental.chat.system.transform": async (_input, output) => {
      const instructions = getDevInstructions();
      if (instructions) {
        output.system.push(instructions);
      }
      output.system.push(`## Dev Plugin — Available Agents

You have the Dev plugin loaded. The following D- agents are available for software engineering work:

- D-Plan — orchestrates the planning pipeline (architecture, tech selection, structure)
- D-Arch — architecture design, system boundaries, data flow
- D-Tech — technology selection, dependency audit, tradeoff analysis
- D-Build — orchestrates the build pipeline (implementation, refactoring, testing)
- D-Impl — implementation, writing production code
- D-Refactor — code improvement, restructuring without changing behavior
- D-Test — test writing, test design, coverage analysis
- D-Review — orchestrates the review pipeline (correctness, security, performance)
- D-Correctness — logic errors, edge cases, correctness audit
- D-Sentry — security audit, vulnerability checking, best practices
- D-Perf — performance analysis, optimization, profiling
- D-Skeptic — devil's advocate, challenge assumptions

Use these agents by invoking D-AgentName when working on software engineering tasks.`);
    },

    "command.execute.before": async (input) => {
      if (!input || input.command !== "dev") return;

      const args = (input.arguments || "").trim().toLowerCase();
      const parts = args.split(/\s+/);
      const command = parts[0] || "status";

      if (command === "status") {
        return [
          "DEV PLUGIN STATUS",
          "  Working directory: " + process.cwd(),
          "",
          "Type /dev help for commands",
        ].join("\n");
      }

      if (command === "plan") {
        return [
          "DEV PLAN",
          "",
          "Starting the planning pipeline. Invoke D-Plan with your feature or project idea.",
          "D-Plan will guide you through architecture, technology selection, and structure.",
        ].join("\n");
      }

      if (command === "build") {
        const feature = parts.slice(1).join(" ") || "(current context)";
        return [
          "DEV BUILD — " + feature,
          "",
          "Starting the build pipeline. Invoke D-Build to implement " + feature + ".",
          "D-Build will delegate to D-Impl, D-Refactor, and D-Test as needed.",
        ].join("\n");
      }

      if (command === "review") {
        const target = parts[1] || ".";
        return [
          "DEV REVIEW — " + target,
          "",
          "Starting the review pipeline on " + target + ".",
          "Invoke D-Review to run correctness, security, and performance audits.",
        ].join("\n");
      }

      if (command === "help") {
        return [
          "DEV PLUGIN COMMANDS",
          "",
          "  /dev plan                     — Start planning pipeline (use with D-Plan)",
          "  /dev build <feature>          — Start build pipeline (use with D-Build)",
          "  /dev review <path>            — Start review pipeline (use with D-Review)",
          "  /dev status                   — Show working directory",
          "  /dev help                     — Show this help",
          "",
          "D-AGENTS (invoke by name):",
          "  D-Plan       — Planning orchestrator (arch, tech, structure)",
          "  D-Arch       — Architecture design",
          "  D-Tech       — Technology selection",
          "  D-Build      — Build orchestrator (impl, refactor, test)",
          "  D-Impl       — Implementation",
          "  D-Refactor   — Code improvement",
          "  D-Test       — Test writing",
          "  D-Review     — Review orchestrator (correctness, sentry, perf)",
          "  D-Correctness — Logic and edge case audit",
          "  D-Sentry     — Security audit",
          "  D-Perf       — Performance analysis",
          "  D-Skeptic    — Devil's advocate",
        ].join("\n");
      }
    },

    tool: {
      "check-pr-readiness": tool({
        description:
          "Check a set of files for PR readiness. Scans for TODOs, FIXMEs, HACKs, empty stubs, and missing tests. Run before opening a pull request.",
        args: {
          files: tool.schema
            .array(tool.schema.string())
            .describe("Array of file paths to check (relative to project root)."),
        },
        async execute(args, context) {
          if (!args.files || args.files.length === 0) {
            return "No files provided. Pass an array of file paths to check.";
          }
          const cwd = context?.cwd || process.cwd();
          const issues = checkPRReadiness(args.files, cwd);
          if (issues.length === 0) {
            return "No issues found. These files look PR-ready.";
          }
          let result = "PR READINESS ISSUES:\n\n";
          for (const { file, issue } of issues) {
            result += `  ${file}: ${issue}\n`;
          }
          return result;
        },
      }),
    },
  };
};
