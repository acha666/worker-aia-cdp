export const OID_DICTIONARY: Record<string, { short?: string; name: string }> = {
  "2.5.4.3": { short: "CN", name: "commonName" },
  "2.5.4.4": { short: "SN", name: "surname" },
  "2.5.4.5": { short: "serialNumber", name: "serialNumber" },
  "2.5.4.6": { short: "C", name: "countryName" },
  "2.5.4.7": { short: "L", name: "localityName" },
  "2.5.4.8": { short: "ST", name: "stateOrProvinceName" },
  "2.5.4.9": { short: "STREET", name: "streetAddress" },
  "2.5.4.10": { short: "O", name: "organizationName" },
  "2.5.4.11": { short: "OU", name: "organizationalUnitName" },
  "2.5.4.12": { short: "T", name: "title" },
  "2.5.4.13": { short: "DESCRIPTION", name: "description" },
  "2.5.4.15": { short: "BUSINESS", name: "businessCategory" },
  "2.5.4.17": { short: "POSTAL", name: "postalCode" },
  "1.2.840.113549.1.9.1": { short: "emailAddress", name: "emailAddress" },
  "0.9.2342.19200300.100.1.25": { short: "DC", name: "domainComponent" },
};

export const SIGNATURE_ALG_NAMES: Record<string, string> = {
  "1.2.840.113549.1.1.5": "sha1WithRSAEncryption",
  "1.2.840.113549.1.1.11": "sha256WithRSAEncryption",
  "1.2.840.113549.1.1.12": "sha384WithRSAEncryption",
  "1.2.840.113549.1.1.13": "sha512WithRSAEncryption",
  "1.2.840.10045.4.3.2": "ecdsa-with-SHA256",
  "1.2.840.10045.4.3.3": "ecdsa-with-SHA384",
  "1.2.840.10045.4.3.4": "ecdsa-with-SHA512",
};

export const KEY_ALG_NAMES: Record<string, string> = {
  "1.2.840.113549.1.1.1": "rsaEncryption",
  "1.2.840.10045.2.1": "ecPublicKey",
  "1.3.101.112": "Ed25519",
  "1.3.101.113": "Ed448",
};

export const EKU_NAMES: Record<string, string> = {
  "1.3.6.1.5.5.7.3.1": "serverAuth",
  "1.3.6.1.5.5.7.3.2": "clientAuth",
  "1.3.6.1.5.5.7.3.3": "codeSigning",
  "1.3.6.1.5.5.7.3.4": "emailProtection",
  "1.3.6.1.5.5.7.3.8": "timeStamping",
  "1.3.6.1.5.5.7.3.9": "OCSPSigning",
};

export const EXTENSION_NAMES: Record<string, string> = {
  "2.5.29.14": "Subject Key Identifier",
  "2.5.29.15": "Key Usage",
  "2.5.29.16": "Private Key Usage Period",
  "2.5.29.17": "Subject Alternative Name",
  "2.5.29.18": "Issuer Alternative Name",
  "2.5.29.19": "Basic Constraints",
  "2.5.29.20": "CRL Number",
  "2.5.29.21": "CRL Reason Code",
  "2.5.29.27": "Delta CRL Indicator",
  "2.5.29.28": "Issuing Distribution Point",
  "2.5.29.31": "CRL Distribution Points",
  "2.5.29.32": "Certificate Policies",
  "2.5.29.35": "Authority Key Identifier",
  "2.5.29.37": "Extended Key Usage",
  "1.3.6.1.5.5.7.1.1": "Authority Information Access",
  "1.3.6.1.5.5.7.1.11": "Subject Information Access",
  "1.3.6.1.5.5.7.1.12": "Logotype",
  "1.3.6.1.4.1.311.21.1": "Certificate Template Name",
  "1.3.6.1.4.1.311.21.4": "Next CRL Publish",
};

export const KEY_USAGE_FLAGS = [
  "digitalSignature",
  "nonRepudiation",
  "keyEncipherment",
  "dataEncipherment",
  "keyAgreement",
  "keyCertSign",
  "cRLSign",
  "encipherOnly",
  "decipherOnly",
];

export const CURVE_NAMES: Record<string, string> = {
  "1.2.840.10045.3.1.7": "P-256",
  "1.3.132.0.34": "P-384",
  "1.3.132.0.35": "P-521",
  "1.3.101.110": "Ed25519",
  "1.3.101.111": "Ed448",
};

export const CRL_REASON_CODES: Record<number, string> = {
  0: "unspecified",
  1: "keyCompromise",
  2: "caCompromise",
  3: "affiliationChanged",
  4: "superseded",
  5: "cessationOfOperation",
  6: "certificateHold",
  8: "removeFromCRL",
  9: "privilegeWithdrawn",
  10: "aaCompromise",
};
