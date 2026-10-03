/**
 * Easy Roster — Phase 1 demo seed.
 *
 * Creates clearly-marked DEMO data:
 *   Company "Easy Roster Demo"
 *   Sectors: "New Cairo Sector", "Cairo Sector"
 *   Sites: "Zia Mall" (25 req / 18 actual → CRITICAL),
 *          "Bureau 58" (20 req / 18 actual → WARNING),
 *          "Les Rois" (30 req / 30 actual → NORMAL)
 *   66 demo employees (Arabic + English names), shifts, attendance
 *   codes, manpower requirements, snapshots, shortages, sample
 *   attendance and leaves.
 *
 * Idempotent: master data is upserted on unique keys; demo
 * transactional rows are tagged "[DEMO]" and replaced on re-run.
 *
 * Run:  npx prisma db seed
 * (see "prisma.seed" in package.json)
 */

import {
  PrismaClient,
  EmployeeStatus,
  ShiftType,
  AttendanceCodeEnum,
  LeaveType,
  LeaveStatus,
  ShortageSeverity,
  ServiceType,
  ContractStatus,
  CandidateStatus,
  MilitaryStatus,
  CandidateSource,
  InterviewResult,
} from "@prisma/client";
import type { Actor } from "../lib/auth";
import { ensureRolesAndPermissions } from "../lib/bootstrap";
import { generateDraftInvoice } from "../modules/billing/billing.service";

const prisma = new PrismaClient();

// ------------------------------------------------------------------
// Static demo data
// ------------------------------------------------------------------

const COMPANY_NAME = "Easy Roster Demo";

const SECTORS = [
  { name: "New Cairo Sector", notes: "[DEMO] Demo sector for Easy Roster Phase 1." },
  { name: "Cairo Sector", notes: "[DEMO] Demo sector for Easy Roster Phase 1." },
] as const;

type ShiftPlan = { MORNING: number; EVENING: number; NIGHT: number };
type ActualPlan = { MORNING: number; EVENING: number; NIGHT: number };

const SITES: Array<{
  name: string;
  sector: string;
  clientName: string;
  location: string;
  contactName: string;
  contactPhone: string;
  required: ShiftPlan;
  actual: ActualPlan;
  notes: string;
}> = [
  {
    name: "Zia Mall",
    sector: "New Cairo Sector",
    clientName: "Zia Mall Management",
    location: "New Cairo, Egypt",
    contactName: "Demo Contact",
    contactPhone: "01001234567",
    required: { MORNING: 10, EVENING: 8, NIGHT: 7 }, // total 25
    actual: { MORNING: 7, EVENING: 6, NIGHT: 5 }, // total 18 → shortage 7 (28%) CRITICAL
    notes: "[DEMO] Demo site — critical shortage example.",
  },
  {
    name: "Bureau 58",
    sector: "New Cairo Sector",
    clientName: "Bureau 58 Business Hub",
    location: "New Cairo, Egypt",
    contactName: "Demo Contact",
    contactPhone: "01007654321",
    required: { MORNING: 8, EVENING: 7, NIGHT: 5 }, // total 20
    actual: { MORNING: 7, EVENING: 6, NIGHT: 5 }, // total 18 → shortage 2 (10%) WARNING
    notes: "[DEMO] Demo site — warning shortage example.",
  },
  {
    name: "Les Rois",
    sector: "Cairo Sector",
    clientName: "Les Rois Compound",
    location: "Cairo, Egypt",
    contactName: "Demo Contact",
    contactPhone: "01009876543",
    required: { MORNING: 12, EVENING: 10, NIGHT: 8 }, // total 30
    actual: { MORNING: 12, EVENING: 10, NIGHT: 8 }, // total 30 → fully staffed NORMAL
    notes: "[DEMO] Demo site — healthy staffing example.",
  },
];

