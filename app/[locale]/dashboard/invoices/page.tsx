"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";

interface InvoiceLine { id: string; descriptionAr: string; descriptionEn: string; quantity: number; unitPrice: number; amount: number }
interface Payment { id: string; paymentNo: string; amount: number; paidAt: string; method: string; reference: string | null }
interface Invoice {
  id: string; invoiceNo: string;
  contract: { id: string; contractNo: string };
  client: { id: string; companyNameAr: string; companyNameEn: string };
  periodStart: string; periodEnd: string; status: string;
  subtotal: number; discountAmount: number; taxAmount: number;
  total: number; paidTotal: number; remaining: number;
  dueDate: string | null;
  lines: InvoiceLine[]; payments: Payment[];
}
interface ClientOpt { id: string; companyNameAr: string; companyNameEn: string }
interface ContractOpt { id: string; contractNo: string; clientName: string }

interface Envelope {
  success: boolean; data?: unknown;
  error?: { code?: string; message?: string };
  meta?: { page: number; totalPages: number };
}

const inputCls =
  "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none";
const labelCls = "block text-sm font-medium text-slate-700";

const STATUSES = ["DRAFT", "ISSUED", "SENT", "PARTIALLY_PAID", "PAID", "OVERDUE", "CANCELLED"];
const METHODS = ["CASH", "BANK_TRANSFER", "CHECK", "ELECTRONIC"];

function statusColor(s: string): string {
  if (s === "PAID") return "bg-green-100 text-green-700";
  if (s === "OVERDUE") return "bg-red-100 text-red-700";
  if (s === "DRAFT" || s === "CANCELLED") return "bg-slate-200 text-slate-600";
  return "bg-amber-100 text-amber-700";
}

