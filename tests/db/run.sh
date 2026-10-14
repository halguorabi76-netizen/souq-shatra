#!/usr/bin/env bash
# Rebuilds a throwaway local database and applies the repository SQL in order.
# Usage: tests/db/run.sh   (needs a local Postgres; PGHOST/PGPORT/PGUSER env respected)
set -euo pipefail
cd "$(dirname "$0")/../.."
DB=${TEST_DB:-souq_test}
export PGHOST=${PGHOST:-/tmp} PGPORT=${PGPORT:-5433} PGUSER=${PGUSER:-postgres}
psql -q -d postgres -c "drop database if exists $DB" -c "create database $DB"
run(){ echo "== $1"; psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$1" >/dev/null; }
run tests/db/00-supabase-stub.sql
run tests/db/01-core-schema.sql
for f in $(cat tests/db/apply-order.txt); do run "$f"; done
for f in tests/db/test-*.sql; do [ -e "$f" ] && { echo "== TEST $f"; psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$f"; }; done
echo "ALL DATABASE CHECKS PASSED"