const ATTENDANCE_CODES: Array<{
  code: AttendanceCodeEnum;
  labelEn: string;
  labelAr: string;
  dayValue: number;
  countsAsPresent: boolean;
  sortOrder: number;
}> = [
  { code: AttendanceCodeEnum.P, labelEn: "Present (1 shift)", labelAr: "حاضر (وردية)", dayValue: 1, countsAsPresent: true, sortOrder: 1 },
  { code: AttendanceCodeEnum.PP, labelEn: "Present (2 shifts)", labelAr: "حاضر (ورديتان)", dayValue: 2, countsAsPresent: true, sortOrder: 2 },
  { code: AttendanceCodeEnum.ONE_AND_HALF, labelEn: "One and a half shifts", labelAr: "وردية ونصف", dayValue: 1.5, countsAsPresent: true, sortOrder: 3 },
  { code: AttendanceCodeEnum.HALF_SHIFT, labelEn: "Half shift", labelAr: "نصف وردية", dayValue: 0.5, countsAsPresent: true, sortOrder: 4 },
  { code: AttendanceCodeEnum.ABSENT, labelEn: "Absence (employee account)", labelAr: "غياب (على حساب الموظف)", dayValue: 0, countsAsPresent: false, sortOrder: 5 },
  { code: AttendanceCodeEnum.DOUBLE_ABSENT, labelEn: "Absence counted as two days", labelAr: "غياب يحسب بيومين", dayValue: -2, countsAsPresent: false, sortOrder: 6 },
  { code: AttendanceCodeEnum.ANNUAL_LEAVE, labelEn: "Annual leave", labelAr: "إجازة سنوية", dayValue: 0, countsAsPresent: false, sortOrder: 7 },
  { code: AttendanceCodeEnum.SICK_LEAVE, labelEn: "Sick leave", labelAr: "إجازة مرضية", dayValue: 0, countsAsPresent: false, sortOrder: 8 },
];

const POSITIONS = [
  { code: "GUARD", titleEn: "Security Guard", titleAr: "فرد أمن" },
  { code: "SUPERVISOR", titleEn: "Supervisor", titleAr: "مشرف" },
  { code: "SITE_MANAGER", titleEn: "Site Manager", titleAr: "مدير موقع" },
  { code: "INSPECTOR", titleEn: "Inspector", titleAr: "مفتش" },
] as const;

// Deterministic demo name pools (Egyptian names).
const FIRST_AR = ["أحمد", "محمد", "محمود", "علي", "حسن", "حسين", "كريم", "طارق", "سامح", "وليد", "إبراهيم", "عبد الله", "مصطفى", "خالد", "ياسر", "أشرف", "هانى", "عماد", "شريف", "تامر", "وائل", "ناصر", "فارس", "باسم", "رامي", "سيد", "جمال", "عادل", "فتحي", "كمال"];
const FIRST_EN = ["Ahmed", "Mohamed", "Mahmoud", "Ali", "Hassan", "Hussein", "Karim", "Tarek", "Sameh", "Walid", "Ibrahim", "Abdullah", "Mostafa", "Khaled", "Yasser", "Ashraf", "Hany", "Emad", "Sherif", "Tamer", "Wael", "Nasser", "Fares", "Basem", "Ramy", "Sayed", "Gamal", "Adel", "Fathy", "Kamal"];
const LAST_AR = ["السيد", "عبد الرحمن", "إبراهيم", "حسن", "علي", "محمد", "خليل", "عبد الله", "فؤاد", "نصر", "حمدي", "عزت", "رمضان", "شعبان", "عوض", "الديب", "النجار", "حجازي", "بركات", "سليمان"];
const LAST_EN = ["Elsayed", "Abdelrahman", "Ibrahim", "Hassan", "Ali", "Mohamed", "Khalil", "Abdullah", "Fouad", "Nasr", "Hamdy", "Ezzat", "Ramadan", "Shaaban", "Awad", "Eldib", "Elnaggar", "Hegazy", "Barakat", "Soliman"];

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

