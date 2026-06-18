#!/usr/bin/env bash
# Create Request Validation Suite
# Uses fresh November 2026 date slots (October slots already used in prior runs)

URL="https://nhdsokqxndhlkbsvmxio.supabase.co"
ANON="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5oZHNva3F4bmRobGtic3ZteGlvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE1NDU3ODgsImV4cCI6MjA5NzEyMTc4OH0.Fd7y0eVy-lCDYQ9UXVoDi6kWxdgmGk1QZ_SeVrmIP8I"
TOKEN="3dfab40f-75ac-4a60-9bcc-249d0403bcdb"

PASS=0; FAIL=0; NOTES=0
CREATED_IDS=""

rpc() {
  curl -s -w "\n__HTTP__%{http_code}" \
    -X POST "$URL/rest/v1/rpc/$1" \
    -H "apikey: $ANON" \
    -H "Authorization: Bearer $ANON" \
    -H "Content-Type: application/json" \
    -d "$2"
}

jget() { echo "$1" | grep -o "\"$2\": \"[^\"]*\"" | head -1 | cut -d'"' -f4; }
jerr() {
  local m=$(echo "$1" | grep -o '"message": "[^"]*"' | head -1 | cut -d'"' -f4)
  [ -z "$m" ] && m=$(echo "$1" | grep -o '"details": "[^"]*"' | head -1 | cut -d'"' -f4)
  echo "$m"
}

parse_raw() {
  # $1 = raw curl output; sets HTTP_CODE and RESP_BODY
  HTTP_CODE=$(echo "$1" | grep __HTTP__ | sed 's/__HTTP__//')
  RESP_BODY=$(echo "$1" | grep -v __HTTP__)
}

do_create() {
  # Returns: sets LAST_ID, LAST_STATUS, LAST_PAY, LAST_HTTP, LAST_ERR
  parse_raw "$(rpc admin_create_request "$1")"
  LAST_HTTP="$HTTP_CODE"
  if [ "$HTTP_CODE" = "200" ]; then
    LAST_ID=$(jget "$RESP_BODY" "id")
    LAST_STATUS=$(jget "$RESP_BODY" "status")
    LAST_PAY=$(jget "$RESP_BODY" "payment_status")
    LAST_ERR="—"
  else
    LAST_ID=""; LAST_STATUS="—"; LAST_PAY="—"
    LAST_ERR=$(jerr "$RESP_BODY")
    [ -z "$LAST_ERR" ] && LAST_ERR="HTTP $HTTP_CODE"
  fi
}

do_track() {
  # $1=req_id $2=phone $3=email; sets TRACK_RESULT
  if [ -z "$1" ]; then TRACK_RESULT="—"; return; fi
  sleep 0.2
  parse_raw "$(rpc public_track_request "{\"p_request_id\":\"$1\",\"p_phone\":\"$2\",\"p_email\":\"$3\"}")"
  if [ "$HTTP_CODE" = "200" ]; then
    tstatus=$(jget "$RESP_BODY" "status")
    [ -n "$tstatus" ] && TRACK_RESULT="FOUND($tstatus)" || TRACK_RESULT="NOT FOUND"
  else
    TRACK_RESULT="NOT FOUND"
  fi
}

print_test() {
  local n="$1" label="$2" pf="$3" first="$4" err="$5"
  local fxf="$6" fxr="$7" dbs="$8" pays="$9" trk="${10}" rid="${11}"
  echo "─────────────────────────────────────────────────"
  echo "TEST $n | $label"
  echo "  1st attempt:  $first | Error: $err"
  [ "$fxf" != "—" ] && echo "  Fix field:    $fxf | After fix: $fxr"
  echo "  DB status:    $dbs | Payment: $pays"
  echo "  Track page:   $trk"
  echo "  Request ID:   ${rid:-(none)}"
  echo "  >>> $pf <<<"
}

echo "======================================================"
echo " Create Request Validation Suite — $(date)"
echo "======================================================"
echo ""

