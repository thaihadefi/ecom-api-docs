module.exports = {
  name: "each operation names the authentication the source requires",
  run: ({ routes, fileManagerRoutes, specOperation, read, webDir }) => {
    const problems = [];
    for (const side of ["admin", "client"]) {
      const middleware = `${webDir}/middlewares/${side}/auth.middleware.ts`;
      if (!/bearerTokenOf/.test(read(middleware))) problems.push(`the ${side} auth middleware no longer reads a Bearer token, but the specification lists ${side === "admin" ? "AdminBearer" : "UserBearer"}`);
    }
    const expected = (route) => {
      if (route.side === "file-manager") return /verifySecret/.test(route.mountArgs || "") ? "FileManagerBearer" : "none";
      if (route.side === "admin") return /verifyToken/.test(route.mountArgs) || /verifyToken/.test(route.args) ? "AdminCookie" : "none";
      return /loggedIn/.test(route.mountArgs) || /loggedIn/.test(route.args) ? "UserCookie" : "none";
    };
    for (const route of [...routes, ...fileManagerRoutes]) {
      const operation = specOperation(route.method, route.path.replace(/\*(\w+)/g, "{$1}"));
      if (!operation) continue;
      if (operation.security === undefined) {
        problems.push(`${route.method.toUpperCase()} ${route.path} does not state its authentication (use security: [] for none)`);
        continue;
      }
      const documented = operation.security.length ? Object.keys(operation.security[0])[0] : "none";
      if (documented !== expected(route)) problems.push(`${route.method.toUpperCase()} ${route.path} requires ${expected(route)} in the source but the specification says ${documented}`);
      const bearer = { UserCookie: "UserBearer", AdminCookie: "AdminBearer" }[expected(route)];
      if (bearer && /^\/(admin\/)?api\//.test(route.path) && !operation.security.some((entry) => bearer in entry)) {
        problems.push(`${route.method.toUpperCase()} ${route.path} accepts a Bearer token in the source but the specification does not list ${bearer}`);
      }
    }
    return problems;
  },
};
