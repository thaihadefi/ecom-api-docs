const fs = require("fs");
const path = require("path");

const multerLimits = (source) => {
  const limits = {};
  for (const match of source.matchAll(/(?:export )?const (\w+)\s*=\s*multer\(\{[\s\S]*?limits:\s*\{([^}]*)\}/g)) {
    limits[match[1]] = Number((match[2].match(/files:\s*(\d+)/) || [])[1]);
  }
  return limits;
};

module.exports = {
  name: "upload endpoints match their multer configuration",
  run: ({ routes, fileManagerRoutes, specOperation, deref, webDir, read }) => {
    const problems = [];
    const shared = multerLimits(read(path.join(webDir, "helpers", "upload.helper.ts")));
    for (const route of [...routes, ...fileManagerRoutes]) {
      const middleware = route.args.match(/(\w+)\.(single|array|fields)\(([^)]*)\)/);
      if (!middleware) continue;
      const operation = specOperation(route.method, route.path);
      if (!operation) continue;
      const label = `${route.method.toUpperCase()} ${route.path}`;
      const source = read(route.routeFile);
      const alias = source.match(new RegExp(`const ${middleware[1]}\\s*=\\s*(\\w+)\\s*;`));
      const local = multerLimits(source);
      const limit = { ...shared, ...local }[alias ? alias[1] : middleware[1]];
      const body = operation.requestBody && operation.requestBody.content && operation.requestBody.content["multipart/form-data"];
      if (!body) {
        problems.push(`${label}: uses file upload middleware but the specification has no multipart/form-data body`);
        continue;
      }
      const properties = (deref(body.schema) || {}).properties || {};
      const field = middleware[3].split(",")[0].replace(/["'\s]/g, "");
      const property = deref(properties[field]);
      if (!property) {
        problems.push(`${label}: file field "${field}" is missing from the specification`);
        continue;
      }
      const isFile = property.format === "binary" || (property.type === "array" && deref(property.items) && deref(property.items).format === "binary");
      if (!isFile) problems.push(`${label}: "${field}" is not declared as a binary file`);
      if (middleware[2] === "array") {
        if (property.type !== "array") problems.push(`${label}: "${field}" accepts several files but is not an array in the specification`);
        else if (limit && property.maxItems !== limit) problems.push(`${label}: "${field}" accepts at most ${limit} files but the specification says maxItems ${property.maxItems}`);
      }
    }
    return problems;
  },
};
