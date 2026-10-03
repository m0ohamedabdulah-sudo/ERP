import { Decimal } from "@prisma/client/runtime/library";

/**
 * Money/decimal helpers. Prisma returns Decimal objects; JSON responses
 * must carry plain numbers, so services convert at the DTO boundary.
 */

type DecimalLike = Decimal | number | string | null | undefined;

/** Convert a Prisma Decimal (or number/string) to a plain number. */
export function d2n(v: DecimalLike): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return v;
  if (typeof v === "string") return Number(v);
  return v.toNumber();
}

/** Nullable variant — preserves null instead of coercing to 0. */
export function d2nOrNull(v: DecimalLike): number | null {
  if (v === null || v === undefined) return null;
  return d2n(v);
}

/** Round to 2 decimal places (currency rounding). */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
