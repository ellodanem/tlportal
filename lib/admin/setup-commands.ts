const TOKEN_SOURCE = "\\{([a-zA-Z0-9_]+)\\}";

/** Replace `{imei}`, `{serial}`, and `{msisdn}` when the unit has a value. Unknown tokens stay put. */
export function applySetupCommandTokens(
  body: string,
  values: Record<string, string | null | undefined>,
): string {
  return body.replace(new RegExp(TOKEN_SOURCE, "g"), (match, key: string) => {
    const value = values[key.toLowerCase()];
    if (value == null || value.trim() === "") {
      return match;
    }
    return value.trim();
  });
}

export function hasUnresolvedSetupTokens(body: string): boolean {
  return new RegExp(TOKEN_SOURCE).test(body);
}