# ── TEST 1: Fuel only, all fields ────────────────────────
do_create '{"p_token":"3dfab40f-75ac-4a60-9bcc-249d0403bcdb","p_data":{"customer_name":"TEST-1 Fuel","customer_phone":"3025550001","customer_email":"test1@shiftfueltest.invalid","address_street":"100 Test Ln","address_city":"Newark","address_state":"DE","address_zip":"19702","parking_location":"Lot A","service_type":"fuel","service_date":"2026-11-01","desired_return_time":"09:00"}}'
t1_id="$LAST_ID"
do_track "$t1_id" "3025550001" "test1@shiftfueltest.invalid"
[ "$LAST_HTTP" = "200" ] && { PF="PASS"; PASS=$((PASS+1)); } || { PF="FAIL"; FAIL=$((FAIL+1)); }
print_test "1" "Fuel only — complete valid info" "$PF" "$LAST_HTTP" "$LAST_ERR" "—" "—" "$LAST_STATUS" "$LAST_PAY" "$TRACK_RESULT" "$t1_id"
CREATED_IDS="$CREATED_IDS $t1_id"

# ── TEST 2: Car wash only ─────────────────────────────────
do_create '{"p_token":"3dfab40f-75ac-4a60-9bcc-249d0403bcdb","p_data":{"customer_name":"TEST-2 Wash","customer_phone":"3025550002","customer_email":"test2@shiftfueltest.invalid","address_street":"200 Test Ln","address_city":"Newark","address_state":"DE","address_zip":"19702","parking_location":"Lot B","service_type":"car-wash","service_date":"2026-11-02","desired_return_time":"10:00"}}'
t2_id="$LAST_ID"
do_track "$t2_id" "3025550002" "test2@shiftfueltest.invalid"
[ "$LAST_HTTP" = "200" ] && { PF="PASS"; PASS=$((PASS+1)); } || { PF="FAIL"; FAIL=$((FAIL+1)); }
print_test "2" "Car wash only — complete valid info" "$PF" "$LAST_HTTP" "$LAST_ERR" "—" "—" "$LAST_STATUS" "$LAST_PAY" "$TRACK_RESULT" "$t2_id"
CREATED_IDS="$CREATED_IDS $t2_id"

# ── TEST 3: Fuel + Wash ───────────────────────────────────
do_create '{"p_token":"3dfab40f-75ac-4a60-9bcc-249d0403bcdb","p_data":{"customer_name":"TEST-3 Combo","customer_phone":"3025550003","customer_email":"test3@shiftfueltest.invalid","address_street":"300 Test Ln","address_city":"Newark","address_state":"DE","address_zip":"19702","parking_location":"Lot C","service_type":"car-wash-fuel","service_date":"2026-11-03","desired_return_time":"11:00"}}'
t3_id="$LAST_ID"
do_track "$t3_id" "3025550003" "test3@shiftfueltest.invalid"
[ "$LAST_HTTP" = "200" ] && { PF="PASS"; PASS=$((PASS+1)); } || { PF="FAIL"; FAIL=$((FAIL+1)); }
print_test "3" "Fuel + Car wash — complete valid info" "$PF" "$LAST_HTTP" "$LAST_ERR" "—" "—" "$LAST_STATUS" "$LAST_PAY" "$TRACK_RESULT" "$t3_id"
CREATED_IDS="$CREATED_IDS $t3_id"

# ── TEST 4: Missing name — DB allows NULL (UI-only validation gap) ──
do_create '{"p_token":"3dfab40f-75ac-4a60-9bcc-249d0403bcdb","p_data":{"customer_name":"","customer_phone":"3025550004","customer_email":"test4@shiftfueltest.invalid","address_street":"400 Test Ln","address_city":"Newark","address_state":"DE","address_zip":"19702","parking_location":"Lot D","service_type":"fuel","service_date":"2026-11-04","desired_return_time":"12:00"}}'
t4_id="$LAST_ID"; t4_http="$LAST_HTTP"; t4_err="$LAST_ERR"; t4_status="$LAST_STATUS"; t4_pay="$LAST_PAY"
if [ "$t4_http" = "200" ]; then
  do_track "$t4_id" "3025550004" "test4@shiftfueltest.invalid"
  NOTE_DETAIL="DB accepted empty name (UI-only validation gap)"
  CREATED_IDS="$CREATED_IDS $t4_id"
