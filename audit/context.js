const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");

const root = path.resolve(__dirname, "..");
const ecomDir = path.resolve(process.env.ECOM_DIR || path.join(root, "..", "Ecom"));
const webDir = path.join(ecomDir, "Web");
const fileManagerDir = path.join(ecomDir, "FileManager");

// SPEC_FILE lets the audits themselves be tested against a deliberately broken copy of the specification.
const spec = yaml.load(fs.readFileSync(process.env.SPEC_FILE || path.join(root, "openapi.yaml"), "utf8"));

const deref = (node) => {
  if (node && node.$ref) {
    let target = spec;
    for (const key of node.$ref.split("/").slice(1)) target = target[key];
    return deref(target);
  }
  return node;
};

const cache = {};
const read = (file) => cache[file] || (cache[file] = fs.readFileSync(file, "utf8"));

const blocksOf = (file) => {
  const blocks = Object.create(null);
  for (const part of read(file).split(/\n(?=(?:export )?(?:const|async function|function) \w+)/)) {
    const match = part.match(/^(?:export )?(?:const|async function|function) (\w+)/);
    if (match) blocks[match[1]] = part;
  }
  return blocks;
};

const importsOf = (file) => {
  const namespaces = Object.create(null);
  const named = Object.create(null);
  const resolve = (from) => path.resolve(path.dirname(file), from) + ".ts";
  for (const match of read(file).matchAll(/import \* as (\w+) from ["']([^"']+)["']/g)) namespaces[match[1]] = resolve(match[2]);
  for (const match of read(file).matchAll(/import \{([^}]+)\} from ["']([^"']+)["']/g)) {
    const target = resolve(match[2]);
    if (!fs.existsSync(target)) continue;
    for (const name of match[1].split(",")) {
      const local = name.trim().split(/\s+as\s+/).pop();
      if (local) named[local] = target;
    }
  }
  return { namespaces, named };
};

// A route file exports its page routes as the default `router` and may export API routers such as `api`.
const mountsOf = (indexFile) => {
  const source = read(indexFile);
  const targets = {};
  for (const match of source.matchAll(/import (?:(\w+)\s*,?\s*)?(?:\{([^}]*)\}\s*)?from ["']\.\/([\w.-]+)\.route["']/g)) {
    const file = path.join(path.dirname(indexFile), `${match[3]}.route.ts`);
    if (match[1]) targets[match[1]] = { file, router: "router" };
    for (const part of (match[2] || "").split(",")) {
      const [exported, alias] = part.trim().split(/\s+as\s+/);
      if (exported) targets[alias || exported] = { file, router: exported };
    }
  }
  const mounts = [];
  for (const match of source.matchAll(/router\.use\(\s*['"]([^'"]*)['"]([\s\S]*?),\s*(\w+)\s*\)\s*;/g)) {
    if (targets[match[3]]) mounts.push({ mount: match[1] === "/" ? "" : match[1], ...targets[match[3]], args: match[2] });
  }
  return mounts;
};

const routes = [];
const scanRouteFile = (file, prefix, side, mountArgs = "", routerName = "router") => {
  const imports = importsOf(file);
  const pattern = new RegExp(`(?<![\\w.])${routerName}\\.(get|post|patch|put|delete)\\(\\s*['"\`]([^'"\`]*)['"\`]([\\s\\S]*?)\\);\\s*\\n`, "g");
  for (const match of read(file).matchAll(pattern)) {
    const route = {
      method: match[1],
      path: (prefix + (match[2] === "/" ? "" : match[2])).replace(/:([A-Za-z]+)/g, "{$1}"),
      args: match[3],
      mountArgs,
      routeFile: file,
      side,
      handler: null,
      text: null,
      controllerFile: null,
    };
    const last = match[3].split(",").map((part) => part.trim()).filter(Boolean).pop() || "";
    const call = last.match(/(\w+)\.(\w+)$/);
    if (call && imports.namespaces[call[1]] && fs.existsSync(imports.namespaces[call[1]])) {
      route.controllerFile = imports.namespaces[call[1]];
      route.handler = call[2];
      route.text = blocksOf(route.controllerFile)[call[2]] || null;
    }
    routes.push(route);
  }
};

for (const { mount, file, router, args } of mountsOf(path.join(webDir, "routes", "admin", "index.route.ts"))) scanRouteFile(file, `/admin${mount}`, "admin", args, router);
const scanClientMounts = (indexFile, prefix, inheritedArgs) => {
  for (const { mount, file, router, args } of mountsOf(indexFile)) {
    if (path.basename(file) === "api.route.ts") scanClientMounts(file, `${prefix}${mount}`, `${inheritedArgs}${args}`);
    else scanRouteFile(file, `${prefix}${mount}`, "client", `${inheritedArgs}${args}`, router);
  }
};
scanClientMounts(path.join(webDir, "routes", "client", "index.route.ts"), "", "");

const fileManagerRoutes = [];
{
  const before = routes.length;
  const index = path.join(fileManagerDir, "routes", "index.route.ts");
  for (const { mount, file, router, args } of mountsOf(index)) scanRouteFile(file, mount, "file-manager", args, router);
  fileManagerRoutes.push(...routes.splice(before));
}

const operations = [];
for (const [route, methods] of Object.entries(spec.paths)) {
  for (const [method, operation] of Object.entries(methods)) operations.push({ method, path: route, operation });
}

const specOperation = (method, routePath) => spec.paths[routePath] && spec.paths[routePath][method];

module.exports = { root, ecomDir, webDir, fileManagerDir, spec, deref, read, blocksOf, importsOf, routes, fileManagerRoutes, operations, specOperation };
