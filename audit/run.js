const fs = require("fs");
const path = require("path");
const context = require("./context");

const checks = fs.readdirSync(path.join(__dirname, "checks")).filter((file) => file.endsWith(".js")).sort();
const only = process.argv[2];
let failed = 0;

(async () => {
  console.log(`Ecom source: ${context.ecomDir}\n`);
  for (const file of checks) {
    if (only && !file.startsWith(only)) continue;
    const check = require(path.join(__dirname, "checks", file));
    const problems = await check.run(context);
    if (problems.length) failed += 1;
    console.log(`${problems.length ? "FAIL" : "ok  "} ${check.name}${problems.length ? ` (${problems.length})` : ""}`);
    for (const problem of problems) console.log(`       ${problem}`);
  }
  console.log(failed ? `\n${failed} audit(s) found differences` : "\nthe specification matches the source");
  process.exit(failed ? 1 : 0);
})();
