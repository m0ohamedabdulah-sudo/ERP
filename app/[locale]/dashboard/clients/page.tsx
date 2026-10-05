"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";

interface Contact {
  id?: string;
  name: string;
  role?: string | null;
  phone?: string | null;
  email?: string | null;
  isPrimary?: boolean;
}

interface Client {
  id: string;
  companyNameAr: string;
  companyNameEn: string;
  taxId: string | null;
  commercialReg: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  status: string;
  notes: string | null;
  contacts: Contact[];
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

const emptyContact = { name: "", role: "", phone: "", email: "", isPrimary: false };
const emptyForm = {
  companyNameAr: "",
  companyNameEn: "",
  taxId: "",
  commercialReg: "",
  address: "",
  phone: "",
  email: "",
  status: "ACTIVE",
  notes: "",
  contacts: [ { ...emptyContact } ],
};

/** Clients list + add/edit with inline contacts + detail view. */
export default function ClientsPage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  const t = useTranslations("clients");
  const [rows, setRows] = useState<Client[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<null | { editing: Client | null }>(null);
  const [detail, setDetail] = useState<Client | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const isAr = locale === "ar";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ page: String(page), pageSize: "20" });
      if (search.trim()) qs.set("search", search.trim());
      if (status) qs.set("status", status);
      const res = await fetch(`/api/v1/clients?${qs}`);
      const body = (await res.json()) as Envelope;
      if (body.success) {
        setRows((body.data as Client[]) ?? []);
        setTotalPages(body.meta?.totalPages ?? 1);
      }
    } catch {
      /* keep old rows */
    } finally {
      setLoading(false);
    }
  }, [page, search, status]);

  useEffect(() => {
    load();
  }, [load]);

  function openAdd() {
    setForm({ ...emptyForm, contacts: [{ ...emptyContact }] });
    setFormError(null);
    setModal({ editing: null });
  }

  function openEdit(c: Client) {
    setForm({
      companyNameAr: c.companyNameAr,
      companyNameEn: c.companyNameEn,
      taxId: c.taxId ?? "",
      commercialReg: c.commercialReg ?? "",
      address: c.address ?? "",
      phone: c.phone ?? "",
      email: c.email ?? "",
      status: c.status,
      notes: c.notes ?? "",
      contacts: c.contacts.map((x) => ({
        name: x.name,
        role: x.role ?? "",
        phone: x.phone ?? "",
        email: x.email ?? "",
        isPrimary: !!x.isPrimary,
      })),
    });
    setFormError(null);
    setModal({ editing: c });
  }

  function updateContact(i: number, patch: Partial<typeof emptyContact>) {
    const contacts = form.contacts.map((c, j) =>
      j === i ? { ...c, ...patch } : c,
    );
    setForm({ ...form, contacts });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setBusy(true);
    try {
      const editing = modal?.editing;
      const payload: Record<string, unknown> = {
        companyNameAr: form.companyNameAr.trim(),
        companyNameEn: form.companyNameEn.trim(),
        status: form.status,
      };
      for (const k of ["taxId", "commercialReg", "address", "phone", "email", "notes"] as const) {
        const v = form[k].trim();
        if (v) payload[k] = v;
      }
      if (!editing) {
        payload.contacts = form.contacts
          .filter((c) => c.name.trim())
          .map((c) => ({
            name: c.name.trim(),
            role: c.role.trim() || undefined,
            phone: c.phone.trim() || undefined,
            email: c.email.trim() || undefined,
            isPrimary: c.isPrimary,
          }));
      }
      const res = await fetch(
        editing ? `/api/v1/clients/${editing.id}` : "/api/v1/clients",
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

  async function remove(c: Client) {
    if (!window.confirm(t("deleteConfirm"))) return;
    try {
      const res = await fetch(`/api/v1/clients/${c.id}`, { method: "DELETE" });
      const body = (await res.json()) as Envelope;
      if (body.success) {
        setDetail(null);
        load();
      }
    } catch {
      /* noop */
    }
  }

  async function openDetail(id: string) {
    try {
      const res = await fetch(`/api/v1/clients/${id}`);
      const body = (await res.json()) as Envelope;
      if (body.success) setDetail(body.data as Client);
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
          value={status}
          onChange={(e) => {
            setStatus(e.currentTarget.value);
            setPage(1);
          }}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">{t("allStatuses")}</option>
          {["ACTIVE", "INACTIVE", "BLACKLISTED"].map((s) => (
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
                {t("companyNameAr")}
              </th>
              <th className="px-4 py-3 text-start font-medium">{t("phone")}</th>
              <th className="px-4 py-3 text-start font-medium">{t("status")}</th>
              <th className="px-4 py-3 text-start font-medium">{t("actions")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} className="border-b border-slate-100">
                <td className="px-4 py-3 font-medium text-slate-900">
                  {isAr ? c.companyNameAr : c.companyNameEn}
                  <span className="block text-xs font-normal text-slate-500">
                    {c.taxId ?? ""}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-600" dir="ltr">
                  {c.phone ?? "—"}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      c.status === "ACTIVE"
                        ? "bg-green-100 text-green-700"
                        : "bg-slate-200 text-slate-600"
                    }`}
                  >
                    {t(`status_${c.status}`)}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <button
                      onClick={() => openDetail(c.id)}
                      className="text-sm font-medium text-slate-700 hover:text-slate-900"
                    >
                      {t("details")}
                    </button>
                    <button
                      onClick={() => openEdit(c)}
                      className="text-sm font-medium text-slate-700 hover:text-slate-900"
                    >
                      {t("edit")}
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

      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-bold text-slate-900">
              {isAr ? detail.companyNameAr : detail.companyNameEn}
            </h2>
            <dl className="mt-4 space-y-2 text-sm">
              {detail.taxId && (
                <div className="flex justify-between">
                  <dt className="text-slate-500">{t("taxId")}</dt>
                  <dd className="font-medium">{detail.taxId}</dd>
                </div>
              )}
              {detail.phone && (
                <div className="flex justify-between">
                  <dt className="text-slate-500">{t("phone")}</dt>
                  <dd className="font-medium" dir="ltr">{detail.phone}</dd>
                </div>
              )}
              {detail.email && (
                <div className="flex justify-between">
                  <dt className="text-slate-500">{t("email")}</dt>
                  <dd className="font-medium" dir="ltr">{detail.email}</dd>
                </div>
              )}
              {detail.address && (
                <div className="flex justify-between">
                  <dt className="text-slate-500">{t("address")}</dt>
                  <dd className="font-medium text-end">{detail.address}</dd>
                </div>
              )}
            </dl>
            <h3 className="mt-5 font-semibold text-slate-900">{t("contacts")}</h3>
            {detail.contacts.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">—</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {detail.contacts.map((c, i) => (
                  <li
                    key={i}
                    className="rounded-lg bg-slate-50 px-3 py-2 text-sm"
                  >
                    <span className="font-medium">{c.name}</span>
                    {c.isPrimary && (
                      <span className="ms-2 rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700">
                        {t("isPrimary")}
                      </span>
                    )}
                    <span className="block text-slate-500">
                      {[c.role, c.phone].filter(Boolean).join(" · ")}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-6 flex justify-between">
              <button
                onClick={() => remove(detail)}
                className="text-sm font-medium text-red-600 hover:text-red-800"
              >
                {t("delete")}
              </button>
              <button
                onClick={() => setDetail(null)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium"
              >
                {t("cancel")}
              </button>
            </div>
          </div>
        </div>
      )}

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form
            onSubmit={submit}
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
          >
            <h2 className="text-lg font-bold text-slate-900">
              {modal.editing ? t("edit") : t("add")}
            </h2>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className={labelCls}>
                {t("companyNameAr")} *
                <input required value={form.companyNameAr}
                  onChange={(e) => setForm({ ...form, companyNameAr: e.currentTarget.value })}
                  className={inputCls} />
              </label>
              <label className={labelCls}>
                {t("companyNameEn")} *
                <input required value={form.companyNameEn}
                  onChange={(e) => setForm({ ...form, companyNameEn: e.currentTarget.value })}
                  className={inputCls} />
              </label>
              <label className={labelCls}>
                {t("taxId")}
                <input value={form.taxId}
                  onChange={(e) => setForm({ ...form, taxId: e.currentTarget.value })}
                  className={inputCls} dir="ltr" />
              </label>
              <label className={labelCls}>
                {t("commercialReg")}
                <input value={form.commercialReg}
                  onChange={(e) => setForm({ ...form, commercialReg: e.currentTarget.value })}
                  className={inputCls} dir="ltr" />
              </label>
              <label className={labelCls}>
                {t("phone")}
                <input inputMode="tel" value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.currentTarget.value })}
                  className={inputCls} dir="ltr" />
              </label>
              <label className={labelCls}>
                {t("email")}
                <input type="email" value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.currentTarget.value })}
                  className={inputCls} dir="ltr" />
              </label>
              <label className={labelCls}>
                {t("address")}
                <input value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.currentTarget.value })}
                  className={inputCls} />
              </label>
              <label className={labelCls}>
                {t("status")}
                <select value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.currentTarget.value })}
                  className={inputCls}>
                  {["ACTIVE", "INACTIVE", "BLACKLISTED"].map((s) => (
                    <option key={s} value={s}>{t(`status_${s}`)}</option>
                  ))}
                </select>
              </label>
              <label className={`${labelCls} sm:col-span-2`}>
                {t("notes")}
                <textarea value={form.notes} rows={2}
                  onChange={(e) => setForm({ ...form, notes: e.currentTarget.value })}
                  className={inputCls} />
              </label>
            </div>

            {!modal.editing && (
              <div className="mt-5">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-slate-900">{t("contacts")}</h3>
                  <button type="button"
                    onClick={() => setForm({ ...form, contacts: [...form.contacts, { ...emptyContact }] })}
                    className="text-sm font-medium text-slate-700 hover:text-slate-900">
                    + {t("addContact")}
                  </button>
                </div>
                {form.contacts.map((c, i) => (
                  <div key={i} className="mt-2 grid gap-2 rounded-lg bg-slate-50 p-3 sm:grid-cols-2">
                    <input placeholder={t("contactName")} value={c.name}
                      onChange={(e) => updateContact(i, { name: e.currentTarget.value })}
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                    <input placeholder={t("role")} value={c.role}
                      onChange={(e) => updateContact(i, { role: e.currentTarget.value })}
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                    <input placeholder={t("contactPhone")} value={c.phone} dir="ltr"
                      onChange={(e) => updateContact(i, { phone: e.currentTarget.value })}
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                    <div className="flex items-center justify-between gap-2">
                      <label className="flex items-center gap-2 text-sm text-slate-600">
                        <input type="checkbox" checked={c.isPrimary}
                          onChange={(e) => updateContact(i, { isPrimary: e.currentTarget.checked })}
                          className="h-4 w-4" />
                        {t("isPrimary")}
                      </label>
                      {form.contacts.length > 1 && (
                        <button type="button"
                          onClick={() => setForm({ ...form, contacts: form.contacts.filter((_, j) => j !== i) })}
                          className="text-sm text-red-600">
                          {t("remove")}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {formError && (
              <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                {formError}
              </p>
            )}

            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => setModal(null)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium">
                {t("cancel")}
              </button>
              <button type="submit" disabled={busy}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
                {t("save")}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
