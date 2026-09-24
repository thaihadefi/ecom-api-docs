const deriveStatuses = require("../derive-statuses");

module.exports = {
  name: "each operation documents the error statuses the source can produce",
  run: (context) => {
    const problems = [];
    for (const [key, derived] of deriveStatuses(context)) {
      const [method, ...rest] = key.split(" ");
      const operation = context.specOperation(method, rest.join(" "));
      const documented = new Set(Object.keys(operation.responses).map(Number).filter((status) => status >= 300));
      const missing = [...derived].filter((status) => !documented.has(status));
      // 302 in a page operation is a canonical redirect the source does not spell out with a status call.
      const extra = [...documented].filter((status) => !derived.has(status) && status !== 302);
      if (missing.length) problems.push(`${method.toUpperCase()} ${rest.join(" ")}: the source can answer ${missing.join(", ")} but the specification does not document it`);
      if (extra.length) problems.push(`${method.toUpperCase()} ${rest.join(" ")}: the specification documents ${extra.join(", ")} but nothing in the source can produce it`);
    }
    return problems;
  },
};
