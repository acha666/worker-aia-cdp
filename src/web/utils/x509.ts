import type { Name } from "@contracts/schemas";

export function formatName(name: Name): string {
  const rdns = name.rdnSequence
    .map((rdn) => rdn.attributes.map(formatAttribute).join("+"))
    .filter((entry) => entry.length > 0);
  return rdns.join(", ");
}

function formatAttribute(attribute: Name["rdnSequence"][number]["attributes"][number]) {
  const key = attribute.type.name ?? attribute.type.oid;
  const value = attribute.value.string ?? "";
  return `${key}=${value}`;
}
