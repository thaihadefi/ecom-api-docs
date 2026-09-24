// Builds the environment of the apps under test from scratch. Variable names are taken from the project's
// .env files, but every value is a placeholder, so no real key or connection string can reach the apps.
const fs = require("fs");
const path = require("path");

const namesIn = (file) => {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, "utf8").split("\n")
    .map((line) => line.replace(/^\s*#\s*/, "").match(/^([A-Z][A-Z0-9_]*)=/))
    .filter(Boolean)
    .map((match) => match[1]);
};

const buildEnv = ({ ecomDir, databaseUri, fileManagerSecret, webPort, fileManagerPort }) => {
  const names = new Set();
  for (const app of ["Web", "FileManager"]) {
    for (const file of [".env", ".env.example"]) namesIn(path.join(ecomDir, app, file)).forEach((name) => names.add(name));
  }
  const env = { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR };
  for (const name of names) env[name] = "contract-test-placeholder";
  return {
    ...env,
    NODE_ENV: "development",
    PORT: String(webPort),
    DATABASE: databaseUri,
    JWT_SECRET: "contract-test-jwt-secret-0123456789abcdef0123456789abcdef",
    SESSION_SECRET: "contract-test-session-secret-0123456789abcdef",
    FILE_MANAGER_SECRET: fileManagerSecret,
    FILE_MANAGER_URL: `http://127.0.0.1:${fileManagerPort}`,
    TRUST_PROXY: "0",
    CDN_DOMAIN: "",
    FILE_MANAGER_CORS_ORIGINS: "",
  };
};

module.exports = { buildEnv };
