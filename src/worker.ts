import { initializePkijsEngine } from "./runtime/pkijs";
import type { Env } from "./env";
import { jsonError } from "./http/json-response";
import { getObjectMetadata } from "./handlers/get-object-metadata";
import { listObjects } from "./handlers/list-objects";
import { getBinaryOrText } from "./handlers/get-binary-or-text";
import { createCRL } from "./handlers/post-crl";

initializePkijsEngine();

function responseFromHead(target: Response) {
  return new Response(null, { status: target.status, headers: target.headers });
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const { method } = req;
    const url = new URL(req.url);

    try {
      if (method === "GET" && (url.pathname === "/api/v1/objects" || /^\/api\/v1\/collections\/(ca|crl|dcrl)\/items$/.test(url.pathname))) {
        return listObjects(req, env, ctx);
      }

      if (method === "GET" && /^\/api\/v1\/objects\/.+\/metadata$/.test(url.pathname)) {
        return getObjectMetadata(req, env, ctx);
      }

      if ((method === "GET" || method === "HEAD") && /^\/(ca|crl|dcrl)\//.test(url.pathname)) {
        const response = await getBinaryOrText(new Request(req, { method: "GET" }), env, ctx);
        return method === "HEAD" ? responseFromHead(response) : response;
      }

      if (method === "POST" && url.pathname === "/api/v1/crls") {
        return createCRL(req, env, ctx);
      }

      if (["/api/list", "/meta", "/crl"].includes(url.pathname)) {
        return jsonError(410, "deprecated_endpoint", "This endpoint has moved. Use /api/v1/* equivalents instead.", {
          details: {
            list: "/api/v1/objects",
            collections: "/api/v1/collections/{ca|crl|dcrl}/items",
            metadata: "/api/v1/objects/{objectKey}/metadata",
            upload: "/api/v1/crls",
          },
        });
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
