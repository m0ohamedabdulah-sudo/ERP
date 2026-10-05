"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";

interface Envelope { success: boolean; data?: unknown; page?: { totalPages: number } }
interface Log {
  id: string; createdAt: string; userEmail: string | null; userName: string | null;
  action: string; module: string; recordId: string | null; ip: string | null;
}
interface LogDetail extends Log { oldValue: unknown; newValue: unknown; userAgent: string | null }

const labelCls = "block text-sm font-medium text-slate-700";
const inputCls = "mt-1 block rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal";

const MODULES = ["auth", "users", "employees", "sites", "attendance", "roster", "clients", "contracts", "invoices", "payroll", "recruitment", "compliance", "audit"];

/** Audit log viewer with filters and expandable details. */
export default function AuditPage() {
  const t = useTranslations("audit");
  const [logs, setLogs] = useState<Log[]>([]);
  const [module, setModule] = useState("");
  const [action, setAction] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [detail, setDetail] = useState<LogDetail | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ page: String(page), pageSize: "25" });
      if (module) qs.set("module", module);
      if (action.trim()) qs.set("action", action.trim());
      if (from) qs.set("from", from);
      if (to) qs.set("to", to);
      const res = await fetch(`/api/v1/audit-logs?${qs}`);
      const b = (await res.json()) as Envelope;
      if (b.success) {
        setLogs((b.data as Log[]) ?? []);
        if (b.page) setTotalPages(b.page.totalPages);
      }
    } catch { /* noop */ } finally { setLoading(false); }
  }, [page, module, action, from, to]);

  useEffect(() => { load(); }, [load]);

  async function openDetail(id: string) {
    try {
      const res = await fetch(`/api/v1/audit-logs/${id}`);
      const b = (await res.json()) as Envelope;
      if (b.success) setDetail((b.data as { log: LogDetail }).log);
    } catch { /* noop */ }
  }

  function clear() {
    setModule(""); setAction(""); setFrom(""); setTo(""); setPage(1);
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">{t("title")}</h1>

      <div className="mt-4 flex flex-wrap items-end gap-2">
        <label className={labelCls}>{t("module")}
          <select value={module} onChange={(e) => { setModule(e.currentTarget.value); setPage(1); }} className={inputCls}>
            <option value="">{t("allModules")}</option>
            {MODULES.map((m) => <option key={m} value={m}>{m}</option>)}
          </select></label>
        <label className={labelCls}>{t("action")}
          <input value={action} onChange={(e) => setAction(e.currentTarget.value)}
            placeholder="employee.update" dir="ltr" className={`${inputCls} w-44`} /></label>
        <label className={labelCls}>{t("from")}
          <input type="date" value={from} onChange={(e) => setFrom(e.currentTarget.value)} className={inputCls} /></label>
        <label className={labelCls}>{t("to")}
          <input type="date" value={to} onChange={(e) => setTo(e.currentTarget.value)} className={inputCls} /></label>
        <button onClick={() => { setPage(1); load(); }} disabled={loading}
          className="rounded-lg bg-slate-900 px-5 py-2 text-sm font-medium text-white disabled:opacity-50">{t("filter")}</button>
        <button onClick={clear} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium">{t("clear")}</button>
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-slate-200 text-slate-500">
            <th className="px-4 py-3 text-start font-medium">{t("time")}</th>
            <th className="px-4 py-3 text-start font-medium">{t("user")}</th>
            <th className="px-4 py-3 text-start font-medium">{t("action")}</th>
            <th className="px-4 py-3 text-start font-medium">{t("module")}</th>
          </tr></thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id} className="cursor-pointer border-b border-slate-100 hover:bg-slate-50" onClick={() => openDetail(l.id)}>
                <td className="px-4 py-2.5 text-xs text-slate-500" dir="ltr">
                  {l.createdAt.slice(0, 16).replace("T", " ")}</td>
                <td className="px-4 py-2.5">{l.userName ?? l.userEmail ?? <span className="text-slate-400">{t("system")}</span>}</td>
                <td className="px-4 py-2.5 font-mono text-xs" dir="ltr">{l.action}</td>
                <td className="px-4 py-2.5">
                  <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700" dir="ltr">{l.module}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
        {logs.length === 0 && <p className="px-4 py-8 text-center text-sm text-slate-500">{t("noLogs")}</p>}
      </div>

      <div className="mt-3 flex justify-end gap-2 text-sm">
        <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}
          className="rounded-lg border border-slate-300 px-3 py-1.5 disabled:opacity-40">‹</button>
        <span className="px-2 py-1.5 text-slate-500" dir="ltr">{page} / {totalPages}</span>
        <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}
          className="rounded-lg border border-slate-300 px-3 py-1.5 disabled:opacity-40">›</button>
      </div>

      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="font-mono text-base font-bold text-slate-900" dir="ltr">{detail.action}</h2>
                <p className="mt-1 text-xs text-slate-500" dir="ltr">
                  {detail.createdAt.slice(0, 19).replace("T", " ")} · {detail.userEmail ?? t("system")} · {detail.ip ?? "—"}
                </p>
              </div>
              <button onClick={() => setDetail(null)} className="text-xl text-slate-400">×</button>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div>
                <h3 className="text-sm font-semibold text-slate-700">{t("oldValue")}</h3>
                <pre className="mt-1 max-h-64 overflow-auto rounded-lg bg-slate-50 p-3 text-xs" dir="ltr">
                  {JSON.stringify(detail.oldValue ?? null, null, 2)}</pre>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-700">{t("newValue")}</h3>
                <pre className="mt-1 max-h-64 overflow-auto rounded-lg bg-slate-50 p-3 text-xs" dir="ltr">
                  {JSON.stringify(detail.newValue ?? null, null, 2)}</pre>
              </div>
            </div>
            <button onClick={() => setDetail(null)}
              className="mt-4 w-full rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium">{t("details")} ×</button>
          </div>
        </div>
      )}
    </div>
  );
}
