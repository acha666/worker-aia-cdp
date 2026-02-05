export type ExtensionStatus = "parsed" | "unparsed" | "error";

export interface ExtensionDetail<T = unknown> {
  oid: string;
  name: string | null;
  critical: boolean;
  status: ExtensionStatus;
  value?: T;
  rawHex?: string | null;
  error?: string | null;
}
