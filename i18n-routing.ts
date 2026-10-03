/**
 * Shared locale routing config (imported by both middleware.ts and i18n.ts).
 * Kept separate from i18n.ts so the Edge middleware never pulls in
 * Node-only modules.
 */
export const routing = {
  locales: ["ar", "en"],
  defaultLocale: "ar",
  // Always prefix: /ar/... and /en/... — no unprefixed pages.
  localePrefix: "always",
} as const;

export type Locale = (typeof routing.locales)[number];

export const isLocale = (v: unknown): v is Locale =>
  typeof v === "string" &&
  (routing.locales as readonly string[]).includes(v);
