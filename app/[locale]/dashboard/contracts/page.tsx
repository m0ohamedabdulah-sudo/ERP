"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";

interface Rate {
  id: string;
  ratePerShift: number;
  ratePerMonth: number | null;
  effectiveFrom: string;
  effectiveTo: string | null;
}
interface ContractSite {
  id: string;
  siteId: string;
  siteName: string;
  serviceType: string;
  rates: Rate[];
}
interface Contract {
  id: string;
  clientId: string;
  clientName: string;
  contractNo: string;
  titleAr: string;
  titleEn: string;
  startDate: string;
  endDate: string;
  status: string;
  paymentTermsDays: number;
  penaltyClause: string | null;
  sla: string | null;
  notes: string | null;
  sites: ContractSite[];
  siteCount: number;
}
interface ClientOpt { id: string; companyNameAr: string; companyNameEn: string }
interface SiteOpt { id: string; name: string }

interface Envelope {
  success: boolean;
  data?: unknown;
  error?: { code?: string; message?: string };
  meta?: { page: number; totalPages: number };
}

const inputCls =
  "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none";
const labelCls = "block text-sm font-medium text-slate-700";

const TRANSITIONS: Record<string, string[]> = {
  DRAFT: ["ACTIVE", "TERMINATED"],
  ACTIVE: ["SUSPENDED", "TERMINATED"],
  SUSPENDED: ["ACTIVE", "TERMINATED"],
  EXPIRED: [],
  TERMINATED: [],
};
const TRANSITION_LABEL: Record<string, string> = {
  ACTIVE: "activate",
  SUSPENDED: "suspend",
  TERMINATED: "terminate",
};
const SERVICE_TYPES = ["STATIC_GUARD", "BODYGUARD", "EVENT_SECURITY", "PATROL", "CCTV_MONITORING"];

