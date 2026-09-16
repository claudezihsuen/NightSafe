// One-time CI bootstrap for NightSafe's Primary Admin.
// Reads all identity/password values from environment variables so credentials
// never need to be committed to the repository or printed to Actions logs.

import { pbkdf2Sync, randomBytes, randomUUID } from "node:crypto";

const name = process.env.PRIMARY_ADMIN_NAME?.trim();
const email = process.env.PRIMARY_ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.PRIMARY_ADMIN_PASSWORD;

if (!name || !email || !password) {
  console.error("Missing PRIMARY_ADMIN_NAME, PRIMARY_ADMIN_EMAIL, or PRIMARY_ADMIN_PASSWORD.");
  process.exit(1);
}

if (!/^\S+@\S+\.\S+$/.test(email)) {
  console.error("PRIMARY_ADMIN_EMAIL is not a valid email address.");
  process.exit(1);
}

if (password.length < 12) {
  console.error("PRIMARY_ADMIN_PASSWORD must be at least 12 characters.");
  process.exit(1);
}

function sqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

const ITERATIONS = 100_000;
const salt = randomBytes(16);
const hash = pbkdf2Sync(password, salt, ITERATIONS, 32, "sha256");
const passwordHash = `${ITERATIONS}:${salt.toString("hex")}:${hash.toString("hex")}`;
const id = randomUUID();

process.stdout.write(
  `INSERT INTO users (id, email, name, role, password_hash, status) VALUES (${sqlString(id)}, ${sqlString(email)}, ${sqlString(name)}, 'SUPER_ADMIN', ${sqlString(passwordHash)}, 'ACTIVE');\n`,
);