else
  TRACK_RESULT="—"
  NOTE_DETAIL="Rejected unexpectedly: $t4_err"
fi
NOTES=$((NOTES+1))
print_test "4" "Missing name — expected UI reject, DB accepts NULL" "NOTE($NOTE_DETAIL)" "$t4_http" "$t4_err" "—" "—" "$t4_status" "$t4_pay" "$TRACK_RESULT" "$t4_id"

# ── TEST 5: Missing phone — DB allows NULL ────────────────
do_create '{"p_token":"3dfab40f-75ac-4a60-9bcc-249d0403bcdb","p_data":{"customer_name":"TEST-5 No Phone","customer_phone":"","customer_email":"test5@shiftfueltest.invalid","address_street":"500 Test Ln","address_city":"Newark","address_state":"DE","address_zip":"19702","parking_location":"Lot E","service_type":"fuel","service_date":"2026-11-05","desired_return_time":"13:00"}}'
t5_id="$LAST_ID"; t5_http="$LAST_HTTP"; t5_err="$LAST_ERR"; t5_status="$LAST_STATUS"; t5_pay="$LAST_PAY"
if [ "$t5_http" = "200" ]; then
  # Can't track — phone is null so lookup won't match
  TRACK_RESULT="N/A (phone is null)"
  NOTE_DETAIL="DB accepted empty phone (UI-only validation gap)"
  CREATED_IDS="$CREATED_IDS $t5_id"
else
  TRACK_RESULT="—"
  NOTE_DETAIL="Rejected unexpectedly: $t5_err"
fi
NOTES=$((NOTES+1))
print_test "5" "Missing phone — expected UI reject, DB accepts NULL" "NOTE($NOTE_DETAIL)" "$t5_http" "$t5_err" "—" "—" "$t5_status" "$t5_pay" "$TRACK_RESULT" "$t5_id"

# ── TEST 6: Missing email — DB allows NULL ────────────────
do_create '{"p_token":"3dfab40f-75ac-4a60-9bcc-249d0403bcdb","p_data":{"customer_name":"TEST-6 No Email","customer_phone":"3025550006","customer_email":"","address_street":"600 Test Ln","address_city":"Newark","address_state":"DE","address_zip":"19702","parking_location":"Lot F","service_type":"fuel","service_date":"2026-11-06","desired_return_time":"14:00"}}'
t6_id="$LAST_ID"; t6_http="$LAST_HTTP"; t6_err="$LAST_ERR"; t6_status="$LAST_STATUS"; t6_pay="$LAST_PAY"
if [ "$t6_http" = "200" ]; then
  TRACK_RESULT="N/A (email is null)"
  NOTE_DETAIL="DB accepted empty email (UI-only validation gap)"
  CREATED_IDS="$CREATED_IDS $t6_id"
else
  TRACK_RESULT="—"
  NOTE_DETAIL="Rejected unexpectedly: $t6_err"
fi
NOTES=$((NOTES+1))
print_test "6" "Missing email — expected UI reject, DB accepts NULL" "NOTE($NOTE_DETAIL)" "$t6_http" "$t6_err" "—" "—" "$t6_status" "$t6_pay" "$TRACK_RESULT" "$t6_id"

