/**
 * Shared API Contracts
 *
 * This module provides type-safe API contracts using ts-rest for
 * contract-first API development between web and worker.
 *
 * Usage in worker:
 *   import { apiContract } from "@contracts";
 *   // Use with ts-rest server adapters
 *
 * Usage in web:
 *   import { apiContract } from "@contracts";
 *   import { initClient } from "@ts-rest/core";
 *   const client = initClient(apiContract, { baseUrl: "/api/v2" });
 */

// Export the main API contract
export { apiContract, type ApiContract } from "./api";

// Export all schemas for validation
export * from "./schemas";
