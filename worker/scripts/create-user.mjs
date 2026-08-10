// Usage: node scripts/create-user.mjs "Jane Owner" jane@nightsafe.dev OWNER hunter2word
//
// Prints a SQL INSERT you can run with:
//   wrangler d1 execute nightsafe-db --local --command "<paste>"
//
// Owner/Agent/Unit Leader accounts aren't created through the tenant
// invite flow, so for local dev this script seeds one directly using the
// same PBKDF2 hash format the worker verifies against.

import { randomBytes, pbkdf2Sync, randomUUID } from "node:crypto";

const [, , name, email, role, password] = process.argv;

if (!name || !email || !role || !password) {
  console.error("Usage: node scripts/create-user.mjs <name> <email> <OWNER|AGENT|UNIT_LEADER> <password>");
  process.exit(1);
}

if (!["OWNER", "AGENT", "UNIT_LEADER"].includes(role)) {
  console.error("Role must be OWNER, AGENT, or UNIT_LEADER (tenants activate via invite link).");
  process.exit(1);
}

const ITERATIONS = 100_000;
const salt = randomBytes(16);
const hash = pbkdf2Sync(password, salt, ITERATIONS, 32, "sha256");
const passwordHash = `${ITERATIONS}:${salt.toString("hex")}:${hash.toString("hex")}`;
const id = randomUUID();

const sql = `INSERT INTO users (id, email, name, role, password_hash, status) VALUES ('${id}', '${email.toLowerCase()}', '${name.replace(/'/g, "''")}', '${role}', '${passwordHash}', 'ACTIVE');`;

console.log(sql);
