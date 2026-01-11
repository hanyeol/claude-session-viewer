#!/usr/bin/env node
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import getPort from "get-port";
import open from "open";

const DEFAULT_SERVER_PORT = 9090;
const DEFAULT_CLIENT_PORT = 5173;

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
const serverPort = await getPort({ port: DEFAULT_SERVER_PORT });
const clientPort = await getPort({ port: DEFAULT_CLIENT_PORT });

const children = new Set();

function spawnProcess(args, envOverrides) {
  const child = spawn(npmCmd, args, {
    cwd: rootDir,
    stdio: "inherit",
    env: { ...process.env, ...envOverrides },
  });
  children.add(child);
  child.on("exit", () => {
    children.delete(child);
  });
  return child;
}

spawnProcess(["run", "dev:server"], { PORT: String(serverPort) });
spawnProcess(["run", "dev:client"], {
  VITE_SERVER_PORT: String(serverPort),
  VITE_CLIENT_PORT: String(clientPort),
});

// Wait for Vite to start, then open browser
setTimeout(async () => {
  const url = `http://localhost:${clientPort}`;
  console.log(`\nOpening browser at ${url}...`);
  await open(url);
}, 1000);

function shutdown(signal) {
  console.log(`\nShutting down processes (${signal})...`);

  for (const child of children) {
    try {
      child.kill(signal);
    } catch (err) {
      // Ignore errors if process is already dead
    }
  }

  // Force kill after 2 seconds if processes haven't exited
  setTimeout(() => {
    for (const child of children) {
      try {
        child.kill('SIGKILL');
      } catch (err) {
        // Ignore errors
      }
    }
    process.exit(0);
  }, 2000);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("exit", () => shutdown("SIGTERM"));
