"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Icon,
  PageHeader,
  Card,
  Btn,
  Badge,
  Field,
  fieldInput,
  EmptyState,
  Spinner,
} from "../_ui";

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
    <div className="space-y-5">
      <PageHeader
        title={t("title")}
        actions={
          <>
            <Btn variant="outline" onClick={() => setShowShifts((v) => !v)}>
              <Icon name="clock" className="h-4 w-4" />
              {t("manageShifts")}
            </Btn>
            {siteId && !roster && (
              <Btn onClick={() => setShowNew(true)}>
                <Icon name="plus" className="h-4 w-4" />
                {t("newRoster")}
              </Btn>
            )}
          </>
        }
      />

      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <Field label={t("site")} className="min-w-48">
            <select
              value={siteId}
              onChange={(e) => { setSiteId(e.currentTarget.value); setRoster(null); }}
              className={fieldInput}
            >
              <option value="">{t("selectSite")}</option>
              {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <Field label={t("week")}>
            <input
              type="date"
              value={week}
              onChange={(e) => e.currentTarget.value && setWeek(weekStart(e.currentTarget.value))}
              className={fieldInput}
            />
          </Field>
          {roster && (
            <div className="flex items-center gap-2 pb-1">
              <Badge tone={isDraft ? "amber" : "green"}>
                {isDraft ? t("draft") : t("published")}
              </Badge>
              <span className="text-sm font-semibold text-slate-700">{roster.name}</span>
            </div>
          )}
        </div>
      </Card>

      {showShifts && siteId && (
        <Card>
          <h3 className="text-[15px] font-bold text-slate-900">{t("shifts")}</h3>
          {shifts.length === 0 ? (
            <EmptyState icon="clock" title={t("noShifts")} />
          ) : (
            <ul className="mt-3 space-y-2">
              {shifts.map((s) => (
                <li
                  key={s.id}
                  className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 px-3.5 py-2.5 text-sm"
                >
                  <span className="min-w-0">
                    <strong className="font-semibold text-slate-900">{s.name}</strong>
                    <span className="ms-2 tabular-nums text-slate-500" dir="ltr">
                      {s.startTime}–{s.endTime}
                    </span>
                    <Badge tone="slate" className="ms-2">
                      {t(`type_${s.type}`)} · {s.requiredStaff}
                    </Badge>
                  </span>
                  <Btn
                    variant="ghost"
                    onClick={() => deleteShift(s.id)}
                    className="shrink-0 px-2.5 py-1.5 text-[13px] text-rose-600 hover:bg-rose-50"
                  >
                    {t("delete")}
                  </Btn>
                </li>
              ))}
            </ul>
          )}
          <form onSubmit={addShift} className="mt-4 grid gap-2.5 sm:grid-cols-6">
            <input
              required
              placeholder={t("shiftName")}
              value={shiftForm.name}
              onChange={(e) => setShiftForm({ ...shiftForm, name: e.currentTarget.value })}
              className={fieldInput + " mt-0 sm:col-span-2"}
            />
            <select
              value={shiftForm.type}
              onChange={(e) => setShiftForm({ ...shiftForm, type: e.currentTarget.value })}
              className={fieldInput + " mt-0"}
            >
              {SHIFT_TYPES.map((st) => <option key={st} value={st}>{t(`type_${st}`)}</option>)}
            </select>
            <input
              type="time"
              value={shiftForm.startTime}
              dir="ltr"
              onChange={(e) => setShiftForm({ ...shiftForm, startTime: e.currentTarget.value })}
              className={fieldInput + " mt-0"}
            />
            <input
              type="time"
              value={shiftForm.endTime}
              dir="ltr"
              onChange={(e) => setShiftForm({ ...shiftForm, endTime: e.currentTarget.value })}
              className={fieldInput + " mt-0"}
            />
            <Btn type="submit" disabled={busy}>
              {busy && <Spinner className="h-4 w-4" />}
              {t("addShift")}
            </Btn>
          </form>
        </Card>
      )}

      {msg && (
        <p className={`rounded-xl px-3.5 py-2.5 text-sm font-medium ${
          msg.ok ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
        }`}>
          {msg.text}
        </p>
      )}

      {siteId && !roster && !showNew && (
        <Card>
          <EmptyState icon="roster" title={t("noRoster")} />
        </Card>
      )}

      {showNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-[2px]">
          <form
            onSubmit={createRoster}
            className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-lg font-extrabold tracking-tight text-slate-900">
                {t("newRoster")}
              </h2>
              <button
                type="button"
                onClick={() => setShowNew(false)}
                className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                aria-label="close"
              >
                <Icon name="x" className="h-5 w-5" />
              </button>
            </div>
            <p className="mt-1 text-sm text-slate-500" dir="ltr">{week} → {weekEnd}</p>
            <Field label={t("rosterName")} className="mt-4">
              <input
                value={newName}
                onChange={(e) => setNewName(e.currentTarget.value)}
                placeholder={week}
                className={fieldInput}
              />
            </Field>
            <div className="mt-6 flex justify-end gap-2">
              <Btn variant="ghost" type="button" onClick={() => setShowNew(false)}>
                {t("cancel")}
              </Btn>
              <Btn type="submit" disabled={busy}>
                {busy && <Spinner className="h-4 w-4" />}
                {t("create")}
              </Btn>
            </div>
          </form>
        </div>
      )}

      {roster && (
        <>
          <Card className="overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50/80 text-[13px] font-semibold text-slate-500">
                    <th className="sticky start-0 bg-slate-50 px-4 py-3 text-start">
                      —
                    </th>
                    {days.map((d, i) => (
                      <th key={d} className="px-2 py-3 text-center">
                        <span className="block text-[13px] font-semibold">{dayNames[i]}</span>
                        <span className="block text-xs font-normal text-slate-400" dir="ltr">
                          {d.slice(5)}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {employees.map((e) => (
                    <tr key={e.id} className="transition hover:bg-slate-50/70">
                      <td className="sticky start-0 bg-white px-4 py-2 font-semibold text-slate-900">
                        {e.fullNameAr}
                        <span className="block font-mono text-xs font-normal text-slate-400">
                          {e.cardNumber}
                        </span>
                      </td>
                      {days.map((d) => {
                        const key = `${e.id}|${d}`;
                        return (
                          <td key={d} className="px-1 py-1.5 text-center">
                            <select
                              value={grid[key] ?? ""}
                              disabled={!isDraft}
                              onChange={(ev) => setGrid({ ...grid, [key]: ev.currentTarget.value })}
                              className="w-full min-w-24 rounded-xl border border-slate-200 bg-white px-1.5 py-1.5 text-xs text-slate-700 disabled:bg-slate-50 focus:border-blue-600 focus:outline-none"
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
            </div>
            {employees.length === 0 && (
              <EmptyState icon="users" title={t("noEmployees")} />
            )}
          </Card>

          {shifts.length === 0 && employees.length > 0 && (
            <p className="rounded-xl bg-amber-50 px-3.5 py-2.5 text-sm font-medium text-amber-800">
              {t("noShifts")}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            {isDraft && (
              <>
                <Btn onClick={save} disabled={busy} className="px-6">
                  {busy && <Spinner className="h-4 w-4" />}
                  {t("save")}
                </Btn>
                <Btn variant="success" onClick={publish} disabled={busy} className="px-6">
                  {t("publish")}
                </Btn>
                <Btn variant="danger" onClick={remove} className="px-4">
                  {t("delete")}
                </Btn>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
