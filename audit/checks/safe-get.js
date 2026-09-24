const path = require("path");

const WRITES = /(updateOne|updateMany|deleteOne|deleteMany|findOneAndUpdate|findByIdAndUpdate|insertMany|\.create\(|\.save\(|\$inc|bulkWrite)/;
const COOKIES = /res\.(cookie|clearCookie)\(/;
const MAX_DEPTH = 3;

// GET routes that write because a third party dictates the method.
const REQUIRED_BY_THIRD_PARTIES = {
  "/auth/google/callback": "Google redirects the browser back with GET and the session cookie is set here",
  "/auth/facebook/callback": "Facebook redirects the browser back with GET and the session cookie is set here",
  "/order/payment-vnpay-ipn": "VNPay calls its notification URL with GET",
  "/order/payment-vnpay-result": "VNPay sends the customer back to the return URL with GET",
};

const writesOf = (context, route) => {
  const found = new Set();
  const seen = new Set();
  const scan = (text, file, depth) => {
    for (const line of text.split("\n")) {
      if (WRITES.test(line)) found.add("database write");
      if (COOKIES.test(line)) found.add("cookie");
    }
    if (depth === 0) return;
    const blocks = context.blocksOf(file);
    const { namespaces, named } = context.importsOf(file);
    const follow = (target, name) => {
      const key = `${target}::${name}`;
      if (seen.has(key)) return;
      seen.add(key);
      const block = context.blocksOf(target)[name];
      if (block) scan(block, target, depth - 1);
    };
    for (const match of text.matchAll(/\b(\w+)\.(\w+)\(/g)) if (namespaces[match[1]]) follow(namespaces[match[1]], match[2]);
    for (const match of text.matchAll(/(?<![.\w])(\w+)\(/g)) {
      if (blocks[match[1]] && blocks[match[1]] !== text) follow(file, match[1]);
      else if (named[match[1]]) follow(named[match[1]], match[1]);
    }
  };
  scan(route.text, route.controllerFile, MAX_DEPTH);
  return [...found];
};

module.exports = {
  name: "GET requests are safe (no database writes, no cookies)",
  run: (context) => {
    const problems = [];
    const stillNeeded = new Set();
    for (const route of context.routes) {
      if (route.method !== "get" || !route.text) continue;
      const writes = writesOf(context, route);
      if (!writes.length) continue;
      if (REQUIRED_BY_THIRD_PARTIES[route.path]) stillNeeded.add(route.path);
      else problems.push(`GET ${route.path} changes state (${writes.join(", ")}); use POST, PUT, PATCH or DELETE for that`);
    }
    for (const routePath of Object.keys(REQUIRED_BY_THIRD_PARTIES)) {
      if (!stillNeeded.has(routePath)) problems.push(`${routePath} is listed as a GET that must write, but it no longer does: remove it from ${path.basename(__filename)}`);
    }
    return problems;
  },
};
