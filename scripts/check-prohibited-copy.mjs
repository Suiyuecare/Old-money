import { readFileSync, readdirSync } from "node:fs";
import { extname, join, resolve } from "node:path";

const workspace = resolve(import.meta.dirname, "..");
const roots = ["app", "components", "lib/editorial.ts"];
const prohibited = ["虛構", "想像", "世界觀", "角色設定"];
const extensions = new Set([".ts", ".tsx", ".css"]);
const failures = [];

function filesAt(path) {
  if (extname(path)) return [path];
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? filesAt(join(path, entry.name)) : [join(path, entry.name)],
  );
}

for (const root of roots) {
  for (const path of filesAt(join(workspace, root))) {
    if (!extensions.has(extname(path))) continue;
    const text = readFileSync(path, "utf8");
    for (const word of prohibited) {
      if (text.includes(word)) failures.push(`${path}: contains prohibited front-end word ${word}`);
    }
  }
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("Front-end copy gate passed.");

