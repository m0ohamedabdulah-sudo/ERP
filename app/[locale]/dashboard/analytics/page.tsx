"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  BarChart, Bar, Legend,
} from "recharts";
import { PageHeader, Card, Btn, Badge, Stat, Field, fieldInput, EmptyState, Spinner } from "../_ui";

interface Envelope { success: boolean; data?: unknown }
interface Daily { date: string; present: number; absent: number }
interface SiteCov { siteId: string; siteName: string; required: number; active: number; presentToday: number; shortage: number }
interface OpsData { daily: Daily[]; sites: SiteCov[]; totals: { present: number; absent: number; records: number } }
interface FinMonth { month: string; payroll: number; invoiced: number; collected: number }
interface FinData { monthly: FinMonth[]; outstanding: number; totals: { payroll: number; invoiced: number; collected: number } }
interface HrData {
  byStatus: { status: string; count: number }[];
  bySite: { siteName: string; count: number }[];
  expiringDocuments: { employeeName: string; cardNumber: string; documentTypeAr: string; documentTypeEn: string; expiresAt: string }[];
  expiredCount: number; totalActive: number;
}
interface SiteOpt { id: string; name: string }

type Tab = "operations" | "finance" | "hr";

function toISO(d: Date): string { return d.toISOString().slice(0, 10); }
function fmt(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

/** Analytics dashboards: operations, finance, HR. */
export default function AnalyticsPage() {
  const t = useTranslations("analytics");
  const locale = useLocale();
  const [tab, setTab] = useState<Tab>("operations");
  const [sites, setSites] = useState<SiteOpt[]>([]);

  const [from, setFrom] = useState(() => toISO(new Date(Date.now() - 29 * 86400000)));
  const [to, setTo] = useState(() => toISO(new Date()));
  const [siteId, setSiteId] = useState("");
  const [ops, setOps] = useState<OpsData | null>(null);

  const [months, setMonths] = useState("6");
  const [fin, setFin] = useState<FinData | null>(null);

  const [hr, setHr] = useState<HrData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/v1/sites?pageSize=100").then((r) => r.json()).then((j: unknown) => {
      const b = j as Envelope;
      if (b.success) setSites((b.data as SiteOpt[]) ?? []);
    }).catch(() => {});
  }, []);

  const loadOps = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ from, to, ...(siteId ? { siteId } : {}) });
      const res = await fetch(`/api/v1/analytics/operations?${qs}`);
      const b = (await res.json()) as Envelope;
      if (b.success) setOps(b.data as OpsData);
    } catch { /* noop */ } finally { setLoading(false); }
  }, [from, to, siteId]);

  const loadFin = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/analytics/finance?months=${months}`);
      const b = (await res.json()) as Envelope;
      if (b.success) setFin(b.data as FinData);
    } catch { /* noop */ } finally { setLoading(false); }
  }, [months]);

  const loadHr = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/analytics/hr");
      const b = (await res.json()) as Envelope;
      if (b.success) setHr(b.data as HrData);
    } catch { /* noop */ } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (tab === "operations") loadOps();
    else if (tab === "finance") loadFin();
    else loadHr();
  }, [tab, loadOps, loadFin, loadHr]);

  const tabs: { id: Tab; label: string }[] = [
    { id: "operations", label: t("tabOperations") },
    { id: "finance", label: t("tabFinance") },
    { id: "hr", label: t("tabHR") },
  ];

  return (
    <div className="space-y-5">
      <PageHeader title={t("title")} />

      <div className="flex w-fit gap-1 rounded-2xl border border-slate-200/70 bg-white p-1.5 shadow-[0_1px_2px_rgba(15,23,42,0.05)]">
        {tabs.map((tb) => (
          <button key={tb.id} onClick={() => setTab(tb.id)}
            className={`rounded-xl px-5 py-2 text-sm font-semibold transition ${
              tab === tb.id ? "bg-slate-900 text-white shadow" : "text-slate-500 hover:text-slate-800"
            }`}>
            {tb.label}
          </button>
        ))}
      </div>

      {tab === "operations" && (
        <div className="space-y-5">
          <Card className="flex flex-wrap items-end gap-3">
            <Field label={t("from")}>
              <input type="date" value={from} onChange={(e) => setFrom(e.currentTarget.value)}
                className={fieldInput} />
            </Field>
            <Field label={t("to")}>
              <input type="date" value={to} onChange={(e) => setTo(e.currentTarget.value)}
                className={fieldInput} />
            </Field>
            <Field label={t("site")}>
              <select value={siteId} onChange={(e) => setSiteId(e.currentTarget.value)}
                className={`${fieldInput} min-w-44`}>
                <option value="">{t("allSites")}</option>
                {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
            <Btn variant="primary" onClick={loadOps} disabled={loading} className="mt-[26px]">
              {loading ? <Spinner className="h-4 w-4" /> : null}{t("apply")}
            </Btn>
          </Card>

          {ops && (
            <>
              <div className="grid gap-4 sm:grid-cols-3">
                <Stat label={t("present")} value={fmt(ops.totals.present)} icon="check" tone="green" />
                <Stat label={t("absent")} value={fmt(ops.totals.absent)} icon="x" tone="red" />
                <Stat
                  label={t("siteCoverage")}
                  value={<>{fmt(ops.sites.reduce((s, x) => s + x.shortage, 0))} <span className="text-sm font-medium text-slate-400">{t("shortage")}</span></>}
                  icon="sites"
                  tone={ops.sites.some((s) => s.shortage > 0) ? "red" : "blue"}
                />
              </div>

              <Card>
                <h3 className="text-[15px] font-bold text-slate-900">{t("attendanceTrend")}</h3>
                <div className="mt-3 h-64" dir="ltr">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={ops.daily.map((d) => ({ ...d, date: d.date.slice(5) }))}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} interval={Math.max(0, Math.floor(ops.daily.length / 10))} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Area type="monotone" dataKey="present" name={t("present")} stroke="#15803d" fill="#bbf7d0" />
                      <Area type="monotone" dataKey="absent" name={t("absent")} stroke="#b91c1c" fill="#fecaca" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </Card>

              <div className="overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.05)]">
                <h3 className="px-5 pt-5 text-[15px] font-bold text-slate-900">{t("siteCoverage")}</h3>
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-y border-slate-100 bg-slate-50/60 text-slate-500">
                      <th className="px-5 py-3 text-start font-semibold">{t("site")}</th>
                      <th className="px-3 py-3 text-center font-semibold">{t("required")}</th>
                      <th className="px-3 py-3 text-center font-semibold">{t("active")}</th>
                      <th className="px-3 py-3 text-center font-semibold">{t("presentToday")}</th>
                      <th className="px-3 py-3 text-center font-semibold">{t("shortage")}</th>
                    </tr></thead>
                    <tbody>
                      {ops.sites.map((s) => (
                        <tr key={s.siteId} className={`border-b border-slate-100 last:border-0 hover:bg-slate-50/60 ${s.shortage > 0 ? "bg-rose-50/50" : ""}`}>
                          <td className="px-5 py-3 font-semibold text-slate-900">{s.siteName}</td>
                          <td className="px-3 py-3 text-center tabular-nums">{s.required}</td>
                          <td className="px-3 py-3 text-center tabular-nums">{s.active}</td>
                          <td className="px-3 py-3 text-center tabular-nums">{s.presentToday}</td>
                          <td className="px-3 py-3 text-center">
                            <Badge tone={s.shortage > 0 ? "red" : "green"}>{s.shortage}</Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {tab === "finance" && (
        <div className="space-y-5">
          <Card className="flex flex-wrap items-end gap-3">
            <Field label={t("months")}>
              <select value={months} onChange={(e) => setMonths(e.currentTarget.value)}
                className={`${fieldInput} min-w-28`}>
                {["3", "6", "12"].map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </Field>
            <Btn variant="primary" onClick={loadFin} disabled={loading} className="mt-[26px]">
              {loading ? <Spinner className="h-4 w-4" /> : null}{t("apply")}
            </Btn>
          </Card>

          {fin && (
            <>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Stat label={t("totalPayroll")} value={fmt(fin.totals.payroll)} icon="payroll" tone="slate" />
                <Stat label={t("totalInvoiced")} value={fmt(fin.totals.invoiced)} icon="invoices" tone="blue" />
                <Stat label={t("totalCollected")} value={fmt(fin.totals.collected)} icon="check" tone="green" />
                <Stat label={t("outstanding")} value={fmt(fin.outstanding)} icon="clock" tone="red" />
              </div>

              <Card>
                <h3 className="text-[15px] font-bold text-slate-900">{t("monthlyOverview")}</h3>
                <div className="mt-3 h-72" dir="ltr">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={fin.monthly}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="payroll" name={t("payroll")} fill="#0f172a" radius={[6, 6, 0, 0]} />
                      <Bar dataKey="invoiced" name={t("invoiced")} fill="#2563eb" radius={[6, 6, 0, 0]} />
                      <Bar dataKey="collected" name={t("collected")} fill="#16a34a" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            </>
          )}
        </div>
      )}

      {tab === "hr" && hr && (
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <Stat label={t("totalActive")} value={hr.totalActive} icon="users" tone="blue" />
            <Stat label={t("expiringDocuments")} value={hr.expiringDocuments.length} icon="clock" tone="amber" />
            <Stat label={t("expiredDocuments")} value={hr.expiredCount} icon="x" tone="red" />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <h3 className="text-[15px] font-bold text-slate-900">{t("headcountByStatus")}</h3>
              <div className="mt-3 space-y-1.5">
                {hr.byStatus.map((r) => (
                  <div key={r.status} className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-2.5 text-sm">
                    <span className="font-medium text-slate-700">{r.status}</span>
                    <Badge tone="blue">{r.count}</Badge>
                  </div>
                ))}
              </div>
            </Card>
            <Card>
              <h3 className="text-[15px] font-bold text-slate-900">{t("headcountBySite")}</h3>
              <div className="mt-3 space-y-1.5">
                {hr.bySite.map((r) => (
                  <div key={r.siteName} className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-2.5 text-sm">
                    <span className="font-medium text-slate-700">{r.siteName}</span>
                    <Badge tone="blue">{r.count}</Badge>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          <Card>
            <h3 className="text-[15px] font-bold text-slate-900">{t("expiringDocuments")}</h3>
            {hr.expiringDocuments.length === 0 ? (
              <EmptyState icon="documents" title={t("noData")} />
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-slate-100 text-slate-500">
                    <th className="px-3 py-2.5 text-start font-semibold">{t("employee")}</th>
                    <th className="px-3 py-2.5 text-start font-semibold">{t("document")}</th>
                    <th className="px-3 py-2.5 text-center font-semibold">{t("expiresAt")}</th>
                  </tr></thead>
                  <tbody>
                    {hr.expiringDocuments.map((d, i) => (
                      <tr key={i} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                        <td className="px-3 py-2.5 font-medium text-slate-900">
                          {d.employeeName} <span className="font-mono text-xs font-normal text-slate-400" dir="ltr">{d.cardNumber}</span>
                        </td>
                        <td className="px-3 py-2.5 text-slate-600">{locale === "ar" ? d.documentTypeAr : d.documentTypeEn}</td>
                        <td className="px-3 py-2.5 text-center">
                          <Badge tone="amber"><span dir="ltr">{d.expiresAt}</span></Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
