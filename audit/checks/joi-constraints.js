const fs = require("fs");
const path = require("path");

// Validators that check a value the request does not carry as such (a file's mimetype).
const NOT_A_REQUEST_FIELD = new Set(["importCSVPost"]);

const ruleArgs = (description, name) => ((description.rules || []).find((rule) => rule.name === name) || {}).args;

const compare = (label, joi, spec, requiredInSpec, problems) => {
  const at = `${label} .${joi.__field}`;
  if (!spec) {
    problems.push(`${at}: the field is missing from the specification`);
    return;
  }
  const required = Boolean(joi.flags && joi.flags.presence === "required");
  if (required && !requiredInSpec) problems.push(`${at}: required by Joi but optional in the specification`);
  if (!required && requiredInSpec) problems.push(`${at}: required in the specification but optional in Joi`);
  const specType = spec.type;
  const openType = spec.oneOf || spec.anyOf;
  const typeOk = openType || joi.type === "any" || joi.type === "alternatives" || joi.type === "binary"
    || (joi.type === "string" && specType === "string") || (joi.type === "date" && specType === "string")
    || (joi.type === "number" && (specType === "number" || specType === "integer"))
    || (joi.type === "boolean" && specType === "boolean") || (joi.type === "array" && specType === "array")
    || (joi.type === "object" && (specType === "object" || !specType));
  if (!typeOk) problems.push(`${at}: Joi ${joi.type} but the specification says ${specType}`);
  const max = (ruleArgs(joi, "max") || {}).limit;
  const min = (ruleArgs(joi, "min") || {}).limit;
  if (joi.type === "string") {
    if (max != null && spec.maxLength !== max) problems.push(`${at}: maxLength ${max} in Joi, ${spec.maxLength} in the specification`);
    if (min != null && spec.minLength !== min) problems.push(`${at}: minLength ${min} in Joi, ${spec.minLength} in the specification`);
    const length = ruleArgs(joi, "length");
    if (length && spec.minLength !== length.limit) problems.push(`${at}: length ${length.limit} in Joi, minLength ${spec.minLength} in the specification`);
    const pattern = ruleArgs(joi, "pattern");
    if (pattern) {
      const source = String(pattern.regex).replace(/^\/|\/[a-z]*$/g, "");
      if (spec.pattern !== source) problems.push(`${at}: pattern ${source} in Joi, ${spec.pattern} in the specification`);
    }
    if ((joi.rules || []).some((rule) => rule.name === "email") && spec.format !== "email") problems.push(`${at}: email in Joi, format ${spec.format} in the specification`);
    if ((joi.rules || []).some((rule) => rule.name === "uri") && spec.format !== "uri") problems.push(`${at}: uri in Joi, format ${spec.format} in the specification`);
  }
  if (joi.type === "number") {
    if (max != null && spec.maximum !== max) problems.push(`${at}: maximum ${max} in Joi, ${spec.maximum} in the specification`);
    if (min != null && spec.minimum !== min) problems.push(`${at}: minimum ${min} in Joi, ${spec.minimum} in the specification`);
    if ((joi.rules || []).some((rule) => rule.name === "integer") && specType !== "integer" && !openType) problems.push(`${at}: integer in Joi, ${specType} in the specification`);
  }
  if (joi.type === "array") {
    if (max != null && spec.maxItems !== max) problems.push(`${at}: maxItems ${max} in Joi, ${spec.maxItems} in the specification`);
    if (min != null && spec.minItems !== min) problems.push(`${at}: minItems ${min} in Joi, ${spec.minItems} in the specification`);
  }
  if (joi.flags && joi.flags.only && joi.allow) {
    const allowed = joi.allow.map(String);
    const documented = (spec.enum || []).map(String);
    const missing = allowed.filter((value) => !documented.includes(value));
    const extra = documented.filter((value) => !allowed.includes(value));
    if (missing.length) problems.push(`${at}: Joi allows ${JSON.stringify(missing)} which the specification enum lacks`);
    if (extra.length && spec.enum) problems.push(`${at}: the specification enum has ${JSON.stringify(extra)} which Joi does not allow`);
  }
};

