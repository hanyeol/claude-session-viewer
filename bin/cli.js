#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import open from "open";
import getPort from "get-port";

const DEFAULT_PORT = 9090;

const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  console.log(
    [
      "Claude Session Viewer",
      "",
      "Usage:",
      "  npx claude-session-viewer [options]",
      "",
      "Options:",
      "  -p, --port <port>  Specify port number (default: 9090)",
      "  -h, --help         Show this help message",
      "  -v, --version      Show package version",
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

// Handle port option
let port = 0;
const portIndex = args.findIndex((arg) => arg === "--port" || arg === "-p");
if (portIndex !== -1 && args[portIndex + 1]) {
  const userPort = Number(args[portIndex + 1]);
  if (Number.isFinite(userPort) && userPort > 0 && userPort < 65536) {
    port = userPort;
  } else {
    console.error(`Invalid port number: ${args[portIndex + 1]}`);
    process.exit(1);
  }
}

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const serverEntry = resolve(rootDir, "dist/server/index.js");

if (!existsSync(serverEntry)) {
  console.error("Build artifacts not found.");
  console.error("Run `npm install` and `npm run build` in the repository first.");
  process.exit(1);
}

// Only use getPort if port was not specified (port === 0)
if (port === 0) {
  port = await getPort({ port: DEFAULT_PORT });
}

const child = spawn(process.execPath, [serverEntry], {
  cwd: rootDir,
  stdio: "inherit",
  env: { ...process.env, PORT: String(port) },
});

// Wait for server to start, then open browser
setTimeout(async () => {
  const url = `http://localhost:${port}`;
  console.log(`\nOpening browser at ${url}...`);
  await open(url);
}, 1000);

child.on("exit", (code) => {
  if (code !== null) {
    process.exit(code);
  }
});

child.on("error", (error) => {
  console.error("Failed to start server:", error.message);
  process.exit(1);
});
