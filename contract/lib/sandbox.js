// Copies the Ecom apps into a temporary directory so a test run can never write into the real checkout
// (uploads land in FileManager/media, generated views in Web/views) and never sees a real .env file.
const fs = require("fs");
const os = require("os");
const path = require("path");

const SKIP_TOP_LEVEL = new Set(["node_modules", "dist", ".git"]);

const copyTree = (from, to, { skip = () => false } = {}) => {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    if (skip(entry.name, from)) continue;
    const source = path.join(from, entry.name);
    const target = path.join(to, entry.name);
    if (entry.isDirectory()) copyTree(source, target, { skip });
    else if (entry.isFile()) fs.copyFileSync(source, target);
  }
};

const createSandbox = (ecomDir) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ecom-contract-"));
  const apps = {};
  for (const app of ["Web", "FileManager"]) {
    const source = path.join(ecomDir, app);
    const target = path.join(root, app);
    if (!fs.existsSync(path.join(source, "node_modules"))) {
      throw new Error(`${source}/node_modules is missing. Run "yarn install" in ${source} first.`);
    }
    copyTree(source, target, {
      skip: (name, dir) => (dir === source && SKIP_TOP_LEVEL.has(name)) || name.startsWith(".env") || (app === "FileManager" && dir === source && name === "media"),
    });
    fs.symlinkSync(path.join(source, "node_modules"), path.join(target, "node_modules"), "dir");
    apps[app] = target;
  }
  for (const folder of ["temp", "users"]) fs.mkdirSync(path.join(apps.FileManager, "media", folder), { recursive: true });
  return { root, apps, remove: () => fs.rmSync(root, { recursive: true, force: true }) };
};

module.exports = { createSandbox };
