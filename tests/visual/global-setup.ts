import { mkdir, rm } from "node:fs/promises";
import path from "node:path";

export default async function globalSetup(): Promise<void> {
  const expected = path.resolve(process.cwd(), "artifacts", "visual-qa");
  const target = path.resolve(process.cwd(), "artifacts/visual-qa");
  if (
    target !== expected ||
    path.basename(target) !== "visual-qa" ||
    path.basename(path.dirname(target)) !== "artifacts"
  ) {
    throw new Error(`Refusing to clean unexpected visual QA path: ${target}`);
  }
  await rm(target, { recursive: true, force: true });
  await mkdir(target, { recursive: true });
}
