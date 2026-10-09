"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Badge, Btn, Card, EmptyState, Field, Icon, PageHeader, Spinner, Stat,
  fieldInput,
} from "../_ui";

type Severity = "NORMAL" | "WARNING" | "CRITICAL";

interface ShiftRow {
  shiftId: string;
  shiftName: string;
  required: number;
  requiredSource: "manpower" | "shift-default";
  rostered: number;
  present: number;
  absent: number;
  onLeave: number;
  shortage: number;
  surplus: number;
  pct: number;
  severity: Severity;
}

interface SiteReport {
  siteId: string;
  siteName: string;
  shifts: ShiftRow[];
  unassigned: { present: number; absent: number; onLeave: number };
  totals: {
    required: number; rostered: number; present: number; absent: number;
    onLeave: number; shortage: number; surplus: number; pct: number;
    severity: Severity;
  };
}

interface Report {
  date: string;
  sites: SiteReport[];
  totals: SiteReport["totals"] & { sites: number; redZones: number };
}

interface Candidate {
  employeeId: string;
  cardNumber: string;
  fullNameAr: string;
  fullNameEn: string;
  siteName: string | null;
  shiftName: string | null;
  reasons: string[];
}

interface SiteOpt { id: string; name: string }
interface Envelope { success: boolean; data?: unknown; error?: { message?: string } }

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function prettyDate(iso: string, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-GB", {
      weekday: "long", day: "numeric", month: "long", timeZone: "UTC",
    }).format(new Date(iso + "T00:00:00Z"));
  } catch {
    return iso;
  }
}

const severityTone: Record<Severity, "green" | "amber" | "red"> = {
  NORMAL: "green",
  WARNING: "amber",
  CRITICAL: "red",
};

function reasonLabel(reason: string, t: (k: string) => string): string {
  switch (reason) {
    case "home-site": return t("homeSite");
    case "same-sector": return t("sameSector");
    case "no-roster-assignment-on-date": return t("noRoster");
    case "no-attendance-on-date": return t("noAttendance");
    default: return reason;
  }
}

