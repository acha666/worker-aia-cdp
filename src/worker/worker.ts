import { initializePkijsEngine } from "./pki/pkijs";
import type { Env } from "./env";
import { apiRouter } from "./api/v2/server";

initializePkijsEngine();

export default {
  async fetch(
    req: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
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
