import { initializePkijsEngine } from "./pki/pkijs";
import type { Env } from "./env";
import { jsonError } from "./utils/json-response";
import {
  listCertificates,
  getCertificate,
  listCrls,
  getCrl,
  uploadCrl,
  getStats,
  getHealth,
} from "./api/v2";

initializePkijsEngine();

export default {
  async fetch(
    req: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    const { method } = req;
    const url = new URL(req.url);

    try {
      // =======================================================================
      // API v2 Routes
      // =======================================================================

      // Certificates
      if (method === "GET" && url.pathname === "/api/v2/certificates") {
        return listCertificates(req, env, ctx);
      }
      if (
        method === "GET" &&
        /^\/api\/v2\/certificates\/[^/]+$/.test(url.pathname)
      ) {
        return getCertificate(req, env, ctx);
      }

      // CRLs
      if (method === "GET" && url.pathname === "/api/v2/crls") {
        return listCrls(req, env, ctx);
      }
      if (method === "GET" && /^\/api\/v2\/crls\/[^/]+$/.test(url.pathname)) {
        return getCrl(req, env, ctx);
      }
      if (method === "POST" && url.pathname === "/api/v2/crls") {
        return uploadCrl(req, env, ctx);
      }

      // Stats and Health
      if (method === "GET" && url.pathname === "/api/v2/stats") {
        return getStats(req, env, ctx);
      }
      if (method === "GET" && url.pathname === "/api/v2/health") {
        return getHealth(req, env, ctx);
      }

      // =======================================================================
      // Deprecated endpoints
      // =======================================================================

      if (["/api/list", "/meta", "/crl"].includes(url.pathname)) {
        return jsonError(
          410,
          "deprecated_endpoint",
          "This endpoint has moved. Use /api/v2/* equivalents instead.",
          {
            details: {
              certificates: "/api/v2/certificates",
              crls: "/api/v2/crls",
              stats: "/api/v2/stats",
              health: "/api/v2/health",
            },
          },
        );
      }

      return env.ASSETS.fetch(req);
    } catch (error) {
      console.error("Unhandled error:", error);
      return new Response(
        JSON.stringify({ error: "internal_error", detail: String(error) }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  },
} satisfies ExportedHandler<Env>;
