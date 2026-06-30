export const DEFAULT_PORTAL_TIMEZONE = "America/St_Lucia" as const;
export const DEFAULT_PORTAL_LOCATION = "St. Lucia" as const;

export type PortalTimezoneOption = {
  value: string;
  label: string;
};

/** Curated IANA zones for TL Portal ops (Caribbean-first). */
export const PORTAL_TIMEZONE_OPTIONS: PortalTimezoneOption[] = [
  { value: "America/St_Lucia", label: "St. Lucia (AST, UTC−4)" },
  { value: "America/Barbados", label: "Barbados (AST, UTC−4)" },
  { value: "America/Port_of_Spain", label: "Trinidad & Tobago (AST, UTC−4)" },
  { value: "America/Grenada", label: "Grenada (AST, UTC−4)" },
  { value: "America/Dominica", label: "Dominica (AST, UTC−4)" },
  { value: "America/Antigua", label: "Antigua & Barbuda (AST, UTC−4)" },
  { value: "America/St_Vincent", label: "St. Vincent (AST, UTC−4)" },
  { value: "America/St_Kitts", label: "St. Kitts & Nevis (AST, UTC−4)" },
  { value: "America/Martinique", label: "Martinique (AST, UTC−4)" },
  { value: "America/Guadeloupe", label: "Guadeloupe (AST, UTC−4)" },
  { value: "America/Puerto_Rico", label: "Puerto Rico (AST, UTC−4)" },
  { value: "America/Jamaica", label: "Jamaica (EST, UTC−5)" },
  { value: "America/New_York", label: "US Eastern (ET)" },
  { value: "America/Chicago", label: "US Central (CT)" },
  { value: "America/Denver", label: "US Mountain (MT)" },
  { value: "America/Los_Angeles", label: "US Pacific (PT)" },
  { value: "UTC", label: "UTC" },
];

const ALLOWED_TIMEZONES = new Set(PORTAL_TIMEZONE_OPTIONS.map((o) => o.value));

export function isValidPortalTimezone(tz: string): boolean {
  const trimmed = tz.trim();
  if (!trimmed || !ALLOWED_TIMEZONES.has(trimmed)) return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: trimmed });
    return true;
  } catch {
    return false;
  }
}

export function portalTimezoneLabel(tz: string): string {
  return PORTAL_TIMEZONE_OPTIONS.find((o) => o.value === tz)?.label ?? tz;
}
