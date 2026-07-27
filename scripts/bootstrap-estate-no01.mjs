import { createHash } from "node:crypto";

import { createClient } from "@supabase/supabase-js";

const FORBIDDEN_HR_PROJECT_REF =
  ["tiorfiqi", "owylbnartegx"].join("");
const GENERATED_AT = "2026-07-24T00:00:00.000Z";

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function assertTarget() {
  const projectRef = required("SUPABASE_PROJECT_REF");
  const confirmedRef = required("CONFIRM_LIGNEE_PROJECT_REF");
  const url = new URL(required("SUPABASE_URL"));
  if (!/^[a-z]{20}$/.test(projectRef)) {
    throw new Error("SUPABASE_PROJECT_REF is invalid.");
  }
  if (
    projectRef === FORBIDDEN_HR_PROJECT_REF ||
    confirmedRef === FORBIDDEN_HR_PROJECT_REF
  ) {
    throw new Error("Refusing to operate on the HR Supabase project.");
  }
  if (
    confirmedRef !== projectRef ||
    url.protocol !== "https:" ||
    url.hostname !== `${projectRef}.supabase.co`
  ) {
    throw new Error(
      "SUPABASE_URL, SUPABASE_PROJECT_REF and CONFIRM_LIGNEE_PROJECT_REF must identify the same new LIGNÉE project.",
    );
  }
  return { projectRef, url: url.toString().replace(/\/$/, "") };
}

function canonicalJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(
        ([key, entry]) =>
          `${JSON.stringify(key)}:${canonicalJson(entry)}`,
      )
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

async function main() {
  const target = assertTarget();
  const secretKey = required("SUPABASE_SECRET_KEY");
  const { products, skus } = await import("../lib/catalog.ts");
  if (products.length !== 50 || skus.length !== 189) {
    throw new Error(
      `Estate No. 01 must contain exactly 50 products and 189 SKUs; received ${products.length}/${skus.length}.`,
    );
  }
  const snapshot = {
    schemaVersion: 1,
    revision: "1",
    generatedAt: GENERATED_AT,
    products,
    skus,
  };
  const digest = createHash("sha256")
    .update(
      canonicalJson({
        schemaVersion: snapshot.schemaVersion,
        products: [...products].sort((left, right) =>
          left.id.localeCompare(right.id),
        ),
        skus: [...skus].sort((left, right) =>
          left.id.localeCompare(right.id),
        ),
      }),
    )
    .digest("hex");

  const client = createClient(target.url, secretKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
  const { data, error } = await client
    .schema("api")
    .rpc("bootstrap_estate_no01", {
      p_snapshot: snapshot,
      p_digest: digest,
    });
  if (error) throw error;
  const result = Array.isArray(data) && data.length === 1 ? data[0] : data;
  if (
    !result ||
    typeof result !== "object" ||
    result.digest !== digest ||
    result.productCount !== 50 ||
    result.skuCount !== 189
  ) {
    throw new Error(
      "Estate No. 01 bootstrap returned an invalid parity response.",
    );
  }
  console.log(
    `Estate No. 01 ready in ${target.projectRef}: 50 products, 189 SKUs, catalog revision ${result.catalogRevision}.`,
  );
}

main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Estate bootstrap failed.",
  );
  process.exitCode = 1;
});
