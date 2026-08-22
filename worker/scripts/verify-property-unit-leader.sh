#!/usr/bin/env bash
# Verifies the Task 10D flow end-to-end against a real running Worker + D1.
#
# Requires: curl, jq
# Usage:
#   API_URL=https://nightsafe-staging.<subdomain>.workers.dev \
#   OWNER_EMAIL=owner@staging.nightsafe.test \
#   OWNER_PASSWORD=hunter2word \
#   ./scripts/verify-property-unit-leader.sh
#
# Only ever run this against STAGING. It creates real records.

set -euo pipefail

API_URL="${API_URL:-http://localhost:8787}"
OWNER_EMAIL="${OWNER_EMAIL:?Set OWNER_EMAIL to a seeded staging Owner account}"
OWNER_PASSWORD="${OWNER_PASSWORD:?Set OWNER_PASSWORD}"

OWNER_JAR=$(mktemp)
LEADER_JAR=$(mktemp)
trap 'rm -f "$OWNER_JAR" "$LEADER_JAR"' EXIT

pass() { echo "  OK  - $1"; }
fail() { echo "FAIL  - $1"; exit 1; }

echo "== 1. Owner login =="
LOGIN_RES=$(curl -sS -c "$OWNER_JAR" -X POST "$API_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$OWNER_EMAIL\",\"password\":\"$OWNER_PASSWORD\"}")
echo "$LOGIN_RES" | jq -e '.user.role == "OWNER"' >/dev/null || fail "Owner login failed: $LOGIN_RES"
pass "Owner logged in"

STAMP=$(date +%s)

echo "== 2. Create property =="
PROP_RES=$(curl -sS -b "$OWNER_JAR" -X POST "$API_URL/api/owner/properties" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"Verify Property $STAMP\",\"address\":\"1 Test St\"}")
PROPERTY_ID=$(echo "$PROP_RES" | jq -r '.id')
[ "$PROPERTY_ID" != "null" ] || fail "Property creation failed: $PROP_RES"
pass "Property created ($PROPERTY_ID)"

echo "== 3. Create unit =="
UNIT_RES=$(curl -sS -b "$OWNER_JAR" -X POST "$API_URL/api/owner/properties/$PROPERTY_ID/units" \
  -H "Content-Type: application/json" \
  -d '{"label":"A-01","monthlyRentDollars":1000}')
UNIT_ID=$(echo "$UNIT_RES" | jq -r '.id')
[ "$UNIT_ID" != "null" ] || fail "Unit creation failed: $UNIT_RES"
pass "Unit created ($UNIT_ID)"

echo "== 4. Create Unit Leader =="
LEADER_EMAIL="verify-leader-$STAMP@staging.nightsafe.test"
LEADER_RES=$(curl -sS -b "$OWNER_JAR" -X POST "$API_URL/api/owner/unit-leaders" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"Verify Leader\",\"email\":\"$LEADER_EMAIL\",\"unitId\":\"$UNIT_ID\"}")
INVITE_LINK=$(echo "$LEADER_RES" | jq -r '.inviteLink')
[ "$INVITE_LINK" != "null" ] || fail "Unit Leader creation failed: $LEADER_RES"
INVITE_TOKEN=$(echo "$INVITE_LINK" | sed 's#.*/invite/##')
pass "Unit Leader created, invite token captured"

