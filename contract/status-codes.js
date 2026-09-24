const path = require("path");
const { startEnvironment } = require("./lib/environment");

const ecomDir = path.resolve(process.env.ECOM_DIR || path.join(__dirname, "..", "..", "Ecom"));

const CASES = (env) => {
  const json = (cookie, body, authorization) => ({ headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}), ...(authorization ? { authorization } : {}) }, body: JSON.stringify(body) });
  const missingId = "000000000000000000000000";
  const form = (cookie, fields, file) => {
    const data = new FormData();
    for (const [key, value] of Object.entries(fields)) data.append(key, value);
    if (file) data.append("files", new Blob([file.content]), file.name);
    return { headers: cookie ? { cookie } : {}, body: data };
  };
  const categoryBody = { name: "Contract category", slug: "contract-category", status: "active" };
  return [
    ["soft delete of a malformed id", "DELETE", "/admin/api/coupons/not-an-id", json(env.adminCookie, {}), 400],
    ["restore of a malformed id", "POST", "/admin/api/coupons/not-an-id/restore", json(env.adminCookie, {}), 400],
    ["the old RPC-style URL is gone", "POST", "/admin/coupon/create", json(env.adminCookie, {}), 404, env.webUrl, { html: true }],
    ["an unknown API path answers JSON", "GET", "/admin/api/nothing", { headers: { cookie: env.adminCookie } }, 404],
    ["malformed body is rejected by the validator", "POST", "/admin/api/coupons", json(env.adminCookie, {}), 400],
    ["malformed id", "DELETE", "/admin/api/coupons/not-an-id?permanent=true", json(env.adminCookie, {}), 400],
    ["empty selection to restore", "POST", "/admin/api/coupons/restore", json(env.adminCookie, { ids: [] }), 400],
    ["empty selection to delete for good", "DELETE", "/admin/api/coupons", json(env.adminCookie, { ids: [] }), 400],
    ["the old bulk PATCH with a value is gone", "PATCH", "/admin/api/coupons", json(env.adminCookie, { value: "destroy", ids: [missingId] }), 404],
    ["deleting for good without the delete permission", "DELETE", "/admin/api/coupons", json(env.limitedCookie, { ids: [missingId] }), 403],
    ["empty selection", "POST", "/admin/api/coupons/trash", json(env.adminCookie, { ids: [] }), 400],
    ["first category is created", "POST", "/admin/api/product-categories", json(env.adminCookie, categoryBody), 200],
    ["the same slug again conflicts", "POST", "/admin/api/product-categories", json(env.adminCookie, categoryBody), 409],
    ["unknown order", "PATCH", `/admin/api/orders/${missingId}`, json(env.adminCookie, { orderStatus: "pending", paymentStatus: "unpaid" }), 404],
    ["invalid order status", "PATCH", `/admin/api/orders/${missingId}`, json(env.adminCookie, { orderStatus: "nope", paymentStatus: "unpaid" }), 400],
    ["admin API call without a login", "POST", "/admin/api/coupons", json(null, {}), 401],
    ["admin call without the permission", "POST", "/admin/api/coupons", json(env.limitedCookie, {}), 403],
    ["the old GET sign-out link is gone (signing out is POST only)", "GET", "/auth/logout", { headers: { cookie: env.userCookie } }, 404, env.webUrl, { html: true }],
    ["view of a product that does not exist", "POST", "/api/products/nope/views", {}, 404],
    ["view of an article that does not exist", "POST", "/api/articles/nope/views", {}, 404],
    ["wrong customer password", "POST", "/api/sessions", json(null, { email: "contract-user@example.com", password: "wrong-password" }), 401],
    ["customer API call without a login", "PATCH", "/api/customers/me", json(null, { fullName: "Someone Else" }), 401],
    ["the old customer RPC-style URL is gone", "POST", "/auth/login", json(null, {}), 404, env.webUrl, { html: true }],
    ["an unknown storefront API path answers JSON", "GET", "/api/nothing", {}, 404],
    ["reviewing without a login", "POST", "/api/reviews", json(null, {}), 401],
    ["reporting a review without a login", "POST", "/api/reviews/000000000000000000000000/reports", json(null, {}), 401],
    ["changing the password without a login", "PUT", "/api/customers/me/password", json(null, {}), 401],
    ["placing an order without a login", "POST", "/api/orders", json(null, {}), 401],
    ["chat messages without a login", "GET", "/api/chat-rooms/current/messages", {}, 401],
    ["the session of a signed-in customer", "GET", "/api/sessions/current", { headers: { cookie: env.userCookie } }, 200, env.webUrl, { signedIn: true }],
    ["a JSON GET without a login answers 401, not a redirect", "GET", "/admin/api/statistics/revenue-by-time", {}, 401],
    ["a JSON GET without the permission answers 403 JSON", "GET", "/admin/api/products/csv", { headers: { cookie: env.limitedCookie } }, 403],
    ["Bearer token of an admin, no cookie", "GET", `/admin/api/chat-rooms/${missingId}/messages`, { headers: { authorization: `Bearer ${env.adminLogin.accessToken}` } }, 404],
    ["Bearer token of an admin without the permission", "POST", "/admin/api/coupons", json(null, {}, `Bearer ${env.limitedLogin.accessToken}`), 403],
    ["a bad Bearer token beats a valid cookie", "GET", `/admin/api/chat-rooms/${missingId}/messages`, { headers: { authorization: "Bearer not-a-token", cookie: env.adminCookie } }, 401],
    ["an admin token is not a customer token", "PATCH", "/api/customers/me", json(null, { fullName: "Someone Else" }, `Bearer ${env.adminLogin.accessToken}`), 401],
    ["Bearer token of a customer, no cookie", "PATCH", "/api/customers/me", json(null, { fullName: "Contract User", phone: "0900000000" }, `Bearer ${env.userLogin.accessToken}`), 200],
    ["an expired or malformed customer Bearer token", "GET", "/api/chat-rooms/current/messages", { headers: { authorization: "Bearer not-a-token" } }, 401],
    ["the session of a Bearer customer", "GET", "/api/sessions/current", { headers: { authorization: `Bearer ${env.userLogin.accessToken}` } }, 200, env.webUrl, { signedIn: true }],
    ["unknown coupon code", "POST", "/api/coupon-checks", json(env.userCookie, { coupon: "NOPE" }), 400],
    ["rating out of range", "PUT", "/api/chat-rooms/current/rating", json(env.userCookie, { stars: 9 }), 400],
    ["chat room that does not exist", "GET", "/admin/api/chat-rooms/000000000000000000000000/messages", { headers: { cookie: env.adminCookie } }, 404],
    ["invalid date range", "GET", "/admin/api/statistics/revenue-by-time?from=2020-13-45&to=2020-01-01", { headers: { cookie: env.adminCookie } }, 400],
    ["missing date range", "GET", "/admin/api/statistics/revenue-by-time", { headers: { cookie: env.adminCookie } }, 400],
    ["FileManager rejects an invalid file name (through Web)", "PATCH", "/admin/api/files/name", json(env.adminCookie, { folder: "users", oldFileName: "a.png", newFileName: "bad/name.png" }), 400],
    ["FileManager: file not found (through Web)", "PATCH", "/admin/api/files/name", json(env.adminCookie, { folder: "users", oldFileName: "missing.png", newFileName: "other.png" }), 404],
    ["FileManager rejects a disallowed file type (through Web)", "POST", "/admin/api/files", form(env.adminCookie, {}, { name: "run.exe", content: "MZ" }), 400],
    ["FileManager without a bearer secret", "GET", "/folders", {}, 401, env.fileManagerUrl],
    ["FileManager with a wrong bearer secret", "GET", "/folders", { headers: { authorization: "Bearer wrong" } }, 401, env.fileManagerUrl],
    ["FileManager: file that does not exist", "GET", "/media/nope.png", {}, 404, env.fileManagerUrl],
    ["FileManager: temp folder is closed", "GET", "/media/temp/x", {}, 403, env.fileManagerUrl],
    ["FileManager: path leaving the media folder", "GET", "/media/%2e%2e%2f%2e%2e%2fetc%2fpasswd", {}, 403, env.fileManagerUrl],
    ["FileManager: rename of a missing file", "PATCH", "/files/name", { headers: { "content-type": "application/json", authorization: `Bearer ${env.fileManagerSecret}` }, body: JSON.stringify({ folder: "users", oldFileName: "a.png", newFileName: "b.png" }) }, 404, env.fileManagerUrl],
  ];
};

