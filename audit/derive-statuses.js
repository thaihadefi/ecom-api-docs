// Works out which HTTP statuses the source of each Web route can answer with: the middleware of the route, the status
// calls of its controller, and the statuses of every service function the controller reaches (three levels deep).
const fs = require("fs");

const RATE_LIMITER = /rateLimit|Limiter|limiter/i;
const MAX_DEPTH = 3;

const permissionAliases = (context, routeFile) => {
  const aliases = [];
  for (const match of context.read(routeFile).matchAll(/const (\w+)\s*=\s*checkPermission\(/g)) aliases.push(match[1]);
  return aliases;
};

let providerStatuses = null;
const shippingProviderStatuses = (context) => {
  if (providerStatuses) return providerStatuses;
  providerStatuses = new Set();
  const dir = require("path").join(context.webDir, "services", "shipping");
  if (!fs.existsSync(dir)) return providerStatuses;
  for (const file of fs.readdirSync(dir).filter((name) => name.endsWith(".provider.ts"))) {
    const text = fs.readFileSync(require("path").join(dir, file), "utf8");
    for (const match of text.matchAll(/httpError\(\s*(\d{3})/g)) providerStatuses.add(Number(match[1]));
    if (/axios\.(get|post|patch|put|delete)\(/.test(text)) providerStatuses.add(502);
  }
  return providerStatuses;
};

const statusesInCode = (context, text, file, depth, seen) => {
  const found = new Set();
  for (const match of text.matchAll(/status:\s*(\d{3})/g)) found.add(Number(match[1]));
  for (const match of text.matchAll(/\?\?\s*(\d{3})/g)) found.add(Number(match[1]));
  for (const match of text.matchAll(/res\.status\((\d{3})\)/g)) found.add(Number(match[1]));
  if (/axios\.(get|post|patch|put|delete)\(/.test(text)) found.add(502);
  if (/upstreamStatus\(\s*data\.httpStatus/.test(text)) [400, 403, 404, 409, 502].forEach((status) => found.add(status));
  else if (/upstreamStatus\(/.test(text)) [400, 502].forEach((status) => found.add(status));
  if (/couponRejectStatus\(/.test(text)) [400, 409].forEach((status) => found.add(status));
  for (const match of text.matchAll(/httpError\(\s*(\d{3})/g)) found.add(Number(match[1]));
  // Shipping goes through a provider registry (services/shipping); a quote or shipment can answer with any
  // status a registered provider produces.
  if (/\b(quoteShippingRates|createShipment)\(/.test(text)) shippingProviderStatuses(context).forEach((status) => found.add(status));
  if (depth === 0) return found;

  const blocks = context.blocksOf(file);
  const { namespaces, named } = context.importsOf(file);
  const follow = (targetFile, name) => {
    const key = `${targetFile}::${name}`;
    if (seen.has(key)) return;
    seen.add(key);
    const block = context.blocksOf(targetFile)[name];
    if (block) statusesInCode(context, block, targetFile, depth - 1, seen).forEach((status) => found.add(status));
  };
  for (const match of text.matchAll(/\b(\w+)\.(\w+)\(/g)) if (namespaces[match[1]]) follow(namespaces[match[1]], match[2]);
  for (const match of text.matchAll(/(?<![.\w])(\w+)\(/g)) {
    if (blocks[match[1]] && blocks[match[1]] !== text) follow(file, match[1]);
    else if (named[match[1]]) follow(named[match[1]], match[1]);
  }
  return found;
};

module.exports = (context) => {
  const result = new Map();
  for (const route of context.routes) {
    const operation = context.specOperation(route.method, route.path);
    if (!operation || !route.text) continue;
    const statuses = new Set();
    const aliased = permissionAliases(context, route.routeFile).some((alias) => new RegExp(`(^|[,\\s(])${alias}(?=[,\\s)])`).test(route.args));
    if (/checkPermission\(/.test(route.args) || aliased) statuses.add(403);
    // A GET only redirects (302) when it renders a server-side page; JSON API routes (/api,
    // /admin/api) answer 401 on every method, matching the source's own isApiRequest check.
    const isJsonApiRoute = /^\/(admin\/)?api(\/|$)/.test(route.path);
    if (operation.security && operation.security.length) statuses.add(route.method === "get" && !isJsonApiRoute ? 302 : 401);
    if (RATE_LIMITER.test(route.args)) statuses.add(429);
    if (/[Vv]alidate\.|settingPatch/.test(route.args)) statuses.add(400);
    if (/\.(single|array|fields)\(/.test(route.args)) statuses.add(400);
    statusesInCode(context, route.text, route.controllerFile, MAX_DEPTH, new Set()).forEach((status) => statuses.add(status));
    if (/sendCaughtError\(|caughtErrorStatus\(/.test(route.text)) [400, 500].forEach((status) => statuses.add(status));
    result.set(`${route.method} ${route.path}`, statuses);
  }
  return result;
};
