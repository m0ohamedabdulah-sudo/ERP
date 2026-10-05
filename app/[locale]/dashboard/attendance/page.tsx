"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Badge, Btn, Card, EmptyState, Field, Icon, PageHeader,
  fieldInput,
} from "../_ui";

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

interface SiteOpt { id: string; name: string }
interface Envelope { success: boolean; data?: unknown; error?: { message?: string } }

/** Pill tone per attendance code. */
function codeTone(code: string): "green" | "red" | "amber" | "blue" | "slate" {
  if (["P", "PP", "12", "6"].includes(code)) return "green";
  if (code === "A" || code === "X") return "red";
  if (code === "AL") return "amber";
  if (code === "SL") return "blue";
  return "slate";
}

function shiftDate(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function prettyDate(iso: string, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-GB", {
      weekday: "long", day: "numeric", month: "long", timeZone: "UTC",
    }).format(new Date(iso + "T00:00:00Z"));
  } catch {
    return iso;
  }
}

/** Daily attendance: pick day + site, tap code pills per guard, save. */
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
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const isAr = locale === "ar";
  const today = new Date().toISOString().slice(0, 10);

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
      const res = await fetch(`/api/v1/attendance?date=${date}&siteId=${siteId}`);
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

  // Auto-load when both are picked.
  useEffect(() => {
    if (siteId && date) loadBoard();
  }, [siteId, date, loadBoard]);

  const codeById = useMemo(() => new Map(codes.map((c) => [c.id, c])), [codes]);

  const stats = useMemo(() => {
    if (!board) return null;
    let present = 0, absent = 0, unmarked = 0;
    for (const e of board.employees) {
      const codeId = marks[e.id];
      if (!codeId) { unmarked += 1; continue; }
      const c = codeById.get(codeId);
      if (!c) { unmarked += 1; continue; }
      if (c.countsAsPresent) present += 1;
      else if (c.code === "A" || c.code === "X") absent += 1;
      else present += 1; // leaves count as non-absence here
    }
    return { present, absent, unmarked, total: board.employees.length };
  }, [board, marks, codeById]);

  const dirty = useMemo(() => {
    if (!board) return false;
    for (const e of board.employees) {
      const saved = e.attendance?.codeId ?? "";
      if ((marks[e.id] ?? "") !== saved) return true;
    }
    return false;
  }, [board, marks]);

  async function save() {
    if (!board) return;
    setSaving(true);
    setMessage(null);
    try {
      const entries = Object.entries(marks)
        .filter(([, codeId]) => codeId)
        .map(([employeeId, codeId]) => ({ employeeId, codeId }));
      if (entries.length === 0) { setSaving(false); return; }
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
        setMessage({ ok: false, text: body.error?.message ?? t("saveError") });
      }
    } catch {
      setMessage({ ok: false, text: t("saveError") });
    } finally {
      setSaving(false);
    }
  }

  async function uploadFile(file: File) {
    if (!siteId) { setMessage({ ok: false, text: t("selectSite") }); return; }
    setUploading(true);
    setMessage(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("siteId", siteId);
      const res = await fetch("/api/v1/attendance/upload", { method: "POST", body: fd });
      const body = (await res.json()) as Envelope;
      if (body.success) {
        const r = body.data as { imported: number; skipped: number; errors: { row: number; reason: string }[] };
        const errText = r.errors.length > 0
          ? ` (${r.errors.slice(0, 3).map((e) => `#${e.row}: ${e.reason}`).join("; ")}${r.errors.length > 3 ? "…" : ""})`
          : "";
        setMessage({ ok: true, text: `${t("uploadDone")}: ${r.imported} — ${t("uploadSkipped")}: ${r.skipped}${errText}` });
        if (board) loadBoard();
      } else {
        setMessage({ ok: false, text: body.error?.message ?? t("saveError") });
      }
    } catch {
      setMessage({ ok: false, text: t("saveError") });
    } finally {
      setUploading(false);
    }
  }

  function markAllPresent() {
    if (!board) return;
    const p = codes.find((c) => c.code === "P");
    if (!p) return;
    const next: Record<string, string> = {};
    for (const e of board.employees) next[e.id] = p.id;
    setMarks(next);
  }

  const pillBase =
    "inline-flex min-w-11 items-center justify-center rounded-lg px-2.5 py-1.5 text-[13px] font-bold transition";

  function pillClass(code: Code, selected: boolean): string {
    const tone = codeTone(code.code);
    if (selected) {
      return {
        green: "bg-emerald-600 text-white shadow-sm",
        red: "bg-rose-600 text-white shadow-sm",
        amber: "bg-amber-500 text-white shadow-sm",
        blue: "bg-sky-600 text-white shadow-sm",
        slate: "bg-slate-600 text-white shadow-sm",
      }[tone];
    }
    return {
      green: "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200 hover:bg-emerald-100",
      red: "bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200 hover:bg-rose-100",
      amber: "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200 hover:bg-amber-100",
      blue: "bg-sky-50 text-sky-700 ring-1 ring-inset ring-sky-200 hover:bg-sky-100",
      slate: "bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-slate-200",
    }[tone];
  }

  return (
    <div className="pb-28">
      <PageHeader
        title={t("title")}
        subtitle={prettyDate(date, locale)}
        actions={
          <>
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              <Icon name="upload" className="h-4 w-4" />
              {uploading ? t("uploading") : t("upload")}
              <input
                type="file" accept=".xlsx,.xls" className="hidden"
                disabled={uploading || !siteId}
                onChange={(e) => {
                  const f = e.currentTarget.files?.[0];
                  if (f) uploadFile(f);
                  e.currentTarget.value = "";
                }}
              />
            </label>
            {board && (
              <Btn variant="outline" onClick={markAllPresent}>
                <Icon name="check" className="h-4 w-4" />
                {isAr ? "تعليم الكل حضور" : "Mark all present"}
              </Btn>
            )}
          </>
        }
      />

      {/* Controls */}
      <Card className="mt-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex items-end gap-1">
            <button
              onClick={() => setDate(shiftDate(date, -1))}
              className="flex h-[42px] w-10 items-center justify-center rounded-xl border border-slate-300 text-slate-600 hover:bg-slate-50"
              aria-label="previous day"
            >
              <Icon name={isAr ? "chevronRight" : "chevronLeft"} className="h-5 w-5" />
            </button>
            <Field label={t("date")} className="w-40">
              <input
                type="date" value={date} max={today}
                onChange={(e) => e.currentTarget.value && setDate(e.currentTarget.value)}
                className={fieldInput}
              />
            </Field>
            <button
              onClick={() => date < today && setDate(shiftDate(date, 1))}
              disabled={date >= today}
              className="flex h-[42px] w-10 items-center justify-center rounded-xl border border-slate-300 text-slate-600 hover:bg-slate-50 disabled:opacity-40"
              aria-label="next day"
            >
              <Icon name={isAr ? "chevronLeft" : "chevronRight"} className="h-5 w-5" />
            </button>
            {date !== today && (
              <button
                onClick={() => setDate(today)}
                className="h-[42px] rounded-xl bg-blue-50 px-3 text-sm font-semibold text-blue-700 hover:bg-blue-100"
              >
                {isAr ? "اليوم" : "Today"}
              </button>
            )}
          </div>
          <Field label={t("site")} className="min-w-52 flex-1 sm:max-w-xs">
            <select
              value={siteId}
              onChange={(e) => setSiteId(e.currentTarget.value)}
              className={fieldInput}
            >
              <option value="">{t("selectSite")}</option>
              {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
        </div>
        {!siteId && (
          <p className="mt-2 text-xs text-slate-400">{t("uploadHint")}</p>
        )}
      </Card>

      {message && (
        <div className={`mt-4 rounded-2xl px-4 py-3 text-sm font-medium ${message.ok ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
          {message.text}
        </div>
      )}

      {/* Summary strip */}
      {board && stats && (
        <div className="mt-4 grid grid-cols-3 gap-3">
          <Card className="flex items-center gap-3 !p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
              <Icon name="check" className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xl font-extrabold tabular-nums text-slate-900">{stats.present}</p>
              <p className="text-xs text-slate-500">{t("present")}</p>
            </div>
          </Card>
          <Card className="flex items-center gap-3 !p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-100 text-rose-700">
              <Icon name="x" className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xl font-extrabold tabular-nums text-slate-900">{stats.absent}</p>
              <p className="text-xs text-slate-500">{t("absent")}</p>
            </div>
          </Card>
          <Card className="flex items-center gap-3 !p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
              <Icon name="clock" className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xl font-extrabold tabular-nums text-slate-900">{stats.unmarked}</p>
              <p className="text-xs text-slate-500">{isAr ? "بدون تعليم" : "Unmarked"}</p>
            </div>
          </Card>
        </div>
      )}

      {/* Board */}
      {loading && (
        <Card className="mt-4 flex items-center justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-700 border-t-transparent" />
        </Card>
      )}

      {board && !loading && (
        <Card className="mt-4 !p-2 sm:!p-3">
          {board.employees.length === 0 ? (
            <EmptyState icon="users" title={t("noEmployees")} />
          ) : (
            <ul className="divide-y divide-slate-100">
              {board.employees.map((e) => {
                const selectedId = marks[e.id] ?? "";
                return (
                  <li key={e.id} className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="truncate text-[15px] font-semibold text-slate-900">{e.fullNameAr}</p>
                      <p className="font-mono text-xs text-slate-400" dir="ltr">{e.cardNumber}</p>
                    </div>
                    <div className="flex flex-wrap gap-1.5" dir="ltr">
                      {codes.map((c) => (
                        <button
                          key={c.id}
                          onClick={() => setMarks({ ...marks, [e.id]: selectedId === c.id ? "" : c.id })}
                          title={isAr ? c.labelAr : c.labelEn}
                          className={`${pillBase} ${pillClass(c, selectedId === c.id)}`}
                        >
                          {c.code}
                        </button>
                      ))}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      )}

      {!board && !loading && siteId && (
        <Card className="mt-4">
          <EmptyState icon="attendance" title={t("title")} hint={t("selectSite")} />
        </Card>
      )}

      {/* Sticky save bar */}
      {board && board.employees.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/90 px-4 py-3 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
            <p className="text-sm text-slate-500">
              {dirty
                ? (isAr ? "في تغييرات غير محفوظة" : "Unsaved changes")
                : (isAr ? "كل التغييرات محفوظة" : "All changes saved")}
              <span className={`ms-2 inline-block h-2 w-2 rounded-full ${dirty ? "bg-amber-500" : "bg-emerald-500"}`} />
            </p>
            <Btn onClick={save} disabled={saving || !dirty} className="px-8 py-3 text-[15px]">
              {saving ? (isAr ? "جاري الحفظ…" : "Saving…") : t("save")}
            </Btn>
          </div>
        </div>
      )}
    </div>
  );
}
