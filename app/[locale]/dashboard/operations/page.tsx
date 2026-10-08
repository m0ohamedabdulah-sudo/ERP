"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  Badge, Btn, Card, EmptyState, Field, Icon, PageHeader, Spinner, Stat,
  fieldInput,
} from "../_ui";

interface LivePerson {
  employeeId: string;
  cardNumber: string;
  fullNameAr: string;
  fullNameEn: string;
  shiftName: string | null;
  checkedInAt?: string;
}

interface LiveSite {
  siteId: string;
  siteName: string;
  required: number;
  requiredSource: "roster" | "manpower";
  present: number;
  redZone: boolean;
  missing: LivePerson[];
  late: LivePerson[];
  unscheduledPresent: LivePerson[];
}

interface LiveAlert {
  siteId: string;
  siteName: string;
  required: number;
  present: number;
}

interface LiveBoard {
  date: string;
  sites: LiveSite[];
  alerts: LiveAlert[];
  totals: { sites: number; required: number; present: number; missing: number; redZones: number };
}

interface SiteOpt { id: string; name: string }
interface EmpOpt { id: string; cardNumber: string; fullNameAr: string; fullNameEn: string }
interface Envelope { success: boolean; data?: unknown; error?: { message?: string } }

function prettyDate(iso: string, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-GB", {
      weekday: "long", day: "numeric", month: "long", timeZone: "UTC",
    }).format(new Date(iso + "T00:00:00Z"));
  } catch {
    return iso;
  }
}

function timeOf(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Africa/Cairo",
    }).format(new Date(iso));
  } catch {
    return "";
  }
}

function PersonRow({ p, isAr, extra }: { p: LivePerson; isAr: boolean; extra?: string }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2 text-[13px]">
      <span className="min-w-0">
        <span className="font-semibold text-slate-800">{isAr ? p.fullNameAr : p.fullNameEn}</span>
        <span className="ms-2 font-mono text-xs text-slate-400">{p.cardNumber}</span>
      </span>
      <span className="shrink-0 text-xs text-slate-500">
        {[p.shiftName, extra].filter(Boolean).join(" · ")}
      </span>
    </div>
  );
}

