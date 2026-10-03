import { describe, expect, it } from "vitest";
import {
  clientQuerySchema,
  createClientSchema,
  updateClientSchema,
} from "../../modules/clients/client.schema";

describe("createClientSchema", () => {
  it("accepts a valid payload and applies defaults", () => {
    const result = createClientSchema.parse({
      companyNameAr: "شركة الأمان",
      companyNameEn: "Security Co",
      email: "info@example.com",
      contacts: [{ name: "John Doe", isPrimary: true }],
    });
    expect(result.companyNameEn).toBe("Security Co");
    expect(result.status).toBe("ACTIVE");
    expect(result.contacts).toHaveLength(1);
    expect(result.contacts[0]?.isPrimary).toBe(true);
  });

  it("defaults contacts to an empty array and isPrimary to false", () => {
    const result = createClientSchema.parse({
      companyNameAr: "شركة",
      companyNameEn: "Company",
      contacts: [{ name: "Jane" }],
    });
    expect(result.contacts).toHaveLength(1);
    expect(result.contacts[0]?.isPrimary).toBe(false);
  });

  it("allows optional fields to be absent", () => {
    const result = createClientSchema.parse({
      companyNameAr: "شركة",
      companyNameEn: "Company",
    });
    expect(result.email).toBeUndefined();
    expect(result.notes).toBeUndefined();
    expect(result.contacts).toEqual([]);
  });

  it("rejects a missing companyNameEn", () => {
    expect(() =>
      createClientSchema.parse({ companyNameAr: "شركة" }),
    ).toThrow();
  });

  it("rejects a missing companyNameAr", () => {
    expect(() =>
      createClientSchema.parse({ companyNameEn: "Company" }),
    ).toThrow();
  });

  it("rejects an invalid email", () => {
    expect(() =>
      createClientSchema.parse({
        companyNameAr: "شركة",
        companyNameEn: "Company",
        email: "not-an-email",
      }),
    ).toThrow();
  });

  it("rejects an invalid contact email", () => {
    expect(() =>
      createClientSchema.parse({
        companyNameAr: "شركة",
        companyNameEn: "Company",
        contacts: [{ name: "Jane", email: "bad" }],
      }),
    ).toThrow();
  });

  it("rejects an invalid status", () => {
    expect(() =>
      createClientSchema.parse({
        companyNameAr: "شركة",
        companyNameEn: "Company",
        status: "ARCHIVED",
      }),
    ).toThrow();
  });

  it("rejects a contact without a name", () => {
    expect(() =>
      createClientSchema.parse({
        companyNameAr: "شركة",
        companyNameEn: "Company",
        contacts: [{ name: "" }],
      }),
    ).toThrow();
  });

  it("rejects more than 20 contacts", () => {
    const contacts = Array.from({ length: 21 }, (_, i) => ({
      name: `Contact ${i}`,
    }));
    expect(() =>
      createClientSchema.parse({
        companyNameAr: "شركة",
        companyNameEn: "Company",
        contacts,
      }),
    ).toThrow();
  });
});

describe("updateClientSchema", () => {
  it("allows a partial update", () => {
    const result = updateClientSchema.parse({ phone: "01001234567" });
    expect(result.phone).toBe("01001234567");
    expect(result.companyNameEn).toBeUndefined();
    expect(result.status).toBeUndefined();
  });

  it("accepts an empty object", () => {
    const result = updateClientSchema.parse({});
    expect(result).toEqual({});
  });

  it("rejects an invalid status", () => {
    expect(() => updateClientSchema.parse({ status: "DELETED" })).toThrow();
  });

  it("rejects an empty companyNameEn", () => {
    expect(() => updateClientSchema.parse({ companyNameEn: "" })).toThrow();
  });
});

describe("clientQuerySchema", () => {
  it("coerces string page/pageSize and applies defaults", () => {
    const result = clientQuerySchema.parse({ page: "2", pageSize: "50" });
    expect(result.page).toBe(2);
    expect(result.pageSize).toBe(50);
    expect(result.search).toBeUndefined();
    expect(result.status).toBeUndefined();
  });

  it("defaults page to 1 and pageSize to 20", () => {
    const result = clientQuerySchema.parse({});
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(20);
  });

  it("rejects non-positive page values", () => {
    expect(() => clientQuerySchema.parse({ page: "0" })).toThrow();
    expect(() => clientQuerySchema.parse({ page: "-3" })).toThrow();
  });

  it("accepts a valid status filter", () => {
    const result = clientQuerySchema.parse({ status: "BLACKLISTED" });
    expect(result.status).toBe("BLACKLISTED");
  });
});
