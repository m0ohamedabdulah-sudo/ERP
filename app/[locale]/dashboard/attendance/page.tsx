"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";

interface Code {
  id: string;
  code: string;
  labelAr: string;
  labelEn: string;
  countsAsPresent: boolean;
}

interface BoardEmployee {
  id: string;
  cardNumber: string;
  fullNameAr: string;
  attendance: { codeId: string } | null;
}

interface Board {
  date: string;
  site: { id: string; name: string; requiredManpower: number };
  employees: BoardEmployee[];
}

interface SiteOpt {
  id: string;
  name: string;
}

interface Envelope {
  success: boolean;
  data?: unknown;
  error?: { message?: string };
}

/** Daily attendance board: pick date + site, set codes, save. */
export default function AttendancePage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  const t = useTranslations("attendance");
  const [sites, setSites] = useState<SiteOpt[]>([]);
  const [codes, setCodes] = useState<Code[]>([]);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [siteId, setSiteId] = useState("");
  const [board, setBoard] = useState<Board | null>(null);
  const [marks, setMarks] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{
    ok: boolean;
    text: string;
  } | null>(null);
  const isAr = locale === "ar";

  useEffect(() => {
    Promise.all([
      fetch("/api/v1/sites?pageSize=100").then((r) => r.json()),
      fetch("/api/v1/attendance/codes").then((r) => r.json()),
    ])
      .then(([sj, cj]: unknown[]) => {
        const sb = sj as Envelope;
        const cb = cj as Envelope;
        if (sb.success) setSites((sb.data as SiteOpt[]) ?? []);
        if (cb.success) setCodes((cb.data as Code[]) ?? []);
      })
      .catch(() => {});
  }, []);

  const loadBoard = useCallback(async () => {
    if (!siteId || !date) return;
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch(
        `/api/v1/attendance?date=${date}&siteId=${siteId}`,
      );
      const body = (await res.json()) as Envelope;
      if (body.success && body.data) {
        const b = body.data as Board;
        setBoard(b);
        const initial: Record<string, string> = {};
        for (const e of b.employees) {
          if (e.attendance) initial[e.id] = e.attendance.codeId;
        }
        setMarks(initial);
      } else {
        setMessage({ ok: false, text: t("loadError") });
      }
    } catch {
      setMessage({ ok: false, text: t("loadError") });
    } finally {
      setLoading(false);
    }
  }, [date, siteId, t]);

  async function save() {
    if (!board) return;
    setSaving(true);
    setMessage(null);
    try {
      const entries = Object.entries(marks)
        .filter(([, codeId]) => codeId)
        .map(([employeeId, codeId]) => ({ employeeId, codeId }));
      if (entries.length === 0) {
        setSaving(false);
        return;
      }
      const res = await fetch("/api/v1/attendance", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ date: board.date, siteId: board.site.id, entries }),
      });
      const body = (await res.json()) as Envelope;
      if (body.success) {
        setMessage({ ok: true, text: t("saved") });
        loadBoard();
      } else {
        setMessage({
          ok: false,
          text: body.error?.message ?? t("saveError"),
        });
      }
    } catch {
      setMessage({ ok: false, text: t("saveError") });
    } finally {
      setSaving(false);
    }
  }

  function markAll(codeId: string) {
    if (!board) return;
    const next: Record<string, string> = {};
    for (const e of board.employees) next[e.id] = codeId;
    setMarks(next);
  }

  const presentCode = codes.find((c) => c.code === "P");

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">{t("title")}</h1>

      <div className="mt-4 flex flex-wrap items-end gap-2">
        <label className="block text-sm font-medium text-slate-700">
          {t("date")}
          <input
            type="date"
            value={date}
            max={new Date().toISOString().slice(0, 10)}
            onChange={(e) => setDate(e.currentTarget.value)}
            className="mt-1 block rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
          />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          {t("site")}
          <select
            value={siteId}
            onChange={(e) => setSiteId(e.currentTarget.value)}
            className="mt-1 block min-w-48 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
          >
            <option value="">{t("selectSite")}</option>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <button
          onClick={loadBoard}
          disabled={!siteId || loading}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {t("load")}
        </button>
        {board && presentCode && (
          <button
            onClick={() => markAll(presentCode.id)}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50"
          >
            {isAr ? "تعليم الكل حضور" : "Mark all present"}
          </button>
        )}
      </div>

      {message && (
        <p
          className={`mt-4 rounded-lg px-3 py-2 text-sm ${
            message.ok
              ? "bg-green-50 text-green-700"
              : "bg-red-50 text-red-700"
          }`}
        >
          {message.text}
        </p>
      )}

      {board && (
        <div className="mt-4 overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="px-4 py-3 text-start font-medium">
                  {t("employee")}
                </th>
                <th className="px-4 py-3 text-start font-medium">{t("card")}</th>
                <th className="px-4 py-3 text-start font-medium">{t("code")}</th>
              </tr>
            </thead>
            <tbody>
              {board.employees.map((e) => (
                <tr key={e.id} className="border-b border-slate-100">
                  <td className="px-4 py-2.5 font-medium text-slate-900">
                    {e.fullNameAr}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-slate-500">
                    {e.cardNumber}
                  </td>
                  <td className="px-4 py-2.5">
                    <select
                      value={marks[e.id] ?? ""}
                      onChange={(ev) =>
                        setMarks({ ...marks, [e.id]: ev.currentTarget.value })
                      }
                      className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                    >
                      <option value="">—</option>
                      {codes.map((c) => (
                        <option key={c.id} value={c.id}>
                          {isAr ? c.labelAr : c.labelEn} ({c.code})
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {board.employees.length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-slate-500">
              {t("noEmployees")}
            </p>
          )}
        </div>
      )}

      {board && board.employees.length > 0 && (
        <div className="mt-4">
          <button
            onClick={save}
            disabled={saving}
            className="rounded-lg bg-slate-900 px-6 py-2.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {t("save")}
          </button>
        </div>
      )}
    </div>
  );
}
