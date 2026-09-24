const fs = require("fs");
const deriveStatuses = require("../derive-statuses");

const RATE_LIMITER = /rateLimit|Limiter|limiter/i;

module.exports = {
  name: "permissions and rate limits named in the descriptions match the routes",
  run: (context) => {
    const problems = [];
    const derived = deriveStatuses(context);
    const aliasCache = {};
    const aliases = (file) => {
      if (!aliasCache[file]) {
        aliasCache[file] = {};
        for (const match of fs.readFileSync(file, "utf8").matchAll(/const (\w+)\s*=\s*checkPermission\(\s*["']([^"']+)["']\s*\)/g)) aliasCache[file][match[1]] = match[2];
      }
      return aliasCache[file];
    };
    for (const route of context.routes) {
      const operation = context.specOperation(route.method, route.path);
      if (!operation) continue;
      const label = `${route.method.toUpperCase()} ${route.path}`;
      const text = operation.description || "";
      const codes = Object.keys(operation.responses || {});

      const permissions = [...route.args.matchAll(/checkPermission\(\s*["']([^"']+)["']\s*\)/g)].map((match) => match[1]);
      for (const [name, permission] of Object.entries(aliases(route.routeFile))) {
        if (new RegExp(`(^|[,\\s(])${name}(?=[,\\s)])`).test(route.args)) permissions.push(permission);
      }
      const documented = [...text.matchAll(/permission `([^`]+)`/g)].map((match) => match[1]);
      for (const permission of permissions) {
        if (!documented.includes(permission)) problems.push(`${label}: the route needs the permission ${permission} but the description names ${JSON.stringify(documented)}`);
      }
      if (!permissions.length && documented.length && route.side === "admin") problems.push(`${label}: the description names the permission ${documented.join(", ")} but the route checks none`);

      const statuses = derived.get(`${route.method} ${route.path}`);
      if (statuses && !statuses.has(403) && codes.includes("403")) problems.push(`${label}: documents 403 but nothing in the source can answer it`);

      const limited = RATE_LIMITER.test(route.args);
      const documentedLimit = /rate limit/i.test(text) || codes.includes("429");
      if (limited !== documentedLimit) problems.push(`${label}: rate limiting is ${limited ? "applied" : "not applied"} in the source but ${documentedLimit ? "documented" : "not documented"}`);
    }
    return problems;
  },
};
