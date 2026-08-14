// Usage: node scripts/create-property.mjs <owner-user-id> "Sagewood Residences" "12 Fern Lane" "2B" 1200
//
// Prints two SQL INSERT statements (property + one unit) you can run with:
//   wrangler d1 execute nightsafe-db --local --file=<path>
//
// Property/unit management isn't built yet, so for local dev this seeds
// the minimum data the Owner tenant-creation flow needs to pick from.

import { randomUUID } from "node:crypto";

const [, , ownerId, propertyName, address, unitLabel, monthlyRentDollars] = process.argv;

if (!ownerId || !propertyName || !address || !unitLabel || !monthlyRentDollars) {
  console.error(
    "Usage: node scripts/create-property.mjs <owner-user-id> <property-name> <address> <unit-label> <monthly-rent-dollars>",
  );
  process.exit(1);
}

const propertyId = randomUUID();
const unitId = randomUUID();
const monthlyRentCents = Math.round(Number(monthlyRentDollars) * 100);

const esc = (s) => s.replace(/'/g, "''");

console.log(
  `INSERT INTO properties (id, owner_id, name, address) VALUES ('${propertyId}', '${ownerId}', '${esc(propertyName)}', '${esc(address)}');`,
);
console.log(
  `INSERT INTO units (id, property_id, label, monthly_rent) VALUES ('${unitId}', '${propertyId}', '${esc(unitLabel)}', ${monthlyRentCents});`,
);
