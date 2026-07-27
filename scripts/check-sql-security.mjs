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
if (/service_role|supabase_secret_/i.test(migrations)) {
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

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log("Static SQL security gate passed.");
