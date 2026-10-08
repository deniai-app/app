/** Postgres jsonb rejects U+0000 (22P05); web search results and imported exports can contain it. */
export function stringifyForJsonb(value: unknown) {
  return JSON.stringify(value, (_key, v) =>
    typeof v === "string" ? v.replaceAll("\u0000", "") : v,
  );
}

/** A JSON copy of `value` that Postgres accepts as jsonb. */
export function toJsonbSafe<T>(value: T): T {
  return JSON.parse(stringifyForJsonb(value)) as T;
}
