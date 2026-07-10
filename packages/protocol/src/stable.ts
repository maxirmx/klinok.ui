function normalized(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(normalized);
  return Object.keys(value)
    .sort()
    .reduce<Record<string, unknown>>((result, key) => {
      const child = (value as Record<string, unknown>)[key];
      if (child !== undefined) result[key] = normalized(child);
      return result;
    }, {});
}

export function stableSerialize(value: unknown): string {
  return JSON.stringify(normalized(value));
}

export function eventSigningValue(event: { signature?: unknown } & Record<string, unknown>): string {
  const unsigned = { ...event };
  delete unsigned.signature;
  return stableSerialize(unsigned);
}
