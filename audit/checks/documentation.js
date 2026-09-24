const fs = require("fs");
const path = require("path");

module.exports = {
  name: "the numbers quoted in the documentation match the specification",
  run: ({ root, operations, routes, fileManagerRoutes }) => {
    const problems = [];
    const documented = operations.length;
    for (const file of ["README.md", "index.html"]) {
      const text = fs.readFileSync(path.join(root, file), "utf8").replace(/const apiSpec = .*/s, "");
      for (const match of text.matchAll(/(\d+)\s+(?:operations|endpoints)\b/g)) {
        if (Number(match[1]) !== documented) problems.push(`${file} says ${match[0]} but the specification documents ${documented} operations`);
      }
    }
    const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");
    const inSpec = new Set(operations.map((operation) => `${operation.method} ${operation.path}`));
    const left = [...routes, ...fileManagerRoutes].filter((route) => route.method === "get" && !inSpec.has(`get ${route.path.replace(/\*(\w+)/g, "{$1}")}`)).length;
    for (const match of readme.matchAll(/other (\d+) `GET` routes/g)) {
      if (Number(match[1]) !== left) problems.push(`README.md says ${match[0]} but ${left} GET routes of the source are left out of the specification`);
    }
    return problems;
  },
};