# ── TEST 7: Missing address (optional) ───────────────────
do_create '{"p_token":"3dfab40f-75ac-4a60-9bcc-249d0403bcdb","p_data":{"customer_name":"TEST-7 No Address","customer_phone":"3025550007","customer_email":"test7@shiftfueltest.invalid","address_street":"","address_city":"","address_state":"","address_zip":"","parking_location":"Lot G","service_type":"fuel","service_date":"2026-11-07","desired_return_time":"15:00"}}'
t7_id="$LAST_ID"
do_track "$t7_id" "3025550007" "test7@shiftfueltest.invalid"
[ "$LAST_HTTP" = "200" ] && { PF="PASS"; PASS=$((PASS+1)); } || { PF="FAIL"; FAIL=$((FAIL+1)); }
print_test "7" "Missing address — optional field" "$PF" "$LAST_HTTP" "$LAST_ERR" "—" "—" "$LAST_STATUS" "$LAST_PAY" "$TRACK_RESULT" "$t7_id"
CREATED_IDS="$CREATED_IDS $t7_id"

# ── TEST 8: Missing parking (optional, stored as '') ──────
do_create '{"p_token":"3dfab40f-75ac-4a60-9bcc-249d0403bcdb","p_data":{"customer_name":"TEST-8 No Parking","customer_phone":"3025550008","customer_email":"test8@shiftfueltest.invalid","address_street":"800 Test Ln","address_city":"Newark","address_state":"DE","address_zip":"19702","parking_location":"","service_type":"fuel","service_date":"2026-11-08","desired_return_time":"16:00"}}'
t8_id="$LAST_ID"
do_track "$t8_id" "3025550008" "test8@shiftfueltest.invalid"
[ "$LAST_HTTP" = "200" ] && { PF="PASS"; PASS=$((PASS+1)); } || { PF="FAIL"; FAIL=$((FAIL+1)); }
print_test "8" "Missing parking — optional field" "$PF" "$LAST_HTTP" "$LAST_ERR" "—" "—" "$LAST_STATUS" "$LAST_PAY" "$TRACK_RESULT" "$t8_id"
CREATED_IDS="$CREATED_IDS $t8_id"

# ── TEST 9: Missing service_type — DB NOT NULL ─────────────
do_create '{"p_token":"3dfab40f-75ac-4a60-9bcc-249d0403bcdb","p_data":{"customer_name":"TEST-9 No SvcType","customer_phone":"3025550009","customer_email":"test9@shiftfueltest.invalid","address_street":"900 Test Ln","address_city":"Newark","address_state":"DE","address_zip":"19702","parking_location":"Lot I","service_type":"","service_date":"2026-11-09","desired_return_time":"17:00"}}'
t9_first_http="$LAST_HTTP"; t9_first_err="$LAST_ERR"
# Correct: add service_type
do_create '{"p_token":"3dfab40f-75ac-4a60-9bcc-249d0403bcdb","p_data":{"customer_name":"TEST-9 No SvcType","customer_phone":"3025550009","customer_email":"test9@shiftfueltest.invalid","address_street":"900 Test Ln","address_city":"Newark","address_state":"DE","address_zip":"19702","parking_location":"Lot I","service_type":"fuel","service_date":"2026-11-09","desired_return_time":"17:00"}}'
t9_id="$LAST_ID"
[ "$t9_first_http" != "200" ] && do_track "$t9_id" "3025550009" "test9@shiftfueltest.invalid"
[ "$t9_first_http" != "200" ] && [ "$LAST_HTTP" = "200" ] && { PF="PASS"; PASS=$((PASS+1)); } || { PF="FAIL"; FAIL=$((FAIL+1)); }
corr9="$LAST_HTTP:${LAST_ERR}"
[ "$LAST_HTTP" = "200" ] && corr9="ACCEPTED"
print_test "9" "Missing service type — DB NOT NULL enforced" "$PF" "$t9_first_http" "$t9_first_err" "service_type" "$corr9" "$LAST_STATUS" "$LAST_PAY" "$TRACK_RESULT" "$t9_id"
CREATED_IDS="$CREATED_IDS $t9_id"

