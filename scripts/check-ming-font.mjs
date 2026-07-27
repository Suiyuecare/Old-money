import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { extname, join, resolve } from "node:path";

const workspace = resolve(import.meta.dirname, "..");
const fontPath = join(workspace, "app/fonts/lignee-ming-subset.woff2");
const registryPath = join(workspace, "content/ming-han-glyphs.txt");
const EXPECTED_FONT_SHA256 =
  "7d40b00769849540f684c24e5b048a3f24b34b07e57cf214baddbefb2834091e";
const EXPECTED_REGISTRY_SHA256 =
  "3be8d10cbc35cc2d4e2ddd3bcf2b7fcd05a97776a6941c9cf03798ac0263f0f8";
const EXPECTED_HAN_GLYPH_COUNT = 1085;
const sourceRoots = ["app", "components", "lib", "content"];
const sourceExtensions = new Set([".ts", ".tsx", ".json", ".css"]);

const sha256 = (bytes) =>
  createHash("sha256").update(bytes).digest("hex");
const isHan = (character) => /\p{Script=Han}/u.test(character);

const fontBytes = readFileSync(fontPath);
if (sha256(fontBytes) !== EXPECTED_FONT_SHA256) {
  throw new Error(
    "The bundled Ming subset changed; regenerate and independently audit its glyph registry before launch.",
  );
}

const registryBytes = readFileSync(registryPath);
if (sha256(registryBytes) !== EXPECTED_REGISTRY_SHA256) {
  throw new Error(
    "The audited Ming glyph registry changed without updating its locked review digest.",
  );
}
const registryCharacters = [...registryBytes.toString("utf8")].filter(isHan);
const registry = new Set(registryCharacters);
if (
  registry.size !== EXPECTED_HAN_GLYPH_COUNT ||
  registryCharacters.length !== registry.size
) {
  throw new Error(
    `Expected ${EXPECTED_HAN_GLYPH_COUNT} unique audited Han glyphs; found ${registry.size}.`,
  );
}

const sourceFiles = [];
const visit = (path) => {
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const child = join(path, entry.name);
    if (entry.isDirectory()) visit(child);
    else if (entry.isFile() && sourceExtensions.has(extname(child))) {
      sourceFiles.push(child);
    }
  }
};
for (const root of sourceRoots) visit(join(workspace, root));

const runtimeCorpus = new Set(
  sourceFiles.flatMap((path) =>
    [...readFileSync(path, "utf8")].filter(isHan),
  ),
);
const missing = [...runtimeCorpus].filter((character) => !registry.has(character));
if (missing.length > 0) {
  throw new Error(
    `Ming subset registry is missing ${missing.length} runtime Han glyph(s): ${missing.join(
      "",
    )}`,
  );
}

console.log(
  `Ming font gate passed: locked WOFF2 and ${registry.size}-glyph audited Han registry cover ${runtimeCorpus.size} runtime glyphs.`,
);
