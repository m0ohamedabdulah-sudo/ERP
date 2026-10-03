/**
 * Unit tests for modules/recruitment/recruitment.schema.ts — Zod validation, no DB.
 */
import { describe, expect, it } from "vitest";
import {
  candidateQuerySchema,
  createCandidateSchema,
  hireCandidateSchema,
  scheduleInterviewSchema,
  statusTransitionSchema,
  updateCandidateSchema,
} from "../../modules/recruitment/recruitment.schema";

const UUID = "11111111-2222-4333-8444-555555555555";
const UUID2 = "66666666-7777-4888-8999-000000000000";

type LooseRecord = Record<string, unknown>;

function validCreate(over: LooseRecord = {}): LooseRecord {
  return {
    nameAr: "أحمد محمد",
    nameEn: "Ahmed Mohamed",
    nationalId: "29001011234567",
    phone: "01012345678",
    email: "ahmed@example.com",
    birthDate: "1990-01-01",
    militaryStatus: "COMPLETED",
    desiredPositionId: UUID,
    desiredSiteId: UUID2,
    source: "WALK_IN",
    ...over,
  };
}

describe("createCandidateSchema", () => {
  it("accepts a valid candidate", () => {
    const parsed = createCandidateSchema.parse(validCreate());
    expect(parsed.nameAr).toBe("أحمد محمد");
    expect(parsed.nationalId).toBe("29001011234567");
    expect(parsed.militaryStatus).toBe("COMPLETED");
  });

  it("applies defaults for militaryStatus and source", () => {
    const parsed = createCandidateSchema.parse({
      nameAr: "أحمد",
      nameEn: "Ahmed",
      nationalId: "29001011234567",
    });
    expect(parsed.militaryStatus).toBe("PENDING");
    expect(parsed.source).toBe("WALK_IN");
    expect(parsed.phone).toBeUndefined();
  });

  it("rejects a bad nationalId", () => {
    expect(() =>
      createCandidateSchema.parse(validCreate({ nationalId: "12345" })),
    ).toThrow(/nationalId must be a 14-digit number/);
    expect(() =>
      createCandidateSchema.parse(validCreate({ nationalId: "2900101123456a" })),
    ).toThrow(/nationalId must be a 14-digit number/);
  });

  it("rejects a bad Egyptian phone", () => {
    expect(() =>
      createCandidateSchema.parse(validCreate({ phone: "201012345678" })),
    ).toThrow(/phone must be an Egyptian mobile number/);
  });

  it("rejects an impossible birthDate", () => {
    expect(() =>
      createCandidateSchema.parse(validCreate({ birthDate: "1990-02-30" })),
    ).toThrow(/Invalid calendar date/);
  });

  it("rejects a malformed date string", () => {
    expect(() =>
      createCandidateSchema.parse(validCreate({ birthDate: "1990-13-01" })),
    ).toThrow();
  });

  it("rejects invalid enum values", () => {
    expect(() =>
      createCandidateSchema.parse(validCreate({ militaryStatus: "DONE" })),
    ).toThrow();
    expect(() =>
      createCandidateSchema.parse(validCreate({ source: "NEWSPAPER" })),
    ).toThrow();
  });

  it("rejects missing required names", () => {
    expect(() =>
      createCandidateSchema.parse(validCreate({ nameAr: "" })),
    ).toThrow();
    expect(() =>
      createCandidateSchema.parse({ nameEn: "Ahmed", nationalId: "29001011234567" }),
    ).toThrow();
  });

  it("rejects a bad desiredPositionId", () => {
    expect(() =>
      createCandidateSchema.parse(validCreate({ desiredPositionId: "nope" })),
    ).toThrow();
  });
});

describe("updateCandidateSchema", () => {
  it("accepts partial updates and null-clearing", () => {
    const parsed = updateCandidateSchema.parse({ phone: "01099999999", cvUrl: null });
    expect(parsed.phone).toBe("01099999999");
    expect(parsed.cvUrl).toBeNull();
    expect(parsed.nameAr).toBeUndefined();
  });

  it("accepts an empty update", () => {
    expect(updateCandidateSchema.parse({})).toEqual({});
  });
});

describe("candidateQuerySchema", () => {
  it("applies pagination defaults", () => {
    const parsed = candidateQuerySchema.parse({});
    expect(parsed.page).toBe(1);
    expect(parsed.pageSize).toBe(20);
  });

  it("coerces page/pageSize from query strings", () => {
    const parsed = candidateQuerySchema.parse({ page: "3", pageSize: "50" });
    expect(parsed.page).toBe(3);
    expect(parsed.pageSize).toBe(50);
  });

  it("turns an empty search into undefined", () => {
    const parsed = candidateQuerySchema.parse({ search: "" });
    expect(parsed.search).toBeUndefined();
  });

  it("accepts status and siteId filters", () => {
    const parsed = candidateQuerySchema.parse({ status: "SCREENING", siteId: UUID });
    expect(parsed.status).toBe("SCREENING");
    expect(parsed.siteId).toBe(UUID);
  });

  it("rejects unknown statuses and oversized pages", () => {
    expect(() => candidateQuerySchema.parse({ status: "HIRED_TOMORROW" })).toThrow();
    expect(() => candidateQuerySchema.parse({ pageSize: 500 })).toThrow();
    expect(() => candidateQuerySchema.parse({ page: 0 })).toThrow();
  });
});

describe("scheduleInterviewSchema", () => {
  const future = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
  const past = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

  it("accepts a future interview", () => {
    const parsed = scheduleInterviewSchema.parse({
      scheduledAt: future,
      location: "Head office",
    });
    expect(parsed.scheduledAt).toBeInstanceOf(Date);
    expect(parsed.interviewerId).toBeUndefined();
  });

  it("rejects a past interview", () => {
    expect(() =>
      scheduleInterviewSchema.parse({ scheduledAt: past }),
    ).toThrow(/scheduledAt must be in the future/);
  });

  it("rejects a non-datetime string", () => {
    expect(() =>
      scheduleInterviewSchema.parse({ scheduledAt: "tomorrow" }),
    ).toThrow();
  });
});

describe("statusTransitionSchema", () => {
  it("accepts a valid status", () => {
    expect(statusTransitionSchema.parse({ to: "APPROVED" }).to).toBe("APPROVED");
  });

  it("rejects an unknown status", () => {
    expect(() => statusTransitionSchema.parse({ to: "EMPLOYED" })).toThrow();
  });
});

describe("hireCandidateSchema", () => {
  it("defaults overrideCompliance to false", () => {
    const parsed = hireCandidateSchema.parse({});
    expect(parsed.overrideCompliance).toBe(false);
    expect(parsed.siteId).toBeUndefined();
  });

  it("accepts explicit hire options", () => {
    const parsed = hireCandidateSchema.parse({
      siteId: UUID,
      shiftId: UUID2,
      salary: 8000,
      overrideCompliance: true,
    });
    expect(parsed.siteId).toBe(UUID);
    expect(parsed.salary).toBe(8000);
    expect(parsed.overrideCompliance).toBe(true);
  });

  it("rejects a non-positive salary", () => {
    expect(() => hireCandidateSchema.parse({ salary: -5 })).toThrow(
      /salary must be positive/,
    );
    expect(() => hireCandidateSchema.parse({ salary: 0 })).toThrow(
      /salary must be positive/,
    );
  });
});
