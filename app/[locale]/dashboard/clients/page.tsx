"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  PageHeader,
  Card,
  Btn,
  Badge,
  Field,
  fieldInput,
  EmptyState,
  Spinner,
  Icon,
} from "../_ui";

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

function statusTone(s: string): "green" | "red" | "slate" {
  if (s === "ACTIVE") return "green";
  if (s === "BLACKLISTED") return "red";
  return "slate";
}

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
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.currentTarget.value);
              setPage(1);
            }}
            placeholder={t("searchPh")}
            className={`${fieldInput} !mt-0 min-w-52 flex-1`}
          />
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.currentTarget.value);
              setPage(1);
            }}
            className={`${fieldInput} !mt-0 w-auto`}
          >
            <option value="">{t("allStatuses")}</option>
            {["ACTIVE", "INACTIVE", "BLACKLISTED"].map((s) => (
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
              <tr className="bg-slate-50/70 text-xs uppercase tracking-wider text-slate-400">
                <th className="px-5 py-3.5 text-start font-semibold">
                  {t("companyNameAr")}
                </th>
                <th className="px-5 py-3.5 text-start font-semibold">{t("phone")}</th>
                <th className="px-5 py-3.5 text-start font-semibold">{t("status")}</th>
                <th className="px-5 py-3.5 text-end font-semibold">{t("actions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((c) => (
                <tr key={c.id} className="transition hover:bg-slate-50/70">
                  <td className="px-5 py-3.5 font-semibold text-slate-900">
                    {isAr ? c.companyNameAr : c.companyNameEn}
                    {c.taxId && (
                      <span className="block text-xs font-normal text-slate-400">
                        {c.taxId}
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-slate-600" dir="ltr">
                    {c.phone ?? "—"}
                  </td>
                  <td className="px-5 py-3.5">
                    <Badge tone={statusTone(c.status)}>{t(`status_${c.status}`)}</Badge>
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex justify-end gap-1">
                      <Btn variant="ghost" onClick={() => openDetail(c.id)} className="px-3 py-1.5">
                        {t("details")}
                      </Btn>
                      <Btn variant="ghost" onClick={() => openEdit(c)} className="px-3 py-1.5">
                        {t("edit")}
                      </Btn>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {loading ? (
          <div className="flex justify-center py-12 text-slate-400">
            <Spinner className="h-7 w-7" />
          </div>
        ) : (
          rows.length === 0 && (
            <EmptyState icon="clients" title={t("noResults")} />
          )
        )}
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Btn
            variant="outline"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="px-3 py-1.5"
          >
            <Icon name="chevronLeft" className="h-4 w-4" />
          </Btn>
          <span className="text-sm font-medium text-slate-600">
            {page} / {totalPages}
          </span>
          <Btn
            variant="outline"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="px-3 py-1.5"
          >
            <Icon name="chevronRight" className="h-4 w-4" />
          </Btn>
        </div>
      )}

      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-[2px]">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-lg font-extrabold tracking-tight text-slate-900">
                {isAr ? detail.companyNameAr : detail.companyNameEn}
              </h2>
              <Badge tone={statusTone(detail.status)}>
                {t(`status_${detail.status}`)}
              </Badge>
            </div>
            <dl className="mt-5 space-y-2.5 text-sm">
              {detail.taxId && (
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-400">{t("taxId")}</dt>
                  <dd className="font-semibold text-slate-900">{detail.taxId}</dd>
                </div>
              )}
              {detail.phone && (
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-400">{t("phone")}</dt>
                  <dd className="font-semibold text-slate-900" dir="ltr">{detail.phone}</dd>
                </div>
              )}
              {detail.email && (
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-400">{t("email")}</dt>
                  <dd className="font-semibold text-slate-900" dir="ltr">{detail.email}</dd>
                </div>
              )}
              {detail.address && (
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-400">{t("address")}</dt>
                  <dd className="max-w-[60%] text-end font-semibold text-slate-900">{detail.address}</dd>
                </div>
              )}
            </dl>
            <h3 className="mt-6 text-sm font-bold uppercase tracking-wider text-slate-400">
              {t("contacts")}
            </h3>
            {detail.contacts.length === 0 ? (
              <p className="mt-2 text-sm text-slate-400">—</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {detail.contacts.map((c, i) => (
                  <li
                    key={i}
                    className="rounded-xl bg-slate-50 px-3.5 py-2.5 text-sm ring-1 ring-slate-100"
                  >
                    <span className="font-semibold text-slate-900">{c.name}</span>
                    {c.isPrimary && (
                      <Badge tone="blue" className="ms-2">
                        {t("isPrimary")}
                      </Badge>
                    )}
                    <span className="block text-slate-500">
                      {[c.role, c.phone].filter(Boolean).join(" · ")}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-6 flex items-center justify-between">
              <Btn variant="danger" onClick={() => remove(detail)} className="px-3.5 py-2">
                <Icon name="x" className="h-4 w-4" />
                {t("delete")}
              </Btn>
              <Btn variant="ghost" onClick={() => setDetail(null)}>
                {t("cancel")}
              </Btn>
            </div>
          </div>
        </div>
      )}

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-[2px]">
          <form
            onSubmit={submit}
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"
          >
            <h2 className="text-lg font-extrabold tracking-tight text-slate-900">
              {modal.editing ? t("edit") : t("add")}
            </h2>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <Field label={`${t("companyNameAr")} *`}>
                <input required value={form.companyNameAr}
                  onChange={(e) => setForm({ ...form, companyNameAr: e.currentTarget.value })}
                  className={fieldInput} />
              </Field>
              <Field label={`${t("companyNameEn")} *`}>
                <input required value={form.companyNameEn}
                  onChange={(e) => setForm({ ...form, companyNameEn: e.currentTarget.value })}
                  className={fieldInput} />
              </Field>
              <Field label={t("taxId")}>
                <input value={form.taxId}
                  onChange={(e) => setForm({ ...form, taxId: e.currentTarget.value })}
                  className={fieldInput} dir="ltr" />
              </Field>
              <Field label={t("commercialReg")}>
                <input value={form.commercialReg}
                  onChange={(e) => setForm({ ...form, commercialReg: e.currentTarget.value })}
                  className={fieldInput} dir="ltr" />
              </Field>
              <Field label={t("phone")}>
                <input inputMode="tel" value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.currentTarget.value })}
                  className={fieldInput} dir="ltr" />
              </Field>
              <Field label={t("email")}>
                <input type="email" value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.currentTarget.value })}
                  className={fieldInput} dir="ltr" />
              </Field>
              <Field label={t("address")}>
                <input value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.currentTarget.value })}
                  className={fieldInput} />
              </Field>
              <Field label={t("status")}>
                <select value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.currentTarget.value })}
                  className={fieldInput}>
                  {["ACTIVE", "INACTIVE", "BLACKLISTED"].map((s) => (
                    <option key={s} value={s}>{t(`status_${s}`)}</option>
                  ))}
                </select>
              </Field>
              <Field label={t("notes")} className="sm:col-span-2">
                <textarea value={form.notes} rows={2}
                  onChange={(e) => setForm({ ...form, notes: e.currentTarget.value })}
                  className={fieldInput} />
              </Field>
            </div>

            {!modal.editing && (
              <div className="mt-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400">
                    {t("contacts")}
                  </h3>
                  <Btn type="button" variant="ghost"
                    onClick={() => setForm({ ...form, contacts: [...form.contacts, { ...emptyContact }] })}
                    className="px-3 py-1.5">
                    <Icon name="plus" className="h-4 w-4" />
                    {t("addContact")}
                  </Btn>
                </div>
                {form.contacts.map((c, i) => (
                  <div key={i} className="mt-2 grid gap-3 rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-100 sm:grid-cols-2">
                    <input placeholder={t("contactName")} value={c.name}
                      onChange={(e) => updateContact(i, { name: e.currentTarget.value })}
                      className={`${fieldInput} !mt-0`} />
                    <input placeholder={t("role")} value={c.role}
                      onChange={(e) => updateContact(i, { role: e.currentTarget.value })}
                      className={`${fieldInput} !mt-0`} />
                    <input placeholder={t("contactPhone")} value={c.phone} dir="ltr"
                      onChange={(e) => updateContact(i, { phone: e.currentTarget.value })}
                      className={`${fieldInput} !mt-0`} />
                    <div className="flex items-center justify-between gap-2">
                      <label className="flex items-center gap-2 text-sm font-medium text-slate-600">
                        <input type="checkbox" checked={c.isPrimary}
                          onChange={(e) => updateContact(i, { isPrimary: e.currentTarget.checked })}
                          className="h-4 w-4 rounded border-slate-300 accent-blue-700" />
                        {t("isPrimary")}
                      </label>
                      {form.contacts.length > 1 && (
                        <button type="button"
                          onClick={() => setForm({ ...form, contacts: form.contacts.filter((_, j) => j !== i) })}
                          className="text-sm font-medium text-rose-600 hover:text-rose-800">
                          {t("remove")}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {formError && (
              <p className="mt-4 rounded-xl bg-rose-50 px-4 py-2.5 text-sm font-medium text-rose-700 ring-1 ring-rose-100">
                {formError}
              </p>
            )}

            <div className="mt-6 flex justify-end gap-2">
              <Btn type="button" variant="ghost" onClick={() => setModal(null)}>
                {t("cancel")}
              </Btn>
              <Btn type="submit" disabled={busy}>
                {busy ? <Spinner className="h-4 w-4" /> : <Icon name="check" className="h-4 w-4" />}
                {t("save")}
              </Btn>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
