import type { CrlType } from "../types";

export const CRL_PREFIX = "crl/";
export const DCRL_PREFIX = "dcrl/";

export function isCrlFile(key: string): boolean {
  return key.endsWith(".crl") || key.endsWith(".crl.pem");
}

export function listPrefixesByType(typeFilter: CrlType | null): string[] {
  const prefixes: string[] = [];
  if (!typeFilter || typeFilter === "full") {
    prefixes.push(CRL_PREFIX);
  }
  if (!typeFilter || typeFilter === "delta") {
    prefixes.push(DCRL_PREFIX);
  }
  return prefixes;
}