module.exports = {
  name: "Joi validators match the request schemas (required, type, length, range, pattern, enum)",
  run: ({ routes, specOperation, deref, webDir, importsOf }) => {
    const modules = path.join(webDir, "node_modules");
    if (!fs.existsSync(path.join(modules, "joi"))) return [`skipped: install the Web dependencies first (yarn install in ${webDir})`];
    require(path.join(modules, "ts-node")).register({ transpileOnly: true, project: path.join(webDir, "tsconfig.json") });
    const Joi = require(path.join(modules, "joi"));

    // Capture the schema each middleware validates against (describe() calls validate() itself, hence the guard).
    let captured = [];
    let busy = false;
    let base = Object.getPrototypeOf(Joi.object());
    while (base && !Object.prototype.hasOwnProperty.call(base, "validate")) base = Object.getPrototypeOf(base);
    for (const method of ["validate", "validateAsync"]) {
      const original = base[method];
      if (!original) continue;
      base[method] = function (...args) {
        if (!busy) {
          busy = true;
          try { captured.push(this.describe()); } catch { /* not describable */ } finally { busy = false; }
        }
        return original.apply(this, args);
      };
    }
    const response = () => {
      const res = { locals: {}, statusCode: 200 };
      for (const method of ["json", "send", "redirect", "render", "end", "status", "set", "header", "setHeader"]) res[method] = () => res;
      return res;
    };
    const describeOf = (middleware) => {
      captured = [];
      try { middleware({ body: {}, query: {}, params: {}, headers: {}, cookies: {}, files: [], method: "POST", originalUrl: "/", ip: "127.0.0.1" }, response(), () => {}); } catch { /* the schema was captured before */ }
      return captured.find((schema) => schema.type === "object" && schema.keys && !("abortEarly" in schema.keys) && !("allowUnknown" in schema.keys)) || null;
    };

    const problems = [];
    const described = new Map();
    for (const route of routes) {
      const operation = specOperation(route.method, route.path);
      if (!operation) continue;
      const { namespaces } = importsOf(route.routeFile);
      const targets = [];
      for (const match of route.args.matchAll(/(\w+)\.(\w+)(?=[,)\s])/g)) {
        if (namespaces[match[1]] && /validate/i.test(match[1]) && !NOT_A_REQUEST_FIELD.has(match[2])) targets.push({ file: namespaces[match[1]], name: match[2] });
      }
      const factory = route.args.match(/settingPatch\("(\w+)"\)/);
      if (factory) targets.push({ file: path.join(webDir, "validates", "admin", "setting.validate.ts"), name: "settingPatch", arg: factory[1] });
      for (const target of targets) {
        const key = `${target.file}::${target.name}::${target.arg || ""}`;
        if (!described.has(key)) {
          const module_ = require(target.file);
          const middleware = target.arg ? module_[target.name](target.arg) : module_[target.name];
          described.set(key, typeof middleware === "function" ? describeOf(middleware) : null);
        }
        const schema = described.get(key);
        const label = `${route.method.toUpperCase()} ${route.path}`;
        if (!schema) {
          problems.push(`${label}: the validator ${target.name} could not be inspected`);
          continue;
        }
        const content = operation.requestBody && operation.requestBody.content;
        const media = content && (content["application/json"] || Object.values(content)[0]);
        const body = (media && deref(media.schema)) || {};
        const required = new Set(body.required || []);
        for (const [field, joi] of Object.entries(schema.keys)) {
          if (joi.type === "any" || joi.type === "alternatives") continue;
          compare(label, { ...joi, __field: field }, deref((body.properties || {})[field]), required.has(field), problems);
        }
      }
    }
    return problems;
  },
};