/** Billing & collection: list, generate from attendance, detail, payments. */
export default function InvoicesPage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  const t = useTranslations("invoices");
  const [rows, setRows] = useState<Invoice[]>([]);
  const [clients, setClients] = useState<ClientOpt[]>([]);
  const [contracts, setContracts] = useState<ContractOpt[]>([]);
  const [status, setStatus] = useState("");
  const [clientId, setClientId] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [showGen, setShowGen] = useState(false);
  const [detail, setDetail] = useState<Invoice | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [gen, setGen] = useState({ contractId: "", periodStart: "", periodEnd: "", taxRate: "14", discountAmount: "0" });
  const [payForm, setPayForm] = useState({ amount: "", paidAt: new Date().toISOString().slice(0, 10), method: "CASH", reference: "" });
  const [showPay, setShowPay] = useState(false);
  const isAr = locale === "ar";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ page: String(page), pageSize: "20" });
      if (status) qs.set("status", status);
      if (clientId) qs.set("clientId", clientId);
      const res = await fetch(`/api/v1/invoices?${qs}`);
      const body = (await res.json()) as Envelope;
      if (body.success) {
        setRows((body.data as Invoice[]) ?? []);
        setTotalPages(body.meta?.totalPages ?? 1);
      }
    } catch { /* keep */ } finally { setLoading(false); }
  }, [page, status, clientId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    Promise.all([
      fetch("/api/v1/clients?pageSize=100").then((r) => r.json()),
      fetch("/api/v1/contracts?pageSize=100&status=ACTIVE").then((r) => r.json()),
    ]).then(([cj, ctj]: unknown[]) => {
      const cb = cj as Envelope; const ctb = ctj as Envelope;
      if (cb.success) setClients((cb.data as ClientOpt[]) ?? []);
      if (ctb.success) setContracts((ctb.data as ContractOpt[]) ?? []);
    }).catch(() => {});
  }, []);

  async function refreshDetail(id: string) {
    try {
      const res = await fetch(`/api/v1/invoices/${id}`);
      const body = (await res.json()) as Envelope;
      if (body.success) setDetail(body.data as Invoice);
    } catch { /* noop */ }
  }

  async function generate(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null); setBusy(true);
    try {
      const res = await fetch("/api/v1/invoices", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contractId: gen.contractId,
          periodStart: gen.periodStart,
          periodEnd: gen.periodEnd,
          taxRate: Number(gen.taxRate) / 100,
          discountAmount: Number(gen.discountAmount) || 0,
        }),
      });
      const body = (await res.json()) as Envelope;
      if (!body.success) { setFormError(body.error?.message ?? t("saveError")); return; }
      setShowGen(false);
      setGen({ contractId: "", periodStart: "", periodEnd: "", taxRate: "14", discountAmount: "0" });
      load();
    } catch { setFormError(t("saveError")); } finally { setBusy(false); }
  }

  async function doTransition(transition: "issue" | "send" | "cancel") {
    if (!detail) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/invoices/${detail.id}/transition`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ transition }),
      });
      const body = (await res.json()) as Envelope;
      if (body.success) { refreshDetail(detail.id); load(); }
    } catch { /* noop */ } finally { setBusy(false); }
  }

  async function recalculate() {
    if (!detail) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/invoices/${detail.id}/recalculate`, { method: "POST" });
      const body = (await res.json()) as Envelope;
      if (body.success) { refreshDetail(detail.id); load(); }
    } catch { /* noop */ } finally { setBusy(false); }
  }

  async function recordPayment(e: React.FormEvent) {
    e.preventDefault();
    if (!detail) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/invoices/${detail.id}/payments`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          amount: Number(payForm.amount),
          paidAt: payForm.paidAt,
          method: payForm.method,
          reference: payForm.reference.trim() || undefined,
        }),
      });
      const body = (await res.json()) as Envelope;
      if (body.success) {
        setShowPay(false);
        setPayForm({ amount: "", paidAt: new Date().toISOString().slice(0, 10), method: "CASH", reference: "" });
        refreshDetail(detail.id); load();
      }
    } catch { /* noop */ } finally { setBusy(false); }
  }

  const money = (n: number) => n.toLocaleString(isAr ? "ar-EG" : "en-US", { maximumFractionDigits: 2 });

  if (detail) {
    return (
      <div>
        <button onClick={() => setDetail(null)} className="text-sm font-medium text-slate-600 hover:text-slate-900">
          ‹ {t("back")}
        </button>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-bold text-slate-900">
            {t("invoiceNo")}: <span className="font-mono">{detail.invoiceNo}</span>
          </h1>
          <span className={`rounded-full px-3 py-1 text-xs font-medium ${statusColor(detail.status)}`}>
            {t(`status_${detail.status}`)}
          </span>
        </div>

        <div className="mt-4 rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <dl className="grid gap-3 text-sm sm:grid-cols-3">
            <div><dt className="text-slate-500">{t("client")}</dt><dd className="font-medium">{isAr ? detail.client.companyNameAr : detail.client.companyNameEn}</dd></div>
            <div><dt className="text-slate-500">{t("contract")}</dt><dd className="font-medium font-mono">{detail.contract.contractNo}</dd></div>
            <div><dt className="text-slate-500">{t("period")}</dt><dd className="font-medium">{detail.periodStart.slice(0, 10)} → {detail.periodEnd.slice(0, 10)}</dd></div>
            <div><dt className="text-slate-500">{t("subtotal")}</dt><dd className="font-medium" dir="ltr">{money(detail.subtotal)}</dd></div>
            <div><dt className="text-slate-500">{t("discount")} + {t("tax")}</dt><dd className="font-medium" dir="ltr">{money(detail.discountAmount)} + {money(detail.taxAmount)}</dd></div>
            <div><dt className="text-slate-500">{t("total")}</dt><dd className="text-lg font-bold" dir="ltr">{money(detail.total)}</dd></div>
            <div><dt className="text-slate-500">{t("paid")}</dt><dd className="font-medium text-green-700" dir="ltr">{money(detail.paidTotal)}</dd></div>
            <div><dt className="text-slate-500">{t("remaining")}</dt><dd className="font-medium text-red-700" dir="ltr">{money(detail.remaining)}</dd></div>
          </dl>
          <div className="mt-4 flex flex-wrap gap-2">
            {detail.status === "DRAFT" && (
              <>
                <button disabled={busy} onClick={() => doTransition("issue")} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{t("issue")}</button>
                <button disabled={busy} onClick={recalculate} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium disabled:opacity-50">{t("recalculate")}</button>
                <button disabled={busy} onClick={() => doTransition("cancel")} className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-600 disabled:opacity-50">{t("cancelInv")}</button>
              </>
            )}
            {detail.status === "ISSUED" && (
              <button disabled={busy} onClick={() => doTransition("send")} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{t("send")}</button>
            )}
          </div>
        </div>

        <h2 className="mt-6 text-lg font-semibold text-slate-900">{t("lines")}</h2>
        <div className="mt-2 overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-slate-200 text-slate-500">
              <th className="px-4 py-2.5 text-start font-medium">{t("description")}</th>
              <th className="px-4 py-2.5 text-start font-medium">{t("qty")}</th>
              <th className="px-4 py-2.5 text-start font-medium">{t("unitPrice")}</th>
              <th className="px-4 py-2.5 text-start font-medium">{t("total")}</th>
            </tr></thead>
            <tbody>
              {detail.lines.map((l) => (
                <tr key={l.id} className="border-b border-slate-100">
                  <td className="px-4 py-2.5">{isAr ? l.descriptionAr : l.descriptionEn}</td>
                  <td className="px-4 py-2.5" dir="ltr">{l.quantity}</td>
                  <td className="px-4 py-2.5" dir="ltr">{money(l.unitPrice)}</td>
                  <td className="px-4 py-2.5 font-medium" dir="ltr">{money(l.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-6 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">{t("payments")}</h2>
          {detail.status !== "DRAFT" && detail.status !== "CANCELLED" && detail.remaining > 0 && (
            <button onClick={() => setShowPay(true)} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white">
              + {t("recordPayment")}
            </button>
          )}
        </div>
        <div className="mt-2 overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-slate-200 text-slate-500">
              <th className="px-4 py-2.5 text-start font-medium">{t("paidAt")}</th>
              <th className="px-4 py-2.5 text-start font-medium">{t("amount")}</th>
              <th className="px-4 py-2.5 text-start font-medium">{t("method")}</th>
              <th className="px-4 py-2.5 text-start font-medium">{t("reference")}</th>
            </tr></thead>
            <tbody>
              {detail.payments.map((p) => (
                <tr key={p.id} className="border-b border-slate-100">
                  <td className="px-4 py-2.5">{p.paidAt.slice(0, 10)}</td>
                  <td className="px-4 py-2.5 font-medium" dir="ltr">{money(p.amount)}</td>
                  <td className="px-4 py-2.5">{t(`method_${p.method}`)}</td>
                  <td className="px-4 py-2.5 text-slate-500">{p.reference ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {detail.payments.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-slate-500">—</p>
          )}
        </div>

        {showPay && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <form onSubmit={recordPayment} className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
              <h3 className="text-lg font-bold text-slate-900">{t("recordPayment")}</h3>
              <div className="mt-4 grid gap-4">
                <label className={labelCls}>{t("amount")} *
                  <input type="number" min={0.01} step="0.01" required value={payForm.amount} dir="ltr"
                    onChange={(e) => setPayForm({ ...payForm, amount: e.currentTarget.value })} className={inputCls} />
                </label>
                <label className={labelCls}>{t("paidAt")} *
                  <input type="date" required value={payForm.paidAt}
                    onChange={(e) => setPayForm({ ...payForm, paidAt: e.currentTarget.value })} className={inputCls} />
                </label>
                <label className={labelCls}>{t("method")}
                  <select value={payForm.method} onChange={(e) => setPayForm({ ...payForm, method: e.currentTarget.value })} className={inputCls}>
                    {METHODS.map((m) => <option key={m} value={m}>{t(`method_${m}`)}</option>)}
                  </select>
                </label>
                <label className={labelCls}>{t("reference")}
                  <input value={payForm.reference}
                    onChange={(e) => setPayForm({ ...payForm, reference: e.currentTarget.value })} className={inputCls} dir="ltr" />
                </label>
              </div>
              <div className="mt-6 flex justify-end gap-2">
                <button type="button" onClick={() => setShowPay(false)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium">{t("cancel")}</button>
                <button type="submit" disabled={busy}
                  className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{t("save")}</button>
              </div>
            </form>
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">{t("title")}</h1>
        <button onClick={() => { setShowGen(true); setFormError(null); }}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700">
          {t("generate")}
        </button>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <select value={status} onChange={(e) => { setStatus(e.currentTarget.value); setPage(1); }}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
          <option value="">{t("allStatuses")}</option>
          {STATUSES.map((s) => <option key={s} value={s}>{t(`status_${s}`)}</option>)}
        </select>
        <select value={clientId} onChange={(e) => { setClientId(e.currentTarget.value); setPage(1); }}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
          <option value="">{t("allClients")}</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{isAr ? c.companyNameAr : c.companyNameEn}</option>)}
        </select>
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-slate-200 text-slate-500">
            <th className="px-4 py-3 text-start font-medium">{t("invoiceNo")}</th>
            <th className="px-4 py-3 text-start font-medium">{t("client")}</th>
            <th className="px-4 py-3 text-start font-medium">{t("period")}</th>
            <th className="px-4 py-3 text-start font-medium">{t("total")}</th>
            <th className="px-4 py-3 text-start font-medium">{t("remaining")}</th>
            <th className="px-4 py-3 text-start font-medium">{t("status")}</th>
            <th className="px-4 py-3 text-start font-medium">{t("actions")}</th>
          </tr></thead>
          <tbody>
            {rows.map((inv) => (
              <tr key={inv.id} className="border-b border-slate-100">
                <td className="px-4 py-3 font-mono text-xs">{inv.invoiceNo}</td>
                <td className="px-4 py-3 font-medium text-slate-900">
                  {isAr ? inv.client.companyNameAr : inv.client.companyNameEn}
                </td>
                <td className="px-4 py-3 text-xs text-slate-600">
                  {inv.periodStart.slice(0, 10)} → {inv.periodEnd.slice(0, 10)}
                </td>
                <td className="px-4 py-3 font-medium" dir="ltr">{money(inv.total)}</td>
                <td className={`px-4 py-3 font-medium ${inv.remaining > 0 ? "text-red-700" : "text-green-700"}`} dir="ltr">
                  {money(inv.remaining)}
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColor(inv.status)}`}>
                    {t(`status_${inv.status}`)}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <button onClick={() => refreshDetail(inv.id)}
                    className="text-sm font-medium text-slate-700 hover:text-slate-900">
                    {t("details")}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && rows.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-slate-500">{t("noResults")}</p>
        )}
      </div>

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-2">
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-40">‹</button>
          <span className="text-sm text-slate-600">{page} / {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-40">›</button>
        </div>
      )}

      {showGen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form onSubmit={generate} className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-bold text-slate-900">{t("generateTitle")}</h2>
            <div className="mt-4 grid gap-4">
              <label className={labelCls}>{t("contract")} *
                <select required value={gen.contractId} onChange={(e) => setGen({ ...gen, contractId: e.currentTarget.value })} className={inputCls}>
                  <option value="">—</option>
                  {contracts.map((c) => <option key={c.id} value={c.id}>{c.contractNo} — {c.clientName}</option>)}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-4">
                <label className={labelCls}>{t("periodStart")} *
                  <input type="date" required value={gen.periodStart}
                    onChange={(e) => setGen({ ...gen, periodStart: e.currentTarget.value })} className={inputCls} />
                </label>
                <label className={labelCls}>{t("periodEnd")} *
                  <input type="date" required value={gen.periodEnd}
                    onChange={(e) => setGen({ ...gen, periodEnd: e.currentTarget.value })} className={inputCls} />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <label className={labelCls}>{t("taxRate")}
                  <input type="number" min={0} max={100} value={gen.taxRate} dir="ltr"
                    onChange={(e) => setGen({ ...gen, taxRate: e.currentTarget.value })} className={inputCls} />
                </label>
                <label className={labelCls}>{t("discountAmount")}
                  <input type="number" min={0} value={gen.discountAmount} dir="ltr"
                    onChange={(e) => setGen({ ...gen, discountAmount: e.currentTarget.value })} className={inputCls} />
                </label>
              </div>
            </div>
            {formError && (
              <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</p>
            )}
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => setShowGen(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium">{t("cancel")}</button>
              <button type="submit" disabled={busy}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{t("generate")}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