echo "== 5. Unit Leader activates account =="
ACTIVATE_RES=$(curl -sS -c "$LEADER_JAR" -X POST "$API_URL/api/auth/activate/$INVITE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"password":"VerifyLeaderPass123"}')
echo "$ACTIVATE_RES" | jq -e '.user.role == "UNIT_LEADER"' >/dev/null || fail "Activation failed: $ACTIVATE_RES"
pass "Unit Leader activated and session created"

echo "== 6. Unit Leader logs in normally (fresh session) =="
rm -f "$LEADER_JAR"
LEADER_LOGIN_RES=$(curl -sS -c "$LEADER_JAR" -X POST "$API_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$LEADER_EMAIL\",\"password\":\"VerifyLeaderPass123\"}")
echo "$LEADER_LOGIN_RES" | jq -e '.user.role == "UNIT_LEADER"' >/dev/null || fail "Unit Leader login failed: $LEADER_LOGIN_RES"
pass "Unit Leader can log in via the normal auth flow"

echo "== 7. Unit Leader sees their assigned unit =="
MY_UNIT_RES=$(curl -sS -b "$LEADER_JAR" "$API_URL/api/unit-leader/unit")
SEEN_UNIT_ID=$(echo "$MY_UNIT_RES" | jq -r '.unit.id')
[ "$SEEN_UNIT_ID" == "$UNIT_ID" ] || fail "Unit Leader does not see the correct unit: $MY_UNIT_RES"
pass "Unit Leader sees exactly their assigned unit"

echo "== 8. Unit Leader cannot reach Owner-only endpoints (scope enforcement) =="
STATUS=$(curl -sS -o /dev/null -w '%{http_code}' -b "$LEADER_JAR" "$API_URL/api/owner/properties")
[ "$STATUS" == "403" ] || fail "Expected 403 for Unit Leader hitting an Owner endpoint, got $STATUS"
pass "Unit Leader blocked from Owner endpoints (403)"

echo "== 9. Owner edits property =="
EDIT_PROP_STATUS=$(curl -sS -o /dev/null -w '%{http_code}' -b "$OWNER_JAR" -X PATCH "$API_URL/api/owner/properties/$PROPERTY_ID" \
  -H "Content-Type: application/json" -d '{"address":"2 Test St (edited)"}')
[ "$EDIT_PROP_STATUS" == "200" ] || fail "Property edit failed, got $EDIT_PROP_STATUS"
pass "Property edited"

echo "== 10. Owner edits unit =="
EDIT_UNIT_STATUS=$(curl -sS -o /dev/null -w '%{http_code}' -b "$OWNER_JAR" -X PATCH "$API_URL/api/owner/units/$UNIT_ID" \
  -H "Content-Type: application/json" -d '{"monthlyRentDollars":1100}')
[ "$EDIT_UNIT_STATUS" == "200" ] || fail "Unit edit failed, got $EDIT_UNIT_STATUS"
pass "Unit edited"

echo "== 11. Deleting the property is blocked (it has a unit) =="
DEL_PROP_STATUS=$(curl -sS -o /dev/null -w '%{http_code}' -b "$OWNER_JAR" -X DELETE "$API_URL/api/owner/properties/$PROPERTY_ID")
[ "$DEL_PROP_STATUS" == "409" ] || fail "Expected 409 blocking property delete, got $DEL_PROP_STATUS"
pass "Property deletion correctly blocked (has units)"

echo "== 12. Deleting the unit is blocked (it has a Unit Leader) =="
DEL_UNIT_STATUS=$(curl -sS -o /dev/null -w '%{http_code}' -b "$OWNER_JAR" -X DELETE "$API_URL/api/owner/units/$UNIT_ID")
[ "$DEL_UNIT_STATUS" == "409" ] || fail "Expected 409 blocking unit delete, got $DEL_UNIT_STATUS"
pass "Unit deletion correctly blocked (Unit Leader assigned)"

echo "== 13. IDOR check: nonexistent property id =="
IDOR_STATUS=$(curl -sS -o /dev/null -w '%{http_code}' -b "$OWNER_JAR" -X PATCH "$API_URL/api/owner/properties/does-not-exist" \
  -H "Content-Type: application/json" -d '{"name":"hacked"}')
[ "$IDOR_STATUS" == "404" ] || fail "Expected 404 for a nonexistent property id, got $IDOR_STATUS"
pass "Editing a nonexistent property id correctly returns 404, not another owner's data"

echo ""
echo "All checks passed."
echo "NOTE: this created real staging records (property, unit, unit leader"
echo "account). Clean up manually if needed -- no automated teardown here."
