// One-time Admin account bootstrap.
//
// Usage:
//   ADMIN_PASSWORD='a long random password' node scripts/create-admin.mjs "Jane Admin" jane@yourcompany.internal
//
// Deliberately takes the password via an environment variable, not a CLI
// argument — argv is visible in shell history and `ps`, which matters more
// for an Admin credential than for the dev-only seed accounts in
// create-user.mjs. Prints a SQL INSERT for you to review before running:
//
//   wrangler d1 execute nightsafe-db --remote --file=<path>
//
// Run this ONCE. Check `SELECT COUNT(*) FROM users WHERE role='ADMIN'`
// first if you're not sure whether an Admin already exists.

import { randomBytes, pbkdf2Sync, randomUUID } from "node:crypto";

const [, , name, email] = process.argv;
const password = process.env.ADMIN_PASSWORD;

if (!name || !email || !password) {
  console.error("Usage: ADMIN_PASSWORD='...' node scripts/create-admin.mjs <name> <email>");
  process.exit(1);
}
if (password.length < 12) {
  console.error("ADMIN_PASSWORD must be at least 12 characters.");
  process.exit(1);
}

const ITERATIONS = 100_000;
const salt = randomBytes(16);
const hash = pbkdf2Sync(password, salt, ITERATIONS, 32, "sha256");
const passwordHash = `${ITERATIONS}:${salt.toString("hex")}:${hash.toString("hex")}`;
const id = randomUUID();

const sql = `INSERT INTO users (id, email, name, role, password_hash, status) VALUES ('${id}', '${email.toLowerCase()}', '${name.replace(/'/g, "''")}', 'ADMIN', '${passwordHash}', 'ACTIVE');`;

console.log(sql);
console.log("\n# Review the statement above, then run it yourself, e.g.:");
console.log("#   wrangler d1 execute nightsafe-db --remote --command \"<paste>\"");
