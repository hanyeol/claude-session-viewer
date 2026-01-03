#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  console.log(
    [
      "Claude Session Viewer",
      "",
      "Usage:",
      "  npx claude-session-viewer",
      "",
      "Options:",
      "  -h, --help     Show this help message",
      "  -v, --version  Show package version",
      "",
    ].join("\n"),
  );
  process.exit(0);
}

if (args.includes("--version") || args.includes("-v")) {
  const pkg = await import("../package.json", { assert: { type: "json" } });
  console.log(pkg.default.version);
  process.exit(0);
}

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const serverEntry = resolve(rootDir, "dist/server/index.js");

if (!existsSync(serverEntry)) {
  console.error("Build artifacts not found.");
  console.error("Run `npm install` and `npm run build` in the repository first.");
  process.exit(1);
}

const child = spawn(process.execPath, [serverEntry], {
  cwd: rootDir,
  stdio: "inherit",
});

child.on("exit", (code) => {
  if (code !== null) {
    process.exit(code);
  }
});

child.on("error", (error) => {
  console.error("Failed to start dev servers:", error.message);
  process.exit(1);
});
