import { readFileSync, readdirSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";

const workspace = resolve(import.meta.dirname, "..");
const ignoredDirectories = new Set([
  ".git",
  ".next",
  ".private",
  "node_modules",
  "playwright-report",
  "test-results",
]);
const ignoredFiles = new Set(["pnpm-lock.yaml", "PLAN.md", "PLAN-REVIEW-LOG.md"]);
const textExtensions = new Set([
  ".ts", ".tsx", ".js", ".mjs", ".json", ".md", ".sql", ".toml", ".yml", ".yaml", ".css",
]);
const patterns = [
  ["OpenAI key", /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/],
  ["Supabase secret key", /\bsb_secret_[A-Za-z0-9_-]{20,}\b/],
  ["AWS access key", /\bAKIA[0-9A-Z]{16}\b/],
  ["Private key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ["ECPay secret assignment", /ECPAY_(?:HASH_KEY|HASH_IV)\s*=\s*[^<\s][^\s]{7,}/],
  ["Forbidden Supabase project", new RegExp("tiorfiqi" + "owylbnartegx")],
];
const failures = [];

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) return [];
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

for (const path of walk(workspace)) {
  if (ignoredFiles.has(relative(workspace, path)) || !textExtensions.has(extname(path))) continue;
  const text = readFileSync(path, "utf8");
  for (const [label, pattern] of patterns) {
    if (pattern.test(text)) failures.push(`${relative(workspace, path)}: ${label}`);
  }
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("Secret scan passed.");
