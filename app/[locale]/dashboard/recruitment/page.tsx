"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";

interface Envelope { success: boolean; data?: unknown; error?: { message?: string }; page?: { total: number; totalPages: number } }
interface Interview { id: string; scheduledAt: string; location: string | null; notes: string | null }
interface Candidate {
  id: string; nameAr: string; nameEn: string; nationalId: string; phone: string | null;
  status: string; appliedAt: string; interviews: Interview[]; notes: string | null;
}
interface SiteOpt { id: string; name: string }

const inputCls = "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none";
const labelCls = "block text-sm font-medium text-slate-700";

const STATUSES = ["NEW", "SCREENING", "INTERVIEW", "MEDICAL_SECURITY_CHECK", "APPROVED", "REJECTED", "HIRED"];
const STATUS_COLORS: Record<string, string> = {
  NEW: "bg-slate-200 text-slate-600",
  SCREENING: "bg-blue-100 text-blue-700",
  INTERVIEW: "bg-purple-100 text-purple-700",
  MEDICAL_SECURITY_CHECK: "bg-amber-100 text-amber-700",
  APPROVED: "bg-green-100 text-green-700",
  REJECTED: "bg-red-100 text-red-700",
  HIRED: "bg-emerald-100 text-emerald-700",
};

/** Recruitment pipeline: candidates, interviews, hire. */
export default function RecruitmentPage() {
  const t = useTranslations("recruitment");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [pipeline, setPipeline] = useState<{ status: string; count: number }[]>([]);
  const [selected, setSelected] = useState<Candidate | null>(null);
  const [sites, setSites] = useState<SiteOpt[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ nameAr: "", nameEn: "", nationalId: "", phone: "", notes: "" });
  const [showInterview, setShowInterview] = useState(false);
  const [intForm, setIntForm] = useState({ scheduledAt: "", location: "", notes: "" });
  const [showHire, setShowHire] = useState(false);
  const [hireForm, setHireForm] = useState({ siteId: "", salary: "" });
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const qs = new URLSearchParams({ page: String(page), pageSize: "20" });
      if (search.trim()) qs.set("search", search.trim());
      if (status) qs.set("status", status);
      const res = await fetch(`/api/v1/candidates?${qs}`);
      const b = (await res.json()) as Envelope;
      if (b.success) {
        setCandidates((b.data as Candidate[]) ?? []);
        if (b.page) setTotalPages(b.page.totalPages);
      }
    } catch { /* noop */ }
  }, [page, search, status]);

  const loadPipeline = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/candidates/pipeline");
      const b = (await res.json()) as Envelope;
      if (b.success) setPipeline((b.data as { status: string; count: number }[]) ?? []);
    } catch { /* noop */ }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadPipeline(); }, [loadPipeline]);
  useEffect(() => {
    fetch("/api/v1/sites?pageSize=100").then((r) => r.json()).then((j: unknown) => {
      const b = j as Envelope;
      if (b.success) setSites((b.data as SiteOpt[]) ?? []);
    }).catch(() => {});
  }, []);

  async function openCandidate(id: string) {
    try {
      const res = await fetch(`/api/v1/candidates/${id}`);
      const b = (await res.json()) as Envelope;
      if (b.success) setSelected(b.data as Candidate);
    } catch { /* noop */ }
  }

  async function addCandidate(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    try {
      const res = await fetch("/api/v1/candidates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          nameAr: form.nameAr.trim(), nameEn: form.nameEn.trim(),
          nationalId: form.nationalId.trim(),
          phone: form.phone.trim() || null,
          notes: form.notes.trim() || null,
        }),
      });
      const b = (await res.json()) as Envelope;
      if (b.success) {
        setShowAdd(false);
        setForm({ nameAr: "", nameEn: "", nationalId: "", phone: "", notes: "" });
        setPage(1); load(); loadPipeline();
      } else setMsg(b.error?.message ?? "Error");
    } catch { setMsg("Error"); }
  }

  async function transition(to: string) {
    if (!selected) return;
    try {
      const res = await fetch(`/api/v1/candidates/${selected.id}/status`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ to }),
      });
      const b = (await res.json()) as Envelope;
      if (b.success) { openCandidate(selected.id); load(); loadPipeline(); }
      else setMsg(b.error?.message ?? "Error");
    } catch { /* noop */ }
  }

  async function schedule(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    try {
      const dt = new Date(intForm.scheduledAt);
      const res = await fetch(`/api/v1/candidates/${selected.id}/interviews`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          scheduledAt: dt.toISOString(),
          location: intForm.location.trim() || null,
          notes: intForm.notes.trim() || null,
        }),
      });
      const b = (await res.json()) as Envelope;
      if (b.success) {
        setShowInterview(false);
        setIntForm({ scheduledAt: "", location: "", notes: "" });
        openCandidate(selected.id);
      } else setMsg(b.error?.message ?? "Error");
    } catch { setMsg("Error"); }
  }

  async function hire(e: React.FormEvent) {
    e.preventDefault();
    if (!selected || !window.confirm(t("hireConfirm"))) return;
    try {
      const res = await fetch(`/api/v1/candidates/${selected.id}/hire`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          siteId: hireForm.siteId || null,
          salary: hireForm.salary ? Number(hireForm.salary) : null,
        }),
      });
      const b = (await res.json()) as Envelope;
      if (b.success) {
        setShowHire(false);
        openCandidate(selected.id); load(); loadPipeline();
      } else setMsg(b.error?.message ?? "Error");
    } catch { setMsg("Error"); }
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">{t("title")}</h1>
        <button onClick={() => setShowAdd(true)}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white">{t("addCandidate")}</button>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {pipeline.map((p) => (
          <button key={p.status} onClick={() => { setStatus(p.status); setPage(1); }}
            className={`rounded-xl px-4 py-2.5 text-sm ring-1 ${status === p.status ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-700 ring-slate-200"}`}>
            <span className="font-bold">{p.count}</span> <span className="ms-1">{t(`st_${p.status}`)}</span>
          </button>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-2">
        <label className={labelCls}>{t("search")}
          <input value={search} onChange={(e) => { setSearch(e.currentTarget.value); setPage(1); }}
            className="mt-1 block w-56 rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal" /></label>
        <label className={labelCls}>{t("status")}
          <select value={status} onChange={(e) => { setStatus(e.currentTarget.value); setPage(1); }}
            className="mt-1 block rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal">
            <option value="">{t("allStatuses")}</option>
            {STATUSES.map((s) => <option key={s} value={s}>{t(`st_${s}`)}</option>)}
          </select></label>
      </div>

      {msg && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{msg}</p>}

      <div className="mt-4 overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-slate-200 text-slate-500">
            <th className="px-4 py-3 text-start font-medium">{t("nameAr")}</th>
            <th className="px-4 py-3 text-start font-medium">{t("nationalId")}</th>
            <th className="px-4 py-3 text-start font-medium">{t("phone")}</th>
            <th className="px-4 py-3 text-center font-medium">{t("status")}</th>
            <th className="px-4 py-3 text-center font-medium">{t("appliedAt")}</th>
          </tr></thead>
          <tbody>
            {candidates.map((c) => (
              <tr key={c.id} className="cursor-pointer border-b border-slate-100 hover:bg-slate-50" onClick={() => openCandidate(c.id)}>
                <td className="px-4 py-2.5 font-medium text-slate-900">{c.nameAr}
                  <span className="block text-xs font-normal text-slate-500" dir="ltr">{c.nameEn}</span></td>
                <td className="px-4 py-2.5 font-mono text-xs" dir="ltr">{c.nationalId}</td>
                <td className="px-4 py-2.5" dir="ltr">{c.phone ?? "—"}</td>
                <td className="px-4 py-2.5 text-center">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[c.status] ?? ""}`}>{t(`st_${c.status}`)}</span></td>
                <td className="px-4 py-2.5 text-center text-xs text-slate-500" dir="ltr">{c.appliedAt.slice(0, 10)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {candidates.length === 0 && <p className="px-4 py-8 text-center text-sm text-slate-500">{t("noCandidates")}</p>}
      </div>

      <div className="mt-3 flex items-center justify-between text-sm text-slate-500">
        <span>—</span>
        <div className="flex gap-2">
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}
            className="rounded-lg border border-slate-300 px-3 py-1.5 disabled:opacity-40">‹</button>
          <span className="px-2 py-1.5" dir="ltr">{page} / {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}
            className="rounded-lg border border-slate-300 px-3 py-1.5 disabled:opacity-40">›</button>
        </div>
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-900">{selected.nameAr}</h2>
                <p className="text-sm text-slate-500" dir="ltr">{selected.nameEn} · {selected.nationalId}</p>
              </div>
              <button onClick={() => setSelected(null)} className="text-xl text-slate-400">×</button>
            </div>
            <div className="mt-2">
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[selected.status] ?? ""}`}>
                {t(`st_${selected.status}`)}</span>
            </div>

            <div className="mt-4">
              <h3 className="text-sm font-semibold text-slate-900">{t("moveTo")}</h3>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {STATUSES.filter((s) => s !== selected.status && s !== "HIRED").map((s) => (
                  <button key={s} onClick={() => transition(s)}
                    className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium hover:bg-slate-50">
                    {t(`st_${s}`)}</button>
                ))}
              </div>
            </div>

            <div className="mt-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-900">{t("interviews")} ({selected.interviews.length})</h3>
                <button onClick={() => setShowInterview(true)}
                  className="text-xs font-medium text-blue-700">{t("scheduleInterview")}</button>
              </div>
              <ul className="mt-1.5 space-y-1">
                {selected.interviews.map((i) => (
                  <li key={i.id} className="rounded-lg bg-slate-50 px-3 py-2 text-xs">
                    <span dir="ltr">{i.scheduledAt.slice(0, 16).replace("T", " ")}</span>
                    {i.location && <span className="ms-2 text-slate-500">{i.location}</span>}
                  </li>
                ))}
              </ul>
            </div>

            {selected.status === "APPROVED" && (
              <button onClick={() => setShowHire(true)}
                className="mt-5 w-full rounded-lg bg-green-700 px-4 py-2.5 text-sm font-medium text-white">
                {t("hire")}</button>
            )}
            <button onClick={() => setSelected(null)}
              className="mt-2 w-full rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium">{t("cancel")}</button>
          </div>
        </div>
      )}

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form onSubmit={addCandidate} className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-bold text-slate-900">{t("addCandidate")}</h2>
            <div className="mt-4 grid gap-4">
              <label className={labelCls}>{t("nameAr")}
                <input required value={form.nameAr} onChange={(e) => setForm({ ...form, nameAr: e.currentTarget.value })} className={inputCls} /></label>
              <label className={labelCls}>{t("nameEn")}
                <input required value={form.nameEn} dir="ltr" onChange={(e) => setForm({ ...form, nameEn: e.currentTarget.value })} className={inputCls} /></label>
              <div className="grid grid-cols-2 gap-4">
                <label className={labelCls}>{t("nationalId")}
                  <input required value={form.nationalId} dir="ltr" maxLength={14}
                    onChange={(e) => setForm({ ...form, nationalId: e.currentTarget.value.replace(/\D/g, "") })} className={inputCls} /></label>
                <label className={labelCls}>{t("phone")}
                  <input value={form.phone} dir="ltr" maxLength={11}
                    onChange={(e) => setForm({ ...form, phone: e.currentTarget.value.replace(/\D/g, "") })} className={inputCls} /></label>
              </div>
              <label className={labelCls}>{t("notes")}
                <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.currentTarget.value })} className={inputCls} /></label>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => setShowAdd(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium">{t("cancel")}</button>
              <button type="submit" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white">{t("save")}</button>
            </div>
          </form>
        </div>
      )}

      {showInterview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form onSubmit={schedule} className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-bold text-slate-900">{t("scheduleInterview")}</h2>
            <div className="mt-4 grid gap-4">
              <label className={labelCls}>{t("scheduledAt")}
                <input required type="datetime-local" value={intForm.scheduledAt} dir="ltr"
                  onChange={(e) => setIntForm({ ...intForm, scheduledAt: e.currentTarget.value })} className={inputCls} /></label>
              <label className={labelCls}>{t("location")}
                <input value={intForm.location} onChange={(e) => setIntForm({ ...intForm, location: e.currentTarget.value })} className={inputCls} /></label>
              <label className={labelCls}>{t("notes")}
                <input value={intForm.notes} onChange={(e) => setIntForm({ ...intForm, notes: e.currentTarget.value })} className={inputCls} /></label>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => setShowInterview(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium">{t("cancel")}</button>
              <button type="submit" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white">{t("save")}</button>
            </div>
          </form>
        </div>
      )}

      {showHire && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form onSubmit={hire} className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-bold text-slate-900">{t("hire")}</h2>
            <div className="mt-4 grid gap-4">
              <label className={labelCls}>{t("hireSiteOptional")}
                <select value={hireForm.siteId} onChange={(e) => setHireForm({ ...hireForm, siteId: e.currentTarget.value })} className={inputCls}>
                  <option value="">—</option>
                  {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select></label>
              <label className={labelCls}>{t("salary")}
                <input type="number" min="0" value={hireForm.salary} dir="ltr"
                  onChange={(e) => setHireForm({ ...hireForm, salary: e.currentTarget.value })} className={inputCls} /></label>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => setShowHire(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium">{t("cancel")}</button>
              <button type="submit" className="rounded-lg bg-green-700 px-4 py-2 text-sm font-medium text-white">{t("hire")}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
