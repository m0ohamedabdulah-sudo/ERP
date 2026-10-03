/**
 * Compliance pure logic (no Prisma, no I/O) — unit-testable without a DB.
 *
 * Document lifecycle:
 *   VALID        — expiresAt is null or far in the future
 *   EXPIRING_SOON — expiresAt within EXPIRY_WARNING_DAYS (inclusive)
 *   EXPIRED      — expiresAt before today
 *   MISSING      — required document type has no row (derived, never stored)
 */

export const EXPIRY_WARNING_DAYS = 30;

/** How many days a sweep notification suppresses duplicates. */
export const NOTIFICATION_DEDUP_DAYS = 7;

export type DocumentStatusV = "VALID" | "EXPIRING_SOON" | "EXPIRED";

/**
 * Compute the status of a document from its expiry date.
 * - null expiresAt → VALID (never expires)
 * - expiresAt < start of today → EXPIRED
 * - expiresAt <= now + warningDays → EXPIRING_SOON
 * - otherwise → VALID
 */
export function computeDocumentStatus(
  expiresAt: Date | null,
  now: Date,
  warningDays: number = EXPIRY_WARNING_DAYS,
): DocumentStatusV {
  if (expiresAt === null) return "VALID";
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();
  if (expiresAt.getTime() < startOfToday) return "EXPIRED";
  const warningLimit = now.getTime() + warningDays * 24 * 60 * 60 * 1000;
  if (expiresAt.getTime() <= warningLimit) return "EXPIRING_SOON";
  return "VALID";
}

/**
 * Default expiry for a document issued at `issuedAt`, based on the
 * document type's validityMonths. null when the type never expires.
 * Preserves the day-of-month, clamped to the target month's last day
 * (e.g. Jan 31 + 1 month → Feb 28/29).
 */
export function defaultExpiresAt(
  issuedAt: Date,
  validityMonths: number | null,
): Date | null {
  if (validityMonths == null) return null;
  const day = issuedAt.getDate();
  const target = new Date(
    issuedAt.getFullYear(),
    issuedAt.getMonth() + validityMonths,
    1,
  );
  const lastDay = new Date(
    target.getFullYear(),
    target.getMonth() + 1,
    0,
  ).getDate();
  target.setDate(Math.min(day, lastDay));
  return target;
}

export type ComplianceReason = "valid" | "expired" | "expiring_soon";

/**
 * Per-document evaluation reused by both candidate and employee
 * compliance checks: VALID → "valid", everything else maps 1:1.
 */
export function evaluateDocumentReason(
  expiresAt: Date | null,
  now: Date,
  warningDays: number = EXPIRY_WARNING_DAYS,
): ComplianceReason {
  const status = computeDocumentStatus(expiresAt, now, warningDays);
  if (status === "EXPIRED") return "expired";
  if (status === "EXPIRING_SOON") return "expiring_soon";
  return "valid";
}

// ------------------------- Sweep notifications -------------------------

export interface ExpiringDocumentInfo {
  employeeId: string;
  employeeNameEn: string;
  employeeNameAr: string;
  documentTypeNameEn: string;
  documentTypeNameAr: string;
  expiresAt: Date;
  /** true when the document has already passed its expiry date */
  expired: boolean;
}

export interface ExpiryNotificationDraft {
  type: string;
  title: string;
  titleAr: string;
  body: string;
  bodyAr: string;
  relatedModule: string;
  relatedId: string;
}

/**
 * Build the broadcast notification for one expiring/expired document.
 * Pure — the service layer persists it (userId null = broadcast).
 */
export function buildExpiryNotification(
  doc: ExpiringDocumentInfo,
): ExpiryNotificationDraft {
  const dateStr = doc.expiresAt.toISOString().slice(0, 10);
  const en = `${doc.documentTypeNameEn} — ${doc.employeeNameEn}`;
  const ar = `${doc.documentTypeNameAr} — ${doc.employeeNameAr}`;
  return {
    type: doc.expired ? "DOCUMENT_EXPIRED" : "DOCUMENT_EXPIRING",
    title: doc.expired
      ? `Document expired: ${en}`
      : `Document expiring: ${en}`,
    titleAr: doc.expired ? `مستند منتهي: ${ar}` : `مستند على وشك الانتهاء: ${ar}`,
    body: doc.expired
      ? `${doc.documentTypeNameEn} for ${doc.employeeNameEn} expired on ${dateStr}.`
      : `${doc.documentTypeNameEn} for ${doc.employeeNameEn} expires on ${dateStr}.`,
    bodyAr: doc.expired
      ? `انتهى ${doc.documentTypeNameAr} الخاص بـ ${doc.employeeNameAr} بتاريخ ${dateStr}.`
      : `سينتهي ${doc.documentTypeNameAr} الخاص بـ ${doc.employeeNameAr} بتاريخ ${dateStr}.`,
    relatedModule: "compliance",
    relatedId: doc.employeeId,
  };
}

export interface RecentNotification {
  type: string;
  relatedId: string | null;
  isRead: boolean;
  createdAt: Date;
}

/**
 * Sweep dedup: skip the notification when an UNREAD notification with
 * the same type + relatedId already exists within the dedup window.
 */
export function shouldSkipExpiryNotification(
  recent: RecentNotification[],
  draft: { type: string; relatedId: string },
  now: Date,
  dedupDays: number = NOTIFICATION_DEDUP_DAYS,
): boolean {
  const cutoff = now.getTime() - dedupDays * 24 * 60 * 60 * 1000;
  return recent.some(
    (n) =>
      n.type === draft.type &&
      n.relatedId === draft.relatedId &&
      !n.isRead &&
      n.createdAt.getTime() >= cutoff,
  );
}
