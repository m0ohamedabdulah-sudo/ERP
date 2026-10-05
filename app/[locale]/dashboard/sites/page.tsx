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
    <div className="space-y-5">
      <PageHeader
        title={t("title")}
        actions={
          <Btn onClick={openAdd}>
            <Icon name="plus" className="h-4 w-4" />
            {t("add")}
          </Btn>
        }
      />

      <Card className="p-4">
        <div className="flex flex-wrap gap-2.5">
          <div className="min-w-52 flex-1">
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.currentTarget.value);
                setPage(1);
              }}
              placeholder={t("searchPh")}
              className={fieldInput + " mt-0"}
            />
          </div>
          <select
            value={sectorId}
            onChange={(e) => {
              setSectorId(e.currentTarget.value);
              setPage(1);
            }}
            className={fieldInput + " mt-0 w-auto"}
          >
            <option value="">{t("allSectors")}</option>
            {sectors.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      </Card>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-slate-400">
          <Spinner className="h-7 w-7" />
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState icon="sites" title={t("noResults")} />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((s) => {
            const coverage =
              s.requiredManpower > 0
                ? Math.round((s.employeesCount / s.requiredManpower) * 100)
                : null;
            return (
              <Card key={s.id} className="flex flex-col">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-100 text-blue-700">
                      <Icon name="sites" className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="truncate font-bold text-slate-900">
                        {s.name}
                      </h3>
                      {s.sector?.name && (
                        <p className="truncate text-[13px] text-slate-500">
                          {s.sector.name}
                        </p>
                      )}
                    </div>
                  </div>
                  <Badge tone={s.isActive ? "green" : "slate"}>
                    {s.isActive ? t("active") : t("inactive")}
                  </Badge>
                </div>

                <dl className="mt-4 space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <dt className="text-slate-500">{t("staff")}</dt>
                    <dd className="font-bold tabular-nums text-slate-900">
                      {s.employeesCount}
                      <span className="font-medium text-slate-400">
                        {" "}
                        / {s.requiredManpower}
                      </span>
                    </dd>
                  </div>
                  {coverage !== null && (
                    <div>
                      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className={`h-full rounded-full transition-all ${
                            coverage >= 100
                              ? "bg-emerald-500"
                              : coverage >= 70
                                ? "bg-amber-500"
                                : "bg-rose-500"
                          }`}
                          style={{ width: `${Math.min(coverage, 100)}%` }}
                        />
                      </div>
                    </div>
                  )}
                  {s.contactName && (
                    <div className="flex items-center justify-between">
                      <dt className="text-slate-500">{t("contactName")}</dt>
                      <dd className="font-medium text-slate-700">
                        {s.contactName}
                      </dd>
                    </div>
                  )}
                  {s.location && (
                    <div className="flex items-center justify-between gap-2">
                      <dt className="shrink-0 text-slate-500">
                        {t("location")}
                      </dt>
                      <dd className="truncate text-end font-medium text-slate-700">
                        {s.location}
                      </dd>
                    </div>
                  )}
                </dl>

                <div className="mt-4 flex gap-1 border-t border-slate-100 pt-3">
                  <Btn
                    variant="ghost"
                    onClick={() => openEdit(s)}
                    className="px-3 py-1.5 text-[13px]"
                  >
                    {t("edit")}
                  </Btn>
                  <Btn
                    variant="ghost"
                    onClick={() => remove(s)}
                    className="px-3 py-1.5 text-[13px] text-rose-600 hover:bg-rose-50"
                  >
                    {t("delete")}
                  </Btn>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Btn
            variant="outline"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="px-3"
            aria-label="prev"
          >
            <Icon name="chevronLeft" className="h-4 w-4" />
          </Btn>
          <span className="text-sm font-medium tabular-nums text-slate-600">
            {page} / {totalPages}
          </span>
          <Btn
            variant="outline"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="px-3"
            aria-label="next"
          >
            <Icon name="chevronRight" className="h-4 w-4" />
          </Btn>
        </div>
      )}

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-[2px]">
          <form
            onSubmit={submit}
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-lg font-extrabold tracking-tight text-slate-900">
                {modal.editing ? t("edit") : t("add")}
              </h2>
              <button
                type="button"
                onClick={() => setModal(null)}
                className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                aria-label="close"
              >
                <Icon name="x" className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <Field label={`${t("name")} *`}>
                <input
                  required
                  value={form.name}
                  onChange={(e) =>
                    setForm({ ...form, name: e.currentTarget.value })
                  }
                  className={fieldInput}
                />
              </Field>
              <Field label={`${t("sector")} *`}>
                <select
                  required
                  value={form.sectorId}
                  onChange={(e) =>
                    setForm({ ...form, sectorId: e.currentTarget.value })
                  }
                  className={fieldInput}
                >
                  <option value="">{t("allSectors")}</option>
                  {sectors.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                  <option value="__new__">{t("newSector")}</option>
                </select>
              </Field>
              {form.sectorId === "__new__" && (
                <Field label={`${t("newSectorName")} *`}>
                  <input
                    value={form.newSectorName}
                    onChange={(e) =>
                      setForm({ ...form, newSectorName: e.currentTarget.value })
                    }
                    className={fieldInput}
                  />
                </Field>
              )}
              <Field label={t("requiredManpower")}>
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
                  className={fieldInput}
                  dir="ltr"
                />
              </Field>
              <Field label={t("location")}>
                <input
                  value={form.location}
                  onChange={(e) =>
                    setForm({ ...form, location: e.currentTarget.value })
                  }
                  className={fieldInput}
                />
              </Field>
              <Field label={t("contactName")}>
                <input
                  value={form.contactName}
                  onChange={(e) =>
                    setForm({ ...form, contactName: e.currentTarget.value })
                  }
                  className={fieldInput}
                />
              </Field>
              <Field label={t("contactPhone")}>
                <input
                  inputMode="tel"
                  value={form.contactPhone}
                  onChange={(e) =>
                    setForm({ ...form, contactPhone: e.currentTarget.value })
                  }
                  className={fieldInput}
                  dir="ltr"
                />
              </Field>
              {modal.editing && (
                <label className="flex items-center gap-2.5 self-center text-sm font-semibold text-slate-700">
                  <input
                    type="checkbox"
                    checked={form.isActive}
                    onChange={(e) =>
                      setForm({ ...form, isActive: e.currentTarget.checked })
                    }
                    className="h-4 w-4 rounded accent-blue-700"
                  />
                  {t("isActive")}
                </label>
              )}
            </div>

            {formError && (
              <p className="mt-4 rounded-xl bg-rose-50 px-3.5 py-2.5 text-sm font-medium text-rose-700">
                {formError}
              </p>
            )}

            <div className="mt-6 flex justify-end gap-2">
              <Btn variant="ghost" type="button" onClick={() => setModal(null)}>
                {t("cancel")}
              </Btn>
              <Btn type="submit" disabled={busy}>
                {busy && <Spinner className="h-4 w-4" />}
                {t("save")}
              </Btn>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
