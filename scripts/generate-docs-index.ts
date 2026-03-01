import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const siteDir = resolve(process.cwd(), "site");
const indexPath = resolve(siteDir, "index.html");
const noJekyllPath = resolve(siteDir, ".nojekyll");

const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>PKI AIA/CDP Worker Docs</title>
    <style>
      :root {
        color-scheme: light dark;
        font-family: Inter, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
      }
      body {
        margin: 0;
        padding: 2rem;
        max-width: 840px;
      }
      h1 {
        margin-top: 0;
      }
      .card {
        border: 1px solid #9994;
        border-radius: 12px;
        padding: 1rem 1.25rem;
      }
      a {
        font-weight: 600;
      }
    </style>
  </head>
  <body>
    <h1>PKI AIA/CDP Worker Documentation</h1>
    <div class="card">
      <p><a href="./api/">Open API Reference (Redoc)</a></p>
      <p><a href="./api/openapi.json">OpenAPI JSON Bundle</a></p>
    </div>
  </body>
</html>
`;

async function main() {
  await mkdir(siteDir, { recursive: true });
  await writeFile(indexPath, html, "utf8");
  await writeFile(noJekyllPath, "\n", "utf8");
  console.log(`Site index written to ${indexPath}`);
}

main().catch((error) => {
  console.error("Failed to generate site index:", error);
  process.exitCode = 1;
});
