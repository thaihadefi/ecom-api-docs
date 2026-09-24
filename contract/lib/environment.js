const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { MongoMemoryReplSet } = require("mongodb-memory-server");
const { createSandbox } = require("./sandbox");
const { buildEnv } = require("./env");
const { seedAccounts } = require("./seed");
const { start, waitForHttp, stopAll } = require("./processes");

const MONGO_VERSION = "7.0.14";
const PASSWORD = "Contract-Test-1!";

const cookieFrom = async (response, name) => {
  const values = typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [response.headers.get("set-cookie") || ""];
  const match = values.map((value) => value.match(new RegExp(`^${name}=([^;]+)`))).find(Boolean);
  if (!match) throw new Error(`the login response did not set the ${name} cookie (HTTP ${response.status}): ${(await response.text()).slice(0, 200)}`);
  return `${name}=${match[1]}`;
};

const startEnvironment = async ({ ecomDir, webPort = Number(process.env.CONTRACT_WEB_PORT) || 3100, fileManagerPort = Number(process.env.CONTRACT_FILE_MANAGER_PORT) || 4100 }) => {
  const sandbox = createSandbox(ecomDir);
  const database = await MongoMemoryReplSet.create({ replSet: { count: 1 }, binary: { version: MONGO_VERSION } });
  const databaseUri = database.getUri("ecom_contract");
  if (!databaseUri.startsWith("mongodb://127.0.0.1")) throw new Error("refusing to run: the test database is not local");

  const stop = async () => {
    await stopAll();
    await database.stop();
    sandbox.remove();
  };

  try {
    const fileManagerSecret = crypto.randomBytes(24).toString("hex");
    const adminEmail = "contract-admin@example.com";
    const limitedAdminEmail = "contract-limited@example.com";
    const userEmail = "contract-user@example.com";
    const env = buildEnv({ ecomDir, databaseUri, fileManagerSecret, webPort, fileManagerPort });
    await seedAccounts({ webDir: sandbox.apps.Web, databaseUri, adminEmail, limitedAdminEmail, userEmail, password: PASSWORD });

    // FileManager listens on a fixed port in its source; the sandbox copy is pointed at the test port instead.
    const entry = path.join(sandbox.apps.FileManager, "index.ts");
    const source = fs.readFileSync(entry, "utf8");
    if (!source.includes("const port = 4000;")) throw new Error("FileManager/index.ts no longer declares `const port = 4000;`; update contract/lib/environment.js");
    fs.writeFileSync(entry, source.replace("const port = 4000;", "const port = Number(process.env.PORT);"));

    const tsNode = (app) => path.join(sandbox.apps[app], "node_modules", "ts-node", "dist", "bin.js");
    const fileManager = start("file-manager", process.execPath, [tsNode("FileManager"), "--transpile-only", "index.ts"], { cwd: sandbox.apps.FileManager, env: { ...env, PORT: String(fileManagerPort) }, logDir: sandbox.root });
    const web = start("web", process.execPath, [tsNode("Web"), "--transpile-only", "index.ts"], { cwd: sandbox.apps.Web, env, logDir: sandbox.root });
    const webUrl = `http://127.0.0.1:${webPort}`;
    const fileManagerUrl = `http://127.0.0.1:${fileManagerPort}`;
    await waitForHttp(`${fileManagerUrl}/media/none`, { child: fileManager });
    await waitForHttp(`${webUrl}/robots.txt`, { child: web });

    const login = (url, email) => fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password: PASSWORD }), redirect: "manual" });
    const session = async (url, email, name) => {
      const response = await login(url, email);
      const cookie = await cookieFrom(response, name);
      return { cookie, body: await response.json() };
    };
    const admin = await session(`${webUrl}/admin/api/sessions`, adminEmail, "tokenAdmin");
    const limited = await session(`${webUrl}/admin/api/sessions`, limitedAdminEmail, "tokenAdmin");
    const user = await session(`${webUrl}/api/sessions`, userEmail, "tokenUser");
    const [adminCookie, limitedCookie, userCookie] = [admin.cookie, limited.cookie, user.cookie];

    return { webUrl, fileManagerUrl, fileManagerSecret, databaseUri, adminCookie, limitedCookie, userCookie, adminLogin: admin.body, limitedLogin: limited.body, userLogin: user.body, cookie: `${adminCookie}; ${userCookie}`, logDir: sandbox.root, stop };
  } catch (error) {
    error.logDir = sandbox.root;
    await stopAll();
    await database.stop();
    throw error;
  }
};

module.exports = { startEnvironment };
