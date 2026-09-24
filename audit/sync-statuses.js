// Adds to openapi.yaml the error statuses the source can answer with but an operation does not document yet.
const fs = require("fs");
const path = require("path");
const context = require("./context");
const deriveStatuses = require("./derive-statuses");

const COMPONENT = { 302: "RedirectToLogin", 400: "BadRequest", 401: "Unauthorized", 403: "PermissionDenied", 404: "NotFound", 409: "Conflict", 429: "RateLimited", 500: "ServerError", 502: "BadGateway" };
const file = path.join(context.root, "openapi.yaml");
const lines = fs.readFileSync(file, "utf8").split("\n");

const operationRange = (routePath, method) => {
  const start = lines.indexOf(`  ${routePath}:`);
  if (start === -1) throw new Error(`${routePath} is not in the specification`);
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index++) {
    if (/^  \//.test(lines[index]) || /^\S/.test(lines[index])) { end = index; break; }
  }
  const begin = lines.findIndex((line, index) => index > start && index < end && line === `    ${method}:`);
  let stop = end;
  for (let index = begin + 1; index < end; index++) {
    if (/^    (get|post|put|patch|delete):/.test(lines[index])) { stop = index; break; }
  }
  return [begin, stop];
};

let updated = 0;
let added = 0;
for (const [key, derived] of deriveStatuses(context)) {
  const [method, ...rest] = key.split(" ");
  const routePath = rest.join(" ");
  const [begin, stop] = operationRange(routePath, method);
  const responses = lines.findIndex((line, index) => index > begin && index < stop && line === "      responses:");
  let end = stop;
  for (let index = responses + 1; index < stop; index++) {
    if (/^      \S/.test(lines[index])) { end = index; break; }
  }
  const entries = [];
  for (const line of lines.slice(responses + 1, end)) {
    const match = line.match(/^        '(\d{3})':/);
    if (match) entries.push({ status: Number(match[1]), text: [line] });
    else entries[entries.length - 1].text.push(line);
  }
  const have = new Set(entries.map((entry) => entry.status));
  const missing = [...derived].filter((status) => status >= 300 && !have.has(status));
  if (!missing.length) continue;
  for (const status of missing) {
    if (!COMPONENT[status]) throw new Error(`${method.toUpperCase()} ${routePath}: no standard response for status ${status}`);
    entries.push({ status, text: [`        '${status}':`, `          $ref: '#/components/responses/${COMPONENT[status]}'`] });
    added += 1;
  }
  entries.sort((a, b) => a.status - b.status);
  lines.splice(responses + 1, end - responses - 1, ...entries.flatMap((entry) => entry.text));
  updated += 1;
}
if (updated) fs.writeFileSync(file, lines.join("\n"));
console.log(updated ? `added ${added} response(s) to ${updated} operation(s); review the diff, then run yarn build` : "nothing to add");
