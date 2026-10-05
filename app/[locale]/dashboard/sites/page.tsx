"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";

interface Site {
  id: string;
  name: string;
  location: string | null;
  contactName: string | null;
  contactPhone: string | null;
  requiredManpower: number;
  isActive: boolean;
  sector: { id: string; name: string } | null;
  employeesCount: number;
}

interface SectorOpt {
  id: string;
  name: string;
}

interface Envelope {
  success: boolean;
  data?: unknown;
  error?: { code?: string; message?: string };
  meta?: { page: number; totalPages: number };
}

const inputCls =
  "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none";
const labelCls = "block text-sm font-medium text-slate-700";

const emptyForm = {
  name: "",
  sectorId: "",
  newSectorName: "",
  location: "",
  contactName: "",
  contactPhone: "",
  requiredManpower: "0",
  isActive: true,
};

/** Sites list + add/edit (with inline sector creation). */
export default function SitesPage() {
  const t = useTranslations("sites");
  const [rows, setRows] = useState<Site[]>([]);
  const [sectors, setSectors] = useState<SectorOpt[]>([]);
  const [search, setSearch] = useState("");
  const [sectorId, setSectorId] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<null | { editing: Site | null }>(null);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ page: String(page), pageSize: "20" });
      if (search.trim()) qs.set("search", search.trim());
      if (sectorId) qs.set("sectorId", sectorId);
      const res = await fetch(`/api/v1/sites?${qs}`);
      const body = (await res.json()) as Envelope;
      if (body.success) {
        setRows((body.data as Site[]) ?? []);
        setTotalPages(body.meta?.totalPages ?? 1);
      }
    } catch {
      /* keep old rows */
    } finally {
      setLoading(false);
    }
  }, [page, search, sectorId]);

  const loadSectors = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/sectors");
      const body = (await res.json()) as Envelope;
      if (body.success) setSectors((body.data as SectorOpt[]) ?? []);
    } catch {
      /* noop */
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    loadSectors();
  }, [loadSectors]);

  function openAdd() {
    setForm(emptyForm);
    setFormError(null);
    setModal({ editing: null });
  }

  function openEdit(s: Site) {
    setForm({
      name: s.name,
      sectorId: s.sector?.id ?? "",
      newSectorName: "",
      location: s.location ?? "",
      contactName: s.contactName ?? "",
      contactPhone: s.contactPhone ?? "",
      requiredManpower: String(s.requiredManpower),
      isActive: s.isActive,
    });
    setFormError(null);
    setModal({ editing: s });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setBusy(true);
    try {
      let finalSectorId = form.sectorId;
      // Inline sector creation when "new sector" is chosen.
      if (finalSectorId === "__new__") {
        const name = form.newSectorName.trim();
        if (!name) {
          setFormError(t("newSectorName"));
          setBusy(false);
          return;
        }
        const sr = await fetch("/api/v1/sectors", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name }),
        });
        const sj = (await sr.json()) as Envelope;
        if (!sj.success) {
          setFormError((sj.error?.message as string) ?? t("saveError"));
          setBusy(false);
          return;
        }
        finalSectorId = (sj.data as SectorOpt).id;
        await loadSectors();
      }

      const payload: Record<string, unknown> = {
        name: form.name.trim(),
        sectorId: finalSectorId,
        requiredManpower: Number(form.requiredManpower) || 0,
      };
      if (form.location.trim()) payload.location = form.location.trim();
      if (form.contactName.trim())
        payload.contactName = form.contactName.trim();
      if (form.contactPhone.trim())
        payload.contactPhone = form.contactPhone.trim();
      const editing = modal?.editing;
      if (editing) payload.isActive = form.isActive;

      const res = await fetch(
        editing ? `/api/v1/sites/${editing.id}` : "/api/v1/sites",
        {
          method: editing ? "PATCH" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const body = (await res.json()) as Envelope;
      if (!body.success) {
        setFormError(
          body.error?.code === "SITE_HAS_EMPLOYEES"
            ? t("deleteBlocked")
            : (body.error?.message ?? t("saveError")),
        );
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

  async function remove(s: Site) {
    if (!window.confirm(t("deleteConfirm"))) return;
    try {
      const res = await fetch(`/api/v1/sites/${s.id}`, { method: "DELETE" });
      const body = (await res.json()) as Envelope;
      if (body.success) {
        load();
      } else if (body.error?.code === "SITE_HAS_EMPLOYEES") {
        window.alert(t("deleteBlocked"));
      }
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
          value={sectorId}
          onChange={(e) => {
            setSectorId(e.currentTarget.value);
            setPage(1);
          }}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">{t("allSectors")}</option>
          {sectors.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((s) => (
          <div
            key={s.id}
            className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200"
          >
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-semibold text-slate-900">{s.name}</h3>
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  s.isActive
                    ? "bg-green-100 text-green-700"
                    : "bg-slate-200 text-slate-600"
                }`}
              >
                {s.sector?.name ?? ""}
              </span>
            </div>
            <dl className="mt-3 space-y-1 text-sm text-slate-600">
              <div className="flex justify-between">
                <dt>{t("requiredManpower")}</dt>
                <dd className="font-medium text-slate-900">
                  {s.requiredManpower}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt>{t("staff")}</dt>
                <dd className="font-medium text-slate-900">
                  {s.employeesCount}
                </dd>
              </div>
              {s.contactName && (
                <div className="flex justify-between">
                  <dt>{t("contactName")}</dt>
                  <dd>{s.contactName}</dd>
                </div>
              )}
              {s.location && (
                <div className="flex justify-between">
                  <dt>{t("location")}</dt>
                  <dd className="text-end">{s.location}</dd>
                </div>
              )}
            </dl>
            <div className="mt-4 flex gap-3 border-t border-slate-100 pt-3">
              <button
                onClick={() => openEdit(s)}
                className="text-sm font-medium text-slate-700 hover:text-slate-900"
              >
                {t("edit")}
              </button>
              <button
                onClick={() => remove(s)}
                className="text-sm font-medium text-red-600 hover:text-red-800"
              >
                {t("delete")}
              </button>
            </div>
          </div>
        ))}
      </div>
      {!loading && rows.length === 0 && (
        <p className="mt-8 text-center text-sm text-slate-500">{t("noResults")}</p>
      )}

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
                {t("name")} *
                <input
                  required
                  value={form.name}
                  onChange={(e) =>
                    setForm({ ...form, name: e.currentTarget.value })
                  }
                  className={inputCls}
                />
              </label>
              <label className={labelCls}>
                {t("sector")} *
                <select
                  required
                  value={form.sectorId}
                  onChange={(e) =>
                    setForm({ ...form, sectorId: e.currentTarget.value })
                  }
                  className={inputCls}
                >
                  <option value="">{t("allSectors")}</option>
                  {sectors.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                  <option value="__new__">{t("newSector")}</option>
                </select>
              </label>
              {form.sectorId === "__new__" && (
                <label className={labelCls}>
                  {t("newSectorName")} *
                  <input
                    value={form.newSectorName}
                    onChange={(e) =>
                      setForm({ ...form, newSectorName: e.currentTarget.value })
                    }
                    className={inputCls}
                  />
                </label>
              )}
              <label className={labelCls}>
                {t("requiredManpower")}
                <input
                  type="number"
                  min={0}
                  value={form.requiredManpower}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      requiredManpower: e.currentTarget.value,
                    })
                  }
                  className={inputCls}
                  dir="ltr"
                />
              </label>
              <label className={labelCls}>
                {t("location")}
                <input
                  value={form.location}
                  onChange={(e) =>
                    setForm({ ...form, location: e.currentTarget.value })
                  }
                  className={inputCls}
                />
              </label>
              <label className={labelCls}>
                {t("contactName")}
                <input
                  value={form.contactName}
                  onChange={(e) =>
                    setForm({ ...form, contactName: e.currentTarget.value })
                  }
                  className={inputCls}
                />
              </label>
              <label className={labelCls}>
                {t("contactPhone")}
                <input
                  inputMode="tel"
                  value={form.contactPhone}
                  onChange={(e) =>
                    setForm({ ...form, contactPhone: e.currentTarget.value })
                  }
                  className={inputCls}
                  dir="ltr"
                />
              </label>
              {modal.editing && (
                <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                  <input
                    type="checkbox"
                    checked={form.isActive}
                    onChange={(e) =>
                      setForm({ ...form, isActive: e.currentTarget.checked })
                    }
                    className="h-4 w-4"
                  />
                  {t("isActive")}
                </label>
              )}
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
