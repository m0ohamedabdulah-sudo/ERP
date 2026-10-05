"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";

interface PayrollRow {
  id: string;
  employeeId: string;
  cardNumber: string;
  fullNameAr: string;
  siteName: string;
  payoutMethod: string;
  basicSalary: number;
  totalP: number;
  deductions: number;
  advances: number;
  bonus: number;
  netPay: number;
  status: string;
}
interface Totals { employees: number; totalNet: number; totalDeductions: number; totalBonus: number }
interface SiteOpt { id: string; name: string }
interface Effect { id: string; kind: string; amount: number; notes: string | null; createdAt: string }

interface Envelope {
  success: boolean; data?: unknown;
  error?: { message?: string };
}

const inputCls =
  "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none";
const labelCls = "block text-sm font-medium text-slate-700";

const KINDS = ["FINE", "CUT", "ADVANCE", "BONUS", "ALLOWANCE"];
const PAYOUTS = ["CASH", "BANK_TRANSFER", "E_WALLET"];

/** Payroll: monthly report from attendance + financial effects + finalize. */
export default function PayrollPage() {
  const t = useTranslations("payroll");
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [siteId, setSiteId] = useState("");
  const [sites, setSites] = useState<SiteOpt[]>([]);
  const [rows, setRows] = useState<PayrollRow[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // effects drawer
  const [fxEmp, setFxEmp] = useState<PayrollRow | null>(null);
  const [effects, setEffects] = useState<Effect[]>([]);
  const [fxForm, setFxForm] = useState({ kind: "FINE", amount: "", notes: "" });

  // payout modal
  const [payEmp, setPayEmp] = useState<PayrollRow | null>(null);
  const [payForm, setPayForm] = useState({ payoutMethod: "CASH", bankAccount: "" });
  const [archives, setArchives] = useState<{ year: number; month: number; status: string; employees: number; totalNet: number }[]>([]);
  const [showArchives, setShowArchives] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ year: String(year), month: String(month) });
      if (siteId) qs.set("siteId", siteId);
      const res = await fetch(`/api/v1/payroll/report?${qs}`);
      const body = (await res.json()) as Envelope;
      if (body.success) {
        const d = body.data as { records: PayrollRow[]; totals: Totals };
        setRows(d.records);
        setTotals(d.totals);
      }
    } catch { /* keep */ } finally { setLoading(false); }
  }, [year, month, siteId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    fetch("/api/v1/payroll/archives").then((r) => r.json()).then((j: unknown) => {
      const b = j as Envelope;
      if (b.success) setArchives((b.data as typeof archives) ?? []);
    }).catch(() => {});
  }, []);
  useEffect(() => {
    fetch("/api/v1/sites?pageSize=100").then((r) => r.json()).then((j: unknown) => {
      const b = j as Envelope;
      if (b.success) setSites((b.data as SiteOpt[]) ?? []);
    }).catch(() => {});
  }, []);

  async function generate() {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch("/api/v1/payroll/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ year, month }),
      });
      const body = (await res.json()) as Envelope;
      if (body.success) { load(); }
      else setMsg({ ok: false, text: body.error?.message ?? t("saveError") });
    } catch { setMsg({ ok: false, text: t("saveError") }); }
    finally { setBusy(false); }
  }

  async function finalize() {
    if (!window.confirm(t("finalizeConfirm"))) return;
    setBusy(true);
    try {
      const res = await fetch("/api/v1/payroll/finalize", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ year, month }),
      });
      const body = (await res.json()) as Envelope;
      if (body.success) load();
    } catch { /* noop */ } finally { setBusy(false); }
  }

  async function openEffects(row: PayrollRow) {
    setFxEmp(row);
    setFxForm({ kind: "FINE", amount: "", notes: "" });
    try {
      const res = await fetch(
        `/api/v1/payroll/adjustments?employeeId=${row.employeeId}&year=${year}&month=${month}`,
      );
      const body = (await res.json()) as Envelope;
      if (body.success) setEffects((body.data as Effect[]) ?? []);
    } catch { setEffects([]); }
  }

  async function addEffect(e: React.FormEvent) {
    e.preventDefault();
    if (!fxEmp) return;
    setBusy(true);
    try {
      const res = await fetch("/api/v1/payroll/adjustments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          employeeId: fxEmp.employeeId, year, month,
          kind: fxForm.kind, amount: Number(fxForm.amount),
          notes: fxForm.notes.trim() || undefined,
        }),
      });
      const body = (await res.json()) as Envelope;
      if (body.success) {
        setFxForm({ kind: "FINE", amount: "", notes: "" });
        openEffects({ ...fxEmp });
        load();
      }
    } catch { /* noop */ } finally { setBusy(false); }
  }

  async function deleteEffect(id: string) {
    if (!window.confirm(t("deleteEffectConfirm")) || !fxEmp) return;
    try {
      const res = await fetch(`/api/v1/payroll/adjustments/${id}`, { method: "DELETE" });
      const body = (await res.json()) as Envelope;
      if (body.success) { openEffects(fxEmp); load(); }
    } catch { /* noop */ }
  }

  async function savePayout(e: React.FormEvent) {
    e.preventDefault();
    if (!payEmp) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/payroll/employees/${payEmp.employeeId}/payout`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          payoutMethod: payForm.payoutMethod,
          bankAccount: payForm.bankAccount.trim() || undefined,
        }),
      });
      const body = (await res.json()) as Envelope;
      if (body.success) { setPayEmp(null); load(); }
    } catch { /* noop */ } finally { setBusy(false); }
  }

  const money = (n: number) =>
    n.toLocaleString("en-US", { maximumFractionDigits: 2 });

  const byMethod = rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.payoutMethod] = (acc[r.payoutMethod] ?? 0) + r.netPay;
    return acc;
  }, {});

  const monthLabel = `${year}-${String(month).padStart(2, "0")}`;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold text-slate-900">{t("title")} — {monthLabel}</h1>
        <div className="flex gap-2">
          <button onClick={generate} disabled={busy}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            {t("generate")}
          </button>
          {rows.length > 0 && rows[0]?.status === "DRAFT" && (
            <button onClick={finalize} disabled={busy}
              className="rounded-lg border border-green-600 px-4 py-2 text-sm font-medium text-green-700 disabled:opacity-50">
              {t("finalize")}
            </button>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <label className="block text-sm font-medium text-slate-700">
          {t("month")}
          <input type="month" value={monthLabel}
            onChange={(e) => {
              const [y, m] = e.currentTarget.value.split("-").map(Number);
              if (y && m) { setYear(y); setMonth(m); }
            }}
            className="mt-1 block rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          {t("site")}
          <select value={siteId} onChange={(e) => setSiteId(e.currentTarget.value)}
            className="mt-1 block min-w-48 rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <option value="">{t("allSites")}</option>
            {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
      </div>

      {msg && (
        <p className={`mt-4 rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
          {msg.text}
        </p>
      )}

      {totals && totals.employees > 0 && (
        <div className="mt-4 grid gap-4 sm:grid-cols-4">
          {[
            { label: t("employees"), value: String(totals.employees) },
            { label: t("totalNet"), value: money(totals.totalNet) },
            { label: t("totalDeductions"), value: money(totals.totalDeductions) },
            { label: t("totalBonus"), value: money(totals.totalBonus) },
          ].map((c) => (
            <div key={c.label} className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
              <p className="text-xs text-slate-500">{c.label}</p>
              <p className="mt-1 text-xl font-bold text-slate-900" dir="ltr">{c.value}</p>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-slate-200 text-slate-500">
            <th className="px-4 py-3 text-start font-medium">{t("employee")}</th>
            <th className="px-4 py-3 text-start font-medium">{t("site")}</th>
            <th className="px-4 py-3 text-start font-medium">{t("totalP")}</th>
            <th className="px-4 py-3 text-start font-medium">{t("deductions")}</th>
            <th className="px-4 py-3 text-start font-medium">{t("bonus")}</th>
            <th className="px-4 py-3 text-start font-medium">{t("netPay")}</th>
            <th className="px-4 py-3 text-start font-medium">{t("payout")}</th>
            <th className="px-4 py-3 text-start font-medium">{t("actions")}</th>
          </tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-slate-100">
                <td className="px-4 py-3 font-medium text-slate-900">
                  {r.fullNameAr}
                  <span className="block font-mono text-xs font-normal text-slate-500">{r.cardNumber}</span>
                </td>
                <td className="px-4 py-3 text-slate-600">{r.siteName}</td>
                <td className="px-4 py-3" dir="ltr">{r.totalP}</td>
                <td className="px-4 py-3 text-red-700" dir="ltr">{money(r.deductions + r.advances)}</td>
                <td className="px-4 py-3 text-green-700" dir="ltr">{money(r.bonus)}</td>
                <td className="px-4 py-3 font-bold" dir="ltr">{money(r.netPay)}</td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => {
                      setPayEmp(r);
                      setPayForm({ payoutMethod: r.payoutMethod, bankAccount: "" });
                    }}
                    className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700 hover:bg-slate-200"
                    title={t("setPayout")}
                  >
                    {t(`payout_${r.payoutMethod}`)}
                  </button>
                </td>
                <td className="px-4 py-3">
                  <button onClick={() => openEffects(r)}
                    className="text-sm font-medium text-slate-700 hover:text-slate-900">
                    {t("effects")}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && rows.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-slate-500">{t("noRecords")}</p>
        )}
      </div>

      {Object.keys(byMethod).length > 0 && (
        <div className="mt-4 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <h3 className="text-sm font-semibold text-slate-900">{t("byMethod")}</h3>
          <div className="mt-2 flex flex-wrap gap-4 text-sm">
            {Object.entries(byMethod).map(([m, total]) => (
              <span key={m} className="text-slate-600">
                {t(`payout_${m}`)}: <strong className="text-slate-900" dir="ltr">{money(total)}</strong>
              </span>
            ))}
          </div>
        </div>
      )}

      {fxEmp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-bold text-slate-900">{t("effects")} — {fxEmp.fullNameAr}</h2>

            <ul className="mt-3 space-y-2">
              {effects.map((fx) => (
                <li key={fx.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
                  <span>
                    <span className={`font-medium ${["FINE", "CUT", "ADVANCE"].includes(fx.kind) ? "text-red-700" : "text-green-700"}`}>
                      {t(`kind_${fx.kind}`)}
                    </span>
                    <span className="ms-2" dir="ltr">{money(fx.amount)}</span>
                    {fx.notes && <span className="block text-xs text-slate-500">{fx.notes}</span>}
                  </span>
                  <button onClick={() => deleteEffect(fx.id)} className="text-xs font-medium text-red-600">
                    {t("delete")}
                  </button>
                </li>
              ))}
              {effects.length === 0 && <li className="text-sm text-slate-500">—</li>}
            </ul>

            <form onSubmit={addEffect} className="mt-4 grid gap-3 rounded-xl border border-slate-200 p-3">
              <div className="grid grid-cols-2 gap-3">
                <label className={labelCls}>{t("kind")}
                  <select value={fxForm.kind} onChange={(e) => setFxForm({ ...fxForm, kind: e.currentTarget.value })} className={inputCls}>
                    {KINDS.map((k) => <option key={k} value={k}>{t(`kind_${k}`)}</option>)}
                  </select>
                </label>
                <label className={labelCls}>{t("amount")}
                  <input type="number" min={0.01} step="0.01" required value={fxForm.amount} dir="ltr"
                    onChange={(e) => setFxForm({ ...fxForm, amount: e.currentTarget.value })} className={inputCls} />
                </label>
              </div>
              <label className={labelCls}>{t("notes")}
                <input value={fxForm.notes} onChange={(e) => setFxForm({ ...fxForm, notes: e.currentTarget.value })} className={inputCls} />
              </label>
              <button type="submit" disabled={busy}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
                {t("addEffect")}
              </button>
            </form>

            <div className="mt-4 flex justify-end">
              <button onClick={() => setFxEmp(null)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium">{t("cancel")}</button>
            </div>
          </div>
        </div>
      )}

      {payEmp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form onSubmit={savePayout} className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-bold text-slate-900">{t("setPayout")} — {payEmp.fullNameAr}</h2>
            <div className="mt-4 grid gap-4">
              <label className={labelCls}>{t("payout")}
                <select value={payForm.payoutMethod}
                  onChange={(e) => setPayForm({ ...payForm, payoutMethod: e.currentTarget.value })} className={inputCls}>
                  {PAYOUTS.map((p) => <option key={p} value={p}>{t(`payout_${p}`)}</option>)}
                </select>
              </label>
              {payForm.payoutMethod !== "CASH" && (
                <label className={labelCls}>{t("bankAccount")}
                  <input value={payForm.bankAccount} dir="ltr"
                    onChange={(e) => setPayForm({ ...payForm, bankAccount: e.currentTarget.value })} className={inputCls} />
                </label>
              )}
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => setPayEmp(null)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium">{t("cancel")}</button>
              <button type="submit" disabled={busy}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{t("save")}</button>
            </div>
          </form>
        </div>
      )}

      <div className="mt-6 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
        <button onClick={() => setShowArchives((v) => !v)}
          className="flex w-full items-center justify-between text-start">
          <h3 className="font-semibold text-slate-900">{t("archives")}</h3>
          <span className="text-sm text-slate-500">{showArchives ? "−" : "+"}</span>
        </button>
        {showArchives && (
          archives.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">{t("noArchives")}</p>
          ) : (
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-slate-200 text-slate-500">
                  <th className="px-3 py-2 text-start font-medium">{t("archiveMonth")}</th>
                  <th className="px-3 py-2 text-center font-medium">{t("archiveStatus")}</th>
                  <th className="px-3 py-2 text-center font-medium">{t("archiveEmployees")}</th>
                  <th className="px-3 py-2 text-end font-medium">{t("archiveTotal")}</th>
                </tr></thead>
                <tbody>
                  {archives.map((a) => (
                    <tr key={`${a.year}-${a.month}-${a.status}`} className="border-b border-slate-100">
                      <td className="px-3 py-2 font-medium" dir="ltr">{a.year}-{String(a.month).padStart(2, "0")}</td>
                      <td className="px-3 py-2 text-center">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${a.status === "FINALIZED" ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-600"}`}>
                          {a.status}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center">{a.employees}</td>
                      <td className="px-3 py-2 text-end font-bold">{a.totalNet.toLocaleString("en-US")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>
    </div>
  );
}
