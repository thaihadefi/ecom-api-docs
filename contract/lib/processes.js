const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const running = new Set();

const start = (name, command, args, { cwd, env, logDir }) => {
  const log = fs.openSync(path.join(logDir, `${name}.log`), "a");
  const child = spawn(command, args, { cwd, env, detached: true, stdio: ["ignore", log, log] });
  running.add(child);
  child.on("exit", () => running.delete(child));
  return child;
};

const waitForHttp = async (url, { timeoutMs = 120000, child } = {}) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child && child.exitCode !== null) throw new Error(`process exited early with code ${child.exitCode} while waiting for ${url}`);
    try {
      await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(3000) });
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw new Error(`${url} did not answer within ${timeoutMs / 1000}s`);
};

const stopAll = async () => {
  const children = [...running];
  for (const child of children) {
    try { process.kill(-child.pid, "SIGTERM"); } catch { /* already gone */ }
  }
  const deadline = Date.now() + 8000;
  while (children.some((child) => child.exitCode === null) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  for (const child of children) {
    if (child.exitCode === null) {
      try { process.kill(-child.pid, "SIGKILL"); } catch { /* already gone */ }
    }
  }
};

module.exports = { start, waitForHttp, stopAll };
