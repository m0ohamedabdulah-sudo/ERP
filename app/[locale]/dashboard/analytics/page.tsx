"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  BarChart, Bar, Legend,
} from "recharts";

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

const card = "rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200";

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
    <div>
      <h1 className="text-2xl font-bold text-slate-900">{t("title")}</h1>

      <div className="mt-4 flex gap-1 rounded-xl bg-slate-100 p-1 w-fit">
        {tabs.map((tb) => (
          <button key={tb.id} onClick={() => setTab(tb.id)}
            className={`rounded-lg px-5 py-2 text-sm font-medium ${tab === tb.id ? "bg-white shadow-sm text-slate-900" : "text-slate-500"}`}>
            {tb.label}
          </button>
        ))}
      </div>

      {tab === "operations" && (
        <div className="mt-4">
          <div className="flex flex-wrap items-end gap-2">
            <label className="block text-sm font-medium text-slate-700">{t("from")}
              <input type="date" value={from} onChange={(e) => setFrom(e.currentTarget.value)}
                className="mt-1 block rounded-lg border border-slate-300 px-3 py-2 text-sm" /></label>
            <label className="block text-sm font-medium text-slate-700">{t("to")}
              <input type="date" value={to} onChange={(e) => setTo(e.currentTarget.value)}
                className="mt-1 block rounded-lg border border-slate-300 px-3 py-2 text-sm" /></label>
            <label className="block text-sm font-medium text-slate-700">{t("site")}
              <select value={siteId} onChange={(e) => setSiteId(e.currentTarget.value)}
                className="mt-1 block min-w-40 rounded-lg border border-slate-300 px-3 py-2 text-sm">
                <option value="">{t("allSites")}</option>
                {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select></label>
            <button onClick={loadOps} disabled={loading}
              className="rounded-lg bg-slate-900 px-5 py-2 text-sm font-medium text-white disabled:opacity-50">
              {t("apply")}</button>
          </div>

          {ops && (
            <>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className={card}><p className="text-sm text-slate-500">{t("present")}</p>
                  <p className="text-2xl font-bold text-green-700">{fmt(ops.totals.present)}</p></div>
                <div className={card}><p className="text-sm text-slate-500">{t("absent")}</p>
                  <p className="text-2xl font-bold text-red-700">{fmt(ops.totals.absent)}</p></div>
                <div className={card}><p className="text-sm text-slate-500">{t("siteCoverage")}</p>
                  <p className="text-2xl font-bold text-slate-900">{fmt(ops.sites.reduce((s, x) => s + x.shortage, 0))} <span className="text-sm font-normal text-slate-500">{t("shortage")}</span></p></div>
              </div>

              <div className={`${card} mt-4`}>
                <h3 className="font-semibold text-slate-900">{t("attendanceTrend")}</h3>
                <div className="mt-2 h-64" dir="ltr">
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
              </div>

              <div className={`${card} mt-4`}>
                <h3 className="font-semibold text-slate-900">{t("siteCoverage")}</h3>
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b border-slate-200 text-slate-500">
                      <th className="px-3 py-2 text-start font-medium">{t("site")}</th>
                      <th className="px-3 py-2 text-center font-medium">{t("required")}</th>
                      <th className="px-3 py-2 text-center font-medium">{t("active")}</th>
                      <th className="px-3 py-2 text-center font-medium">{t("presentToday")}</th>
                      <th className="px-3 py-2 text-center font-medium">{t("shortage")}</th>
                    </tr></thead>
                    <tbody>
                      {ops.sites.map((s) => (
                        <tr key={s.siteId} className={`border-b border-slate-100 ${s.shortage > 0 ? "bg-red-50" : ""}`}>
                          <td className="px-3 py-2 font-medium text-slate-900">{s.siteName}</td>
                          <td className="px-3 py-2 text-center">{s.required}</td>
                          <td className="px-3 py-2 text-center">{s.active}</td>
                          <td className="px-3 py-2 text-center">{s.presentToday}</td>
                          <td className={`px-3 py-2 text-center font-bold ${s.shortage > 0 ? "text-red-700" : "text-green-700"}`}>{s.shortage}</td>
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
        <div className="mt-4">
          <div className="flex items-end gap-2">
            <label className="block text-sm font-medium text-slate-700">{t("months")}
              <select value={months} onChange={(e) => setMonths(e.currentTarget.value)}
                className="mt-1 block rounded-lg border border-slate-300 px-3 py-2 text-sm">
                {["3", "6", "12"].map((m) => <option key={m} value={m}>{m}</option>)}
              </select></label>
            <button onClick={loadFin} disabled={loading}
              className="rounded-lg bg-slate-900 px-5 py-2 text-sm font-medium text-white disabled:opacity-50">{t("apply")}</button>
          </div>

          {fin && (
            <>
              <div className="mt-4 grid gap-3 sm:grid-cols-4">
                <div className={card}><p className="text-sm text-slate-500">{t("totalPayroll")}</p>
                  <p className="text-xl font-bold text-slate-900">{fmt(fin.totals.payroll)}</p></div>
                <div className={card}><p className="text-sm text-slate-500">{t("totalInvoiced")}</p>
                  <p className="text-xl font-bold text-slate-900">{fmt(fin.totals.invoiced)}</p></div>
                <div className={card}><p className="text-sm text-slate-500">{t("totalCollected")}</p>
                  <p className="text-xl font-bold text-green-700">{fmt(fin.totals.collected)}</p></div>
                <div className={card}><p className="text-sm text-slate-500">{t("outstanding")}</p>
                  <p className="text-xl font-bold text-red-700">{fmt(fin.outstanding)}</p></div>
              </div>

              <div className={`${card} mt-4`}>
                <h3 className="font-semibold text-slate-900">{t("monthlyOverview")}</h3>
                <div className="mt-2 h-72" dir="ltr">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={fin.monthly}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="payroll" name={t("payroll")} fill="#0f172a" />
                      <Bar dataKey="invoiced" name={t("invoiced")} fill="#2563eb" />
                      <Bar dataKey="collected" name={t("collected")} fill="#16a34a" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {tab === "hr" && hr && (
        <div className="mt-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className={card}><p className="text-sm text-slate-500">{t("totalActive")}</p>
              <p className="text-2xl font-bold text-slate-900">{hr.totalActive}</p></div>
            <div className={card}><p className="text-sm text-slate-500">{t("expiringDocuments")}</p>
              <p className="text-2xl font-bold text-amber-700">{hr.expiringDocuments.length}</p></div>
            <div className={card}><p className="text-sm text-slate-500">{t("expiredDocuments")}</p>
              <p className="text-2xl font-bold text-red-700">{hr.expiredCount}</p></div>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div className={card}>
              <h3 className="font-semibold text-slate-900">{t("headcountByStatus")}</h3>
              <div className="mt-2 space-y-1.5">
                {hr.byStatus.map((r) => (
                  <div key={r.status} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
                    <span className="font-medium">{r.status}</span><span className="font-bold">{r.count}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className={card}>
              <h3 className="font-semibold text-slate-900">{t("headcountBySite")}</h3>
              <div className="mt-2 space-y-1.5">
                {hr.bySite.map((r) => (
                  <div key={r.siteName} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
                    <span className="font-medium">{r.siteName}</span><span className="font-bold">{r.count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className={`${card} mt-4`}>
            <h3 className="font-semibold text-slate-900">{t("expiringDocuments")}</h3>
            {hr.expiringDocuments.length === 0
              ? <p className="mt-2 text-sm text-slate-500">{t("noData")}</p>
              : (
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b border-slate-200 text-slate-500">
                      <th className="px-3 py-2 text-start font-medium">{t("employee")}</th>
                      <th className="px-3 py-2 text-start font-medium">{t("document")}</th>
                      <th className="px-3 py-2 text-center font-medium">{t("expiresAt")}</th>
                    </tr></thead>
                    <tbody>
                      {hr.expiringDocuments.map((d, i) => (
                        <tr key={i} className="border-b border-slate-100">
                          <td className="px-3 py-2">{d.employeeName} <span className="font-mono text-xs text-slate-400">{d.cardNumber}</span></td>
                          <td className="px-3 py-2">{locale === "ar" ? d.documentTypeAr : d.documentTypeEn}</td>
                          <td className="px-3 py-2 text-center font-medium text-amber-700" dir="ltr">{d.expiresAt}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
          </div>
        </div>
      )}
    </div>
  );
}
