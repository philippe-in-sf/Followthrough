export type PersonNameParts = {
  firstName: string;
  lastName: string;
};

function compactWhitespace(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function formatPersonName(firstName: string, lastName = "") {
  return [compactWhitespace(firstName), compactWhitespace(lastName)].filter(Boolean).join(" ");
}

export function parsePersonName(value: string): PersonNameParts | null {
  const compact = compactWhitespace(value);
  if (!compact) return null;

  const separator = compact.search(/\s/);
  if (separator === -1) {
    return { firstName: compact, lastName: "" };
  }

  return {
    firstName: compact.slice(0, separator),
    lastName: compact.slice(separator + 1).trim(),
  };
}

export function parsePersonNameList(value: string) {
  return value
    .split(/[\n,;]+/)
    .map(parsePersonName)
    .filter((name): name is PersonNameParts => name !== null);
}

export function personNameKey(firstName: string, lastName = "") {
  return formatPersonName(firstName, lastName).toLowerCase();
}
