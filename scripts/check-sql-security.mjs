import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const workspace = resolve(import.meta.dirname, "..");
const migrationDirectory = join(workspace, "supabase/migrations");
const migrations = readdirSync(migrationDirectory)
  .filter((name) => name.endsWith(".sql"))
  .sort()
  .map((name) => readFileSync(join(migrationDirectory, name), "utf8"))
  .join("\n");
const config = readFileSync(join(workspace, "supabase/config.toml"), "utf8");
const seed = readFileSync(join(workspace, "supabase/seed.sql"), "utf8");
const sqlTests = readdirSync(join(workspace, "supabase/tests"))
  .filter((name) => name.endsWith(".sql"))
  .sort()
  .map((name) => readFileSync(join(workspace, "supabase/tests", name), "utf8"))
  .join("\n");
const errors = [];

for (const schema of [
  "catalog_private",
  "commerce_private",
  "ops_private",
  "engagement_private",
  "api",
]) {
  if (!migrations.includes(`create schema if not exists ${schema}`)) {
    errors.push(`Missing schema ${schema}.`);
  }
}
if (!/schemas\s*=\s*\["api"\]/.test(config)) {
  errors.push("Data API exposure must be pinned to api only.");
}
if (/create extension[^;]+version/i.test(migrations)) {
  errors.push("Extension versions must not be pinned.");
}
if (/supabase_secret_/i.test(migrations)) {
  errors.push("Migration contains a privileged API credential reference.");
}
if (!migrations.includes("enable row level security") || !migrations.includes("force row level security")) {
  errors.push("Forced RLS block is missing.");
}
if (!migrations.includes("nobypassrls")) errors.push("Application roles must be NOBYPASSRLS.");
if (!migrations.includes("set search_path = ''")) {
  errors.push("Security functions must pin an empty search_path.");
}
if (!migrations.includes("revoke all on all functions in schema api")) {
  errors.push("Default API function execute revoke is missing.");
}
if (migrations.includes("pg_net")) errors.push("pg_net must not be enabled.");
if (!migrations.includes("pg_advisory_xact_lock")) {
  errors.push("Inventory operation keys must be serialized before replay lookup.");
}
const adminDashboardDefinition = migrations.match(
  /create or replace function api\.admin_dashboard\(\)[\s\S]*?\$function\$;/i,
)?.[0] ?? "";
for (const [label, pattern] of [
  [
    "capture the validated caller role",
    /actor_role\s*:=\s*ops_private\.require_admin_role/i,
  ],
  [
    "hide order totals from merchandisers",
    /'orderCount'\s*,\s*case\s+when actor_role in \('owner', 'fulfillment', 'support'\)/i,
  ],
  [
    "hide open-order totals from merchandisers",
    /'openOrderCount'\s*,\s*case\s+when actor_role in \('owner', 'fulfillment', 'support'\)/i,
  ],
  [
    "restrict aggregate revenue to Owners",
    /'revenueTwd'\s*,\s*case\s+when actor_role = 'owner'/i,
  ],
  [
    "hide recent orders from merchandisers",
    /'recentOrders'\s*,\s*case\s+when actor_role in \('owner', 'fulfillment', 'support'\)/i,
  ],
]) {
  if (!pattern.test(adminDashboardDefinition)) {
    errors.push(`Admin dashboard must ${label}.`);
  }
}
if (
  !sqlTests.includes(
    "Merchandiser dashboard exposes order, revenue, or customer data",
  )
) {
  errors.push("SQL tests must assert the merchandiser dashboard redaction.");
}
if (
  /grant execute on function api\.apply_inventory_operation[^;]*\bstorefront_rpc_caller\b/i.test(
    migrations,
  )
) {
  errors.push("Storefront must not execute the generic inventory operation.");
}
if (
  !/revoke execute on function api\.apply_inventory_operation[^;]*\bfrom storefront_rpc_caller\b/i.test(
    migrations,
  )
) {
  errors.push("Storefront inventory execution must be explicitly revoked.");
}
if (
  !sqlTests.includes(
    "'api.apply_inventory_operation(text,uuid,text,integer,uuid,uuid)'",
  )
) {
  errors.push("SQL negative tests must assert the storefront inventory denial.");
}
if (!seed.includes("product.launch_position * 100") || !sqlTests.includes("seeded_variants <> 189")) {
  errors.push("Seed and SQL contract test must preserve the complete 189-SKU option matrix.");
}
for (const contract of [
  "create table commerce_private.order_access_challenges",
  "create table commerce_private.order_access_sessions",
  "create or replace function api.order_access_request(",
  "create or replace function api.order_access_exchange(",
  "create or replace function api.order_access_session_read(",
  "create or replace function api.order_access_session_revoke(",
  "create or replace function api.worker_order_access_recipient_resolve(",
]) {
  if (!migrations.includes(contract)) {
    errors.push(`Missing guest order-access contract: ${contract}`);
  }
}
if (
  /grant execute on function api\.order_access_[^(]*\([^;]+to\s+(?:anon|authenticated)/i.test(
    migrations,
  )
) {
  errors.push("Guest order-access RPCs must remain server-only.");
}
for (const assertion of [
  "ORDER_ACCESS_RATE_LIMIT",
  "INVALID_ORDER_ACCESS_EMAIL_PAYLOAD",
  "'api.worker_order_access_recipient_resolve(uuid,uuid)'",
]) {
  if (!sqlTests.includes(assertion)) {
    errors.push(`Order-access SQL test is missing assertion: ${assertion}`);
  }
}
for (const contract of [
  "create table ops_private.media_orphan_cleanup_candidates",
  "create or replace function api.admin_media_orphan_cleanup_stage(",
  "create or replace function api.worker_media_orphan_cleanup_claim(",
  "create or replace function api.worker_media_orphan_cleanup_complete(",
  "media_assets_cleanup_registration_guard",
  "media_upload_intents_stage_source_cleanup",
  "media_upload_intents_cleanup_finalization_guard",
  "media_orphan_cleanup_expired_lease_idx",
]) {
  if (!migrations.includes(contract)) {
    errors.push(`Missing media orphan cleanup contract: ${contract}`);
  }
}
for (const assertion of [
  "MEDIA_DERIVATIVES_REQUIRE_REUPLOAD",
  "MEDIA_SOURCE_REQUIRES_REUPLOAD",
  "MEDIA_ORPHAN_CLEANUP_IN_PROGRESS",
  "'api.worker_media_orphan_cleanup_claim(text,text,text,timestamp with time zone,integer)'",
]) {
  if (!sqlTests.includes(assertion)) {
    errors.push(`Media cleanup SQL test is missing assertion: ${assertion}`);
  }
}
for (const contract of [
  "create or replace function ops_private.sanitize_invoice_issue_job_payload()",
  "operation_jobs_invoice_issue_opaque_payload_check",
  "create or replace function api.worker_invoice_issue_payload_resolve(",
  "create or replace function api.worker_reconciliation_claim(",
  "operation_jobs_reconciliation_claimable",
]) {
  if (!migrations.includes(contract)) {
    errors.push(
      `Missing private invoice/reconciliation contract: ${contract}`,
    );
  }
}
for (const assertion of [
  "INVOICE_ISSUE_DURABLE_PAYLOAD_CONTAINS_PLAINTEXT",
  "RECONCILIATION_WORKER_REDISPATCHED_REMOTE_EFFECT",
  "'api.worker_invoice_issue_payload_resolve(uuid,text,text)'",
  "'api.worker_reconciliation_claim(text,timestamp with time zone,integer)'",
]) {
  if (!sqlTests.includes(assertion)) {
    errors.push(
      `Invoice/reconciliation SQL test is missing assertion: ${assertion}`,
    );
  }
}
for (const contract of [
  "add column dispatch_started_at timestamptz",
  "operation_jobs_dispatch_fence_guard",
  "create or replace function api.worker_operations_dispatch_start(",
  "DISPATCHED_REMOTE_EFFECT_CANNOT_RETRY",
  "candidate.dispatch_started_at is null",
  "candidate.dispatch_started_at is not null",
]) {
  if (!migrations.includes(contract)) {
    errors.push(
      `Missing remote-effect dispatch fence contract: ${contract}`,
    );
  }
}
for (const assertion of [
  "PRE_DISPATCH_REMOTE_EFFECT_WAS_NOT_REQUEUED",
  "POST_DISPATCH_REMOTE_EFFECT_RETRY_WAS_ACCEPTED",
  "POST_DISPATCH_EXPIRED_LEASE_WAS_REQUEUED",
  "'api.worker_operations_dispatch_start(text,text,timestamp with time zone)'",
]) {
  if (!sqlTests.includes(assertion)) {
    errors.push(
      `Remote-effect dispatch SQL test is missing assertion: ${assertion}`,
    );
  }
}

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log("Static SQL security gate passed.");
