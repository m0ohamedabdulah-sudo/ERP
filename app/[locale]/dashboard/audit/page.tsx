"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  PageHeader, Card, Btn, Badge, Field, fieldInput, EmptyState, Icon, Spinner,
} from "../_ui";

interface Envelope { success: boolean; data?: unknown; page?: { totalPages: number } }
interface Log {
  id: string; createdAt: string; userEmail: string | null; userName: string | null;
  action: string; module: string; recordId: string | null; ip: string | null;
}
interface LogDetail extends Log { oldValue: unknown; newValue: unknown; userAgent: string | null }

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
    <div className="space-y-5">
      <PageHeader title={t("title")} />

      <Card className="flex flex-wrap items-end gap-3">
        <Field label={t("module")}>
          <select value={module} onChange={(e) => { setModule(e.currentTarget.value); setPage(1); }}
            className={`${fieldInput} min-w-36`}>
            <option value="">{t("allModules")}</option>
            {MODULES.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </Field>
        <Field label={t("action")}>
          <input value={action} onChange={(e) => setAction(e.currentTarget.value)}
            placeholder="employee.update" dir="ltr" className={`${fieldInput} w-44`} />
        </Field>
        <Field label={t("from")}>
          <input type="date" value={from} onChange={(e) => setFrom(e.currentTarget.value)} className={fieldInput} />
        </Field>
        <Field label={t("to")}>
          <input type="date" value={to} onChange={(e) => setTo(e.currentTarget.value)} className={fieldInput} />
        </Field>
        <div className="mt-[26px] flex gap-2">
          <Btn variant="primary" onClick={() => { setPage(1); load(); }} disabled={loading}>
            {loading ? <Spinner className="h-4 w-4" /> : null}{t("filter")}
          </Btn>
          <Btn variant="outline" onClick={clear}>{t("clear")}</Btn>
        </div>
      </Card>

      <div className="overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.05)]">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-slate-100 bg-slate-50/60 text-slate-500">
              <th className="px-4 py-3 text-start font-semibold">{t("time")}</th>
              <th className="px-4 py-3 text-start font-semibold">{t("user")}</th>
              <th className="px-4 py-3 text-start font-semibold">{t("action")}</th>
              <th className="px-4 py-3 text-start font-semibold">{t("module")}</th>
            </tr></thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id} className="cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50/60" onClick={() => openDetail(l.id)}>
                  <td className="px-4 py-2.5 text-xs tabular-nums text-slate-500" dir="ltr">
                    {l.createdAt.slice(0, 16).replace("T", " ")}
                  </td>
                  <td className="px-4 py-2.5 font-medium text-slate-800">
                    {l.userName ?? l.userEmail ?? <Badge tone="slate">{t("system")}</Badge>}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-slate-700" dir="ltr">{l.action}</td>
                  <td className="px-4 py-2.5">
                    <Badge tone="slate"><span dir="ltr">{l.module}</span></Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {logs.length === 0 && <EmptyState icon="shield" title={t("noLogs")} />}
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

      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="font-mono text-base font-extrabold tracking-tight text-slate-900" dir="ltr">{detail.action}</h2>
                <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500" dir="ltr">
                  <span>{detail.createdAt.slice(0, 19).replace("T", " ")}</span>
                  <span>·</span>
                  <span>{detail.userEmail ?? t("system")}</span>
                  <span>·</span>
                  <Badge tone="slate">{detail.module}</Badge>
                </p>
              </div>
              <Btn variant="ghost" onClick={() => setDetail(null)} className="!px-2.5">
                <Icon name="x" className="h-4 w-4" />
              </Btn>
            </div>
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              <div>
                <h3 className="text-sm font-bold text-slate-800">{t("oldValue")}</h3>
                <pre className="mt-1.5 max-h-64 overflow-auto rounded-xl bg-slate-50 p-3.5 text-xs ring-1 ring-inset ring-slate-200/60" dir="ltr">
                  {JSON.stringify(detail.oldValue ?? null, null, 2)}</pre>
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-800">{t("newValue")}</h3>
                <pre className="mt-1.5 max-h-64 overflow-auto rounded-xl bg-slate-50 p-3.5 text-xs ring-1 ring-inset ring-slate-200/60" dir="ltr">
                  {JSON.stringify(detail.newValue ?? null, null, 2)}</pre>
              </div>
            </div>
            <Btn variant="outline" onClick={() => setDetail(null)} className="mt-5 w-full">
              <Icon name="x" className="h-4 w-4" />{t("details")}
            </Btn>
          </div>
        </div>
      )}
    </div>
  );
}
