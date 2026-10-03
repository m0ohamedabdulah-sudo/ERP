/**
 * Unit tests for modules/compliance/compliance.schema.ts — Zod validation, no DB.
 */
import { describe, expect, it } from "vitest";
import {
  createDocumentTypeSchema,
  documentQuerySchema,
  documentTypeQuerySchema,
  upsertCandidateDocumentSchema,
  upsertEmployeeDocumentSchema,
} from "../../modules/compliance/compliance.schema";

const UUID = "11111111-2222-4333-8444-555555555555";

type LooseRecord = Record<string, unknown>;

function validType(over: LooseRecord = {}): LooseRecord {
  return {
    code: "criminal_record",
    nameAr: "فيش جنائي",
    nameEn: "Criminal Record",
    requiredForHire: true,
    validityMonths: 3,
    isRecurring: true,
    ...over,
  };
}

function validDoc(over: LooseRecord = {}): LooseRecord {
  return {
    documentTypeId: UUID,
    documentNo: "CR-2026-001",
    issuedAt: "2026-09-01",
    expiresAt: "2026-12-01",
    fileUrl: "/uploads/docs/cr-001.pdf",
    notes: "Verified copy",
    ...over,
  };
}

describe("createDocumentTypeSchema", () => {
  it("accepts a valid document type", () => {
    const parsed = createDocumentTypeSchema.parse(validType());
    expect(parsed.code).toBe("criminal_record");
    expect(parsed.validityMonths).toBe(3);
  });

  it("applies defaults for requiredForHire and isRecurring", () => {
    const parsed = createDocumentTypeSchema.parse({
      code: "birth_certificate",
      nameAr: "شهادة ميلاد",
      nameEn: "Birth Certificate",
    });
    expect(parsed.requiredForHire).toBe(false);
    expect(parsed.isRecurring).toBe(true);
    expect(parsed.validityMonths).toBeUndefined(); // .nullish() omits to undefined
  });

  it("rejects non-snake_case codes", () => {
    expect(() =>
      createDocumentTypeSchema.parse(validType({ code: "Criminal-Record" })),
    ).toThrow();
    expect(() =>
      createDocumentTypeSchema.parse(validType({ code: "criminal record" })),
    ).toThrow();
  });

  it("rejects empty names and non-positive validity months", () => {
    expect(() =>
      createDocumentTypeSchema.parse(validType({ nameAr: "  " })),
    ).toThrow();
    expect(() =>
      createDocumentTypeSchema.parse(validType({ validityMonths: 0 })),
    ).toThrow();
    expect(() =>
      createDocumentTypeSchema.parse(validType({ validityMonths: -3 })),
    ).toThrow();
  });
});

describe("upsertCandidateDocumentSchema / upsertEmployeeDocumentSchema", () => {
  it("accepts a full document payload", () => {
    const parsed = upsertCandidateDocumentSchema.parse(validDoc());
    expect(parsed.documentTypeId).toBe(UUID);
    expect(parsed.documentNo).toBe("CR-2026-001");
    expect(parsed.issuedAt).toBeInstanceOf(Date);
  });

  it("accepts a minimal payload (all optional fields omitted → undefined)", () => {
    const parsed = upsertEmployeeDocumentSchema.parse({ documentTypeId: UUID });
    expect(parsed.documentNo).toBeUndefined();
    expect(parsed.issuedAt).toBeUndefined();
    expect(parsed.expiresAt).toBeUndefined();
    expect(parsed.fileUrl).toBeUndefined();
    // explicit null is still accepted (means "clear the stored value")
    const nulled = upsertEmployeeDocumentSchema.parse({
      documentTypeId: UUID,
      documentNo: null,
    });
    expect(nulled.documentNo).toBeNull();
  });

  it("rejects expiresAt before issuedAt", () => {
    expect(() =>
      upsertCandidateDocumentSchema.parse(
        validDoc({ issuedAt: "2026-09-01", expiresAt: "2026-08-01" }),
      ),
    ).toThrow(/on or after issuedAt/);
  });

  it("rejects malformed dates and non-existent calendar dates", () => {
    expect(() =>
      upsertEmployeeDocumentSchema.parse(validDoc({ issuedAt: "01-09-2026" })),
    ).toThrow();
    expect(() =>
      upsertCandidateDocumentSchema.parse(validDoc({ expiresAt: "2026-02-30" })),
    ).toThrow();
  });

  it("rejects an invalid documentTypeId", () => {
    expect(() =>
      upsertCandidateDocumentSchema.parse(validDoc({ documentTypeId: "nope" })),
    ).toThrow();
  });
});

describe("documentTypeQuerySchema", () => {
  it("applies pagination defaults", () => {
    const parsed = documentTypeQuerySchema.parse({});
    expect(parsed.page).toBe(1);
    expect(parsed.pageSize).toBe(20);
  });

  it("parses the requiredForHire string filter", () => {
    expect(documentTypeQuerySchema.parse({ requiredForHire: "true" }).requiredForHire).toBe(true);
    expect(documentTypeQuerySchema.parse({ requiredForHire: "false" }).requiredForHire).toBe(false);
  });
});

describe("documentQuerySchema", () => {
  it("applies pagination defaults and parses filters", () => {
    const parsed = documentQuerySchema.parse({
      status: "EXPIRED",
      documentTypeId: UUID,
      expiringWithinDays: "30",
      search: "CR-",
    });
    expect(parsed.page).toBe(1);
    expect(parsed.status).toBe("EXPIRED");
    expect(parsed.documentTypeId).toBe(UUID);
    expect(parsed.expiringWithinDays).toBe(30);
    expect(parsed.search).toBe("CR-");
  });

  it("rejects unknown and non-storable statuses", () => {
    // MISSING is derived, never stored — not a valid list filter
    expect(() => documentQuerySchema.parse({ status: "MISSING" })).toThrow();
    expect(() => documentQuerySchema.parse({ status: "BOGUS" })).toThrow();
  });
});