function SiteCard({ site, isAr, t }: { site: LiveSite; isAr: boolean; t: (k: string) => string }) {
  const [open, setOpen] = useState(site.redZone);
  const pct = site.required > 0 ? Math.min(100, Math.round((site.present / site.required) * 100)) : 100;
  const barTone = site.redZone ? "bg-rose-500" : pct >= 100 ? "bg-emerald-500" : "bg-blue-500";
  const hasLists = site.missing.length > 0 || site.late.length > 0 || site.unscheduledPresent.length > 0;

  return (
    <Card className={site.redZone ? "ring-2 ring-rose-200" : ""}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-[16px] font-extrabold text-slate-900">{site.siteName}</h3>
          <p className="mt-0.5 text-xs text-slate-400">
            {t(site.requiredSource === "roster" ? "fromRoster" : "fromManpower")}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {site.redZone
            ? <Badge tone="red">{t("redZone")}</Badge>
            : <Badge tone="green">{t("allCovered")}</Badge>}
          <Link
            href={`./operations/qr/${site.siteId}`}
            className="inline-flex items-center gap-1 rounded-xl border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            title={t("qrCode")}
          >
            <Icon name="upload" className="h-3.5 w-3.5" />
            QR
          </Link>
        </div>
      </div>

      <div className="mt-4 flex items-end justify-between">
        <p className="text-3xl font-extrabold tabular-nums tracking-tight text-slate-900">
          {site.present}
          <span className="text-lg font-bold text-slate-400"> / {site.required}</span>
        </p>
        <p className="text-xs font-medium text-slate-500">{t("present")} / {t("required")}</p>
      </div>
      <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full transition-all ${barTone}`} style={{ width: `${pct}%` }} />
      </div>

      {hasLists && (
        <button
          onClick={() => setOpen((v) => !v)}
          className="mt-3 flex w-full items-center justify-between rounded-xl px-1 py-1 text-[13px] font-semibold text-slate-600 hover:text-slate-900"
        >
          <span className="flex gap-3">
            {site.missing.length > 0 && <span className="text-rose-600">● {site.missing.length} {t("missing")}</span>}
            {site.late.length > 0 && <span className="text-amber-600">● {site.late.length} {t("late")}</span>}
            {site.unscheduledPresent.length > 0 && <span className="text-blue-600">● {site.unscheduledPresent.length} {t("unscheduled")}</span>}
          </span>
          <Icon name={open ? "chevronLeft" : "chevronRight"} className="h-4 w-4 rtl:rotate-180" />
        </button>
      )}
      {open && hasLists && (
        <div className="mt-2 space-y-2">
          {site.missing.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-bold text-rose-600">{t("missing")}</p>
              <div className="space-y-1.5">
                {site.missing.map((p) => <PersonRow key={p.employeeId} p={p} isAr={isAr} />)}
              </div>
            </div>
          )}
          {site.late.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-bold text-amber-600">{t("late")}</p>
              <div className="space-y-1.5">
                {site.late.map((p) => <PersonRow key={p.employeeId} p={p} isAr={isAr} extra={p.checkedInAt ? timeOf(p.checkedInAt) : undefined} />)}
              </div>
            </div>
          )}
          {site.unscheduledPresent.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-bold text-blue-600">{t("unscheduled")}</p>
              <div className="space-y-1.5">
                {site.unscheduledPresent.map((p) => <PersonRow key={p.employeeId} p={p} isAr={isAr} extra={p.checkedInAt ? timeOf(p.checkedInAt) : undefined} />)}
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

/** Live operations command center: per-site coverage board, auto-refresh 60s. */
export default function OperationsPage({ params: { locale } }: { params: { locale: string } }) {
  const t = useTranslations("operations");
  const isAr = locale === "ar";
  const [board, setBoard] = useState<LiveBoard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // Manual panel state
  const [sites, setSites] = useState<SiteOpt[]>([]);
  const [empQuery, setEmpQuery] = useState("");
  const [empOpts, setEmpOpts] = useState<EmpOpt[]>([]);
  const [empId, setEmpId] = useState("");
  const [siteId, setSiteId] = useState("");
  const [action, setAction] = useState<"in" | "out">("in");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [manualMsg, setManualMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(false);
    try {
      const res = await fetch("/api/v1/operations/live");
      const body = (await res.json()) as Envelope;
      if (body.success && body.data) setBoard(body.data as LiveBoard);
      else setError(true);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(() => load(true), 60_000);
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => {
    fetch("/api/v1/sites?pageSize=100")
      .then((r) => r.json())
      .then((j: unknown) => {
        const b = j as Envelope;
        if (b.success) setSites((b.data as SiteOpt[]) ?? []);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (empQuery.trim().length < 2) { setEmpOpts([]); return; }
    const id = setTimeout(() => {
      fetch(`/api/v1/employees?search=${encodeURIComponent(empQuery)}&status=ACTIVE&pageSize=20`)
        .then((r) => r.json())
        .then((j: unknown) => {
          const b = j as { success: boolean; data?: EmpOpt[] };
          if (b.success) setEmpOpts(b.data ?? []);
        })
        .catch(() => {});
    }, 300);
    return () => clearTimeout(id);
  }, [empQuery]);

  const selectedEmp = useMemo(() => empOpts.find((e) => e.id === empId), [empOpts, empId]);

  async function submitManual() {
    if (!empId || !siteId || saving) return;
    setSaving(true);
    setManualMsg(null);
    try {
      const res = await fetch("/api/v1/operations/checkin/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId: empId, siteId, action, note: note || undefined }),
      });
      const body = (await res.json()) as Envelope;
      if (body.success) {
        setManualMsg({ ok: true, text: t("manualDone") });
        setEmpQuery(""); setEmpId(""); setNote("");
        load(true);
      } else {
        setManualMsg({ ok: false, text: body.error?.message ?? t("loadError") });
      }
    } catch {
      setManualMsg({ ok: false, text: t("loadError") });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title={t("title")}
        subtitle={board ? `${t("subtitle")} · ${prettyDate(board.date, locale)}` : t("subtitle")}
        actions={
          <Btn variant="outline" onClick={() => load()} disabled={loading}>
            <Icon name="clock" className="h-4 w-4" />
            {t("refresh")}
          </Btn>
        }
      />

      {loading && !board ? (
        <div className="flex justify-center py-16"><Spinner className="h-8 w-8 text-blue-700" /></div>
      ) : error || !board ? (
        <Card><EmptyState icon="clock" title={t("loadError")} /></Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <Stat label={t("present")} value={board.totals.present} icon="users" tone="green" />
            <Stat label={t("required")} value={board.totals.required} icon="sites" tone="blue" />
            <Stat label={t("missing")} value={board.totals.missing} icon="x" tone="red" />
            <Stat label={t("redZone")} value={board.totals.redZones} icon="attendance" tone="amber" />
            <Stat label={t("site")} value={board.totals.sites} icon="dashboard" tone="slate" />
          </div>

          {board.alerts.length > 0 && (
            <Card className="border-rose-200 bg-rose-50/60">
              <p className="mb-2 text-sm font-extrabold text-rose-800">{t("alertsTitle")}</p>
              <div className="flex flex-wrap gap-2">
                {board.alerts.map((a) => (
                  <Badge key={a.siteId} tone="red" className="px-3 py-1.5 text-[13px]">
                    {a.siteName}: {a.present}/{a.required}
                  </Badge>
                ))}
              </div>
            </Card>
          )}

          {board.sites.length === 0 ? (
            <Card><EmptyState icon="sites" title={t("noSites")} /></Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {board.sites.map((s) => <SiteCard key={s.siteId} site={s} isAr={isAr} t={t} />)}
            </div>
          )}

          <Card>
            <h3 className="text-[16px] font-extrabold text-slate-900">{t("manualTitle")}</h3>
            <p className="mt-0.5 text-[13px] text-slate-500">{t("manualHint")}</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field label={t("employee")}>
                <input
                  className={fieldInput}
                  value={empQuery}
                  onChange={(e) => { setEmpQuery(e.target.value); setEmpId(""); }}
                  placeholder={t("searchEmployee")}
                />
                {empOpts.length > 0 && !empId && (
                  <div className="mt-1 max-h-44 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg">
                    {empOpts.map((e) => (
                      <button
                        key={e.id}
                        type="button"
                        onClick={() => { setEmpId(e.id); setEmpQuery(isAr ? e.fullNameAr : e.fullNameEn); }}
                        className="block w-full px-3 py-2 text-start text-[13px] hover:bg-slate-50"
                      >
                        <span className="font-semibold">{isAr ? e.fullNameAr : e.fullNameEn}</span>
                        <span className="ms-2 font-mono text-xs text-slate-400">{e.cardNumber}</span>
                      </button>
                    ))}
                  </div>
                )}
                {selectedEmp && (
                  <p className="mt-1 font-mono text-xs text-slate-500">{selectedEmp.cardNumber}</p>
                )}
              </Field>
              <Field label={t("site")}>
                <select className={fieldInput} value={siteId} onChange={(e) => setSiteId(e.target.value)}>
                  <option value="">{t("selectSite")}</option>
                  {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </Field>
              <Field label={t("action")}>
                <div className="mt-1.5 flex gap-2">
                  {(["in", "out"] as const).map((a) => (
                    <button
                      key={a}
                      type="button"
                      onClick={() => setAction(a)}
                      className={`flex-1 rounded-xl px-3 py-2.5 text-sm font-bold transition ${
                        action === a
                          ? a === "in" ? "bg-emerald-600 text-white" : "bg-rose-600 text-white"
                          : "border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      {t(a === "in" ? "checkIn" : "checkOut")}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label={t("note")}>
                <input
                  className={fieldInput}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="…"
                />
              </Field>
            </div>
            <div className="mt-4 flex items-center gap-3">
              <Btn onClick={submitManual} disabled={!empId || !siteId || saving}>
                {saving && <Spinner className="h-4 w-4" />}
                {t("submit")}
              </Btn>
              {manualMsg && (
                <p className={`text-sm font-semibold ${manualMsg.ok ? "text-emerald-700" : "text-rose-700"}`}>
                  {manualMsg.text}
                </p>
              )}
            </div>
          </Card>
          <p className="text-center text-xs text-slate-400">{t("autoRefresh")}</p>
        </>
      )}
    </div>
  );
}
