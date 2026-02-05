/**
 * ts-rest Server Implementation
 * Connects the API contract to handler implementations
 */

import { apiContract } from "@contracts/api";
import { createServerRouter } from "./router";
import { listCertificates, getCertificate } from "./certificates";
import { listCrls, getCrl, uploadCrl } from "./crls";
import { getStats, getHealth } from "./stats";

/**
 * Create the API server router with all handlers
 */
export const apiRouter = createServerRouter(apiContract, {
  certificates: {
    list: listCertificates,
    get: getCertificate,
  },
  crls: {
    list: listCrls,
    get: getCrl,
    upload: uploadCrl,
  },
  stats: {
    get: getStats,
  },
  health: {
    get: getHealth,
  },
});

export { apiContract };
