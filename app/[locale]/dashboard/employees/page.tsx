"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";

interface Employee {
  id: string;
  cardNumber: string;
  fullNameAr: string;
  fullNameEn: string;
  nationalId: string;
  mobile: string | null;
  status: string;
  hiringDate: string;
  salary: number | null;
  site: { id: string; name: string } | null;
  position: { id: string; titleAr: string; titleEn: string } | null;
}

interface SiteOpt {
  id: string;
  name: string;
}
interface PositionOpt {
  id: string;
  titleAr: string;
  titleEn: string;
}

interface Envelope {
  success: boolean;
  data?: unknown;
  error?: { message?: string };
  meta?: { page: number; totalPages: number; total: number };
}

const inputCls =
  "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none";
const labelCls = "block text-sm font-medium text-slate-700";

const emptyForm = {
  fullNameAr: "",
  fullNameEn: "",
  nationalId: "",
  mobile: "",
  siteId: "",
  positionId: "",
  hiringDate: new Date().toISOString().slice(0, 10),
  salary: "",
};

/** Personnel list + add/edit. */
export default function EmployeesPage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  const t = useTranslations("employees");
  const [rows, setRows] = useState<Employee[]>([]);
  const [sites, setSites] = useState<SiteOpt[]>([]);
  const [positions, setPositions] = useState<PositionOpt[]>([]);
  const [search, setSearch] = useState("");
  const [siteId, setSiteId] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<null | { editing: Employee | null }>(null);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const isAr = locale === "ar";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ page: String(page), pageSize: "20" });
      if (search.trim()) qs.set("search", search.trim());
      if (siteId) qs.set("siteId", siteId);
      if (status) qs.set("status", status);
      const res = await fetch(`/api/v1/employees?${qs}`);
      const body = (await res.json()) as Envelope;
      if (body.success) {
        setRows((body.data as Employee[]) ?? []);
        setTotalPages(body.meta?.totalPages ?? 1);
      }
    } catch {
      /* keep old rows */
    } finally {
      setLoading(false);
    }
  }, [page, search, siteId, status]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    fetch("/api/v1/sites?pageSize=100")
      .then((r) => r.json())
      .then((j: unknown) => {
        const body = j as Envelope;
        if (body.success) setSites((body.data as SiteOpt[]) ?? []);
      })
      .catch(() => {});
    fetch("/api/v1/positions")
      .then((r) => r.json())
      .then((j: unknown) => {
        const body = j as Envelope;
        if (body.success) setPositions((body.data as PositionOpt[]) ?? []);
      })
      .catch(() => {});
  }, []);

  function openAdd() {
    setForm(emptyForm);
    setFormError(null);
    setModal({ editing: null });
  }

  function openEdit(e: Employee) {
    setForm({
      fullNameAr: e.fullNameAr,
      fullNameEn: e.fullNameEn,
      nationalId: e.nationalId,
      mobile: e.mobile ?? "",
      siteId: e.site?.id ?? "",
      positionId: e.position?.id ?? "",
      hiringDate: e.hiringDate,
      salary: e.salary === null ? "" : String(e.salary),
    });
    setFormError(null);
    setModal({ editing: e });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setBusy(true);
    try {
      const payload: Record<string, unknown> = {
        fullNameAr: form.fullNameAr.trim(),
        fullNameEn: form.fullNameEn.trim(),
        nationalId: form.nationalId.trim(),
        hiringDate: form.hiringDate,
        siteId: form.siteId,
      };
      if (form.mobile.trim()) payload.mobile = form.mobile.trim();
      if (form.positionId) payload.positionId = form.positionId;
      if (form.salary.trim()) payload.salary = Number(form.salary);
      const editing = modal?.editing;
      const res = await fetch(
        editing ? `/api/v1/employees/${editing.id}` : "/api/v1/employees",
        {
          method: editing ? "PATCH" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const body = (await res.json()) as Envelope;
      if (!body.success) {
        setFormError(body.error?.message ?? t("saveError"));
        return;
      }
      setModal(null);
      load();
    } catch {
      setFormError(t("saveError"));
    } finally {
      setBusy(false);
    }
  }

  async function remove(e: Employee) {
    if (!window.confirm(t("deleteConfirm"))) return;
    try {
      const res = await fetch(`/api/v1/employees/${e.id}`, {
        method: "DELETE",
      });
      const body = (await res.json()) as Envelope;
      if (body.success) load();
    } catch {
      /* noop */
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">{t("title")}</h1>
        <button
          onClick={openAdd}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          {t("add")}
        </button>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <input
          value={search}
          onChange={(e) => {
            setSearch(e.currentTarget.value);
            setPage(1);
          }}
          placeholder={t("searchPh")}
          className="min-w-52 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
        />
        <select
          value={siteId}
          onChange={(e) => {
            setSiteId(e.currentTarget.value);
            setPage(1);
          }}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">{t("allSites")}</option>
          {sites.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.currentTarget.value);
            setPage(1);
          }}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">{t("allStatuses")}</option>
          {["ACTIVE", "ON_LEAVE", "SUSPENDED", "TERMINATED"].map((s) => (
            <option key={s} value={s}>
              {t(`status_${s}`)}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500">
              <th className="px-4 py-3 text-start font-medium">
                {t("cardNumber")}
              </th>
              <th className="px-4 py-3 text-start font-medium">{t("name")}</th>
              <th className="px-4 py-3 text-start font-medium">{t("site")}</th>
              <th className="px-4 py-3 text-start font-medium">
                {t("position")}
              </th>
              <th className="px-4 py-3 text-start font-medium">{t("mobile")}</th>
              <th className="px-4 py-3 text-start font-medium">{t("status")}</th>
              <th className="px-4 py-3 text-start font-medium">{t("actions")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => (
              <tr key={e.id} className="border-b border-slate-100">
                <td className="px-4 py-3 font-mono text-xs text-slate-600">
                  {e.cardNumber}
                </td>
                <td className="px-4 py-3 font-medium text-slate-900">
                  {isAr ? e.fullNameAr : e.fullNameEn}
                  <span className="block text-xs font-normal text-slate-500">
                    {e.nationalId}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {e.site?.name ?? "—"}
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {e.position
                    ? isAr
                      ? e.position.titleAr
                      : e.position.titleEn
                    : "—"}
                </td>
                <td className="px-4 py-3 text-slate-600" dir="ltr">
                  {e.mobile ?? "—"}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      e.status === "ACTIVE"
                        ? "bg-green-100 text-green-700"
                        : "bg-slate-200 text-slate-600"
                    }`}
                  >
                    {t(`status_${e.status}`)}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <button
                      onClick={() => openEdit(e)}
                      className="text-sm font-medium text-slate-700 hover:text-slate-900"
                    >
                      {t("edit")}
                    </button>
                    <button
                      onClick={() => remove(e)}
                      className="text-sm font-medium text-red-600 hover:text-red-800"
                    >
                      {t("delete")}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && rows.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-slate-500">
            {t("noResults")}
          </p>
        )}
      </div>

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-2">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-40"
          >
            ‹
          </button>
          <span className="text-sm text-slate-600">
            {page} / {totalPages}
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-40"
          >
            ›
          </button>
        </div>
      )}

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form
            onSubmit={submit}
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
          >
            <h2 className="text-lg font-bold text-slate-900">
              {modal.editing ? t("edit") : t("add")}
            </h2>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className={labelCls}>
                {t("fullNameAr")} *
                <input
                  required
                  value={form.fullNameAr}
                  onChange={(e) =>
                    setForm({ ...form, fullNameAr: e.currentTarget.value })
                  }
                  className={inputCls}
                />
              </label>
              <label className={labelCls}>
                {t("fullNameEn")} *
                <input
                  required
                  value={form.fullNameEn}
                  onChange={(e) =>
                    setForm({ ...form, fullNameEn: e.currentTarget.value })
                  }
                  className={inputCls}
                />
              </label>
              <label className={labelCls}>
                {t("nationalId")} *
                <input
                  required
                  inputMode="numeric"
                  pattern="\d{14}"
                  maxLength={14}
                  value={form.nationalId}
                  onChange={(e) =>
                    setForm({ ...form, nationalId: e.currentTarget.value })
                  }
                  className={inputCls}
                  dir="ltr"
                />
              </label>
              <label className={labelCls}>
                {t("mobile")}
                <input
                  inputMode="tel"
                  value={form.mobile}
                  onChange={(e) =>
                    setForm({ ...form, mobile: e.currentTarget.value })
                  }
                  className={inputCls}
                  dir="ltr"
                />
              </label>
              <label className={labelCls}>
                {t("site")} *
                <select
                  required
                  value={form.siteId}
                  onChange={(e) =>
                    setForm({ ...form, siteId: e.currentTarget.value })
                  }
                  className={inputCls}
                >
                  <option value="">{t("allSites")}</option>
                  {sites.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className={labelCls}>
                {t("position")}
                <select
                  value={form.positionId}
                  onChange={(e) =>
                    setForm({ ...form, positionId: e.currentTarget.value })
                  }
                  className={inputCls}
                >
                  <option value="">—</option>
                  {positions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {isAr ? p.titleAr : p.titleEn}
                    </option>
                  ))}
                </select>
              </label>
              <label className={labelCls}>
                {t("hiringDate")} *
                <input
                  type="date"
                  required
                  value={form.hiringDate}
                  onChange={(e) =>
                    setForm({ ...form, hiringDate: e.currentTarget.value })
                  }
                  className={inputCls}
                />
              </label>
              <label className={labelCls}>
                {t("salary")}
                <input
                  type="number"
                  min={0}
                  value={form.salary}
                  onChange={(e) =>
                    setForm({ ...form, salary: e.currentTarget.value })
                  }
                  className={inputCls}
                  dir="ltr"
                />
              </label>
            </div>

            {formError && (
              <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                {formError}
              </p>
            )}

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setModal(null)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium"
              >
                {t("cancel")}
              </button>
              <button
                type="submit"
                disabled={busy}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {t("save")}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
