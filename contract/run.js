const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { startEnvironment } = require("./lib/environment");

const root = path.resolve(__dirname, "..");
const ecomDir = path.resolve(process.env.ECOM_DIR || path.join(root, "..", "Ecom"));
const schemathesis = path.join(__dirname, ".venv", "bin", "schemathesis");
const argument = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : process.argv[index + 1];
};
const examples = argument("examples", "10");
const timeout = argument("timeout", "6");
const workers = argument("workers", "1");
const seed = argument("seed", "1");
const reportDir = path.join(__dirname, "reports");

// Logging out would invalidate the session used by every other request.
const SESSION_ENDING = "^/(admin/api|api)/sessions/current$";
const FILE_MANAGER = "^/(files|folders|media)";
// Third-party calls would only time out against the placeholder keys, and bcrypt logins block the single Node thread until the test session ends.
const EXTERNAL_OR_HEAVY = "^/(admin/api/(chat-rooms/[^/]+/(reply-suggestion|reply-refinements|summary|customer-emotion)|recommendation-jobs|flagged-orders/retraining|cache|admin-accounts(/.*)?|sessions)|api/(cart/quote|orders|sessions|customers|customers/me/(password|addresses.*)|password-resets.*)|order/payment-zalopay.*)";
const CHECKS = "not_a_server_error,status_code_conformance,content_type_conformance,response_schema_conformance";

const run = (label, url, extra) => {
  console.log(`\n=== ${label} (${url}) ===`);
  const result = spawnSync(schemathesis, [
    "run", path.join(root, "openapi.yaml"),
    "--url", url, "--mode", "positive", "--checks", CHECKS,
    "--max-examples", examples, "--seed", seed, "--workers", workers, "--no-color",
    "--request-timeout", timeout, "--continue-on-failure", "--phases", "fuzzing",
    "--report", "junit", "--report-dir", reportDir, "--report-junit-path", path.join(reportDir, `${label}.xml`),
    ...extra,
  ], { stdio: "inherit" });
  return result.status;
};

(async () => {
  if (!fs.existsSync(schemathesis)) {
    console.error('Schemathesis is not installed. Run: python3 -m venv contract/.venv && contract/.venv/bin/pip install "schemathesis==4.4.4"');
    process.exit(2);
  }
  fs.mkdirSync(reportDir, { recursive: true });
  const environment = await startEnvironment({ ecomDir });
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, async () => {
      await environment.stop();
      process.exit(130);
    });
  }
  let status = 0;
  try {
    status |= run("web", environment.webUrl, ["-H", `Cookie: ${environment.cookie}`, "--exclude-path-regex", `${SESSION_ENDING}|${FILE_MANAGER}|${EXTERNAL_OR_HEAVY}`]);
    status |= run("file-manager", environment.fileManagerUrl, ["-H", `Authorization: Bearer ${environment.fileManagerSecret}`, "--include-path-regex", FILE_MANAGER]);
  } finally {
    await environment.stop();
  }
  process.exit(status ? 1 : 0);
})().catch((error) => {
  console.error("contract run failed:", error.message, error.logDir ? `(app logs: ${error.logDir})` : "");
  process.exit(2);
});
