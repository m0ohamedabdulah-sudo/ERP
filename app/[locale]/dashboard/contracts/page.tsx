"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  PageHeader,
  Card,
  Btn,
  Badge,
  Field,
  fieldInput,
  EmptyState,
  Spinner,
  Icon,
} from "../_ui";

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

function statusTone(s: string): "green" | "red" | "amber" | "slate" {
  if (s === "ACTIVE") return "green";
  if (s === "SUSPENDED") return "amber";
  if (s === "TERMINATED") return "red";
  return "slate";
}

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
  const backIcon = isAr ? "chevronRight" : "chevronLeft";

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
      <div className="space-y-5">
        <Btn variant="ghost" onClick={() => { setDetail(null); }} className="px-3 py-1.5">
          <Icon name={backIcon} className="h-4 w-4" />
          {t("back")}
        </Btn>

        <PageHeader
          title={`${detail.contractNo} — ${isAr ? detail.titleAr : detail.titleEn}`}
          actions={<Badge tone={statusTone(detail.status)}>{t(`status_${detail.status}`)}</Badge>}
        />

        <Card>
          <dl className="grid gap-x-6 gap-y-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-[13px] font-medium text-slate-400">{t("client")}</dt>
              <dd className="mt-0.5 font-semibold text-slate-900">{detail.clientName}</dd>
            </div>
            <div>
              <dt className="text-[13px] font-medium text-slate-400">{t("paymentTermsDays")}</dt>
              <dd className="mt-0.5 font-semibold text-slate-900">{detail.paymentTermsDays}</dd>
            </div>
            <div>
              <dt className="text-[13px] font-medium text-slate-400">{t("startDate")}</dt>
              <dd className="mt-0.5 font-semibold text-slate-900">{fmtDate(detail.startDate)}</dd>
            </div>
            <div>
              <dt className="text-[13px] font-medium text-slate-400">{t("endDate")}</dt>
              <dd className="mt-0.5 font-semibold text-slate-900">{fmtDate(detail.endDate)}</dd>
            </div>
          </dl>
          <div className="mt-5 flex flex-wrap gap-2 border-t border-slate-100 pt-5">
            {(TRANSITIONS[detail.status] ?? []).map((to) => (
              <Btn
                key={to}
                disabled={busy}
                onClick={() => transition(to)}
                variant={to === "TERMINATED" ? "danger" : "primary"}
              >
                {t(TRANSITION_LABEL[to] ?? to)}
              </Btn>
            ))}
            {detail.status === "DRAFT" && (
              <Btn variant="danger" onClick={remove}>
                <Icon name="x" className="h-4 w-4" />
                {t("delete")}
              </Btn>
            )}
          </div>
        </Card>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-extrabold tracking-tight text-slate-900">
            {t("sites")} ({detail.siteCount})
          </h2>
          <Btn variant="outline" onClick={() => setShowSiteForm((v) => !v)} className="px-3.5 py-2">
            <Icon name="plus" className="h-4 w-4" />
            {t("addSite")}
          </Btn>
        </div>

        {showSiteForm && (
          <Card className="p-4">
            <div className="grid gap-3 sm:grid-cols-4">
              <select value={siteForm.siteId} onChange={(e) => setSiteForm({ ...siteForm, siteId: e.currentTarget.value })}
                className={`${fieldInput} !mt-0`}>
                <option value="">{t("site")}</option>
                {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <select value={siteForm.serviceType} onChange={(e) => setSiteForm({ ...siteForm, serviceType: e.currentTarget.value })}
                className={`${fieldInput} !mt-0`}>
                {SERVICE_TYPES.map((s) => <option key={s} value={s}>{t(`service_${s}`)}</option>)}
              </select>
              <input type="number" min={1} placeholder={t("ratePerShift")} value={siteForm.ratePerShift} dir="ltr"
                onChange={(e) => setSiteForm({ ...siteForm, ratePerShift: e.currentTarget.value })}
                className={`${fieldInput} !mt-0`} />
              <Btn onClick={addSite} disabled={busy} className="w-full sm:w-auto">
                {busy ? <Spinner className="h-4 w-4" /> : <Icon name="check" className="h-4 w-4" />}
                {t("save")}
              </Btn>
            </div>
          </Card>
        )}

        <div className="grid gap-4">
          {detail.sites.map((s) => (
            <Card key={s.id} className="p-0">
              <div className="flex items-center justify-between gap-3 px-5 py-4">
                <h3 className="font-bold text-slate-900">{s.siteName}</h3>
                <div className="flex items-center gap-3">
                  <Badge tone="blue">{t(`service_${s.serviceType}`)}</Badge>
                  <button onClick={() => removeSite(s.id)} className="text-xs font-semibold text-rose-600 hover:text-rose-800">
                    {t("removeSite")}
                  </button>
                </div>
              </div>
              <div className="overflow-x-auto border-t border-slate-100">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs uppercase tracking-wider text-slate-400">
                      <th className="px-5 py-2.5 text-start font-semibold">{t("ratePerShift")}</th>
                      <th className="px-5 py-2.5 text-start font-semibold">{t("ratePerMonth")}</th>
                      <th className="px-5 py-2.5 text-start font-semibold">{t("effectiveFrom")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {s.rates.map((r) => (
                      <tr key={r.id}>
                        <td className="px-5 py-2.5 font-semibold tabular-nums text-slate-900" dir="ltr">{r.ratePerShift}</td>
                        <td className="px-5 py-2.5 tabular-nums text-slate-600" dir="ltr">{r.ratePerMonth ?? "—"}</td>
                        <td className="px-5 py-2.5 text-slate-600">{r.effectiveFrom.slice(0, 10)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title={t("title")}
        actions={
          <Btn onClick={() => { setShowAdd(true); setFormError(null); }}>
            <Icon name="plus" className="h-4 w-4" />
            {t("add")}
          </Btn>
        }
      />

      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          <input value={search} onChange={(e) => { setSearch(e.currentTarget.value); setPage(1); }}
            placeholder={t("searchPh")}
            className={`${fieldInput} !mt-0 min-w-52 flex-1`} />
          <select value={status} onChange={(e) => { setStatus(e.currentTarget.value); setPage(1); }}
            className={`${fieldInput} !mt-0 w-auto`}>
            <option value="">{t("allStatuses")}</option>
            {["DRAFT", "ACTIVE", "SUSPENDED", "EXPIRED", "TERMINATED"].map((s) => (
              <option key={s} value={s}>{t(`status_${s}`)}</option>
            ))}
          </select>
          <select value={clientId} onChange={(e) => { setClientId(e.currentTarget.value); setPage(1); }}
            className={`${fieldInput} !mt-0 w-auto`}>
            <option value="">{t("allClients")}</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{isAr ? c.companyNameAr : c.companyNameEn}</option>
            ))}
          </select>
        </div>
      </Card>

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50/70 text-xs uppercase tracking-wider text-slate-400">
                <th className="px-5 py-3.5 text-start font-semibold">{t("contractNo")}</th>
                <th className="px-5 py-3.5 text-start font-semibold">{t("client")}</th>
                <th className="px-5 py-3.5 text-start font-semibold">{t("endDate")}</th>
                <th className="px-5 py-3.5 text-start font-semibold">{t("status")}</th>
                <th className="px-5 py-3.5 text-end font-semibold">{t("actions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((c) => (
                <tr key={c.id} className="transition hover:bg-slate-50/70">
                  <td className="px-5 py-3.5 font-mono text-xs font-semibold text-slate-900">{c.contractNo}</td>
                  <td className="px-5 py-3.5 font-semibold text-slate-900">{c.clientName}</td>
                  <td className="px-5 py-3.5 text-slate-600">{fmtDate(c.endDate)}</td>
                  <td className="px-5 py-3.5">
                    <Badge tone={statusTone(c.status)}>{t(`status_${c.status}`)}</Badge>
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex justify-end">
                      <Btn variant="ghost" onClick={() => refreshDetail(c.id)} className="px-3 py-1.5">
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
            <EmptyState icon="contracts" title={t("noResults")} />
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

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-[2px]">
          <form onSubmit={create} className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
            <h2 className="text-lg font-extrabold tracking-tight text-slate-900">{t("add")}</h2>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <Field label={`${t("client")} *`}>
                <select required value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.currentTarget.value })} className={fieldInput}>
                  <option value="">{t("allClients")}</option>
                  {clients.map((c) => <option key={c.id} value={c.id}>{isAr ? c.companyNameAr : c.companyNameEn}</option>)}
                </select>
              </Field>
              <Field label={`${t("contractNo")} *`}>
                <input required value={form.contractNo} onChange={(e) => setForm({ ...form, contractNo: e.currentTarget.value })} className={fieldInput} dir="ltr" />
              </Field>
              <Field label={`${t("titleAr")} *`}>
                <input required value={form.titleAr} onChange={(e) => setForm({ ...form, titleAr: e.currentTarget.value })} className={fieldInput} />
              </Field>
              <Field label={`${t("titleEn")} *`}>
                <input required value={form.titleEn} onChange={(e) => setForm({ ...form, titleEn: e.currentTarget.value })} className={fieldInput} />
              </Field>
              <Field label={`${t("startDate")} *`}>
                <input type="date" required value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.currentTarget.value })} className={fieldInput} />
              </Field>
              <Field label={`${t("endDate")} *`}>
                <input type="date" required value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.currentTarget.value })} className={fieldInput} />
              </Field>
              <Field label={t("paymentTermsDays")}>
                <input type="number" min={0} value={form.paymentTermsDays} dir="ltr"
                  onChange={(e) => setForm({ ...form, paymentTermsDays: e.currentTarget.value })} className={fieldInput} />
              </Field>
              <Field label={`${t("site")} *`}>
                <select required value={form.siteId} onChange={(e) => setForm({ ...form, siteId: e.currentTarget.value })} className={fieldInput}>
                  <option value="">{t("site")}</option>
                  {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </Field>
              <Field label={t("serviceType")}>
                <select value={form.serviceType} onChange={(e) => setForm({ ...form, serviceType: e.currentTarget.value })} className={fieldInput}>
                  {SERVICE_TYPES.map((s) => <option key={s} value={s}>{t(`service_${s}`)}</option>)}
                </select>
              </Field>
              <Field label={`${t("ratePerShift")} *`}>
                <input type="number" min={1} required value={form.ratePerShift} dir="ltr"
                  onChange={(e) => setForm({ ...form, ratePerShift: e.currentTarget.value })} className={fieldInput} />
              </Field>
            </div>
            {formError && (
              <p className="mt-4 rounded-xl bg-rose-50 px-4 py-2.5 text-sm font-medium text-rose-700 ring-1 ring-rose-100">{formError}</p>
            )}
            <div className="mt-6 flex justify-end gap-2">
              <Btn type="button" variant="ghost" onClick={() => setShowAdd(false)}>{t("cancel")}</Btn>
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
