const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");
const SwaggerParser = require("@apidevtools/swagger-parser");

const root = path.join(__dirname, "..");
const validateOnly = process.argv.includes("--validate");
const copyFlag = process.argv.indexOf("--copy-to");
const copyTo = copyFlag === -1 ? null : process.argv[copyFlag + 1];
const VENDOR_DIR = path.join("vendor", "swagger-ui");
const VENDOR_FILES = ["swagger-ui.css", "swagger-ui-bundle.js", "favicon-32x32.png", "LICENSE", "NOTICE"];
const BEGIN = "/* SPEC:BEGIN */";
const END = "/* SPEC:END */";

const main = async () => {
  const spec = yaml.load(fs.readFileSync(path.join(root, "openapi.yaml"), "utf8"));
  await SwaggerParser.validate(JSON.parse(JSON.stringify(spec)));
  const operations = Object.values(spec.paths).reduce((sum, item) => sum + Object.keys(item).length, 0);
  console.log(`openapi.yaml is valid: ${Object.keys(spec.paths).length} paths, ${operations} operations`);
  if (validateOnly) return;

  fs.writeFileSync(path.join(root, "openapi.json"), JSON.stringify(spec, null, 2) + "\n");

  const htmlPath = path.join(root, "index.html");
  const html = fs.readFileSync(htmlPath, "utf8");
  const start = html.indexOf(BEGIN);
  const end = html.indexOf(END);
  if (start === -1 || end === -1) throw new Error("index.html is missing the SPEC:BEGIN / SPEC:END markers");
  const inline = JSON.stringify(spec).replace(/</g, "\\u003c");
  fs.writeFileSync(htmlPath, `${html.slice(0, start + BEGIN.length)}\n    const apiSpec = ${inline};\n    ${html.slice(end)}`);
  console.log("openapi.json and index.html updated");

  const vendorTarget = path.join(root, VENDOR_DIR);
  fs.mkdirSync(vendorTarget, { recursive: true });
  for (const file of VENDOR_FILES) fs.copyFileSync(path.join(root, "node_modules", "swagger-ui-dist", file), path.join(vendorTarget, file));
  console.log(`copied Swagger UI ${require("swagger-ui-dist/package.json").version} to ${VENDOR_DIR}`);

  if (copyTo) {
    // Serving the site from the API's own origin lets Swagger UI "Try it out" send the HTTP-only auth cookies.
    const target = path.resolve(root, copyTo);
    fs.mkdirSync(target, { recursive: true });
    for (const file of ["index.html", "openapi.yaml", "openapi.json"]) fs.copyFileSync(path.join(root, file), path.join(target, file));
    for (const dir of ["css", "js"]) {
      const srcDir = path.join(root, dir);
      if (fs.existsSync(srcDir)) {
        const destDir = path.join(target, dir);
        fs.mkdirSync(destDir, { recursive: true });
        for (const file of fs.readdirSync(srcDir)) fs.copyFileSync(path.join(srcDir, file), path.join(destDir, file));
      }
    }
    fs.mkdirSync(path.join(target, VENDOR_DIR), { recursive: true });
    for (const file of VENDOR_FILES) fs.copyFileSync(path.join(vendorTarget, file), path.join(target, VENDOR_DIR, file));
    console.log(`copied index.html, openapi.yaml, openapi.json, css, js and ${VENDOR_DIR} to ${target}`);
  }
};

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
