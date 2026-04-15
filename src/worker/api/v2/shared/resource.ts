export const PEM_SUFFIX = ".pem";

export function stripPemSuffix(value: string): string {
  return value.endsWith(PEM_SUFFIX) ? value.slice(0, -PEM_SUFFIX.length) : value;
}

export function baseFilenameFromKey(key: string, prefix: string): string {
  const canonicalKey = stripPemSuffix(key);
  return canonicalKey.startsWith(prefix) ? canonicalKey.slice(prefix.length) : canonicalKey;
}

export function stripKnownPrefix(value: string, prefixes: readonly string[]): string {
  for (const prefix of prefixes) {
    if (value.startsWith(prefix)) {
      return value.slice(prefix.length);
    }
  }
  return value;
}

export function includeField(include: Set<string>, field: string): boolean {
  return include.size === 0 || include.has(field);
}
