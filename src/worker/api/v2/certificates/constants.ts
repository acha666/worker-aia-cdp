export const CERT_PREFIX = "ca/";

export const DER_CERT_PATTERN = /\.(crt|cer)$/i;

export function isCertificateFile(key: string): boolean {
  return (
    key.endsWith(".crt") ||
    key.endsWith(".cer") ||
    key.endsWith(".der") ||
    key.endsWith(".crt.pem") ||
    key.endsWith(".cer.pem")
  );
}
