/**
 * ts-rest Cloudflare Worker Adapter
 * Provides routing and type-safe handler execution for ts-rest contracts
 */

import type { AppRoute, AppRouter } from "@ts-rest/core";
import type { Env, RouteHandler } from "../../env";
import { jsonError } from "./response";

type ServerRouter<T extends AppRouter> = {
  [K in keyof T]: T[K] extends AppRouter
    ? ServerRouter<T[K]>
    : T[K] extends AppRoute
      ? RouteHandler
      : never;
};

interface RouterOptions {
  basePath?: string;
}

/**
 * Create a ts-rest compatible router for Cloudflare Workers
 */
export function createServerRouter<T extends AppRouter>(
  _contract: T,
  handlers: ServerRouter<T>,
  _options: RouterOptions = {},
): {
  handlers: ServerRouter<T>;
  handle: (
    req: Request,
    env: Env,
    ctx: ExecutionContext,
  ) => Promise<Response | null>;
} {
  const routeMap = new Map<
    string,
    { method: string; pattern: RegExp; handler: RouteHandler }
  >();

  // Build route map from contract and handlers
  function buildRoutes(
    contract: AppRouter,
    handlerObj: Record<string, unknown>,
    prefix = "",
  ) {
    for (const [key, value] of Object.entries(contract)) {
      const handler = handlerObj[key];

      if (isAppRoute(value)) {
        // This is a route definition
        const fullPath = prefix + value.path;
        const pattern = pathToRegex(fullPath);
        const method = value.method.toUpperCase();

        if (typeof handler === "function") {
          routeMap.set(`${method}:${fullPath}`, {
            method,
            pattern,
            handler: handler as RouteHandler,
          });
        }
      } else if (typeof value === "object" && value !== null) {
        // This is a nested router
        buildRoutes(
          value as AppRouter,
          handler as Record<string, unknown>,
          prefix,
        );
      }
    }
  }

  buildRoutes(_contract, handlers as Record<string, unknown>);

  return {
    handlers,
    handle: async (
      req: Request,
      env: Env,
      ctx: ExecutionContext,
    ): Promise<Response | null> => {
      const url = new URL(req.url);
      const method = req.method.toUpperCase();

      // Find matching route
      for (const [, route] of routeMap) {
        if (route.method === method && route.pattern.test(url.pathname)) {
          try {
            return await route.handler(req, env, ctx);
          } catch (error) {
            console.error("Handler error:", error);
            return jsonError(
              500,
              "internal_error",
              "An unexpected error occurred",
            );
          }
        }
      }

      // No matching route found
      return null;
    },
  };
}

/**
 * Check if a value is an AppRoute
 */
function isAppRoute(value: unknown): value is AppRoute {
  return (
    typeof value === "object" &&
    value !== null &&
    "method" in value &&
    "path" in value &&
    "responses" in value
  );
}

/**
 * Convert a path pattern to a regex
 * e.g., "/api/v2/certificates/:id" -> /^\/api\/v2\/certificates\/[^\/]+$/
 */
function pathToRegex(path: string): RegExp {
  const regexStr = path
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&") // Escape special chars
    .replace(/:(\w+)/g, "[^/]+"); // Replace :param with [^/]+ (unescaped colon)
  return new RegExp(`^${regexStr}$`);
}

/**
 * Extract path parameters from a URL
 */
export function extractPathParams(
  path: string,
  pattern: string,
): Record<string, string> {
  const params: Record<string, string> = {};
  const pathParts = path.split("/");
  const patternParts = pattern.split("/");

  for (let i = 0; i < patternParts.length; i++) {
    if (patternParts[i].startsWith(":")) {
      const paramName = patternParts[i].slice(1);
      params[paramName] = decodeURIComponent(pathParts[i]);
    }
  }

  return params;
}

/**
 * Get the ID parameter from a request URL
 * Extracts the last path segment as the ID
 */
export function getIdFromPath(url: URL): string {
  const parts = url.pathname.split("/").filter(Boolean);
  return decodeURIComponent(parts[parts.length - 1]);
}