function severityFor(shortagePct: number): ShortageSeverity {
  // NOTE: thresholds are demo defaults — in production these come from
  // Settings (configurable per company), not from code.
  if (shortagePct <= 0) return ShortageSeverity.NORMAL;
  if (shortagePct <= 10) return ShortageSeverity.WARNING;
  return ShortageSeverity.CRITICAL;
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d;
}

function daysFromNow(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + n);
  d.setHours(0, 0, 0, 0);
  return d;
}

// ------------------------------------------------------------------
// Seed
// ------------------------------------------------------------------

async function main(): Promise<void> {
  // --- Company ----------------------------------------------------
  const company = await prisma.company.upsert({
    where: { name: COMPANY_NAME },
    update: {},
    create: { name: COMPANY_NAME },
  });

  // --- Roles & permissions (canonical catalog in lib/bootstrap.ts) ---
  await ensureRolesAndPermissions(prisma);

  // --- Demo admin user (password hash MUST be replaced; see README) --
  const superAdmin = await prisma.role.findUniqueOrThrow({ where: { name: "SUPER_ADMIN" } });
  await prisma.user.upsert({
    where: { email: "admin@easyroster.demo" },
    update: {},
    create: {
      email: "admin@easyroster.demo",
      // Placeholder — never a real credential. Set a real Argon2/bcrypt
      // hash via the auth setup flow before any real use.
      passwordHash: "__DEMO_PASSWORD_HASH_REPLACE_ME__",
      fullName: "Demo Administrator",
      roleId: superAdmin.id,
    },
  });

  // --- Sectors ------------------------------------------------------
  const sectorByName = new Map<string, { id: string }>();
  for (const s of SECTORS) {
    const sector = await prisma.sector.upsert({
      where: { companyId_name: { companyId: company.id, name: s.name } },
      update: { notes: s.notes, isActive: true },
      create: { companyId: company.id, name: s.name, notes: s.notes },
    });
    sectorByName.set(s.name, sector);
  }

  // --- Positions ------------------------------------------------------
  const positionByCode = new Map<string, { id: string }>();
  for (const p of POSITIONS) {
    const position = await prisma.position.upsert({
      where: { code: p.code },
      update: { titleEn: p.titleEn, titleAr: p.titleAr },
      create: p,
    });
    positionByCode.set(p.code, position);
  }
  const guardPosition = positionByCode.get("GUARD")!;

  // --- Sites + shifts ---------------------------------------------------
  const siteByName = new Map<string, { id: string; sectorId: string }>();
  const shiftByKey = new Map<string, { id: string }>(); // `${siteName}:${SHIFT}`

  for (const s of SITES) {
    const sector = sectorByName.get(s.sector)!;
    const totalRequired = s.required.MORNING + s.required.EVENING + s.required.NIGHT;
    const site = await prisma.site.upsert({
      where: { sectorId_name: { sectorId: sector.id, name: s.name } },
      update: {
        clientName: s.clientName,
        location: s.location,
        contactName: s.contactName,
        contactPhone: s.contactPhone,
        requiredManpower: totalRequired,
        notes: s.notes,
        isActive: true,
      },
      create: {
        sectorId: sector.id,
        name: s.name,
        clientName: s.clientName,
        location: s.location,
        contactName: s.contactName,
        contactPhone: s.contactPhone,
        requiredManpower: totalRequired,
        notes: s.notes,
      },
    });
    siteByName.set(s.name, { id: site.id, sectorId: sector.id });

    const shiftDefs: Array<{ key: keyof ShiftPlan; name: string; type: ShiftType; start: string; end: string }> = [
      { key: "MORNING", name: "Morning", type: ShiftType.MORNING, start: "08:00", end: "16:00" },
      { key: "EVENING", name: "Evening", type: ShiftType.EVENING, start: "16:00", end: "00:00" },
      { key: "NIGHT", name: "Night", type: ShiftType.NIGHT, start: "00:00", end: "08:00" },
    ];
    for (const def of shiftDefs) {
      const shift = await prisma.shift.upsert({
        where: { siteId_name: { siteId: site.id, name: def.name } },
        update: { type: def.type, startTime: def.start, endTime: def.end, requiredStaff: s.required[def.key], isActive: true },
        create: {
          siteId: site.id,
          name: def.name,
          type: def.type,
          startTime: def.start,
          endTime: def.end,
          requiredStaff: s.required[def.key],
        },
      });
      shiftByKey.set(`${s.name}:${def.key}`, { id: shift.id });

      // Manpower requirement per shift (effective from 30 days ago, open-ended).
      const existing = await prisma.manpowerRequirement.findFirst({
        where: { siteId: site.id, shiftId: shift.id, effectiveTo: null },
      });
      if (existing) {
        await prisma.manpowerRequirement.update({
          where: { id: existing.id },
          data: { requiredCount: s.required[def.key] },
        });
      } else {
        await prisma.manpowerRequirement.create({
          data: {
            siteId: site.id,
            shiftId: shift.id,
            requiredCount: s.required[def.key],
            effectiveFrom: daysAgo(30),
            notes: "[DEMO] Demo manpower plan.",
          },
        });
      }
    }

    // Double shift definition (ad-hoc, no planned requirement).
    await prisma.shift.upsert({
      where: { siteId_name: { siteId: site.id, name: "Double" } },
      update: { isActive: true },
      create: {
        siteId: site.id,
        name: "Double",
        type: ShiftType.DOUBLE,
        startTime: "08:00",
        endTime: "00:00",
        requiredStaff: 0,
      },
    });
  }

  // --- Security ERP Phase 1 demo: client + contract + rates ---------------
  // Idempotent: client/contract upserted on business keys; contract-site
  // rates are replaced on re-run.
  const demoClientNameEn = "Zia Mall Management";
  let demoClient = await prisma.client.findFirst({
    where: { companyNameEn: demoClientNameEn },
  });
  if (demoClient) {
    demoClient = await prisma.client.update({
      where: { id: demoClient.id },
      data: {
        companyNameAr: "إدارة زيا مول",
        taxId: "123-456-789",
        commercialReg: "CR-DEMO-0001",
        address: "New Cairo, Egypt",
        phone: "01001234567",
        email: "accounts@ziamall.demo",
        status: "ACTIVE",
        notes: "[DEMO] Demo client for Security ERP Phase 1.",
      },
    });
  } else {
    demoClient = await prisma.client.create({
      data: {
        companyNameAr: "إدارة زيا مول",
        companyNameEn: demoClientNameEn,
        taxId: "123-456-789",
        commercialReg: "CR-DEMO-0001",
        address: "New Cairo, Egypt",
        phone: "01001234567",
        email: "accounts@ziamall.demo",
        status: "ACTIVE",
        notes: "[DEMO] Demo client for Security ERP Phase 1.",
        contacts: {
          create: {
            name: "Demo Contact",
            role: "Facilities Manager",
            phone: "01001234567",
            email: "contact@ziamall.demo",
            isPrimary: true,
          },
        },
      },
    });
  }

  const ziaMall = siteByName.get("Zia Mall")!;
  const contractStart = new Date(2026, 0, 1);
  const contractEnd = new Date(2026, 11, 31);
  const demoContract = await prisma.contract.upsert({
    where: { contractNo: "CNT-2026-001" },
    update: {
      titleAr: "عقد حراسة زيا مول 2026",
      titleEn: "Zia Mall Guarding Contract 2026",
      startDate: contractStart,
      endDate: contractEnd,
      status: ContractStatus.ACTIVE,
      paymentTermsDays: 30,
      notes: "[DEMO] Demo contract for Security ERP Phase 1.",
    },
    create: {
      clientId: demoClient.id,
      contractNo: "CNT-2026-001",
      titleAr: "عقد حراسة زيا مول 2026",
      titleEn: "Zia Mall Guarding Contract 2026",
      startDate: contractStart,
      endDate: contractEnd,
      status: ContractStatus.ACTIVE,
      paymentTermsDays: 30,
      penaltyClause: "[DEMO] 1% of monthly value per uncovered shift.",
      sla: "[DEMO] 100% shift coverage; supervisor on site 24/7.",
      notes: "[DEMO] Demo contract for Security ERP Phase 1.",
    },
  });

  const demoContractSite = await prisma.contractSite.upsert({
    where: {
      contractId_siteId_serviceType: {
        contractId: demoContract.id,
        siteId: ziaMall.id,
        serviceType: ServiceType.STATIC_GUARD,
      },
    },
    update: {},
    create: {
      contractId: demoContract.id,
      siteId: ziaMall.id,
      serviceType: ServiceType.STATIC_GUARD,
    },
  });
  // Replace demo rates on re-run (no business key on rates).
  await prisma.contractRate.deleteMany({
    where: { contractSiteId: demoContractSite.id },
  });
  const demoRates: Array<{ shift: string; amount: number }> = [
    { shift: "MORNING", amount: 300 },
    { shift: "EVENING", amount: 300 },
    { shift: "NIGHT", amount: 350 },
  ];
  for (const r of demoRates) {
    const shift = shiftByKey.get(`Zia Mall:${r.shift}`)!;
    await prisma.contractRate.create({
      data: {
        contractSiteId: demoContractSite.id,
        shiftId: shift.id,
        positionId: null, // applies to all positions
        ratePerShift: r.amount,
        effectiveFrom: contractStart,
        effectiveTo: null,
      },
    });
  }

  // --- Attendance codes ---------------------------------------------------
  const codeByEnum = new Map<AttendanceCodeEnum, { id: string }>();
  for (const c of ATTENDANCE_CODES) {
    const code = await prisma.attendanceCode.upsert({
      where: { code: c.code },
      update: {
        labelEn: c.labelEn,
        labelAr: c.labelAr,
        dayValue: c.dayValue,
        countsAsPresent: c.countsAsPresent,
        sortOrder: c.sortOrder,
        isActive: true,
      },
      create: {
        code: c.code,
        labelEn: c.labelEn,
        labelAr: c.labelAr,
        dayValue: c.dayValue,
        countsAsPresent: c.countsAsPresent,
        sortOrder: c.sortOrder,
      },
    });
    codeByEnum.set(c.code, { id: code.id });
  }
  const presentCodeId = codeByEnum.get(AttendanceCodeEnum.P)!.id;

  // --- Employees (66: 18 Zia Mall, 18 Bureau 58, 30 Les Rois) --------------
  const employeeSiteOrder: string[] = [
    ...Array(18).fill("Zia Mall"),
    ...Array(18).fill("Bureau 58"),
    ...Array(30).fill("Les Rois"),
  ];
  const shiftCycle: Array<keyof ShiftPlan> = ["MORNING", "EVENING", "NIGHT"];
  const employeeIds: string[] = [];

  for (let i = 0; i < employeeSiteOrder.length; i++) {
    const siteName = employeeSiteOrder[i] as string;
    const site = siteByName.get(siteName)!;
    const shiftKey = shiftCycle[i % 3] as keyof ShiftPlan;
    const shift = shiftByKey.get(`${siteName}:${shiftKey}`)!;

    const firstAr = FIRST_AR[i % FIRST_AR.length] as string;
    const firstEn = FIRST_EN[i % FIRST_EN.length] as string;
    const lastAr = LAST_AR[(i * 7) % LAST_AR.length] as string;
    const lastEn = LAST_EN[(i * 7) % LAST_EN.length] as string;

    const cardNumber = `ER-${String(i + 1).padStart(4, "0")}`;
    // 14-digit demo national ID — unique, clearly synthetic.
    const nationalId = `2990101${String(1000000 + i)}`;
    const mobile = `0100${String(1000000 + i * 13).slice(0, 7)}`;

    // Hiring dates spread over ~2 years; first 3 are "new hires".
    const hiringDate = i < 3 ? daysAgo([2, 5, 9][i] as number) : daysAgo(40 + ((i * 37) % 700));

    // One resigned employee to feed "employees leaving".
    const isResigned = i === 60;

    const employee = await prisma.employee.upsert({
      where: { cardNumber },
      update: {
        siteId: site.id,
        sectorId: site.sectorId,
        shiftId: shift.id,
      },
      create: {
        cardNumber,
        fullNameAr: `${firstAr} ${lastAr}`,
        fullNameEn: `${firstEn} ${lastEn}`,
        nationalId,
        mobile,
        emergencyContact: `0111${String(2000000 + i * 17).slice(0, 7)}`,
        hiringDate,
        positionId: guardPosition.id,
        rank: "Guard",
        department: "Security",
        sectorId: site.sectorId,
        siteId: site.id,
        shiftId: shift.id,
        salary: 6000 + (i % 5) * 500,
        contractType: "Full-time",
        insuranceStatus: "Insured",
        status: isResigned ? EmployeeStatus.RESIGNED : EmployeeStatus.ACTIVE,
        lastWorkingDay: isResigned ? daysAgo(5) : null,
        exitReason: isResigned ? "Resignation" : null,
        notes: "[DEMO] Demo employee.",
      },
    });
    employeeIds.push(employee.id);
  }

  // --- Manpower snapshots + shortages (today, demo operational state) ------
  const today = daysAgo(0);
  for (const s of SITES) {
    const site = siteByName.get(s.name)!;
    const totalRequired = s.required.MORNING + s.required.EVENING + s.required.NIGHT;
    const totalActual = s.actual.MORNING + s.actual.EVENING + s.actual.NIGHT;
    const totalShortage = totalRequired - totalActual;
    const totalPct = totalRequired === 0 ? 0 : (totalShortage / totalRequired) * 100;

    await prisma.manpowerSnapshot.upsert({
      where: { siteId_date: { siteId: site.id, date: today } },
      update: {
        requiredCount: totalRequired,
        actualCount: totalActual,
        shortage: totalShortage,
        surplus: Math.max(0, -totalShortage),
        shortagePct: Math.round(totalPct * 100) / 100,
      },
      create: {
        siteId: site.id,
        date: today,
        requiredCount: totalRequired,
        actualCount: totalActual,
        shortage: totalShortage,
        surplus: Math.max(0, -totalShortage),
        shortagePct: Math.round(totalPct * 100) / 100,
      },
    });

    for (const key of Object.keys(s.required) as Array<keyof ShiftPlan>) {
      const required = s.required[key];
      const actual = s.actual[key];
      const shortage = required - actual;
      const pct = required === 0 ? 0 : (shortage / required) * 100;
      const shift = shiftByKey.get(`${s.name}:${key}`)!;
      await prisma.shortage.upsert({
        where: { siteId_shiftId_date: { siteId: site.id, shiftId: shift.id, date: today } },
        update: {
          required,
          actual,
          shortage,
          surplus: Math.max(0, -shortage),
          percentage: Math.round(pct * 100) / 100,
          severity: severityFor(pct),
        },
        create: {
          siteId: site.id,
          shiftId: shift.id,
          date: today,
          required,
          actual,
          shortage,
          surplus: Math.max(0, -shortage),
          percentage: Math.round(pct * 100) / 100,
          severity: severityFor(pct),
        },
      });
    }
  }

  // --- Sample attendance (last 7 days, first 12 employees) -------------------
  const absentCodeId = codeByEnum.get(AttendanceCodeEnum.ABSENT)!.id;
  const sickCodeId = codeByEnum.get(AttendanceCodeEnum.SICK_LEAVE)!.id;
  for (let e = 0; e < 12; e++) {
    const employeeId = employeeIds[e] as string;
    const employee = await prisma.employee.findUniqueOrThrow({ where: { id: employeeId } });
    for (let d = 6; d >= 0; d--) {
      const date = daysAgo(d);
      let codeId = presentCodeId;
      if (e === 5 && d === 3) codeId = absentCodeId;
      if (e === 8 && d === 1) codeId = sickCodeId;
      await prisma.attendance.upsert({
        where: { employeeId_date: { employeeId, date } },
        update: { codeId, siteId: employee.siteId },
        create: {
          employeeId,
          siteId: employee.siteId,
          date,
          codeId,
          notes: "[DEMO] Demo attendance.",
        },
      });
    }
  }

  // --- Security ERP Phase 1 demo: draft invoice for the demo contract ----
  // Idempotent: previous DRAFT demo invoices for the contract are replaced
  // (issued/paid invoices are never touched by the seed).
  const demoPeriodStart = daysAgo(6);
  const demoPeriodEnd = daysAgo(0);
  await prisma.invoice.deleteMany({
    where: { contractId: demoContract.id, status: "DRAFT" },
  });
  const seedActor: Actor = { userId: null, role: "SYSTEM", permissions: ["*"] };
  const demoInvoice = await generateDraftInvoice(
    seedActor,
    {
      contractId: demoContract.id,
      periodStart: demoPeriodStart,
      periodEnd: demoPeriodEnd,
      taxRate: 0.14, // Egypt VAT
      discountAmount: 0,
    },
  );
  console.log(
    `  demo invoice: ${demoInvoice.invoiceNo} (${demoInvoice.lines.length} lines, total ${demoInvoice.total})`,
  );

  // --- Sample leaves ([DEMO]-tagged; replaced on re-run) ---------------------
  await prisma.leave.deleteMany({ where: { notes: { contains: "[DEMO]" } } });
  const approver = await prisma.user.findUniqueOrThrow({ where: { email: "admin@easyroster.demo" } });
  const leaveSamples: Array<{ employeeIdx: number; type: LeaveType; start: Date; end: Date; days: number }> = [
    { employeeIdx: 3, type: LeaveType.ANNUAL, start: daysAgo(2), end: daysFromNow(3), days: 6 },
    { employeeIdx: 10, type: LeaveType.SICK, start: daysAgo(1), end: daysFromNow(1), days: 3 },
  ];
  for (const l of leaveSamples) {
    await prisma.leave.create({
      data: {
        employeeId: employeeIds[l.employeeIdx] as string,
        type: l.type,
        startDate: l.start,
        endDate: l.end,
        days: l.days,
        status: LeaveStatus.APPROVED,
        approverId: approver.id,
        notes: "[DEMO] Demo leave.",
      },
    });
  }

  // --- Security ERP Phase 2: document types + recruitment demo ------------------
  // Required guard document types for Egyptian security-company hiring.
  const documentTypes = [
    { code: "criminal_record", nameAr: "فيش جنائي", nameEn: "Criminal Record", requiredForHire: true, validityMonths: 3, isRecurring: true },
    { code: "work_permit", nameAr: "كعب عمل", nameEn: "Work Permit", requiredForHire: true, validityMonths: null, isRecurring: false },
    { code: "birth_certificate", nameAr: "شهادة ميلاد", nameEn: "Birth Certificate", requiredForHire: true, validityMonths: null, isRecurring: false },
    { code: "military_status", nameAr: "الموقف من التجنيد", nameEn: "Military Status Certificate", requiredForHire: true, validityMonths: null, isRecurring: false },
    { code: "practice_license", nameAr: "رخصة مزاولة المهنة", nameEn: "Practice License", requiredForHire: true, validityMonths: 12, isRecurring: true },
    { code: "social_insurance", nameAr: "التأمينات الاجتماعية", nameEn: "Social Insurance", requiredForHire: true, validityMonths: null, isRecurring: false },
    { code: "national_id_copy", nameAr: "صورة البطاقة", nameEn: "National ID Copy", requiredForHire: true, validityMonths: null, isRecurring: false },
    { code: "health_certificate", nameAr: "شهادة صحية", nameEn: "Health Certificate", requiredForHire: true, validityMonths: 12, isRecurring: true },
  ] as const;
  for (const t of documentTypes) {
    await prisma.documentType.upsert({
      where: { code: t.code },
      update: { nameAr: t.nameAr, nameEn: t.nameEn, requiredForHire: t.requiredForHire, validityMonths: t.validityMonths, isRecurring: t.isRecurring },
      create: { code: t.code, nameAr: t.nameAr, nameEn: t.nameEn, requiredForHire: t.requiredForHire, validityMonths: t.validityMonths, isRecurring: t.isRecurring },
    });
  }

  // Demo recruitment pipeline (5 candidates across stages + 3 interviews).
  const recruitmentSite = siteByName.get("Zia Mall")!;
  const demoCandidates = [
    { nationalId: "29503151234567", nameAr: "كريم عادل حسن", nameEn: "Karim Adel Hassan", phone: "01011223344", status: CandidateStatus.NEW },
    { nationalId: "29607201234568", nameAr: "محمد سامي إبراهيم", nameEn: "Mohamed Samy Ibrahim", phone: "01022334455", status: CandidateStatus.SCREENING },
    { nationalId: "29405151234569", nameAr: "أحمد فؤاد علي", nameEn: "Ahmed Fouad Ali", phone: "01033445566", status: CandidateStatus.INTERVIEW },
    { nationalId: "29309101234570", nameAr: "مصطفى رجب محمود", nameEn: "Mostafa Ragab Mahmoud", phone: "01044556677", status: CandidateStatus.MEDICAL_SECURITY_CHECK },
    { nationalId: "29201011234571", nameAr: "خالد عبد الله سيد", nameEn: "Khaled Abdallah Sayed", phone: "01055667788", status: CandidateStatus.APPROVED },
  ] as const;
  const candidateByNationalId = new Map<string, { id: string }>();
  for (const c of demoCandidates) {
    const candidate = await prisma.candidate.upsert({
      where: { nationalId: c.nationalId },
      update: { status: c.status, phone: c.phone },
      create: {
        nameAr: c.nameAr, nameEn: c.nameEn, nationalId: c.nationalId, phone: c.phone,
        militaryStatus: MilitaryStatus.COMPLETED,
        desiredPositionId: guardPosition.id, desiredSiteId: recruitmentSite.id,
        source: CandidateSource.WALK_IN, status: c.status,
        notes: "[DEMO] Demo candidate for Security ERP Phase 2.",
      },
    });
    candidateByNationalId.set(c.nationalId, candidate);
  }
  const demoInterviews = [
    { nationalId: "29405151234569", daysFromNow: 2, location: "Head office — HR", result: InterviewResult.PENDING, score: null as number | null, notes: "[DEMO] First interview." },
    { nationalId: "29309101234570", daysFromNow: -1, location: "Head office — HR", result: InterviewResult.PASSED, score: 85, notes: "[DEMO] Passed first interview; medical check pending." },
    { nationalId: "29201011234571", daysFromNow: -7, location: "Head office — HR", result: InterviewResult.PASSED, score: 92, notes: "[DEMO] Passed; approved for hire." },
  ];
  for (const i of demoInterviews) {
    const candidate = candidateByNationalId.get(i.nationalId)!;
    const scheduledAt = new Date(Date.now() + i.daysFromNow * 24 * 3600 * 1000);
    const existing = await prisma.interview.findFirst({ where: { candidateId: candidate.id, scheduledAt } });
    if (!existing) {
      await prisma.interview.create({
        data: { candidateId: candidate.id, scheduledAt, location: i.location, result: i.result, score: i.score, notes: i.notes },
      });
    }
  }

  console.log("Seed complete:");
  console.log(`  company: ${COMPANY_NAME}`);
  console.log(`  sectors: ${SECTORS.length}, sites: ${SITES.length}`);
  console.log(`  employees: ${employeeIds.length} (Zia Mall 18 / Bureau 58 18 / Les Rois 30)`);
  console.log("  Red Zone: Zia Mall CRITICAL (25/18, -7, 28%) | Bureau 58 WARNING (20/18, -2, 10%) | Les Rois NORMAL (30/30)");
}

main()
  .catch((e: unknown) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