function ShiftTable({ shifts, isAr, t, onSuggest }: {
  shifts: ShiftRow[];
  isAr: boolean;
  t: (k: string) => string;
  onSuggest: (shift: ShiftRow) => void;
}) {
  if (shifts.length === 0) return null;
  return (
    <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200">
      <table className="w-full min-w-[640px] text-[13px]">
        <thead>
          <tr className="bg-slate-50 text-start text-xs text-slate-500">
            <th className="px-3 py-2 text-start font-bold">{t("shift")}</th>
            <th className="px-3 py-2 text-end font-bold tabular-nums">{t("required")}</th>
            <th className="px-3 py-2 text-end font-bold tabular-nums">{t("rostered")}</th>
            <th className="px-3 py-2 text-end font-bold tabular-nums">{t("present")}</th>
            <th className="px-3 py-2 text-end font-bold tabular-nums">{t("absent")}</th>
            <th className="px-3 py-2 text-end font-bold tabular-nums">{t("onLeave")}</th>
            <th className="px-3 py-2 text-end font-bold tabular-nums">{t("shortage")}</th>
            <th className="px-3 py-2 text-end font-bold">{t("severity")}</th>
            <th className="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {shifts.map((s) => (
            <tr key={s.shiftId} className="border-t border-slate-100 hover:bg-slate-50/60">
              <td className="px-3 py-2.5">
                <p className="font-bold text-slate-800">{s.shiftName}</p>
                <p className="text-[11px] text-slate-400">
                  {t(s.requiredSource === "manpower" ? "fromManpower" : "fromShiftDefault")}
                </p>
              </td>
              <td className="px-3 py-2.5 text-end font-bold tabular-nums text-slate-900">{s.required}</td>
              <td className="px-3 py-2.5 text-end tabular-nums text-slate-600">{s.rostered}</td>
              <td className="px-3 py-2.5 text-end font-semibold tabular-nums text-emerald-700">{s.present}</td>
              <td className="px-3 py-2.5 text-end tabular-nums text-rose-600">{s.absent}</td>
              <td className="px-3 py-2.5 text-end tabular-nums text-amber-600">{s.onLeave}</td>
              <td className={`px-3 py-2.5 text-end font-extrabold tabular-nums ${s.shortage > 0 ? "text-rose-700" : "text-slate-400"}`}>
                {s.shortage > 0 ? `-${s.shortage}` : "0"}
              </td>
              <td className="px-3 py-2.5 text-end">
                <Badge tone={severityTone[s.severity]}>
                  {t(s.severity === "NORMAL" ? "normal" : s.severity === "WARNING" ? "warning" : "critical")}
                </Badge>
              </td>
              <td className="px-3 py-2.5 text-end">
                {s.shortage > 0 && (
                  <button
                    onClick={() => onSuggest(s)}
                    className="rounded-xl border border-blue-300 px-2.5 py-1.5 text-xs font-bold text-blue-700 hover:bg-blue-50"
                  >
                    {t("suggest")}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CandidatesDrawer({ site, shift, date, isAr, t, onClose }: {
  site: SiteReport;
  shift: ShiftRow;
  date: string;
  isAr: boolean;
  t: (k: string) => string;
  onClose: () => void;
}) {
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(
      `/api/v1/shortages/replacements?date=${date}&siteId=${site.siteId}&shiftId=${shift.shiftId}&limit=10`,
    )
      .then((r) => r.json())
      .then((j: unknown) => {
        const b = j as Envelope;
        if (b.success) setCandidates((b.data as { candidates: Candidate[] }).candidates ?? []);
        else setCandidates([]);
      })
      .catch(() => setCandidates([]))
      .finally(() => setLoading(false));
  }, [site.siteId, shift.shiftId, date]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-slate-900/50" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-md flex-col bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div>
            <h3 className="text-[16px] font-extrabold text-slate-900">{t("replacementsTitle")}</h3>
            <p className="mt-0.5 text-[13px] text-slate-500">
              {site.siteName} · {shift.shiftName} · {t("shortBy")} {shift.shortage}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl border border-slate-300 px-2.5 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50"
          >
            {t("close")}
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <p className="mb-3 text-xs text-slate-400">{t("candidatesHint")}</p>
          {loading ? (
            <div className="flex justify-center py-12"><Spinner className="h-8 w-8 text-blue-700" /></div>
          ) : !candidates || candidates.length === 0 ? (
            <EmptyState icon="users" title={t("noCandidates")} />
          ) : (
            <div className="space-y-2.5">
              {candidates.map((c) => (
                <div key={c.employeeId} className="rounded-2xl border border-slate-200 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-bold text-slate-800">
                      {isAr ? c.fullNameAr : c.fullNameEn}
                      <span className="ms-2 font-mono text-xs font-normal text-slate-400">{c.cardNumber}</span>
                    </p>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {[c.siteName, c.shiftName ? `${t("usualShift")}: ${c.shiftName}` : null].filter(Boolean).join(" · ")}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {c.reasons.map((r) => (
                      <Badge key={r} tone={r === "home-site" ? "blue" : "slate"} className="text-[11px]">
                        {reasonLabel(r, t)}
                      </Badge>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Shortage report: per-site × per-shift coverage with replacement suggestions. */
export default function ShortagesPage({ params: { locale } }: { params: { locale: string } }) {
  const t = useTranslations("shortage");
  const isAr = locale === "ar";
  const [date, setDate] = useState(todayStr());
  const [siteId, setSiteId] = useState("");
  const [sites, setSites] = useState<SiteOpt[]>([]);
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [drawer, setDrawer] = useState<{ site: SiteReport; shift: ShiftRow } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const qs = new URLSearchParams({ date });
      if (siteId) qs.set("siteId", siteId);
      const res = await fetch(`/api/v1/shortages?${qs}`);
      const body = (await res.json()) as Envelope;
      if (body.success && body.data) setReport(body.data as Report);
      else setError(true);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [date, siteId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    fetch("/api/v1/sites?pageSize=100")
      .then((r) => r.json())
      .then((j: unknown) => {
        const b = j as Envelope;
        if (b.success) setSites((b.data as SiteOpt[]) ?? []);
      })
      .catch(() => {});
  }, []);

  return (
    <div className="space-y-5">
      <PageHeader
        title={t("title")}
        subtitle={`${t("subtitle")} · ${prettyDate(date, locale)}`}
        actions={
          <Btn variant="outline" onClick={load} disabled={loading}>
            <Icon name="clock" className="h-4 w-4" />
            {t("refresh")}
          </Btn>
        }
      />

      <Card>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label={t("date")}>
            <input
              type="date"
              className={fieldInput}
              value={date}
              max={todayStr()}
              onChange={(e) => e.target.value && setDate(e.target.value)}
            />
          </Field>
          <Field label={t("site")}>
            <select className={fieldInput} value={siteId} onChange={(e) => setSiteId(e.target.value)}>
              <option value="">{t("allSites")}</option>
              {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
        </div>
      </Card>

      {loading && !report ? (
        <div className="flex justify-center py-16"><Spinner className="h-8 w-8 text-blue-700" /></div>
      ) : error || !report ? (
        <Card><EmptyState icon="x" title={t("loadError")} /></Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <Stat label={t("required")} value={report.totals.required} icon="sites" tone="blue" />
            <Stat label={t("present")} value={report.totals.present} icon="users" tone="green" />
            <Stat label={t("shortage")} value={report.totals.shortage} icon="x" tone="red" />
            <Stat label={t("redZones")} value={report.totals.redZones} icon="attendance" tone="amber" />
            <Stat label={t("sites")} value={report.totals.sites} icon="dashboard" tone="slate" />
          </div>

          {report.sites.length === 0 ? (
            <Card><EmptyState icon="sites" title={t("noSites")} /></Card>
          ) : (
            <div className="space-y-4">
              {report.sites.map((site) => (
                <Card key={site.siteId} className={site.totals.severity === "CRITICAL" ? "ring-2 ring-rose-200" : ""}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-[16px] font-extrabold text-slate-900">{site.siteName}</h3>
                      <p className="mt-0.5 text-xs tabular-nums text-slate-500">
                        {t("present")} {site.totals.present} / {t("required")} {site.totals.required}
                        {site.totals.shortage > 0 && (
                          <span className="font-bold text-rose-600"> · {t("shortBy")} {site.totals.shortage}</span>
                        )}
                      </p>
                    </div>
                    <Badge tone={severityTone[site.totals.severity]}>
                      {t(site.totals.severity === "NORMAL" ? "normal" : site.totals.severity === "WARNING" ? "warning" : "critical")}
                    </Badge>
                  </div>

                  <ShiftTable
                    shifts={site.shifts}
                    isAr={isAr}
                    t={t}
                    onSuggest={(shift) => setDrawer({ site, shift })}
                  />

                  {(site.unassigned.present > 0 || site.unassigned.absent > 0 || site.unassigned.onLeave > 0) && (
                    <p className="mt-2 text-xs text-slate-400">
                      {t("unassigned")}: {t("present")} {site.unassigned.present} · {t("absent")} {site.unassigned.absent} · {t("onLeave")} {site.unassigned.onLeave}
                    </p>
                  )}
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {drawer && (
        <CandidatesDrawer
          site={drawer.site}
          shift={drawer.shift}
          date={date}
          isAr={isAr}
          t={t}
          onClose={() => setDrawer(null)}
        />
      )}
    </div>
  );
}
