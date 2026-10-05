import { ApiError, ok, withErrors } from "../../../../../lib/api-response";
import { getActor } from "../../../../../lib/auth";
import { prisma } from "../../../../../lib/prisma";

/**
 * Dashboard overview: headcounts plus today's attendance position
 * per site (present vs required manpower).
 */

interface SiteStatus {
  id: string;
  name: string;
  required: number;
  present: number;
  employees: number;
}

async function summary(req: Request): Promise<Response> {
  const actor = await getActor(req);
  if (!actor) {
    throw new ApiError("UNAUTHENTICATED", "Authentication required", 401);
  }

  const todayStr = new Date().toISOString().slice(0, 10);
  const today = new Date(todayStr + "T00:00:00Z");

  const [employeesTotal, sites, records] = await Promise.all([
    prisma.employee.count({ where: { deletedAt: null, status: "ACTIVE" } }),
    prisma.site.findMany({
      where: { deletedAt: null, isActive: true },
      select: {
        id: true,
        name: true,
        requiredManpower: true,
        _count: {
          select: { employees: { where: { deletedAt: null, status: "ACTIVE" } } },
        },
      },
      orderBy: { name: "asc" },
    }),
    prisma.attendance.findMany({
      where: { date: today },
      select: { siteId: true, code: { select: { countsAsPresent: true } } },
    }),
  ]);

  const presentBySite = new Map<string, number>();
  for (const r of records) {
    if (r.code.countsAsPresent) {
      presentBySite.set(r.siteId, (presentBySite.get(r.siteId) ?? 0) + 1);
    }
  }

  const siteStatus: SiteStatus[] = sites.map((s) => ({
    id: s.id,
    name: s.name,
    required: s.requiredManpower,
    present: presentBySite.get(s.id) ?? 0,
    employees: s._count.employees,
  }));

  const presentTotal = [...presentBySite.values()].reduce((a, b) => a + b, 0);

  return ok({
    date: todayStr,
    employees: { active: employeesTotal },
    sites: { active: sites.length },
    today: {
      present: presentTotal,
      sites: siteStatus,
    },
  });
}

export const GET = withErrors(summary);
