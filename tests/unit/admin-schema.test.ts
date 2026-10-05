import { describe, expect, it } from "vitest";
import {
  auditQuerySchema,
  createUserSchema,
  updateRolePermissionsSchema,
  updateUserSchema,
  userQuerySchema,
} from "../../modules/admin/admin.schema";

const ROLE_ID = "11111111-1111-1111-1111-111111111111";
const PERM_ID = "22222222-2222-2222-2222-222222222222";

describe("createUserSchema", () => {
  it("accepts a valid user", () => {
    const r = createUserSchema.parse({
      email: "ops@example.com",
      password: "secret123",
      fullName: "Ops Manager",
      roleId: ROLE_ID,
    });
    expect(r.email).toBe("ops@example.com");
  });

  it("rejects a short password", () => {
    expect(() =>
      createUserSchema.parse({
        email: "a@b.com",
        password: "short",
        fullName: "X",
        roleId: ROLE_ID,
      }),
    ).toThrow();
  });

  it("rejects a bad email", () => {
    expect(() =>
      createUserSchema.parse({
        email: "not-an-email",
        password: "secret123",
        fullName: "X",
        roleId: ROLE_ID,
      }),
    ).toThrow();
  });
});

describe("updateUserSchema", () => {
  it("allows partial updates", () => {
    const r = updateUserSchema.parse({ isActive: false });
    expect(r.isActive).toBe(false);
    expect(r.fullName).toBeUndefined();
  });
});

describe("updateRolePermissionsSchema", () => {
  it("accepts a permission set", () => {
    const r = updateRolePermissionsSchema.parse({ permissionIds: [PERM_ID] });
    expect(r.permissionIds).toHaveLength(1);
  });

  it("accepts an empty set (revoke all)", () => {
    expect(updateRolePermissionsSchema.parse({ permissionIds: [] }).permissionIds).toHaveLength(0);
  });
});

describe("auditQuerySchema", () => {
  it("applies pagination defaults", () => {
    const r = auditQuerySchema.parse({});
    expect(r.page).toBe(1);
    expect(r.pageSize).toBe(25);
  });

  it("accepts a date range", () => {
    const r = auditQuerySchema.parse({ from: "2026-10-01", to: "2026-10-05", module: "payroll" });
    expect(r.module).toBe("payroll");
  });
});

describe("userQuerySchema", () => {
  it("treats empty search as undefined", () => {
    expect(userQuerySchema.parse({ search: "" }).search).toBeUndefined();
  });
});
