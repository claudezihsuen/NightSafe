import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";

const bin = process.platform === "win32" ? "npx.cmd" : "npx";
const base = ["wrangler", "d1"];

function run(args, { expectFailure = false, quiet = false } = {}) {
  const result = spawnSync(bin, [...base, ...args], {
    encoding: "utf8",
    stdio: quiet ? "pipe" : "inherit",
  });

  const failed = result.status !== 0;
  if (expectFailure && !failed) {
    throw new Error(`Expected command to fail, but it succeeded: wrangler d1 ${args.join(" ")}`);
  }
  if (!expectFailure && failed) {
    const detail = quiet ? `\n${result.stdout ?? ""}\n${result.stderr ?? ""}` : "";
    throw new Error(`Command failed: wrangler d1 ${args.join(" ")}${detail}`);
  }
}

function exec(sql, options) {
  run(["execute", "nightsafe-db", "--local", "--command", sql], options);
}

console.log("Resetting local D1 test state...");
rmSync(".wrangler/state", { recursive: true, force: true });

console.log("Applying every migration to a clean local D1...");
run(["migrations", "apply", "nightsafe-db", "--local"]);

console.log("Seeding invariant-test data...");
exec(`
  INSERT INTO users (id,email,name,role,status) VALUES
    ('owner','owner@example.test','Owner','OWNER','ACTIVE'),
    ('agent','agent@example.test','Agent','AGENT','ACTIVE'),
    ('leader1','leader1@example.test','Leader One','UNIT_LEADER','ACTIVE'),
    ('leader2','leader2@example.test','Leader Two','UNIT_LEADER','ACTIVE'),
    ('tenant','tenant@example.test','Tenant','TENANT','ACTIVE');

  INSERT INTO properties (id,owner_id,name,address) VALUES
    ('p1','owner','Active Property','1 Test Road'),
    ('p2','owner','Archived Property','2 Test Road');

  INSERT INTO units (id,property_id,label,monthly_rent) VALUES
    ('u1','p1','A',100000),
    ('u2','p1','B',100000),
    ('u3','p2','C',100000);

  UPDATE properties SET archived_at = datetime('now') WHERE id = 'p2';
  UPDATE users SET unit_id = 'u2' WHERE id = 'leader1';

  INSERT INTO leases (id,unit_id,tenant_id,monthly_rent,start_date,status)
  VALUES ('lease1','u1','tenant',100000,'2026-01-01','ACTIVE');

  INSERT INTO deposit_items
    (id,lease_id,name,type,quantity,unit_amount,total_amount,currency,refundable,created_by)
  VALUES
    ('deposit1','lease1','Security deposit','Rental Deposit',1,10000,10000,'MYR',1,'owner'),
    ('deposit2','lease1','Admin fee','Other',1,5000,5000,'MYR',0,'owner');

  INSERT INTO deposit_payments (id,deposit_item_id,amount,paid_at,recorded_by)
  VALUES ('pay1','deposit1',9000,'2026-01-01','owner');

  INSERT INTO deposit_payments (id,deposit_item_id,amount,paid_at,recorded_by)
  VALUES ('pay-nonref','deposit2',5000,'2026-01-01','owner');

  INSERT INTO agent_assignments (id,agent_id,property_id,unit_id)
  VALUES ('assign1','agent','p1','u1');
`);

console.log("Checking duplicate agent-assignment guard...");
exec(
  "INSERT INTO agent_assignments (id,agent_id,property_id,unit_id) VALUES ('assign2','agent','p1','u1')",
  { expectFailure: true, quiet: true },
);

console.log("Checking archived property assignment guard...");
exec(
  "INSERT INTO agent_assignments (id,agent_id,property_id,unit_id) VALUES ('assign3','agent','p2','u3')",
  { expectFailure: true, quiet: true },
);

console.log("Checking archived property unit-creation guard...");
exec(
  "INSERT INTO units (id,property_id,label,monthly_rent) VALUES ('u4','p2','D',100000)",
  { expectFailure: true, quiet: true },
);

console.log("Checking archived inventory active-lease guard...");
exec(
  "INSERT INTO leases (id,unit_id,tenant_id,monthly_rent,start_date,status) VALUES ('lease2','u3','agent',100000,'2026-01-01','ACTIVE')",
  { expectFailure: true, quiet: true },
);

console.log("Checking one active Unit Leader per unit...");
exec(
  "UPDATE users SET unit_id = 'u2' WHERE id = 'leader2'",
  { expectFailure: true, quiet: true },
);

console.log("Checking deposit item overpayment guard...");
exec(
  "INSERT INTO deposit_payments (id,deposit_item_id,amount,paid_at,recorded_by) VALUES ('pay2','deposit1',2000,'2026-01-02','owner')",
  { expectFailure: true, quiet: true },
);

console.log("Checking deduction cannot exceed refundable money held...");
exec(
  "INSERT INTO deposit_deductions (id,lease_id,name,amount,reason,created_by) VALUES ('ded-too-much','lease1','Damage',10000,'Test','owner')",
  { expectFailure: true, quiet: true },
);
exec(
  "INSERT INTO deposit_deductions (id,lease_id,name,amount,reason,created_by) VALUES ('ded-ok','lease1','Damage',1000,'Test','owner')",
);

console.log("Checking return cannot exceed remaining refundable money held...");
exec(
  "INSERT INTO deposit_returns (id,lease_id,amount,returned_at,created_by) VALUES ('return-too-much','lease1',9000,'2026-02-01','owner')",
  { expectFailure: true, quiet: true },
);
exec(
  "INSERT INTO deposit_returns (id,lease_id,amount,returned_at,created_by) VALUES ('return-ok','lease1',8000,'2026-02-01','owner')",
);

console.log("Checking fully settled refundable deposit cannot be deducted again...");
exec(
  "INSERT INTO deposit_deductions (id,lease_id,name,amount,reason,created_by) VALUES ('ded-after-return','lease1','Late damage',1,'Test','owner')",
  { expectFailure: true, quiet: true },
);

console.log("Checking non-refundable payments cannot be refunded as deposit money...");
exec(
  "INSERT INTO deposit_returns (id,lease_id,amount,returned_at,created_by) VALUES ('return-nonref','lease1',1,'2026-02-02','owner')",
  { expectFailure: true, quiet: true },
);

console.log("All NightSafe D1 invariant tests passed.");
