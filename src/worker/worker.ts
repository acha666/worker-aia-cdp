import { initializePkijsEngine } from "./pki/pkijs";
import type { Env } from "./env";
import { apiRouter } from "./api/v2/server";
import { buildHeadersForObject } from "./utils/content";

initializePkijsEngine();

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);

    try {
      // =======================================================================
      // API v2 Routes (handled by ts-rest router)
      // =======================================================================

      if (url.pathname.startsWith("/api/v2/")) {
        const response = await apiRouter.handle(req, env, ctx);
        if (response) {
          return response;
        }
      }

      // =====================================================================
      // Direct R2 downloads for certificates and CRLs
      // =====================================================================

      if (
        url.pathname.startsWith("/ca/") ||
        url.pathname.startsWith("/crl/") ||
        url.pathname.startsWith("/dcrl/")
      ) {
        if (req.method !== "GET" && req.method !== "HEAD") {
          return new Response("Method Not Allowed", { status: 405 });
        }

        let key: string;
        try {
          key = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
        } catch {
          return new Response("Bad Request", { status: 400 });
        }

        const object = await env.STORE.get(key);
        if (!object) {
          return new Response("Not Found", { status: 404 });
        }

        const metadata = (object as { customMetadata?: Record<string, string> }).customMetadata;
        const headers = buildHeadersForObject(object, key, metadata);
        const filename = key.split("/").pop() ?? "download";
        headers.set("Content-Disposition", `attachment; filename="${filename}"`);

        if (req.method === "HEAD") {
          return new Response(null, { headers });
        }

        return new Response(object.body, { headers });
      }

      return env.ASSETS.fetch(req);
    } catch (error) {
      console.error("Unhandled error:", error);
      return new Response(JSON.stringify({ error: "internal_error", detail: String(error) }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  },
} satisfies ExportedHandler<Env>;
