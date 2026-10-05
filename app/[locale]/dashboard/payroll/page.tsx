"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Badge, Btn, Card, EmptyState, Field, Icon, PageHeader, Stat,
  fieldInput,
} from "../_ui";

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

  const [fxEmp, setFxEmp] = useState<PayrollRow | null>(null);
  const [effects, setEffects] = useState<Effect[]>([]);
  const [fxForm, setFxForm] = useState({ kind: "FINE", amount: "", notes: "" });

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

  const loadArchives = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/payroll/archives");
      const b = (await res.json()) as Envelope;
      if (b.success) setArchives((b.data as typeof archives) ?? []);
    } catch { /* noop */ }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadArchives(); }, [loadArchives]);
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
      if (body.success) { load(); loadArchives(); }
    } catch { /* noop */ } finally { setBusy(false); }
  }

  async function reopen() {
    if (!window.confirm(t("reopenConfirm"))) return;
    setBusy(true);
    try {
      const res = await fetch("/api/v1/payroll/reopen", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ year, month }),
      });
      const body = (await res.json()) as Envelope;
      if (body.success) { load(); loadArchives(); }
      else setMsg({ ok: false, text: body.error?.message ?? t("saveError") });
    } catch { setMsg({ ok: false, text: t("saveError") }); }
    finally { setBusy(false); }
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
  const isFinalized = rows.length > 0 && rows[0]?.status === "FINALIZED";

  return (
    <div>
      <PageHeader
        title={`${t("title")} — ${monthLabel}`}
        subtitle={isFinalized ? t("finalized") : undefined}
        actions={
          <>
            <Btn onClick={generate} disabled={busy}>
              <Icon name="plus" className="h-4 w-4" />
              {t("generate")}
            </Btn>
            {rows.length > 0 && rows[0]?.status === "DRAFT" && (
              <Btn variant="success" onClick={finalize} disabled={busy}>
                <Icon name="check" className="h-4 w-4" />
                {t("finalize")}
              </Btn>
            )}
            {isFinalized && (
              <Btn variant="outline" onClick={reopen} disabled={busy}>
                {t("reopen")}
              </Btn>
            )}
          </>
        }
      />

      <Card className="mt-4">
        <div className="flex flex-wrap items-end gap-3">
          <Field label={t("month")} className="w-44">
            <input type="month" value={monthLabel} dir="ltr"
              onChange={(e) => {
                const [y, m] = e.currentTarget.value.split("-").map(Number);
                if (y && m) { setYear(y); setMonth(m); }
              }}
              className={fieldInput} />
          </Field>
          <Field label={t("site")} className="min-w-48 flex-1 sm:max-w-xs">
            <select value={siteId} onChange={(e) => setSiteId(e.currentTarget.value)}
              className={fieldInput}>
              <option value="">{t("allSites")}</option>
              {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          {isFinalized && <Badge tone="green" className="mb-2.5">{t("finalized")}</Badge>}
        </div>
      </Card>

      {msg && (
        <div className={`mt-4 rounded-2xl px-4 py-3 text-sm font-medium ${msg.ok ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
          {msg.text}
        </div>
      )}

      {totals && totals.employees > 0 && (
        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label={t("employees")} value={totals.employees} icon="users" tone="blue" />
          <Stat label={t("totalNet")} value={money(totals.totalNet)} icon="payroll" tone="green" />
          <Stat label={t("totalDeductions")} value={money(totals.totalDeductions)} icon="x" tone="red" />
          <Stat label={t("totalBonus")} value={money(totals.totalBonus)} icon="plus" tone="amber" />
        </div>
      )}

      <Card className="mt-4 !p-2 sm:!p-3">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-slate-500">
                <th className="px-4 py-3 text-start text-[13px] font-semibold">{t("employee")}</th>
                <th className="px-4 py-3 text-start text-[13px] font-semibold">{t("site")}</th>
                <th className="px-4 py-3 text-start text-[13px] font-semibold">{t("totalP")}</th>
                <th className="px-4 py-3 text-start text-[13px] font-semibold">{t("deductions")}</th>
                <th className="px-4 py-3 text-start text-[13px] font-semibold">{t("bonus")}</th>
                <th className="px-4 py-3 text-start text-[13px] font-semibold">{t("netPay")}</th>
                <th className="px-4 py-3 text-start text-[13px] font-semibold">{t("payout")}</th>
                <th className="px-4 py-3 text-end text-[13px] font-semibold">{t("actions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.id} className="transition hover:bg-slate-50/70">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-slate-900">{r.fullNameAr}</p>
                    <p className="font-mono text-xs text-slate-400" dir="ltr">{r.cardNumber}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{r.siteName}</td>
                  <td className="px-4 py-3 tabular-nums" dir="ltr">{r.totalP}</td>
                  <td className="px-4 py-3 font-semibold tabular-nums text-rose-700" dir="ltr">{money(r.deductions + r.advances)}</td>
                  <td className="px-4 py-3 font-semibold tabular-nums text-emerald-700" dir="ltr">{money(r.bonus)}</td>
                  <td className="px-4 py-3 text-[15px] font-extrabold tabular-nums text-slate-900" dir="ltr">{money(r.netPay)}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => {
                        setPayEmp(r);
                        setPayForm({ payoutMethod: r.payoutMethod, bankAccount: "" });
                      }}
                      title={t("setPayout")}
                    >
                      <Badge tone="slate" className="hover:bg-slate-200">{t(`payout_${r.payoutMethod}`)}</Badge>
                    </button>
                  </td>
                  <td className="px-4 py-3 text-end">
                    <button onClick={() => openEffects(r)}
                      className="text-sm font-semibold text-blue-700 hover:text-blue-800">
                      {t("effects")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!loading && rows.length === 0 && (
          <EmptyState icon="payroll" title={t("noRecords")} />
        )}
      </Card>

      {Object.keys(byMethod).length > 0 && (
        <Card className="mt-4">
          <h3 className="text-[15px] font-bold text-slate-900">{t("byMethod")}</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {Object.entries(byMethod).map(([m, total]) => (
              <Badge key={m} tone="blue" className="!px-3 !py-1.5 !text-[13px]">
                {t(`payout_${m}`)}: <span dir="ltr" className="tabular-nums">{money(total)}</span>
              </Badge>
            ))}
          </div>
        </Card>
      )}

      {fxEmp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-[2px]">
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
            <h2 className="text-lg font-extrabold tracking-tight text-slate-900">
              {t("effects")} — {fxEmp.fullNameAr}
            </h2>
            <ul className="mt-4 space-y-2">
              {effects.map((fx) => (
                <li key={fx.id} className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 px-3.5 py-2.5 text-sm">
                  <span>
                    <Badge tone={["FINE", "CUT", "ADVANCE"].includes(fx.kind) ? "red" : "green"}>
                      {t(`kind_${fx.kind}`)}
                    </Badge>
                    <span className="ms-2 font-bold tabular-nums" dir="ltr">{money(fx.amount)}</span>
                    {fx.notes && <span className="block text-xs text-slate-500">{fx.notes}</span>}
                  </span>
                  <button onClick={() => deleteEffect(fx.id)} className="shrink-0 text-xs font-semibold text-rose-600 hover:text-rose-700">
                    {t("delete")}
                  </button>
                </li>
              ))}
              {effects.length === 0 && (
                <li><EmptyState title={t("noRecords")} /></li>
              )}
            </ul>
            <form onSubmit={addEffect} className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/50 p-4">
              <div className="grid grid-cols-2 gap-3">
                <Field label={t("kind")}>
                  <select value={fxForm.kind} onChange={(e) => setFxForm({ ...fxForm, kind: e.currentTarget.value })} className={fieldInput}>
                    {KINDS.map((k) => <option key={k} value={k}>{t(`kind_${k}`)}</option>)}
                  </select>
                </Field>
                <Field label={t("amount")}>
                  <input type="number" min={0.01} step="0.01" required value={fxForm.amount} dir="ltr"
                    onChange={(e) => setFxForm({ ...fxForm, amount: e.currentTarget.value })} className={fieldInput} />
                </Field>
              </div>
              <Field label={t("notes")} className="mt-3">
                <input value={fxForm.notes} onChange={(e) => setFxForm({ ...fxForm, notes: e.currentTarget.value })} className={fieldInput} />
              </Field>
              <Btn type="submit" disabled={busy} className="mt-4 w-full">
                <Icon name="plus" className="h-4 w-4" />
                {t("addEffect")}
              </Btn>
            </form>
            <div className="mt-4 flex justify-end">
              <Btn variant="outline" onClick={() => setFxEmp(null)}>{t("cancel")}</Btn>
            </div>
          </div>
        </div>
      )}

      {payEmp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-[2px]">
          <form onSubmit={savePayout} className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
            <h2 className="text-lg font-extrabold tracking-tight text-slate-900">{t("setPayout")}</h2>
            <p className="mt-0.5 text-sm text-slate-500">{payEmp.fullNameAr}</p>
            <div className="mt-4 grid gap-4">
              <Field label={t("payout")}>
                <select value={payForm.payoutMethod}
                  onChange={(e) => setPayForm({ ...payForm, payoutMethod: e.currentTarget.value })} className={fieldInput}>
                  {PAYOUTS.map((p) => <option key={p} value={p}>{t(`payout_${p}`)}</option>)}
                </select>
              </Field>
              {payForm.payoutMethod !== "CASH" && (
                <Field label={t("bankAccount")}>
                  <input value={payForm.bankAccount} dir="ltr"
                    onChange={(e) => setPayForm({ ...payForm, bankAccount: e.currentTarget.value })} className={fieldInput} />
                </Field>
              )}
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Btn variant="outline" type="button" onClick={() => setPayEmp(null)}>{t("cancel")}</Btn>
              <Btn type="submit" disabled={busy}>{t("save")}</Btn>
            </div>
          </form>
        </div>
      )}

      <Card className="mt-6">
        <button onClick={() => setShowArchives((v) => !v)}
          className="flex w-full items-center justify-between text-start">
          <h3 className="text-[15px] font-bold text-slate-900">{t("archives")}</h3>
          <Icon name={showArchives ? "chevronLeft" : "plus"} className="h-4 w-4 text-slate-400" />
        </button>
        {showArchives && (
          archives.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">{t("noArchives")}</p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <tbody className="divide-y divide-slate-100">
                  {archives.map((a) => (
                    <tr key={`${a.year}-${a.month}-${a.status}`} className="transition hover:bg-slate-50/70">
                      <td className="px-3 py-2.5 font-bold tabular-nums" dir="ltr">{a.year}-{String(a.month).padStart(2, "0")}</td>
                      <td className="px-3 py-2.5">
                        <Badge tone={a.status === "FINALIZED" ? "green" : "slate"}>{a.status}</Badge>
                      </td>
                      <td className="px-3 py-2.5 text-center tabular-nums text-slate-500">{a.employees}</td>
                      <td className="px-3 py-2.5 text-end font-extrabold tabular-nums" dir="ltr">{a.totalNet.toLocaleString("en-US")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </Card>
    </div>
  );
}
