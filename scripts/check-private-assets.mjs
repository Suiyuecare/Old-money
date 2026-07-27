import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";

import sharp from "sharp";

const workspace = resolve(import.meta.dirname, "..");
const registry = JSON.parse(
  readFileSync(
    join(workspace, "content/private-anchor-registry.json"),
    "utf8",
  ),
);
const reviewRecord = JSON.parse(
  readFileSync(
    join(workspace, "content/asset-review-record.json"),
    "utf8",
  ),
);
const errors = [];
const hashes = new Set();

if (
  registry.revision !== "private-anchor-registry-v1" ||
  registry.anchors.length !== 8
) {
  errors.push("Private anchor registry must contain exactly eight v1 records.");
}

for (const anchor of registry.anchors) {
  const path = join(workspace, anchor.ignoredLocalPath);
  if (!existsSync(path)) {
    errors.push(`Missing optional local identity source: ${path}`);
    continue;
  }
  const bytes = readFileSync(path);
  if (bytes.toString("hex", 0, 8) !== "89504e470d0a1a0a") {
    errors.push(`Invalid PNG signature: ${path}`);
  }
  const hash = createHash("sha256").update(bytes).digest("hex");
  hashes.add(hash);
  if (hash !== anchor.sha256) {
    errors.push(`Private identity source hash does not match registry: ${anchor.id}`);
  }
  try {
    execFileSync("git", ["check-ignore", "-q", path], { cwd: workspace });
  } catch {
    errors.push(`Private identity source is not Git-ignored: ${path}`);
  }
}

if (hashes.size !== 8) {
  errors.push(`Expected eight byte-distinct private identity sources; found ${hashes.size}.`);
}

if (
  reviewRecord.revision !== "asset-review-record-v1" ||
  reviewRecord.contactSheets?.length !== 2 ||
  reviewRecord.sourceSheets?.length !== 26
) {
  errors.push("Private asset review record is malformed.");
} else {
  const sourceHashes = new Set();
  for (const source of reviewRecord.sourceSheets) {
    const path = join(workspace, source.ignoredLocalPath);
    if (!existsSync(path)) {
      errors.push(`Missing ignored native source sheet: ${path}`);
      continue;
    }
    const hash = createHash("sha256")
      .update(readFileSync(path))
      .digest("hex");
    sourceHashes.add(hash);
    if (hash !== source.sha256) {
      errors.push(`Native source sheet hash mismatch: ${source.ignoredLocalPath}`);
    }
    try {
      execFileSync("git", ["check-ignore", "-q", path], { cwd: workspace });
    } catch {
      errors.push(`Native source sheet is not Git-ignored: ${path}`);
    }
  }
  if (sourceHashes.size !== 26) {
    errors.push(
      `Expected 26 byte-distinct native source sheets; found ${sourceHashes.size}.`,
    );
  }

  for (const sheet of reviewRecord.contactSheets) {
    const path = join(workspace, sheet.ignoredLocalPath);
    if (!existsSync(path)) {
      errors.push(`Missing ignored review contact sheet: ${path}`);
      continue;
    }
    const hash = createHash("sha256")
      .update(readFileSync(path))
      .digest("hex");
    if (hash !== sheet.sha256) {
      errors.push(`Review contact sheet hash mismatch: ${sheet.ignoredLocalPath}`);
    }
    const metadata = await sharp(path).metadata();
    if (metadata.width !== sheet.width || metadata.height !== sheet.height) {
      errors.push(
        `Review contact sheet dimensions mismatch: ${sheet.ignoredLocalPath}`,
      );
    }
    try {
      execFileSync("git", ["check-ignore", "-q", path], { cwd: workspace });
    } catch {
      errors.push(`Review contact sheet is not Git-ignored: ${path}`);
    }
  }
}

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log(
  "Optional private asset gate passed: 8 anchors, 26 native source sheets, and 2 fresh review sheets are distinct, hashed, and ignored.",
);
