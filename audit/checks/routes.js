const fs = require("fs");
const path = require("path");

// Routes declared directly on the Express app (not through a router), e.g. the PWA manifest. The app is built
// in app.ts (index.ts only starts it); both are read so either layout is covered.
const appRoutes = (webDir) => {
  const source = ["app.ts", "index.ts"]
    .map((file) => path.join(webDir, file))
    .filter((file) => fs.existsSync(file))
    .map((file) => fs.readFileSync(file, "utf8"))
    .join("\n");
  return [...source.matchAll(/app\.(get|post)\(\s*['"]([^'"]+)['"]/g)].map((match) => `${match[1]} ${match[2]}`);
};

module.exports = {
  name: "every route of the source is documented (HTML pages excepted)",
  run: ({ routes, fileManagerRoutes, operations, webDir }) => {
    const problems = [];
    const inSpec = new Set(operations.map((op) => `${op.method} ${op.path}`));
    const sourceKey = (route) => `${route.method} ${route.path.replace(/\*(\w+)/g, "{$1}")}`;
    const all = [...routes, ...fileManagerRoutes];
    const sourceKeys = new Set([...all.map(sourceKey), ...appRoutes(webDir)]);

    for (const route of all) {
      if (route.method !== "get" && !inSpec.has(sourceKey(route))) problems.push(`${route.method.toUpperCase()} ${route.path} exists in the source but not in the specification`);
    }
    for (const op of operations) {
      if (!sourceKeys.has(`${op.method} ${op.path}`)) problems.push(`${op.method.toUpperCase()} ${op.path} is documented but not found in the source`);
    }
    for (const route of routes) {
      if (route.method === "get" && !inSpec.has(sourceKey(route)) && route.text && /res\.(json|send)\(|\.status\(\d+\)\.json/.test(route.text)) {
        problems.push(`GET ${route.path} answers with JSON but is left out of the specification`);
      }
    }
    return problems;
  },
};
