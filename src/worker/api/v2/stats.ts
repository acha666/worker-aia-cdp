/**
 * API v2 - Stats and Health Handlers
 */

import type { RouteHandler } from "../../env";
import type { StatsResult, HealthResult, CertificateStatusState, CrlStatusState } from "./types";
import { jsonSuccess } from "./response";
import { getCacheControlHeader } from "../../cache/config";

const VERSION = "2.0.0";

/**
 * GET /api/v2/stats
 * Get statistics about stored objects
 */
export const getStats: RouteHandler = async (_req, env) => {
  const now = Date.now();

  // Initialize counters
  const stats: StatsResult = {
    certificates: {
      total: 0,
      byStatus: {
        valid: 0,
        expired: 0,
        "not-yet-valid": 0,
      },
    },
    crls: {
      total: 0,
      full: 0,
      delta: 0,
      byStatus: {
        current: 0,
        stale: 0,
        expired: 0,
      },
      totalRevocations: 0,
    },
    storage: {
      totalSize: 0,
      byPrefix: {
        ca: 0,
        crl: 0,
        dcrl: 0,
      },
    },
  };

  // List all objects
  const prefixes = ["ca/", "crl/", "dcrl/"];

  for (const prefix of prefixes) {
    let cursor: string | undefined;
    do {
      const list = await env.STORE.list({
        prefix,
        cursor,
        include: ["customMetadata"],
      } as R2ListOptions);

      for (const object of list.objects) {
        const metadata = (object as { customMetadata?: Record<string, string> }).customMetadata;
        const size = object.size;

        // Update storage stats
        stats.storage.totalSize += size;
        if (prefix === "ca/") {
          stats.storage.byPrefix.ca += size;
        } else if (prefix === "crl/") {
          stats.storage.byPrefix.crl += size;
        } else if (prefix === "dcrl/") {
          stats.storage.byPrefix.dcrl += size;
        }

        // Process certificates
        if (prefix === "ca/" && isCertFile(object.key)) {
          stats.certificates.total++;

          const notBefore = metadata?.summaryNotBefore ?? metadata?.notBefore;
          const notAfter = metadata?.summaryNotAfter ?? metadata?.notAfter;
          const status = computeCertStatus(now, notBefore, notAfter);
          stats.certificates.byStatus[status]++;
        }

        // Process CRLs
        if ((prefix === "crl/" || prefix === "dcrl/") && isCrlFile(object.key)) {
          stats.crls.total++;

          if (prefix === "dcrl/") {
            stats.crls.delta++;
          } else {
            stats.crls.full++;
          }

          const thisUpdate = metadata?.summaryThisUpdate ?? metadata?.thisUpdate;
          const nextUpdate = metadata?.summaryNextUpdate ?? metadata?.nextUpdate;
          const status = computeCrlStatus(now, thisUpdate, nextUpdate);
          stats.crls.byStatus[status]++;

          // Count revocations
          const revokedCount = parseInt(metadata?.revokedCount ?? "0", 10) || 0;
          stats.crls.totalRevocations += revokedCount;
        }
      }

      cursor = list.truncated ? list.cursor : undefined;
    } while (cursor);
  }

  return jsonSuccess(stats, {
    headers: { "Cache-Control": getCacheControlHeader("list") },
  });
};

/**
 * GET /api/v2/health
 * Health check endpoint
 */
export const getHealth: RouteHandler = async (_req, env) => {
  const checks: HealthResult["checks"] = {};
  let overallStatus: HealthResult["status"] = "healthy";

  // Check R2 storage
  const storageStart = Date.now();
  try {
    await env.STORE.list({ limit: 1 });
    checks.storage = {
      status: "ok",
      latencyMs: Date.now() - storageStart,
    };
  } catch {
    checks.storage = {
      status: "error",
      latencyMs: Date.now() - storageStart,
    };
    overallStatus = "unhealthy";
  }

  // Check cache (always ok for edge cache)
  checks.cache = { status: "ok" };

  const result: HealthResult = {
    status: overallStatus,
    version: VERSION,
    checks,
  };

  const httpStatus = overallStatus === "unhealthy" ? 503 : 200;

  return jsonSuccess(result, {
    status: httpStatus,
    headers: { "Cache-Control": "no-cache" },
  });
};

// =============================================================================
// Helper Functions
// =============================================================================

function isCertFile(key: string): boolean {
  return (
    key.endsWith(".crt") ||
    key.endsWith(".cer") ||
    key.endsWith(".der") ||
    key.endsWith(".crt.pem") ||
    key.endsWith(".cer.pem")
  );
}

function isCrlFile(key: string): boolean {
  return key.endsWith(".crl") || key.endsWith(".crl.pem");
}

function computeCertStatus(
  now: number,
  notBefore?: string,
  notAfter?: string
): CertificateStatusState {
  if (notBefore) {
    const nbDate = new Date(notBefore);
    if (now < nbDate.getTime()) {
      return "not-yet-valid";
    }
  }
  if (notAfter) {
    const naDate = new Date(notAfter);
    if (now > naDate.getTime()) {
      return "expired";
    }
  }
  return "valid";
}

function computeCrlStatus(now: number, thisUpdate?: string, nextUpdate?: string): CrlStatusState {
  if (nextUpdate) {
    const nuDate = new Date(nextUpdate);
    if (now > nuDate.getTime()) {
      return "expired";
    }

    if (thisUpdate) {
      const tuDate = new Date(thisUpdate);
      const validityPeriod = nuDate.getTime() - tuDate.getTime();
      const elapsed = now - tuDate.getTime();
      if (elapsed > validityPeriod * 0.8) {
        return "stale";
      }
    }
  }
  return "current";
}
