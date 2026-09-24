const path = require("path");

const seedAccounts = async ({ webDir, databaseUri, adminEmail, limitedAdminEmail, userEmail, password }) => {
  const modules = path.join(webDir, "node_modules");
  require(path.join(modules, "ts-node")).register({ transpileOnly: true, project: path.join(webDir, "tsconfig.json") });
  const mongoose = require(path.join(modules, "mongoose"));
  const bcrypt = require(path.join(modules, "bcryptjs"));
  await mongoose.connect(databaseUri);
  const AccountAdmin = require(path.join(webDir, "models", "account-admin.model.ts")).default;
  const AccountUser = require(path.join(webDir, "models", "account-user.model.ts")).default;
  const hash = await bcrypt.hash(password, 10);
  await AccountAdmin.create({ fullName: "Contract Admin", email: adminEmail, password: hash, status: "active", isSuperAdmin: true, roles: [], search: "contract admin" });
  await AccountAdmin.create({ fullName: "Limited Admin", email: limitedAdminEmail, password: hash, status: "active", isSuperAdmin: false, roles: [], search: "limited admin" });
  await AccountUser.create({ fullName: "Contract User", email: userEmail, phone: "0900000000", password: hash, emailVerified: true, status: "active", search: "contract user" });
  await mongoose.disconnect();
};

module.exports = { seedAccounts };
