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

const STATUS_TONES: Record<string, "green" | "amber" | "red" | "slate"> = {
  ACTIVE: "green",
  ON_LEAVE: "amber",
  SUSPENDED: "red",
  TERMINATED: "slate",
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
            value={siteId}
            onChange={(e) => {
              setSiteId(e.currentTarget.value);
              setPage(1);
            }}
            className={fieldInput + " mt-0 w-auto"}
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
            className={fieldInput + " mt-0 w-auto"}
          >
            <option value="">{t("allStatuses")}</option>
            {["ACTIVE", "ON_LEAVE", "SUSPENDED", "TERMINATED"].map((s) => (
              <option key={s} value={s}>
                {t(`status_${s}`)}
              </option>
            ))}
          </select>
        </div>
      </Card>

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50/80 text-[13px] font-semibold text-slate-500">
                <th className="px-4 py-3 text-start">{t("cardNumber")}</th>
                <th className="px-4 py-3 text-start">{t("name")}</th>
                <th className="px-4 py-3 text-start">{t("site")}</th>
                <th className="px-4 py-3 text-start">{t("position")}</th>
                <th className="px-4 py-3 text-start">{t("mobile")}</th>
                <th className="px-4 py-3 text-start">{t("status")}</th>
                <th className="px-4 py-3 text-start">{t("actions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((e) => (
                <tr key={e.id} className="transition hover:bg-slate-50/70">
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">
                    {e.cardNumber}
                  </td>
                  <td className="px-4 py-3 font-semibold text-slate-900">
                    {isAr ? e.fullNameAr : e.fullNameEn}
                    <span
                      className="block text-xs font-normal text-slate-400"
                      dir="ltr"
                    >
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
                    <Badge tone={STATUS_TONES[e.status] ?? "slate"}>
                      {t(`status_${e.status}`)}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <Btn
                        variant="ghost"
                        onClick={() => openEdit(e)}
                        className="px-2.5 py-1.5 text-[13px]"
                      >
                        {t("edit")}
                      </Btn>
                      <Btn
                        variant="ghost"
                        onClick={() => remove(e)}
                        className="px-2.5 py-1.5 text-[13px] text-rose-600 hover:bg-rose-50"
                      >
                        {t("delete")}
                      </Btn>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {loading && (
          <div className="flex items-center justify-center py-12 text-slate-400">
            <Spinner className="h-6 w-6" />
          </div>
        )}
        {!loading && rows.length === 0 && (
          <EmptyState icon="users" title={t("noResults")} />
        )}
      </Card>

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
              <div>
                <h2 className="text-lg font-extrabold tracking-tight text-slate-900">
                  {modal.editing ? t("edit") : t("add")}
                </h2>
              </div>
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
              <Field label={`${t("fullNameAr")} *`}>
                <input
                  required
                  value={form.fullNameAr}
                  onChange={(e) =>
                    setForm({ ...form, fullNameAr: e.currentTarget.value })
                  }
                  className={fieldInput}
                />
              </Field>
              <Field label={`${t("fullNameEn")} *`}>
                <input
                  required
                  value={form.fullNameEn}
                  onChange={(e) =>
                    setForm({ ...form, fullNameEn: e.currentTarget.value })
                  }
                  className={fieldInput}
                />
              </Field>
              <Field label={`${t("nationalId")} *`}>
                <input
                  required
                  inputMode="numeric"
                  pattern="\d{14}"
                  maxLength={14}
                  value={form.nationalId}
                  onChange={(e) =>
                    setForm({ ...form, nationalId: e.currentTarget.value })
                  }
                  className={fieldInput}
                  dir="ltr"
                />
              </Field>
              <Field label={t("mobile")}>
                <input
                  inputMode="tel"
                  value={form.mobile}
                  onChange={(e) =>
                    setForm({ ...form, mobile: e.currentTarget.value })
                  }
                  className={fieldInput}
                  dir="ltr"
                />
              </Field>
              <Field label={`${t("site")} *`}>
                <select
                  required
                  value={form.siteId}
                  onChange={(e) =>
                    setForm({ ...form, siteId: e.currentTarget.value })
                  }
                  className={fieldInput}
                >
                  <option value="">{t("allSites")}</option>
                  {sites.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t("position")}>
                <select
                  value={form.positionId}
                  onChange={(e) =>
                    setForm({ ...form, positionId: e.currentTarget.value })
                  }
                  className={fieldInput}
                >
                  <option value="">—</option>
                  {positions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {isAr ? p.titleAr : p.titleEn}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={`${t("hiringDate")} *`}>
                <input
                  type="date"
                  required
                  value={form.hiringDate}
                  onChange={(e) =>
                    setForm({ ...form, hiringDate: e.currentTarget.value })
                  }
                  className={fieldInput}
                />
              </Field>
              <Field label={t("salary")}>
                <input
                  type="number"
                  min={0}
                  value={form.salary}
                  onChange={(e) =>
                    setForm({ ...form, salary: e.currentTarget.value })
                  }
                  className={fieldInput}
                  dir="ltr"
                />
              </Field>
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
