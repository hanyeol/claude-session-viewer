#!/usr/bin/env node
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import getPort from "get-port";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";

const DEFAULT_PORT = 9090;
const port = await getPort({ port: DEFAULT_PORT });

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

spawnProcess(["run", "dev:server"], { PORT: String(port) });
spawnProcess(["run", "dev:client"], { VITE_API_PORT: String(port) });

function shutdown(signal) {
  for (const child of children) {
    child.kill(signal);
  }
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
