"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  PageHeader,
  Card,
  Btn,
  Badge,
  Stat,
  Field,
  fieldInput,
  EmptyState,
  Spinner,
  Icon,
} from "../_ui";

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

const STATUSES = ["DRAFT", "ISSUED", "SENT", "PARTIALLY_PAID", "PAID", "OVERDUE", "CANCELLED"];
const METHODS = ["CASH", "BANK_TRANSFER", "CHECK", "ELECTRONIC"];

function statusTone(s: string): "green" | "red" | "amber" | "slate" {
  if (s === "PAID") return "green";
  if (s === "OVERDUE") return "red";
  if (s === "DRAFT" || s === "CANCELLED") return "slate";
  return "amber";
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
  const backIcon = isAr ? "chevronRight" : "chevronLeft";

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
      <div className="space-y-5">
        <Btn variant="ghost" onClick={() => setDetail(null)} className="px-3 py-1.5">
          <Icon name={backIcon} className="h-4 w-4" />
          {t("back")}
        </Btn>

        <PageHeader
          title={`${t("invoiceNo")}: ${detail.invoiceNo}`}
          actions={<Badge tone={statusTone(detail.status)}>{t(`status_${detail.status}`)}</Badge>}
        />

        <div className="grid gap-4 sm:grid-cols-3">
          <Stat label={t("total")} value={<span dir="ltr">{money(detail.total)}</span>} icon="invoices" tone="blue" />
          <Stat label={t("paid")} value={<span dir="ltr">{money(detail.paidTotal)}</span>} icon="check" tone="green" />
          <Stat label={t("remaining")} value={<span dir="ltr">{money(detail.remaining)}</span>} icon="clock" tone={detail.remaining > 0 ? "red" : "green"} />
        </div>

        <Card>
          <dl className="grid gap-x-6 gap-y-4 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-[13px] font-medium text-slate-400">{t("client")}</dt>
              <dd className="mt-0.5 font-semibold text-slate-900">{isAr ? detail.client.companyNameAr : detail.client.companyNameEn}</dd>
            </div>
            <div>
              <dt className="text-[13px] font-medium text-slate-400">{t("contract")}</dt>
              <dd className="mt-0.5 font-mono font-semibold text-slate-900">{detail.contract.contractNo}</dd>
            </div>
            <div>
              <dt className="text-[13px] font-medium text-slate-400">{t("period")}</dt>
              <dd className="mt-0.5 font-semibold text-slate-900" dir="ltr">{detail.periodStart.slice(0, 10)} → {detail.periodEnd.slice(0, 10)}</dd>
            </div>
            <div>
              <dt className="text-[13px] font-medium text-slate-400">{t("subtotal")}</dt>
              <dd className="mt-0.5 font-semibold tabular-nums text-slate-900" dir="ltr">{money(detail.subtotal)}</dd>
            </div>
            <div>
              <dt className="text-[13px] font-medium text-slate-400">{t("discount")} + {t("tax")}</dt>
              <dd className="mt-0.5 font-semibold tabular-nums text-slate-900" dir="ltr">{money(detail.discountAmount)} + {money(detail.taxAmount)}</dd>
            </div>
          </dl>
          <div className="mt-5 flex flex-wrap gap-2 border-t border-slate-100 pt-5">
            {detail.status === "DRAFT" && (
              <>
                <Btn disabled={busy} onClick={() => doTransition("issue")}>
                  {t("issue")}
                </Btn>
                <Btn variant="outline" disabled={busy} onClick={recalculate}>
                  {t("recalculate")}
                </Btn>
                <Btn variant="danger" disabled={busy} onClick={() => doTransition("cancel")}>
                  {t("cancelInv")}
                </Btn>
              </>
            )}
            {detail.status === "ISSUED" && (
              <Btn disabled={busy} onClick={() => doTransition("send")}>
                {t("send")}
              </Btn>
            )}
          </div>
        </Card>

        <div>
          <h2 className="mb-3 text-lg font-extrabold tracking-tight text-slate-900">{t("lines")}</h2>
          <Card className="overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50/70 text-xs uppercase tracking-wider text-slate-400">
                    <th className="px-5 py-3 text-start font-semibold">{t("description")}</th>
                    <th className="px-5 py-3 text-start font-semibold">{t("qty")}</th>
                    <th className="px-5 py-3 text-start font-semibold">{t("unitPrice")}</th>
                    <th className="px-5 py-3 text-end font-semibold">{t("total")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {detail.lines.map((l) => (
                    <tr key={l.id} className="transition hover:bg-slate-50/70">
                      <td className="px-5 py-3 font-medium text-slate-900">{isAr ? l.descriptionAr : l.descriptionEn}</td>
                      <td className="px-5 py-3 tabular-nums text-slate-600" dir="ltr">{l.quantity}</td>
                      <td className="px-5 py-3 tabular-nums text-slate-600" dir="ltr">{money(l.unitPrice)}</td>
                      <td className="px-5 py-3 font-semibold tabular-nums text-slate-900" dir="ltr">{money(l.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        <div>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-extrabold tracking-tight text-slate-900">{t("payments")}</h2>
            {detail.status !== "DRAFT" && detail.status !== "CANCELLED" && detail.remaining > 0 && (
              <Btn onClick={() => setShowPay(true)} className="px-3.5 py-2">
                <Icon name="plus" className="h-4 w-4" />
                {t("recordPayment")}
              </Btn>
            )}
          </div>
          <Card className="overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50/70 text-xs uppercase tracking-wider text-slate-400">
                    <th className="px-5 py-3 text-start font-semibold">{t("paidAt")}</th>
                    <th className="px-5 py-3 text-start font-semibold">{t("amount")}</th>
                    <th className="px-5 py-3 text-start font-semibold">{t("method")}</th>
                    <th className="px-5 py-3 text-start font-semibold">{t("reference")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {detail.payments.map((p) => (
                    <tr key={p.id} className="transition hover:bg-slate-50/70">
                      <td className="px-5 py-3 text-slate-600">{p.paidAt.slice(0, 10)}</td>
                      <td className="px-5 py-3 font-semibold tabular-nums text-slate-900" dir="ltr">{money(p.amount)}</td>
                      <td className="px-5 py-3 text-slate-600">{t(`method_${p.method}`)}</td>
                      <td className="px-5 py-3 text-slate-500" dir="ltr">{p.reference ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {detail.payments.length === 0 && (
              <p className="px-4 py-6 text-center text-sm text-slate-400">—</p>
            )}
          </Card>
        </div>

        {showPay && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-[2px]">
            <form onSubmit={recordPayment} className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
              <h3 className="text-lg font-extrabold tracking-tight text-slate-900">{t("recordPayment")}</h3>
              <div className="mt-5 grid gap-4">
                <Field label={`${t("amount")} *`}>
                  <input type="number" min={0.01} step="0.01" required value={payForm.amount} dir="ltr"
                    onChange={(e) => setPayForm({ ...payForm, amount: e.currentTarget.value })} className={fieldInput} />
                </Field>
                <Field label={`${t("paidAt")} *`}>
                  <input type="date" required value={payForm.paidAt}
                    onChange={(e) => setPayForm({ ...payForm, paidAt: e.currentTarget.value })} className={fieldInput} />
                </Field>
                <Field label={t("method")}>
                  <select value={payForm.method} onChange={(e) => setPayForm({ ...payForm, method: e.currentTarget.value })} className={fieldInput}>
                    {METHODS.map((m) => <option key={m} value={m}>{t(`method_${m}`)}</option>)}
                  </select>
                </Field>
                <Field label={t("reference")}>
                  <input value={payForm.reference}
                    onChange={(e) => setPayForm({ ...payForm, reference: e.currentTarget.value })} className={fieldInput} dir="ltr" />
                </Field>
              </div>
              <div className="mt-6 flex justify-end gap-2">
                <Btn type="button" variant="ghost" onClick={() => setShowPay(false)}>{t("cancel")}</Btn>
                <Btn type="submit" disabled={busy}>
                  {busy ? <Spinner className="h-4 w-4" /> : <Icon name="check" className="h-4 w-4" />}
                  {t("save")}
                </Btn>
              </div>
            </form>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title={t("title")}
        actions={
          <Btn onClick={() => { setShowGen(true); setFormError(null); }}>
            <Icon name="plus" className="h-4 w-4" />
            {t("generate")}
          </Btn>
        }
      />

      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          <select value={status} onChange={(e) => { setStatus(e.currentTarget.value); setPage(1); }}
            className={`${fieldInput} !mt-0 w-auto`}>
            <option value="">{t("allStatuses")}</option>
            {STATUSES.map((s) => <option key={s} value={s}>{t(`status_${s}`)}</option>)}
          </select>
          <select value={clientId} onChange={(e) => { setClientId(e.currentTarget.value); setPage(1); }}
            className={`${fieldInput} !mt-0 w-auto`}>
            <option value="">{t("allClients")}</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{isAr ? c.companyNameAr : c.companyNameEn}</option>)}
          </select>
        </div>
      </Card>

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50/70 text-xs uppercase tracking-wider text-slate-400">
                <th className="px-5 py-3.5 text-start font-semibold">{t("invoiceNo")}</th>
                <th className="px-5 py-3.5 text-start font-semibold">{t("client")}</th>
                <th className="px-5 py-3.5 text-start font-semibold">{t("period")}</th>
                <th className="px-5 py-3.5 text-start font-semibold">{t("total")}</th>
                <th className="px-5 py-3.5 text-start font-semibold">{t("remaining")}</th>
                <th className="px-5 py-3.5 text-start font-semibold">{t("status")}</th>
                <th className="px-5 py-3.5 text-end font-semibold">{t("actions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((inv) => (
                <tr key={inv.id} className="transition hover:bg-slate-50/70">
                  <td className="px-5 py-3.5 font-mono text-xs font-semibold text-slate-900">{inv.invoiceNo}</td>
                  <td className="px-5 py-3.5 font-semibold text-slate-900">
                    {isAr ? inv.client.companyNameAr : inv.client.companyNameEn}
                  </td>
                  <td className="px-5 py-3.5 text-xs text-slate-600" dir="ltr">
                    {inv.periodStart.slice(0, 10)} → {inv.periodEnd.slice(0, 10)}
                  </td>
                  <td className="px-5 py-3.5 font-semibold tabular-nums text-slate-900" dir="ltr">{money(inv.total)}</td>
                  <td className={`px-5 py-3.5 font-semibold tabular-nums ${inv.remaining > 0 ? "text-rose-700" : "text-emerald-700"}`} dir="ltr">
                    {money(inv.remaining)}
                  </td>
                  <td className="px-5 py-3.5">
                    <Badge tone={statusTone(inv.status)}>{t(`status_${inv.status}`)}</Badge>
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex justify-end">
                      <Btn variant="ghost" onClick={() => refreshDetail(inv.id)} className="px-3 py-1.5">
                        {t("details")}
                      </Btn>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {loading ? (
          <div className="flex justify-center py-12 text-slate-400">
            <Spinner className="h-7 w-7" />
          </div>
        ) : (
          rows.length === 0 && (
            <EmptyState icon="invoices" title={t("noResults")} />
          )
        )}
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Btn variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="px-3 py-1.5">
            <Icon name="chevronLeft" className="h-4 w-4" />
          </Btn>
          <span className="text-sm font-medium text-slate-600">{page} / {totalPages}</span>
          <Btn variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="px-3 py-1.5">
            <Icon name="chevronRight" className="h-4 w-4" />
          </Btn>
        </div>
      )}

      {showGen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-[2px]">
          <form onSubmit={generate} className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h2 className="text-lg font-extrabold tracking-tight text-slate-900">{t("generateTitle")}</h2>
            <div className="mt-5 grid gap-4">
              <Field label={`${t("contract")} *`}>
                <select required value={gen.contractId} onChange={(e) => setGen({ ...gen, contractId: e.currentTarget.value })} className={fieldInput}>
                  <option value="">—</option>
                  {contracts.map((c) => <option key={c.id} value={c.id}>{c.contractNo} — {c.clientName}</option>)}
                </select>
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label={`${t("periodStart")} *`}>
                  <input type="date" required value={gen.periodStart}
                    onChange={(e) => setGen({ ...gen, periodStart: e.currentTarget.value })} className={fieldInput} />
                </Field>
                <Field label={`${t("periodEnd")} *`}>
                  <input type="date" required value={gen.periodEnd}
                    onChange={(e) => setGen({ ...gen, periodEnd: e.currentTarget.value })} className={fieldInput} />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label={t("taxRate")}>
                  <input type="number" min={0} max={100} value={gen.taxRate} dir="ltr"
                    onChange={(e) => setGen({ ...gen, taxRate: e.currentTarget.value })} className={fieldInput} />
                </Field>
                <Field label={t("discountAmount")}>
                  <input type="number" min={0} value={gen.discountAmount} dir="ltr"
                    onChange={(e) => setGen({ ...gen, discountAmount: e.currentTarget.value })} className={fieldInput} />
                </Field>
              </div>
            </div>
            {formError && (
              <p className="mt-4 rounded-xl bg-rose-50 px-4 py-2.5 text-sm font-medium text-rose-700 ring-1 ring-rose-100">{formError}</p>
            )}
            <div className="mt-6 flex justify-end gap-2">
              <Btn type="button" variant="ghost" onClick={() => setShowGen(false)}>{t("cancel")}</Btn>
              <Btn type="submit" disabled={busy}>
                {busy ? <Spinner className="h-4 w-4" /> : <Icon name="check" className="h-4 w-4" />}
                {t("generate")}
              </Btn>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