(async () => {
  const env = await startEnvironment({ ecomDir });
  let failed = 0;
  try {
    for (const [label, method, route, init, expected, base = env.webUrl, options = {}] of CASES(env)) {
      const response = await fetch(`${base}${route}`, { method, redirect: "manual", ...init });
      const text = await response.text();
      let body = null;
      try { body = JSON.parse(text); } catch { /* not JSON */ }
      const shapeOk = options.html
        ? /text\/html/.test(response.headers.get("content-type") || "")
        : options.signedIn ? body && body.ok === true
        : expected >= 400 ? body && body.code === "error" && typeof body.message === "string" : body && body.code === "success";
      const ok = response.status === expected && shapeOk;
      if (!ok) failed++;
      console.log(`${ok ? "ok  " : "FAIL"} ${String(response.status).padEnd(3)} (want ${expected}) ${method.padEnd(6)} ${route.padEnd(44)} ${label}${ok ? "" : `  -> ${text.slice(0, 120)}`}`);
    }
    const { MongoClient } = require("mongodb");
    const client = await MongoClient.connect(env.databaseUri);
    const jsonHeaders = { "content-type": "application/json", cookie: env.adminCookie };
    const step = async (label, method, route, body, expected) => {
      const response = await fetch(`${env.webUrl}${route}`, { method, headers: jsonHeaders, body: body ? JSON.stringify(body) : undefined });
      const ok = response.status === expected;
      if (!ok) failed++;
      console.log(`${ok ? "ok  " : "FAIL"} ${String(response.status).padEnd(3)} (want ${expected}) ${method.padEnd(6)} ${route.padEnd(52)} ${label}${ok ? "" : `  -> ${(await response.text()).slice(0, 100)}`}`);
    };
    try {
      await step("create a record", "POST", "/admin/api/product-attributes", { name: "Flow attribute", type: "text" }, 200);
      const attributes = client.db("ecom_contract").collection("attributes-product");
      const record = await attributes.findOne({ name: "Flow attribute" });
      const flags = async () => Boolean((await attributes.findOne({ _id: record._id }))?.deleted);
      const id = String(record._id);
      await step("move it to the trash", "DELETE", `/admin/api/product-attributes/${id}`, null, 200);
      if (!(await flags())) { failed++; console.log("FAIL the record is not marked as deleted after DELETE"); }
      await step("restore it", "POST", `/admin/api/product-attributes/${id}/restore`, null, 200);
      if (await flags()) { failed++; console.log("FAIL the record is still deleted after the restore"); }
      await step("trash it again", "DELETE", `/admin/api/product-attributes/${id}`, null, 200);
      await step("delete it for good", "DELETE", `/admin/api/product-attributes/${id}?permanent=true`, null, 200);
      if (await attributes.findOne({ _id: record._id })) { failed++; console.log("FAIL the record still exists after the permanent delete"); }
    } finally {
      await client.close();
    }

    for (const [ok, label] of [
      [env.userLogin.tokenType === "Bearer" && typeof env.userLogin.accessToken === "string" && env.userLogin.expiresIn > 0, "the customer login response carries accessToken, tokenType and expiresIn"],
      [env.adminLogin.tokenType === "Bearer" && typeof env.adminLogin.accessToken === "string" && env.adminLogin.expiresIn > 0, "the admin login response carries accessToken, tokenType and expiresIn"],
    ]) {
      if (!ok) failed++;
      console.log(`${ok ? "ok  " : "FAIL"} ${label}`);
    }
    {
      const folderStep = async (label, method, route, body, expected) => {
        const response = await fetch(`${env.webUrl}${route}`, { method, headers: { "content-type": "application/json", cookie: env.adminCookie }, body: body ? JSON.stringify(body) : undefined });
        const ok = response.status === expected;
        if (!ok) failed++;
        console.log(`${ok ? "ok  " : "FAIL"} ${String(response.status).padEnd(3)} (want ${expected}) ${method.padEnd(6)} ${route.padEnd(52)} ${label}${ok ? "" : `  -> ${(await response.text()).slice(0, 100)}`}`);
      };
      const listed = async () => {
        const response = await fetch(`${env.fileManagerUrl}/folders`, { headers: { authorization: `Bearer ${env.fileManagerSecret}` } });
        return JSON.stringify(await response.json());
      };
      await folderStep("create a folder", "POST", "/admin/api/folders", { folderName: "contract-folder" }, 200);
      if (!(await listed()).includes("contract-folder")) { failed++; console.log("FAIL FileManager does not list the new folder"); }
      await folderStep("rename it", "PATCH", "/admin/api/folders/name", { folderPath: "contract-folder", newFolderName: "contract-folder-2" }, 200);
      await folderStep("delete it", "DELETE", "/admin/api/folders?folderPath=contract-folder-2", null, 200);
      if ((await listed()).includes("contract-folder")) { failed++; console.log("FAIL FileManager still lists the deleted folder"); }
    }

    const customerClient = await MongoClient.connect(env.databaseUri);
    try {
      const customer = async (label, method, route, body, expected) => {
        const response = await fetch(`${env.webUrl}${route}`, { method, headers: { "content-type": "application/json", cookie: env.userCookie }, body: body ? JSON.stringify(body) : undefined });
        const ok = response.status === expected;
        if (!ok) failed++;
        console.log(`${ok ? "ok  " : "FAIL"} ${String(response.status).padEnd(3)} (want ${expected}) ${method.padEnd(6)} ${route.padEnd(52)} ${label}${ok ? "" : `  -> ${(await response.text()).slice(0, 100)}`}`);
      };
      const address = { fullName: "Contract User", phone: "0912345678", address: "1 Contract Street", longitude: 106.7, latitude: 10.8, isDefault: false };
      await customer("add an address", "POST", "/api/customers/me/addresses", address, 200);
      const db = customerClient.db("ecom_contract");
      const names = (await db.listCollections().toArray()).map((entry) => entry.name).filter((name) => /address/i.test(name));
      const record = names.length ? await db.collection(names[0]).findOne({ fullName: "Contract User", address: "1 Contract Street" }) : null;
      if (!record) { failed++; console.log("FAIL the address was not stored"); } else {
        const addressId = String(record._id);
        await customer("make it the default", "PUT", `/api/customers/me/addresses/${addressId}/default`, null, 200);
        await customer("edit it", "PATCH", `/api/customers/me/addresses/${addressId}`, { ...address, address: "2 Contract Street" }, 200);
        await customer("delete it", "DELETE", `/api/customers/me/addresses/${addressId}`, null, 200);
        if (await db.collection(names[0]).findOne({ _id: record._id })) { failed++; console.log("FAIL the address still exists after the delete"); }
      }
      await customer("edit the profile", "PATCH", "/api/customers/me", { fullName: "Contract User", phone: "0900000000" }, 200);
      await customer("sign out", "DELETE", "/api/sessions/current", null, 200);
    } finally {
      await customerClient.close();
    }

    const counted = await fetch(`${env.webUrl}/api/product-categories/contract-category/views`, { method: "POST" });
    const countedOk = counted.status === 200 && /viewed_product_category_/.test(counted.headers.get("set-cookie") || "");
    const opened = await fetch(`${env.webUrl}/product/category/contract-category`, { redirect: "manual" });
    const openedOk = opened.status === 200 && !/viewed_/.test(opened.headers.get("set-cookie") || "");
    for (const [ok, label] of [[countedOk, "POST …/view counts the view and remembers it in a cookie"], [openedOk, "GET of the page sets no view cookie"]]) {
      if (!ok) failed++;
      console.log(`${ok ? "ok  " : "FAIL"} ${label}`);
    }
    for (const [route, cookie] of [["/", ""], ["/auth/login", ""], ["/dashboard/address", env.userCookie], ["/dashboard/profile/edit", env.userCookie], ["/admin/dashboard", env.adminCookie], ["/admin/product/list", env.adminCookie], ["/admin/order/list", env.adminCookie], ["/admin/order/flagged", env.adminCookie], ["/admin/review/list", env.adminCookie], ["/admin/contact-inquiry/list", env.adminCookie], ["/admin/coupon/trash", env.adminCookie], ["/admin/product/trash", env.adminCookie], ["/admin/order/trash", env.adminCookie], ["/admin/file-manager", env.adminCookie]]) {
      const page = await fetch(`${env.webUrl}${route}`, { headers: cookie ? { cookie } : {}, redirect: "manual" });
      const ok = page.status === 200 && /text\/html/.test(page.headers.get("content-type") || "");
      if (!ok) failed++;
      console.log(`${ok ? "ok  " : "FAIL"} ${page.status}     (want 200) GET    ${route.padEnd(44)} the page renders`);
    }
    const unauth = await fetch(`${env.webUrl}/admin/dashboard`, { redirect: "manual" });
    const redirectOk = unauth.status === 302;
    if (!redirectOk) failed++;
    console.log(`${redirectOk ? "ok  " : "FAIL"} ${unauth.status}     (want 302) GET    /admin/dashboard                             page request without a login is redirected`);
  } finally {
    await env.stop();
  }
  console.log(failed ? `\n${failed} check(s) failed` : "\nall status codes are as expected");
  process.exit(failed ? 1 : 0);
})().catch((error) => { console.error("failed:", error.message, error.logDir ? `(logs: ${error.logDir})` : ""); process.exit(2); });
