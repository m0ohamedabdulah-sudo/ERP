"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  PageHeader, Card, Btn, Badge, Field, fieldInput, EmptyState, Icon,
} from "../_ui";

type BadgeTone = "green" | "red" | "amber" | "blue" | "slate" | "purple";

interface Envelope { success: boolean; data?: unknown; error?: { message?: string }; page?: { total: number; totalPages: number } }
interface Interview { id: string; scheduledAt: string; location: string | null; notes: string | null }
interface Candidate {
  id: string; nameAr: string; nameEn: string; nationalId: string; phone: string | null;
  status: string; appliedAt: string; interviews: Interview[]; notes: string | null;
}
interface SiteOpt { id: string; name: string }

const STATUSES = ["NEW", "SCREENING", "INTERVIEW", "MEDICAL_SECURITY_CHECK", "APPROVED", "REJECTED", "HIRED"];
const STATUS_TONES: Record<string, BadgeTone> = {
  NEW: "slate",
  SCREENING: "blue",
  INTERVIEW: "purple",
  MEDICAL_SECURITY_CHECK: "amber",
  APPROVED: "green",
  REJECTED: "red",
  HIRED: "green",
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
    <div className="space-y-5">
      <PageHeader
        title={t("title")}
        actions={
          <Btn variant="primary" onClick={() => setShowAdd(true)}>
            <Icon name="plus" className="h-4 w-4" />{t("addCandidate")}
          </Btn>
        }
      />

      <div className="flex flex-wrap gap-2">
        {pipeline.map((p) => {
          const active = status === p.status;
          return (
            <button key={p.status} onClick={() => { setStatus(p.status); setPage(1); }}
              className={`flex items-center gap-2 rounded-2xl border px-4 py-2.5 text-sm font-semibold transition ${
                active
                  ? "border-slate-900 bg-slate-900 text-white shadow"
                  : "border-slate-200/70 bg-white text-slate-700 hover:border-slate-300"
              }`}>
              <span className={`text-lg font-extrabold tabular-nums ${active ? "text-white" : "text-slate-900"}`}>{p.count}</span>
              <span className={active ? "text-slate-200" : "text-slate-500"}>{t(`st_${p.status}`)}</span>
            </button>
          );
        })}
      </div>

      <Card className="flex flex-wrap items-end gap-3">
        <Field label={t("search")}>
          <input value={search} onChange={(e) => { setSearch(e.currentTarget.value); setPage(1); }}
            className={`${fieldInput} w-56`} />
        </Field>
        <Field label={t("status")}>
          <select value={status} onChange={(e) => { setStatus(e.currentTarget.value); setPage(1); }}
            className={`${fieldInput} min-w-40`}>
            <option value="">{t("allStatuses")}</option>
            {STATUSES.map((s) => <option key={s} value={s}>{t(`st_${s}`)}</option>)}
          </select>
        </Field>
      </Card>

      {msg && (
        <div className="flex items-center gap-2 rounded-xl bg-rose-50 px-4 py-2.5 text-sm font-medium text-rose-700 ring-1 ring-inset ring-rose-200">
          <Icon name="x" className="h-4 w-4 shrink-0" />{msg}
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.05)]">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-slate-100 bg-slate-50/60 text-slate-500">
              <th className="px-4 py-3 text-start font-semibold">{t("nameAr")}</th>
              <th className="px-4 py-3 text-start font-semibold">{t("nationalId")}</th>
              <th className="px-4 py-3 text-start font-semibold">{t("phone")}</th>
              <th className="px-4 py-3 text-center font-semibold">{t("status")}</th>
              <th className="px-4 py-3 text-center font-semibold">{t("appliedAt")}</th>
            </tr></thead>
            <tbody>
              {candidates.map((c) => (
                <tr key={c.id} className="cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50/60" onClick={() => openCandidate(c.id)}>
                  <td className="px-4 py-2.5 font-semibold text-slate-900">
                    {c.nameAr}
                    <span className="block text-xs font-normal text-slate-500" dir="ltr">{c.nameEn}</span>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs" dir="ltr">{c.nationalId}</td>
                  <td className="px-4 py-2.5" dir="ltr">{c.phone ?? "—"}</td>
                  <td className="px-4 py-2.5 text-center">
                    <Badge tone={STATUS_TONES[c.status] ?? "slate"}>{t(`st_${c.status}`)}</Badge>
                  </td>
                  <td className="px-4 py-2.5 text-center text-xs text-slate-500" dir="ltr">{c.appliedAt.slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {candidates.length === 0 && <EmptyState icon="recruitment" title={t("noCandidates")} />}
      </div>

      <div className="flex items-center justify-end">
        <div className="flex items-center gap-2">
          <Btn variant="ghost" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="!px-3">
            <Icon name="chevronLeft" className="h-4 w-4 rtl:rotate-180" />
          </Btn>
          <span className="px-2 text-sm tabular-nums text-slate-500" dir="ltr">{page} / {totalPages}</span>
          <Btn variant="ghost" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="!px-3">
            <Icon name="chevronRight" className="h-4 w-4 rtl:rotate-180" />
          </Btn>
        </div>
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-extrabold tracking-tight text-slate-900">{selected.nameAr}</h2>
                <p className="mt-0.5 text-sm text-slate-500" dir="ltr">{selected.nameEn} · {selected.nationalId}</p>
              </div>
              <Btn variant="ghost" onClick={() => setSelected(null)} className="!px-2.5">
                <Icon name="x" className="h-4 w-4" />
              </Btn>
            </div>
            <div className="mt-3">
              <Badge tone={STATUS_TONES[selected.status] ?? "slate"}>{t(`st_${selected.status}`)}</Badge>
            </div>

            <div className="mt-5">
              <h3 className="text-sm font-bold text-slate-900">{t("moveTo")}</h3>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {STATUSES.filter((s) => s !== selected.status && s !== "HIRED").map((s) => (
                  <Btn key={s} variant="outline" onClick={() => transition(s)} className="!px-2.5 !py-1.5 !text-xs">
                    {t(`st_${s}`)}
                  </Btn>
                ))}
              </div>
            </div>

            <div className="mt-5">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900">{t("interviews")} ({selected.interviews.length})</h3>
                <Btn variant="ghost" onClick={() => setShowInterview(true)} className="!px-2 !py-1 !text-xs !text-blue-700">
                  <Icon name="plus" className="h-3.5 w-3.5" />{t("scheduleInterview")}
                </Btn>
              </div>
              <ul className="mt-2 space-y-1.5">
                {selected.interviews.map((i) => (
                  <li key={i.id} className="rounded-xl bg-slate-50 px-3.5 py-2.5 text-xs text-slate-600">
                    <span className="font-semibold text-slate-800" dir="ltr">{i.scheduledAt.slice(0, 16).replace("T", " ")}</span>
                    {i.location && <span className="ms-2 text-slate-500">{i.location}</span>}
                  </li>
                ))}
              </ul>
            </div>

            {selected.status === "APPROVED" && (
              <Btn variant="success" onClick={() => setShowHire(true)} className="mt-6 w-full">
                {t("hire")}
              </Btn>
            )}
            <Btn variant="outline" onClick={() => setSelected(null)} className="mt-2 w-full">
              {t("cancel")}
            </Btn>
          </div>
        </div>
      )}

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form onSubmit={addCandidate} className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-extrabold tracking-tight text-slate-900">{t("addCandidate")}</h2>
            <div className="mt-4 grid gap-4">
              <Field label={t("nameAr")}>
                <input required value={form.nameAr} onChange={(e) => setForm({ ...form, nameAr: e.currentTarget.value })} className={fieldInput} />
              </Field>
              <Field label={t("nameEn")}>
                <input required value={form.nameEn} dir="ltr" onChange={(e) => setForm({ ...form, nameEn: e.currentTarget.value })} className={fieldInput} />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label={t("nationalId")}>
                  <input required value={form.nationalId} dir="ltr" maxLength={14}
                    onChange={(e) => setForm({ ...form, nationalId: e.currentTarget.value.replace(/\D/g, "") })} className={fieldInput} />
                </Field>
                <Field label={t("phone")}>
                  <input value={form.phone} dir="ltr" maxLength={11}
                    onChange={(e) => setForm({ ...form, phone: e.currentTarget.value.replace(/\D/g, "") })} className={fieldInput} />
                </Field>
              </div>
              <Field label={t("notes")}>
                <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.currentTarget.value })} className={fieldInput} />
              </Field>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Btn variant="outline" type="button" onClick={() => setShowAdd(false)}>{t("cancel")}</Btn>
              <Btn variant="primary" type="submit">{t("save")}</Btn>
            </div>
          </form>
        </div>
      )}

      {showInterview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form onSubmit={schedule} className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-extrabold tracking-tight text-slate-900">{t("scheduleInterview")}</h2>
            <div className="mt-4 grid gap-4">
              <Field label={t("scheduledAt")}>
                <input required type="datetime-local" value={intForm.scheduledAt} dir="ltr"
                  onChange={(e) => setIntForm({ ...intForm, scheduledAt: e.currentTarget.value })} className={fieldInput} />
              </Field>
              <Field label={t("location")}>
                <input value={intForm.location} onChange={(e) => setIntForm({ ...intForm, location: e.currentTarget.value })} className={fieldInput} />
              </Field>
              <Field label={t("notes")}>
                <input value={intForm.notes} onChange={(e) => setIntForm({ ...intForm, notes: e.currentTarget.value })} className={fieldInput} />
              </Field>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Btn variant="outline" type="button" onClick={() => setShowInterview(false)}>{t("cancel")}</Btn>
              <Btn variant="primary" type="submit">{t("save")}</Btn>
            </div>
          </form>
        </div>
      )}

      {showHire && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form onSubmit={hire} className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-extrabold tracking-tight text-slate-900">{t("hire")}</h2>
            <div className="mt-4 grid gap-4">
              <Field label={t("hireSiteOptional")}>
                <select value={hireForm.siteId} onChange={(e) => setHireForm({ ...hireForm, siteId: e.currentTarget.value })} className={fieldInput}>
                  <option value="">—</option>
                  {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </Field>
              <Field label={t("salary")}>
                <input type="number" min="0" value={hireForm.salary} dir="ltr"
                  onChange={(e) => setHireForm({ ...hireForm, salary: e.currentTarget.value })} className={fieldInput} />
              </Field>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Btn variant="outline" type="button" onClick={() => setShowHire(false)}>{t("cancel")}</Btn>
              <Btn variant="success" type="submit">{t("hire")}</Btn>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
