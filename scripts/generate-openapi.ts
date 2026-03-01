import { mkdir, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { openApiDocument } from "../src/contracts/openapi";

const outputPath = resolve(process.cwd(), "docs/openapi-v2.json");

async function main() {
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(openApiDocument, null, 2)}\n`, "utf8");
  console.log(`OpenAPI document written to ${outputPath}`);
}

main().catch((error) => {
  console.error("Failed to generate OpenAPI document:", error);
  process.exitCode = 1;
});
