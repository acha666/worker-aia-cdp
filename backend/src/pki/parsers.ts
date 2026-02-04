import { fromBER, OctetString, Integer, Sequence } from "asn1js";
import * as pkijs from "pkijs";
import { describeName, toHex } from "./utils";

export function parseCertificate(der: ArrayBuffer) {
  const asn1 = fromBER(der);
  if (asn1.offset === -1) {throw new Error("Bad certificate DER");}
  return new pkijs.Certificate({ schema: asn1.result });
}

export function parseCRL(der: ArrayBuffer) {
  const asn1 = fromBER(der);
  if (asn1.offset === -1) {throw new Error("Bad CRL DER");}
  return new pkijs.CertificateRevocationList({ schema: asn1.result });
}

export function getCN(cert: pkijs.Certificate): string | undefined {
  for (const rdn of cert.subject.typesAndValues) {
    if (rdn.type === "2.5.4.3") {return rdn.value.valueBlock.value;}
  }
  return undefined;
}

export function getSKIHex(cert: pkijs.Certificate): string | undefined {
  const extension = cert.extensions?.find((ext) => ext.extnID === "2.5.29.14");
  if (!extension) {return undefined;}
  const asn1 = fromBER(extension.extnValue.valueBlock.valueHex);
  const raw = asn1.result as OctetString;
  return toHex(raw.valueBlock.valueHex);
}

export function getCRLAKIHex(
  crl: pkijs.CertificateRevocationList,
): string | undefined {
  const extension = crl.crlExtensions?.extensions.find(
    (ext) => ext.extnID === "2.5.29.35",
  );
  if (!extension) {return undefined;}
  const asn1 = fromBER(extension.extnValue.valueBlock.valueHex);
  const sequence = asn1.result as Sequence;
  const first = sequence.valueBlock.value[0];
  if (first?.idBlock.tagClass !== 3 || first.idBlock.tagNumber !== 0)
    {return undefined;}
  return toHex(
    (first as unknown as { valueBlock: { valueHex: ArrayBuffer } }).valueBlock
      .valueHex,
  );
}

export function getCRLNumber(
  crl: pkijs.CertificateRevocationList,
): bigint | undefined {
  const extension = crl.crlExtensions?.extensions.find(
    (ext) => ext.extnID === "2.5.29.20",
  );
  if (!extension) {return undefined;}
  const asn1 = fromBER(extension.extnValue.valueBlock.valueHex);
  const integer = asn1.result as Integer;
  const bytes = new Uint8Array(integer.valueBlock.valueHex);
  let value = 0n;
  for (const byte of bytes) {value = (value << 8n) + BigInt(byte);}
  return value;
}

export function getDeltaBaseCRLNumber(
  crl: pkijs.CertificateRevocationList,
): bigint | undefined {
  const extension = crl.crlExtensions?.extensions.find(
    (ext) => ext.extnID === "2.5.29.27",
  );
  if (!extension) {return undefined;}
  const asn1 = fromBER(extension.extnValue.valueBlock.valueHex);
  const integer = asn1.result as Integer;
  const bytes = new Uint8Array(integer.valueBlock.valueHex);
  let value = 0n;
  for (const byte of bytes) {value = (value << 8n) + BigInt(byte);}
  return value;
}

export function isDeltaCRL(crl: pkijs.CertificateRevocationList): boolean {
  return getDeltaBaseCRLNumber(crl) !== undefined;
}

export function friendlyNameFromCert(cert: pkijs.Certificate): string {
  const cn = getCN(cert);
  if (cn) {return cn.replace(/[^\w.-]+/g, "").replace(/\s+/g, "");}
  const ski = getSKIHex(cert);
  return ski ? `CA-${ski.slice(0, 16)}` : `CA-${Date.now()}`;
}

export function describeRelativeName(name: pkijs.RelativeDistinguishedNames) {
  return describeName(name);
}
