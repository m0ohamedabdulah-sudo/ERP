"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";

interface Shift { id: string; name: string; type: string; startTime: string; endTime: string; requiredStaff: number }
interface Emp { id: string; fullNameAr: string; cardNumber: string }
interface Assignment { employeeId: string; shiftId: string; date: string }
interface Roster {
  id: string; name: string; status: string;
  startDate: string; endDate: string;
  assignments: Assignment[];
}
interface SiteOpt { id: string; name: string }
interface Envelope { success: boolean; data?: unknown; error?: { message?: string } }

const inputCls =
  "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none";

const SHIFT_TYPES = ["MORNING", "EVENING", "NIGHT", "DOUBLE", "CUSTOM"];

function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return toISO(d);
}
function weekStart(iso: string): string {
  // Monday as week start.
  const d = new Date(iso + "T00:00:00Z");
  const dow = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dow);
  return toISO(d);
}

/** Weekly roster board per site: assign shifts to employees per day. */
export default function RosterPage() {
  const t = useTranslations("roster");
  const [sites, setSites] = useState<SiteOpt[]>([]);
  const [siteId, setSiteId] = useState("");
  const [week, setWeek] = useState(() => weekStart(toISO(new Date())));
  const [roster, setRoster] = useState<Roster | null>(null);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [employees, setEmployees] = useState<Emp[]>([]);
  const [grid, setGrid] = useState<Record<string, string>>({}); // `${empId}|${date}` -> shiftId
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [showShifts, setShowShifts] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [shiftForm, setShiftForm] = useState({ name: "", type: "MORNING", startTime: "08:00", endTime: "20:00", requiredStaff: "0" });

  const days = Array.from({ length: 7 }, (_, i) => addDays(week, i));
  const weekEnd = addDays(week, 6);

  const loadLookups = useCallback(async () => {
    if (!siteId) return;
    try {
      const [sh, em] = await Promise.all([
        fetch(`/api/v1/sites/${siteId}/shifts`).then((r) => r.json()),
        fetch(`/api/v1/employees?siteId=${siteId}&pageSize=100`).then((r) => r.json()),
      ]);
      const shb = sh as Envelope; const emb = em as Envelope;
      if (shb.success) setShifts((shb.data as Shift[]) ?? []);
      if (emb.success) setEmployees((emb.data as Emp[]) ?? []);
    } catch { /* noop */ }
  }, [siteId]);

  const loadRoster = useCallback(async () => {
    if (!siteId) { setRoster(null); return; }
    try {
      const res = await fetch(`/api/v1/rosters?siteId=${siteId}&from=${week}&to=${weekEnd}&pageSize=5`);
      const body = (await res.json()) as Envelope;
      if (body.success) {
        const list = (body.data as Roster[]) ?? [];
        const found = list.find((r) => r.startDate.slice(0, 10) <= week && r.endDate.slice(0, 10) >= weekEnd)
          ?? list[0] ?? null;
        setRoster(found);
        const g: Record<string, string> = {};
        for (const a of found?.assignments ?? []) {
          g[`${a.employeeId}|${a.date.slice(0, 10)}`] = a.shiftId;
        }
        setGrid(g);
      }
    } catch { /* noop */ }
  }, [siteId, week, weekEnd]);

  useEffect(() => {
    fetch("/api/v1/sites?pageSize=100").then((r) => r.json()).then((j: unknown) => {
      const b = j as Envelope;
      if (b.success) setSites((b.data as SiteOpt[]) ?? []);
    }).catch(() => {});
  }, []);
  useEffect(() => { loadLookups(); }, [loadLookups]);
  useEffect(() => { loadRoster(); }, [loadRoster]);

  async function createRoster(e: React.FormEvent) {
    e.preventDefault();
    if (!siteId) return;
    setBusy(true); setMsg(null);
    try {
      const res = await fetch("/api/v1/rosters", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          siteId,
          name: newName.trim() || `${week}`,
          startDate: week,
          endDate: weekEnd,
        }),
      });
      const body = (await res.json()) as Envelope;
      if (body.success) {
        setShowNew(false); setNewName("");
        loadRoster();
      } else setMsg({ ok: false, text: body.error?.message ?? t("saveError") });
    } catch { setMsg({ ok: false, text: t("saveError") }); }
    finally { setBusy(false); }
  }

  async function save() {
    if (!roster) return;
    setBusy(true); setMsg(null);
    try {
      const assignments = Object.entries(grid)
        .filter(([, shiftId]) => shiftId)
        .map(([key, shiftId]) => {
          const [employeeId, date] = key.split("|");
          return { employeeId, shiftId, date };
        });
      const res = await fetch(`/api/v1/rosters/${roster.id}/assignments`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ assignments }),
      });
      const body = (await res.json()) as Envelope;
      setMsg({ ok: !!body.success, text: body.success ? t("saved") : (body.error?.message ?? t("saveError")) });
    } catch { setMsg({ ok: false, text: t("saveError") }); }
    finally { setBusy(false); }
  }

  async function publish() {
    if (!roster || !window.confirm(t("publishConfirm"))) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/rosters/${roster.id}/publish`, { method: "POST" });
      const body = (await res.json()) as Envelope;
      if (body.success) loadRoster();
    } catch { /* noop */ } finally { setBusy(false); }
  }

  async function remove() {
    if (!roster || !window.confirm(t("deleteConfirm"))) return;
    try {
      const res = await fetch(`/api/v1/rosters/${roster.id}`, { method: "DELETE" });
      const body = (await res.json()) as Envelope;
      if (body.success) { setRoster(null); setGrid({}); }
    } catch { /* noop */ }
  }

  async function addShift(e: React.FormEvent) {
    e.preventDefault();
    if (!siteId) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/sites/${siteId}/shifts`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: shiftForm.name.trim(),
          type: shiftForm.type,
          startTime: shiftForm.startTime,
          endTime: shiftForm.endTime,
          requiredStaff: Number(shiftForm.requiredStaff) || 0,
        }),
      });
      const body = (await res.json()) as Envelope;
      if (body.success) {
        setShiftForm({ name: "", type: "MORNING", startTime: "08:00", endTime: "20:00", requiredStaff: "0" });
        loadLookups();
      }
    } catch { /* noop */ } finally { setBusy(false); }
  }

  async function deleteShift(id: string) {
    try {
      const res = await fetch(`/api/v1/shifts/${id}`, { method: "DELETE" });
      const body = (await res.json()) as Envelope;
      if (body.success) loadLookups();
    } catch { /* noop */ }
  }

  const isDraft = roster?.status === "DRAFT";
  const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold text-slate-900">{t("title")}</h1>
        <div className="flex gap-2">
          <button onClick={() => setShowShifts((v) => !v)}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50">
            {t("manageShifts")}
          </button>
          {siteId && !roster && (
            <button onClick={() => setShowNew(true)}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white">
              {t("newRoster")}
            </button>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-2">
        <label className="block text-sm font-medium text-slate-700">
          {t("site")}
          <select value={siteId} onChange={(e) => { setSiteId(e.currentTarget.value); setRoster(null); }}
            className="mt-1 block min-w-48 rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <option value="">{t("selectSite")}</option>
            {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <label className="block text-sm font-medium text-slate-700">
          {t("week")}
          <input type="date" value={week} onChange={(e) => e.currentTarget.value && setWeek(weekStart(e.currentTarget.value))}
            className="mt-1 block rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </label>
        {roster && (
          <span className={`rounded-full px-3 py-1 text-xs font-medium ${isDraft ? "bg-slate-200 text-slate-600" : "bg-green-100 text-green-700"}`}>
            {isDraft ? t("draft") : t("published")} · {roster.name}
          </span>
        )}
      </div>

      {showShifts && siteId && (
        <div className="mt-4 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <h3 className="font-semibold text-slate-900">{t("shifts")}</h3>
          <ul className="mt-2 space-y-1.5">
            {shifts.map((s) => (
              <li key={s.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
                <span>
                  <strong>{s.name}</strong>
                  <span className="ms-2 text-slate-500" dir="ltr">{s.startTime}–{s.endTime}</span>
                  <span className="ms-2 text-xs text-slate-400">{t(`type_${s.type}`)} · {s.requiredStaff}</span>
                </span>
                <button onClick={() => deleteShift(s.id)} className="text-xs font-medium text-red-600">{t("delete")}</button>
              </li>
            ))}
            {shifts.length === 0 && <li className="text-sm text-slate-500">—</li>}
          </ul>
          <form onSubmit={addShift} className="mt-3 grid gap-2 sm:grid-cols-6">
            <input required placeholder={t("shiftName")} value={shiftForm.name}
              onChange={(e) => setShiftForm({ ...shiftForm, name: e.currentTarget.value })}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm sm:col-span-2" />
            <select value={shiftForm.type} onChange={(e) => setShiftForm({ ...shiftForm, type: e.currentTarget.value })}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
              {SHIFT_TYPES.map((st) => <option key={st} value={st}>{t(`type_${st}`)}</option>)}
            </select>
            <input type="time" value={shiftForm.startTime} dir="ltr"
              onChange={(e) => setShiftForm({ ...shiftForm, startTime: e.currentTarget.value })}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <input type="time" value={shiftForm.endTime} dir="ltr"
              onChange={(e) => setShiftForm({ ...shiftForm, endTime: e.currentTarget.value })}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <button type="submit" disabled={busy}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
              {t("addShift")}
            </button>
          </form>
        </div>
      )}

      {msg && (
        <p className={`mt-4 rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
          {msg.text}
        </p>
      )}

      {siteId && !roster && !showNew && (
        <p className="mt-8 text-center text-sm text-slate-500">{t("noRoster")}</p>
      )}

      {showNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form onSubmit={createRoster} className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-bold text-slate-900">{t("newRoster")}</h2>
            <p className="mt-1 text-sm text-slate-500" dir="ltr">{week} → {weekEnd}</p>
            <label className="mt-4 block text-sm font-medium text-slate-700">
              {t("rosterName")}
              <input value={newName} onChange={(e) => setNewName(e.currentTarget.value)}
                placeholder={week} className={inputCls} />
            </label>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => setShowNew(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium">{t("cancel")}</button>
              <button type="submit" disabled={busy}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{t("create")}</button>
            </div>
          </form>
        </div>
      )}

      {roster && (
        <>
          <div className="mt-4 overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="sticky start-0 bg-white px-4 py-3 text-start font-medium">—</th>
                  {days.map((d, i) => (
                    <th key={d} className="px-2 py-3 text-center font-medium">
                      <span className="block text-xs">{dayNames[i]}</span>
                      <span className="block text-xs font-normal" dir="ltr">{d.slice(5)}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {employees.map((e) => (
                  <tr key={e.id} className="border-b border-slate-100">
                    <td className="sticky start-0 bg-white px-4 py-2 font-medium text-slate-900">
                      {e.fullNameAr}
                      <span className="block font-mono text-xs font-normal text-slate-500">{e.cardNumber}</span>
                    </td>
                    {days.map((d) => {
                      const key = `${e.id}|${d}`;
                      return (
                        <td key={d} className="px-1 py-1.5 text-center">
                          <select
                            value={grid[key] ?? ""}
                            disabled={!isDraft}
                            onChange={(ev) => setGrid({ ...grid, [key]: ev.currentTarget.value })}
                            className="w-full min-w-24 rounded-lg border border-slate-200 px-1 py-1.5 text-xs disabled:bg-slate-50"
                          >
                            <option value="">—</option>
                            {shifts.map((s) => (
                              <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                          </select>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            {employees.length === 0 && (
              <p className="px-4 py-8 text-center text-sm text-slate-500">{t("noEmployees")}</p>
            )}
          </div>
          {shifts.length === 0 && employees.length > 0 && (
            <p className="mt-2 text-sm text-amber-700">{t("noShifts")}</p>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            {isDraft && (
              <>
                <button onClick={save} disabled={busy}
                  className="rounded-lg bg-slate-900 px-6 py-2.5 text-sm font-medium text-white disabled:opacity-50">
                  {t("save")}
                </button>
                <button onClick={publish} disabled={busy}
                  className="rounded-lg border border-green-600 px-6 py-2.5 text-sm font-medium text-green-700 disabled:opacity-50">
                  {t("publish")}
                </button>
                <button onClick={remove}
                  className="rounded-lg border border-red-300 px-4 py-2.5 text-sm font-medium text-red-600">
                  {t("delete")}
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