/** Contracts list + create + detail (sites, rates, status transitions). */
export default function ContractsPage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  const t = useTranslations("contracts");
  const [rows, setRows] = useState<Contract[]>([]);
  const [clients, setClients] = useState<ClientOpt[]>([]);
  const [sites, setSites] = useState<SiteOpt[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [clientId, setClientId] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [detail, setDetail] = useState<Contract | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [form, setForm] = useState({
    clientId: "", contractNo: "", titleAr: "", titleEn: "",
    startDate: "", endDate: "", paymentTermsDays: "30",
    siteId: "", serviceType: "STATIC_GUARD", ratePerShift: "",
  });
  const [siteForm, setSiteForm] = useState({ siteId: "", serviceType: "STATIC_GUARD", ratePerShift: "" });
  const [showSiteForm, setShowSiteForm] = useState(false);
  const isAr = locale === "ar";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ page: String(page), pageSize: "20" });
      if (search.trim()) qs.set("search", search.trim());
      if (status) qs.set("status", status);
      if (clientId) qs.set("clientId", clientId);
      const res = await fetch(`/api/v1/contracts?${qs}`);
      const body = (await res.json()) as Envelope;
      if (body.success) {
        setRows((body.data as Contract[]) ?? []);
        setTotalPages(body.meta?.totalPages ?? 1);
      }
    } catch { /* keep */ } finally { setLoading(false); }
  }, [page, search, status, clientId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    Promise.all([
      fetch("/api/v1/clients?pageSize=100").then((r) => r.json()),
      fetch("/api/v1/sites?pageSize=100").then((r) => r.json()),
    ]).then(([cj, sj]: unknown[]) => {
      const cb = cj as Envelope; const sb = sj as Envelope;
      if (cb.success) setClients((cb.data as ClientOpt[]) ?? []);
      if (sb.success) setSites((sb.data as SiteOpt[]) ?? []);
    }).catch(() => {});
  }, []);

  async function refreshDetail(id: string) {
    try {
      const res = await fetch(`/api/v1/contracts/${id}`);
      const body = (await res.json()) as Envelope;
      if (body.success) setDetail(body.data as Contract);
    } catch { /* noop */ }
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null); setBusy(true);
    try {
      const payload = {
        clientId: form.clientId,
        contractNo: form.contractNo.trim(),
        titleAr: form.titleAr.trim(),
        titleEn: form.titleEn.trim(),
        startDate: form.startDate,
        endDate: form.endDate,
        paymentTermsDays: Number(form.paymentTermsDays) || 30,
        sites: [{
          siteId: form.siteId,
          serviceType: form.serviceType,
          rates: [{
            ratePerShift: Number(form.ratePerShift),
            effectiveFrom: form.startDate,
          }],
        }],
      };
      const res = await fetch("/api/v1/contracts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await res.json()) as Envelope;
      if (!body.success) { setFormError(body.error?.message ?? t("saveError")); return; }
      setShowAdd(false);
      setForm({ clientId: "", contractNo: "", titleAr: "", titleEn: "", startDate: "", endDate: "", paymentTermsDays: "30", siteId: "", serviceType: "STATIC_GUARD", ratePerShift: "" });
      load();
    } catch { setFormError(t("saveError")); } finally { setBusy(false); }
  }

  async function transition(to: string) {
    if (!detail) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/contracts/${detail.id}/status`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ to }),
      });
      const body = (await res.json()) as Envelope;
      if (body.success) { refreshDetail(detail.id); load(); }
    } catch { /* noop */ } finally { setBusy(false); }
  }

  async function addSite() {
    if (!detail || !siteForm.siteId || !siteForm.ratePerShift) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/contracts/${detail.id}/sites`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          siteId: siteForm.siteId,
          serviceType: siteForm.serviceType,
          rates: [{ ratePerShift: Number(siteForm.ratePerShift), effectiveFrom: detail.startDate.slice(0, 10) }],
        }),
      });
      const body = (await res.json()) as Envelope;
      if (body.success) {
        setShowSiteForm(false);
        setSiteForm({ siteId: "", serviceType: "STATIC_GUARD", ratePerShift: "" });
        refreshDetail(detail.id);
      }
    } catch { /* noop */ } finally { setBusy(false); }
  }

  async function removeSite(contractSiteId: string) {
    if (!detail || !window.confirm(t("removeSite") + "?")) return;
    try {
      const res = await fetch(`/api/v1/contracts/sites/${contractSiteId}`, { method: "DELETE" });
      const body = (await res.json()) as Envelope;
      if (body.success) refreshDetail(detail.id);
    } catch { /* noop */ }
  }

  async function remove() {
    if (!detail || !window.confirm(t("deleteConfirm"))) return;
    try {
      const res = await fetch(`/api/v1/contracts/${detail.id}`, { method: "DELETE" });
      const body = (await res.json()) as Envelope;
      if (body.success) { setDetail(null); load(); }
    } catch { /* noop */ }
  }

  const fmtDate = (iso: string) => iso.slice(0, 10);

  if (detail) {
    return (
      <div>
        <button onClick={() => { setDetail(null); }} className="text-sm font-medium text-slate-600 hover:text-slate-900">
          ‹ {t("back")}
        </button>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-bold text-slate-900">
            {detail.contractNo} — {isAr ? detail.titleAr : detail.titleEn}
          </h1>
          <span className={`rounded-full px-3 py-1 text-xs font-medium ${
            detail.status === "ACTIVE" ? "bg-green-100 text-green-700"
            : detail.status === "DRAFT" ? "bg-slate-200 text-slate-600"
            : "bg-red-100 text-red-700"}`}>
            {t(`status_${detail.status}`)}
          </span>
        </div>

        <div className="mt-4 rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div><dt className="text-slate-500">{t("client")}</dt><dd className="font-medium">{detail.clientName}</dd></div>
            <div><dt className="text-slate-500">{t("paymentTermsDays")}</dt><dd className="font-medium">{detail.paymentTermsDays}</dd></div>
            <div><dt className="text-slate-500">{t("startDate")}</dt><dd className="font-medium">{fmtDate(detail.startDate)}</dd></div>
            <div><dt className="text-slate-500">{t("endDate")}</dt><dd className="font-medium">{fmtDate(detail.endDate)}</dd></div>
          </dl>
          <div className="mt-4 flex flex-wrap gap-2">
            {(TRANSITIONS[detail.status] ?? []).map((to) => (
              <button key={to} disabled={busy} onClick={() => transition(to)}
                className={`rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50 ${
                  to === "TERMINATED" ? "bg-red-600 hover:bg-red-500" : "bg-slate-900 hover:bg-slate-700"}`}>
                {t(TRANSITION_LABEL[to] ?? to)}
              </button>
            ))}
            {detail.status === "DRAFT" && (
              <button onClick={remove} className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-600">
                {t("delete")}
              </button>
            )}
          </div>
        </div>

        <div className="mt-6 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">{t("sites")} ({detail.siteCount})</h2>
          <button onClick={() => setShowSiteForm((v) => !v)}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-50">
            + {t("addSite")}
          </button>
        </div>

        {showSiteForm && (
          <div className="mt-3 grid gap-2 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200 sm:grid-cols-4">
            <select value={siteForm.siteId} onChange={(e) => setSiteForm({ ...siteForm, siteId: e.currentTarget.value })}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
              <option value="">{t("site")}</option>
              {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <select value={siteForm.serviceType} onChange={(e) => setSiteForm({ ...siteForm, serviceType: e.currentTarget.value })}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
              {SERVICE_TYPES.map((s) => <option key={s} value={s}>{t(`service_${s}`)}</option>)}
            </select>
            <input type="number" min={1} placeholder={t("ratePerShift")} value={siteForm.ratePerShift} dir="ltr"
              onChange={(e) => setSiteForm({ ...siteForm, ratePerShift: e.currentTarget.value })}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <button onClick={addSite} disabled={busy}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
              {t("save")}
            </button>
          </div>
        )}

        <div className="mt-3 space-y-3">
          {detail.sites.map((s) => (
            <div key={s.id} className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-slate-900">{s.siteName}</h3>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-500">{t(`service_${s.serviceType}`)}</span>
                  <button onClick={() => removeSite(s.id)} className="text-xs font-medium text-red-600 hover:text-red-800">
                    {t("removeSite")}
                  </button>
                </div>
              </div>
              <table className="mt-2 w-full text-sm">
                <thead><tr className="text-slate-500">
                  <th className="py-1 text-start font-medium">{t("ratePerShift")}</th>
                  <th className="py-1 text-start font-medium">{t("ratePerMonth")}</th>
                  <th className="py-1 text-start font-medium">{t("effectiveFrom")}</th>
                </tr></thead>
                <tbody>
                  {s.rates.map((r) => (
                    <tr key={r.id} className="border-t border-slate-100">
                      <td className="py-1.5" dir="ltr">{r.ratePerShift}</td>
                      <td className="py-1.5" dir="ltr">{r.ratePerMonth ?? "—"}</td>
                      <td className="py-1.5">{r.effectiveFrom.slice(0, 10)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">{t("title")}</h1>
        <button onClick={() => { setShowAdd(true); setFormError(null); }}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700">
          {t("add")}
        </button>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <input value={search} onChange={(e) => { setSearch(e.currentTarget.value); setPage(1); }}
          placeholder={t("searchPh")}
          className="min-w-52 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none" />
        <select value={status} onChange={(e) => { setStatus(e.currentTarget.value); setPage(1); }}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
          <option value="">{t("allStatuses")}</option>
          {["DRAFT", "ACTIVE", "SUSPENDED", "EXPIRED", "TERMINATED"].map((s) => (
            <option key={s} value={s}>{t(`status_${s}`)}</option>
          ))}
        </select>
        <select value={clientId} onChange={(e) => { setClientId(e.currentTarget.value); setPage(1); }}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
          <option value="">{t("allClients")}</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>{isAr ? c.companyNameAr : c.companyNameEn}</option>
          ))}
        </select>
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-slate-200 text-slate-500">
            <th className="px-4 py-3 text-start font-medium">{t("contractNo")}</th>
            <th className="px-4 py-3 text-start font-medium">{t("client")}</th>
            <th className="px-4 py-3 text-start font-medium">{t("endDate")}</th>
            <th className="px-4 py-3 text-start font-medium">{t("status")}</th>
            <th className="px-4 py-3 text-start font-medium">{t("actions")}</th>
          </tr></thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} className="border-b border-slate-100">
                <td className="px-4 py-3 font-mono text-xs">{c.contractNo}</td>
                <td className="px-4 py-3 font-medium text-slate-900">{c.clientName}</td>
                <td className="px-4 py-3 text-slate-600">{fmtDate(c.endDate)}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    c.status === "ACTIVE" ? "bg-green-100 text-green-700"
                    : c.status === "DRAFT" ? "bg-slate-200 text-slate-600"
                    : "bg-red-100 text-red-700"}`}>
                    {t(`status_${c.status}`)}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <button onClick={() => refreshDetail(c.id)}
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

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form onSubmit={create} className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-bold text-slate-900">{t("add")}</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className={labelCls}>{t("client")} *
                <select required value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.currentTarget.value })} className={inputCls}>
                  <option value="">{t("allClients")}</option>
                  {clients.map((c) => <option key={c.id} value={c.id}>{isAr ? c.companyNameAr : c.companyNameEn}</option>)}
                </select>
              </label>
              <label className={labelCls}>{t("contractNo")} *
                <input required value={form.contractNo} onChange={(e) => setForm({ ...form, contractNo: e.currentTarget.value })} className={inputCls} dir="ltr" />
              </label>
              <label className={labelCls}>{t("titleAr")} *
                <input required value={form.titleAr} onChange={(e) => setForm({ ...form, titleAr: e.currentTarget.value })} className={inputCls} />
              </label>
              <label className={labelCls}>{t("titleEn")} *
                <input required value={form.titleEn} onChange={(e) => setForm({ ...form, titleEn: e.currentTarget.value })} className={inputCls} />
              </label>
              <label className={labelCls}>{t("startDate")} *
                <input type="date" required value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.currentTarget.value })} className={inputCls} />
              </label>
              <label className={labelCls}>{t("endDate")} *
                <input type="date" required value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.currentTarget.value })} className={inputCls} />
              </label>
              <label className={labelCls}>{t("paymentTermsDays")}
                <input type="number" min={0} value={form.paymentTermsDays} dir="ltr"
                  onChange={(e) => setForm({ ...form, paymentTermsDays: e.currentTarget.value })} className={inputCls} />
              </label>
              <label className={labelCls}>{t("site")} *
                <select required value={form.siteId} onChange={(e) => setForm({ ...form, siteId: e.currentTarget.value })} className={inputCls}>
                  <option value="">{t("site")}</option>
                  {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </label>
              <label className={labelCls}>{t("serviceType")}
                <select value={form.serviceType} onChange={(e) => setForm({ ...form, serviceType: e.currentTarget.value })} className={inputCls}>
                  {SERVICE_TYPES.map((s) => <option key={s} value={s}>{t(`service_${s}`)}</option>)}
                </select>
              </label>
              <label className={labelCls}>{t("ratePerShift")} *
                <input type="number" min={1} required value={form.ratePerShift} dir="ltr"
                  onChange={(e) => setForm({ ...form, ratePerShift: e.currentTarget.value })} className={inputCls} />
              </label>
            </div>
            {formError && (
              <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</p>
            )}
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => setShowAdd(false)}
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
