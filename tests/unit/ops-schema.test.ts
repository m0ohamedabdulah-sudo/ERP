import { describe, expect, it } from "vitest";
import {
  employeeQuerySchema,
  createEmployeeSchema,
  updateEmployeeSchema,
} from "../../modules/employees/employee.schema";
import {
  siteQuerySchema,
  createSiteSchema,
  updateSiteSchema,
} from "../../modules/sites/site.schema";
import {
  boardQuerySchema,
  markAttendanceSchema,
} from "../../modules/attendance/attendance.schema";

const SITE_ID = "11111111-1111-1111-1111-111111111111";

describe("createEmployeeSchema", () => {
  it("accepts a valid payload", () => {
    const result = createEmployeeSchema.parse({
      fullNameAr: "أحمد محمد",
      fullNameEn: "Ahmed Mohamed",
      nationalId: "29001011234567",
      hiringDate: "2026-01-15",
      siteId: SITE_ID,
    });
    expect(result.fullNameAr).toBe("أحمد محمد");
    expect(result.mobile).toBeUndefined();
  });

  it("rejects a national ID that is not 14 digits", () => {
    expect(() =>
      createEmployeeSchema.parse({
        fullNameAr: "أحمد",
        fullNameEn: "Ahmed",
        nationalId: "123",
        hiringDate: "2026-01-15",
        siteId: SITE_ID,
      }),
    ).toThrow();
  });

  it("rejects a malformed hiring date", () => {
    expect(() =>
      createEmployeeSchema.parse({
        fullNameAr: "أحمد",
        fullNameEn: "Ahmed",
        nationalId: "29001011234567",
        hiringDate: "15-01-2026",
        siteId: SITE_ID,
      }),
    ).toThrow();
  });

  it("requires the site", () => {
    expect(() =>
      createEmployeeSchema.parse({
        fullNameAr: "أحمد",
        fullNameEn: "Ahmed",
        nationalId: "29001011234567",
        hiringDate: "2026-01-15",
      }),
    ).toThrow();
  });
});

describe("updateEmployeeSchema", () => {
  it("allows partial updates", () => {
    const result = updateEmployeeSchema.parse({ mobile: "01001234567" });
    expect(result.mobile).toBe("01001234567");
    expect(result.fullNameAr).toBeUndefined();
  });

  it("accepts null to clear the position", () => {
    const result = updateEmployeeSchema.parse({ positionId: null });
    expect(result.positionId).toBeNull();
  });
});

describe("employeeQuerySchema", () => {
  it("applies pagination defaults", () => {
    const result = employeeQuerySchema.parse({});
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(20);
  });
});

describe("createSiteSchema", () => {
  it("accepts a valid payload and defaults manpower to 0", () => {
    const result = createSiteSchema.parse({
      name: "Zia Mall",
      sectorId: SITE_ID,
    });
    expect(result.requiredManpower).toBe(0);
  });

  it("rejects negative manpower", () => {
    expect(() =>
      createSiteSchema.parse({
        name: "Zia Mall",
        sectorId: SITE_ID,
        requiredManpower: -5,
      }),
    ).toThrow();
  });
});

describe("siteQuerySchema", () => {
  it("applies pagination defaults", () => {
    const result = siteQuerySchema.parse({});
    expect(result.page).toBe(1);
  });
});

describe("updateSiteSchema", () => {
  it("allows toggling isActive", () => {
    const result = updateSiteSchema.parse({ isActive: false });
    expect(result.isActive).toBe(false);
  });
});

describe("boardQuerySchema", () => {
  it("accepts date + siteId", () => {
    const result = boardQuerySchema.parse({
      date: "2026-10-05",
      siteId: SITE_ID,
    });
    expect(result.date).toBe("2026-10-05");
  });

  it("rejects a malformed date", () => {
    expect(() =>
      boardQuerySchema.parse({ date: "tomorrow", siteId: SITE_ID }),
    ).toThrow();
  });
});

describe("markAttendanceSchema", () => {
  it("accepts a bulk mark payload", () => {
    const result = markAttendanceSchema.parse({
      date: "2026-10-05",
      siteId: SITE_ID,
      entries: [
        { employeeId: SITE_ID, codeId: SITE_ID },
        { employeeId: SITE_ID, codeId: SITE_ID, notes: "late" },
      ],
    });
    expect(result.entries).toHaveLength(2);
  });

  it("rejects an empty entries array", () => {
    expect(() =>
      markAttendanceSchema.parse({
        date: "2026-10-05",
        siteId: SITE_ID,
        entries: [],
      }),
    ).toThrow();
  });
});