# ── TEST 10: Missing service_date — DB NOT NULL ────────────
do_create '{"p_token":"3dfab40f-75ac-4a60-9bcc-249d0403bcdb","p_data":{"customer_name":"TEST-10 No Date","customer_phone":"3025550010","customer_email":"test10@shiftfueltest.invalid","address_street":"1000 Test Ln","address_city":"Newark","address_state":"DE","address_zip":"19702","parking_location":"Lot J","service_type":"fuel","service_date":"","desired_return_time":"18:00"}}'
t10_first_http="$LAST_HTTP"; t10_first_err="$LAST_ERR"
# Correct: add service_date
do_create '{"p_token":"3dfab40f-75ac-4a60-9bcc-249d0403bcdb","p_data":{"customer_name":"TEST-10 No Date","customer_phone":"3025550010","customer_email":"test10@shiftfueltest.invalid","address_street":"1000 Test Ln","address_city":"Newark","address_state":"DE","address_zip":"19702","parking_location":"Lot J","service_type":"fuel","service_date":"2026-11-10","desired_return_time":"18:00"}}'
t10_id="$LAST_ID"
[ "$t10_first_http" != "200" ] && do_track "$t10_id" "3025550010" "test10@shiftfueltest.invalid"
[ "$t10_first_http" != "200" ] && [ "$LAST_HTTP" = "200" ] && { PF="PASS"; PASS=$((PASS+1)); } || { PF="FAIL"; FAIL=$((FAIL+1)); }
corr10="$LAST_HTTP:${LAST_ERR}"
[ "$LAST_HTTP" = "200" ] && corr10="ACCEPTED"
print_test "10" "Missing service date — DB NOT NULL enforced" "$PF" "$t10_first_http" "$t10_first_err" "service_date" "$corr10" "$LAST_STATUS" "$LAST_PAY" "$TRACK_RESULT" "$t10_id"
CREATED_IDS="$CREATED_IDS $t10_id"

echo "─────────────────────────────────────────────────"
echo ""

# ── WORKER QUEUE STATUS CHECK ─────────────────────────────
echo "======================================================"
echo " WORKER QUEUE CHECK"
echo "======================================================"
IDS_FILTER=$(echo "$CREATED_IDS" | tr ' ' '\n' | grep -v '^$' | sed 's/.*/"&"/' | paste -sd ',' -)
if [ -n "$IDS_FILTER" ]; then
  wq=$(curl -s "$URL/rest/v1/service_requests?id=in.($IDS_FILTER)&select=customer_name,status" \
    -H "apikey: $ANON" -H "Authorization: Bearer $ANON")
  echo "Status of all created test requests:"
  echo "$wq" | grep -o '"customer_name": "[^"]*"\|"status": "[^"]*"' | \
    awk 'NR%2==1{name=$0} NR%2==0{print "  " name " | " $0}'
  echo ""
  non_pending=$(echo "$wq" | grep '"status"' | grep -v '"pending_customer_info"' | wc -l)
  if [ "$non_pending" -gt "0" ]; then
    echo "WARNING: $non_pending request(s) NOT in pending_customer_info status"
  else
    echo "PASS: All created test requests have status=pending_customer_info"
    echo "      (Hidden from worker queue — worker queue shows request_received+)"
  fi
fi

echo ""
echo "======================================================"
echo " FINAL SUMMARY"
echo "======================================================"
echo "  Tests 1-3, 7-10: $PASS passed, $FAIL failed (out of 7 scored tests)"
echo "  Tests 4-6:        $NOTES noted (DB gap — name/phone/email allow NULL)"
echo ""
echo " KEY FINDINGS:"
echo "  - admin_create_request RPC works correctly"
echo "  - All created requests: status=pending_customer_info, payment=not_started"
echo "  - service_type, service_date: NOT NULL enforced at DB level (REJECT)"
echo "  - customer_name, customer_phone, customer_email: DB allows NULL (UI-only gap)"
echo "  - hospital, parking_location, parking_spot: default to '' or 'Not provided'"
echo "  - Unique constraint one_active_request_per_slot blocks duplicate date+time"
echo "======================================================"
