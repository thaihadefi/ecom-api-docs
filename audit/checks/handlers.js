module.exports = {
  name: "handlers read only what the specification declares",
  run: ({ routes, specOperation, deref }) => {
    const problems = [];
    for (const route of routes) {
      const operation = specOperation(route.method, route.path);
      if (!operation || !route.text) continue;
      const label = `${route.method.toUpperCase()} ${route.path}`;
      if (route.method !== "get" && !operation.requestBody && /req\.body|req\.files?\b/.test(route.text)) {
        problems.push(`${label}: the handler reads the request body or files but the specification has no requestBody`);
      }
      const declared = new Set((operation.parameters || []).map((parameter) => (deref(parameter) || {}).name));
      const used = new Set();
      for (const match of route.text.matchAll(/req\.query\.(\w+)/g)) used.add(match[1]);
      for (const match of route.text.matchAll(/(?:const|let)\s*\{([^}]*)\}\s*=\s*req\.query/g)) {
        for (const part of match[1].split(",")) {
          const name = part.split(":")[0].split("=")[0].trim();
          if (name) used.add(name);
        }
      }
      const missing = [...used].filter((name) => !declared.has(name));
      if (missing.length) problems.push(`${label}: the handler reads the query parameter(s) ${missing.join(", ")} that the specification does not declare`);
    }
    return problems;
  },
};
