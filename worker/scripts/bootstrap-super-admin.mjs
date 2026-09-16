// One-time production bootstrap for NightSafe's primary administrator.
// No password is accepted or stored here. The script creates a
// WAITING_FOR_ACTIVATION ADMIN plus a Primary Admin marker and 7-day token.
// The Worker exposes the marked account to the frontend as SUPER_ADMIN.
//
// Example:
//   node scripts/bootstrap-super-admin.mjs \
//     "Primary Admin" "admin@example.com" "https://nightsafe.pages.dev" \
//     > super-admin.sql
//
// The SQL is written to stdout. The activation URL is written to stderr so
// redirecting stdout produces a clean SQL file.

import { createHash, randomBytes, randomUUID } from "node:crypto";

const [, , nameArg, emailArg, frontendArg = "https://nightsafe.pages.dev"] = process.argv;

const name = nameArg?.trim();
const email = emailArg?.trim().toLowerCase();
const frontendUrl = frontendArg.replace(/\/+$/, "");

if (!name || !email) {
  console.error(
    "Usage: node scripts/bootstrap-super-admin.mjs <name> <email> [frontend-url] > super-admin.sql",
  );
  process.exit(1);
}

if (!/^\S+@\S+\.\S+$/.test(email)) {
  console.error("Enter a valid email address.");
  process.exit(1);
}

function sqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

const userId = randomUUID();
const token = randomBytes(32).toString("hex");
const tokenHash = createHash("sha256").update(token).digest("hex");
const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

console.log(
  `INSERT INTO users (id, email, name, role, status) VALUES (${sqlString(userId)}, ${sqlString(email)}, ${sqlString(name)}, 'ADMIN', 'WAITING_FOR_ACTIVATION');`,
);
console.log(`INSERT INTO primary_admins (user_id) VALUES (${sqlString(userId)});`);
console.log(
  `INSERT INTO invitations (token_hash, user_id, expires_at) VALUES (${sqlString(tokenHash)}, ${sqlString(userId)}, ${sqlString(expiresAt)});`,
);

console.error(`Activation link: ${frontendUrl}/invite/${token}`);
console.error(`Expires: ${expiresAt}`);
