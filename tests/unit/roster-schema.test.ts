import { describe, expect, it } from "vitest";
import { createShiftSchema, updateShiftSchema } from "../../modules/roster/shift.schema";
import {
  createRosterSchema,
  rosterQuerySchema,
  setAssignmentsSchema,
} from "../../modules/roster/roster.schema";

const SITE_ID = "11111111-1111-1111-1111-111111111111";
const EMP_ID = "22222222-2222-2222-2222-222222222222";

describe("createShiftSchema", () => {
  it("accepts a valid shift", () => {
    const r = createShiftSchema.parse({
      name: "Morning",
      type: "MORNING",
      startTime: "08:00",
      endTime: "20:00",
    });
    expect(r.breakMinutes).toBe(0);
    expect(r.requiredStaff).toBe(0);
  });

  it("rejects a malformed time", () => {
    expect(() =>
      createShiftSchema.parse({ name: "X", startTime: "8am", endTime: "20:00" }),
    ).toThrow();
  });

  it("rejects an unknown shift type", () => {
    expect(() =>
      createShiftSchema.parse({ name: "X", type: "DAWN", startTime: "08:00", endTime: "20:00" }),
    ).toThrow();
  });
});

describe("updateShiftSchema", () => {
  it("allows partial updates", () => {
    const r = updateShiftSchema.parse({ requiredStaff: 10 });
    expect(r.requiredStaff).toBe(10);
    expect(r.name).toBeUndefined();
  });
});

describe("createRosterSchema", () => {
  it("accepts a valid week roster", () => {
    const r = createRosterSchema.parse({
      siteId: SITE_ID,
      name: "Week 41",
      startDate: "2026-10-05",
      endDate: "2026-10-11",
    });
    expect(r.name).toBe("Week 41");
  });

  it("rejects endDate before startDate", () => {
    expect(() =>
      createRosterSchema.parse({
        siteId: SITE_ID,
        name: "Bad",
        startDate: "2026-10-11",
        endDate: "2026-10-05",
      }),
    ).toThrow();
  });
});

describe("setAssignmentsSchema", () => {
  it("accepts a board save", () => {
    const r = setAssignmentsSchema.parse({
      assignments: [{ employeeId: EMP_ID, shiftId: SITE_ID, date: "2026-10-06" }],
    });
    expect(r.assignments).toHaveLength(1);
  });

  it("accepts an empty board (clear all)", () => {
    const r = setAssignmentsSchema.parse({ assignments: [] });
    expect(r.assignments).toHaveLength(0);
  });

  it("rejects a bad date", () => {
    expect(() =>
      setAssignmentsSchema.parse({
        assignments: [{ employeeId: EMP_ID, shiftId: SITE_ID, date: "tomorrow" }],
      }),
    ).toThrow();
  });
});

describe("rosterQuerySchema", () => {
  it("applies pagination defaults", () => {
    const r = rosterQuerySchema.parse({});
    expect(r.page).toBe(1);
    expect(r.pageSize).toBe(20);
  });
});
