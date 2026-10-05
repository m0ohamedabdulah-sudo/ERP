"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import {
  PageHeader, Card, Btn, Badge, Field, fieldInput, EmptyState, Icon,
} from "../_ui";

type BadgeTone = "green" | "red" | "amber" | "blue" | "slate" | "purple";

interface Envelope { success: boolean; data?: unknown; error?: { message?: string } }
interface Emp { id: string; fullNameAr: string; cardNumber: string }
interface DocType { id: string; code: string; nameAr: string; nameEn: string; requiredForHire: boolean; validityMonths: number | null }
interface EmpDoc {
  id: string; documentTypeId: string; documentNo: string | null;
  issuedAt: string | null; expiresAt: string | null;
  status: string; verifiedAt: string | null; notes: string | null;
  documentType?: { nameAr: string; nameEn: string };
}

const STATUS_TONES: Record<string, BadgeTone> = {
  VALID: "green",
  EXPIRING: "amber",
  EXPIRED: "red",
  MISSING: "slate",
};

type Tab = "employees" | "types";

/** Document vault: employee documents + document types. */
export default function DocumentsPage() {
  const t = useTranslations("documents");
  const locale = useLocale();
  const [tab, setTab] = useState<Tab>("employees");

  const [empQuery, setEmpQuery] = useState("");
  const [empResults, setEmpResults] = useState<Emp[]>([]);
  const [employee, setEmployee] = useState<Emp | null>(null);
  const [docs, setDocs] = useState<EmpDoc[]>([]);
  const [types, setTypes] = useState<DocType[]>([]);
  const [showDocModal, setShowDocModal] = useState(false);
  const [editingDoc, setEditingDoc] = useState<EmpDoc | null>(null);
  const [docForm, setDocForm] = useState({ documentTypeId: "", documentNo: "", issuedAt: "", expiresAt: "", notes: "" });
  const [showTypeModal, setShowTypeModal] = useState(false);
  const [editingType, setEditingType] = useState<DocType | null>(null);
  const [typeForm, setTypeForm] = useState({ code: "", nameAr: "", nameEn: "", requiredForHire: false, validityMonths: "" });
  const [msg, setMsg] = useState<string | null>(null);

  const loadTypes = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/compliance/document-types?pageSize=100");
      const b = (await res.json()) as Envelope;
      if (b.success) setTypes(((b.data as { rows?: DocType[] })?.rows ?? b.data) as DocType[] ?? []);
    } catch { /* noop */ }
  }, []);

  useEffect(() => { loadTypes(); }, [loadTypes]);

  const loadDocs = useCallback(async (empId: string) => {
    try {
      const res = await fetch(`/api/v1/compliance/employees/${empId}/documents?pageSize=100`);
      const b = (await res.json()) as Envelope;
      if (b.success) {
        const d = b.data as { rows?: EmpDoc[] } | EmpDoc[];
        setDocs(Array.isArray(d) ? d : d.rows ?? []);
      }
    } catch { /* noop */ }
  }, []);

  useEffect(() => {
    if (empQuery.trim().length < 2) { setEmpResults([]); return; }
    const h = setTimeout(async () => {
      try {
        const res = await fetch(`/api/v1/employees?search=${encodeURIComponent(empQuery)}&pageSize=10`);
        const b = (await res.json()) as Envelope;
        if (b.success) setEmpResults((b.data as Emp[]) ?? []);
      } catch { /* noop */ }
    }, 300);
    return () => clearTimeout(h);
  }, [empQuery]);

  function pickEmployee(e: Emp) {
    setEmployee(e); setEmpQuery(""); setEmpResults([]);
    loadDocs(e.id);
  }

  function openDocModal(d?: EmpDoc) {
    setEditingDoc(d ?? null);
    setDocForm(d ? {
      documentTypeId: d.documentTypeId,
      documentNo: d.documentNo ?? "",
      issuedAt: d.issuedAt?.slice(0, 10) ?? "",
      expiresAt: d.expiresAt?.slice(0, 10) ?? "",
      notes: d.notes ?? "",
    } : { documentTypeId: "", documentNo: "", issuedAt: "", expiresAt: "", notes: "" });
    setShowDocModal(true);
  }

  async function saveDoc(e: React.FormEvent) {
    e.preventDefault();
    if (!employee) return;
    setMsg(null);
    try {
      const body = {
        documentTypeId: docForm.documentTypeId,
        documentNo: docForm.documentNo || null,
        issuedAt: docForm.issuedAt || null,
        expiresAt: docForm.expiresAt || null,
        notes: docForm.notes || null,
      };
      const url = editingDoc
        ? `/api/v1/compliance/employee-documents/${editingDoc.id}`
        : `/api/v1/compliance/employees/${employee.id}/documents`;
      const res = await fetch(url, {
        method: editingDoc ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const b = (await res.json()) as Envelope;
      if (b.success) { setShowDocModal(false); loadDocs(employee.id); }
      else setMsg(b.error?.message ?? "Error");
    } catch { setMsg("Error"); }
  }

  async function deleteDoc(id: string) {
    if (!employee || !window.confirm(t("deleteConfirm"))) return;
    try {
      const res = await fetch(`/api/v1/compliance/employee-documents/${id}`, { method: "DELETE" });
      const b = (await res.json()) as Envelope;
      if (b.success) loadDocs(employee.id);
    } catch { /* noop */ }
  }

  async function verifyDoc(id: string) {
    if (!employee) return;
    try {
      const res = await fetch(`/api/v1/compliance/employee-documents/${id}/verify`, { method: "POST" });
      const b = (await res.json()) as Envelope;
      if (b.success) loadDocs(employee.id);
    } catch { /* noop */ }
  }

  function openTypeModal(dt?: DocType) {
    setEditingType(dt ?? null);
    setTypeForm(dt ? {
      code: dt.code, nameAr: dt.nameAr, nameEn: dt.nameEn,
      requiredForHire: dt.requiredForHire, validityMonths: dt.validityMonths != null ? String(dt.validityMonths) : "",
    } : { code: "", nameAr: "", nameEn: "", requiredForHire: false, validityMonths: "" });
    setShowTypeModal(true);
  }

  async function saveType(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    try {
      const body = {
        code: typeForm.code.trim().toUpperCase(),
        nameAr: typeForm.nameAr.trim(), nameEn: typeForm.nameEn.trim(),
        requiredForHire: typeForm.requiredForHire,
        validityMonths: typeForm.validityMonths ? Number(typeForm.validityMonths) : null,
      };
      const url = editingType ? `/api/v1/compliance/document-types/${editingType.id}` : "/api/v1/compliance/document-types";
      const res = await fetch(url, {
        method: editingType ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const b = (await res.json()) as Envelope;
      if (b.success) { setShowTypeModal(false); loadTypes(); }
      else setMsg(b.error?.message ?? "Error");
    } catch { setMsg("Error"); }
  }

  const typeName = (dt?: { nameAr: string; nameEn: string }) =>
    dt ? (locale === "ar" ? dt.nameAr : dt.nameEn) : "—";

  return (
    <div className="space-y-5">
      <PageHeader
        title={t("title")}
        actions={
          <>
            {tab === "employees" && employee && (
              <Btn variant="primary" onClick={() => openDocModal()}>
                <Icon name="plus" className="h-4 w-4" />{t("addDocument")}
              </Btn>
            )}
            {tab === "types" && (
              <Btn variant="primary" onClick={() => openTypeModal()}>
                <Icon name="plus" className="h-4 w-4" />{t("addType")}
              </Btn>
            )}
          </>
        }
      />

      <div className="flex w-fit gap-1 rounded-2xl border border-slate-200/70 bg-white p-1.5 shadow-[0_1px_2px_rgba(15,23,42,0.05)]">
        {(["employees", "types"] as Tab[]).map((tb) => (
          <button key={tb} onClick={() => setTab(tb)}
            className={`rounded-xl px-5 py-2 text-sm font-semibold transition ${
              tab === tb ? "bg-slate-900 text-white shadow" : "text-slate-500 hover:text-slate-800"
            }`}>
            {t(tb === "employees" ? "tabEmployees" : "tabTypes")}
          </button>
        ))}
      </div>

      {msg && (
        <div className="flex items-center gap-2 rounded-xl bg-rose-50 px-4 py-2.5 text-sm font-medium text-rose-700 ring-1 ring-inset ring-rose-200">
          <Icon name="x" className="h-4 w-4 shrink-0" />{msg}
        </div>
      )}

      {tab === "employees" && (
        <div className="space-y-5">
          <div className="relative max-w-md">
            <input value={empQuery} onChange={(e) => setEmpQuery(e.currentTarget.value)}
              placeholder={t("searchEmployee")}
              className={fieldInput} />
            {empResults.length > 0 && (
              <ul className="absolute z-10 mt-2 w-full overflow-hidden rounded-2xl bg-white py-1 shadow-xl ring-1 ring-slate-200">
                {empResults.map((e) => (
                  <li key={e.id}><button onClick={() => pickEmployee(e)}
                    className="block w-full px-4 py-2.5 text-start text-sm font-medium text-slate-700 hover:bg-slate-50">
                    {e.fullNameAr} <span className="font-mono text-xs font-normal text-slate-400">{e.cardNumber}</span>
                  </button></li>
                ))}
              </ul>
            )}
          </div>

          {!employee && (
            <EmptyState icon="documents" title={t("selectEmployee")} />
          )}

          {employee && (
            <Card>
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-[15px] font-bold text-slate-900">
                  {employee.fullNameAr}
                  <span className="ms-2 font-mono text-xs font-normal text-slate-400">{employee.cardNumber}</span>
                </h3>
                <Badge tone="blue">{docs.length}</Badge>
              </div>
              {docs.length === 0 ? (
                <EmptyState icon="documents" title={t("noDocuments")} />
              ) : (
                <ul className="mt-4 space-y-2">
                  {docs.map((d) => (
                    <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 px-4 py-3">
                      <div className="min-w-0 text-sm">
                        <span className="font-bold text-slate-900">{typeName(d.documentType)}</span>
                        {d.documentNo && <span className="ms-2 font-mono text-xs text-slate-500" dir="ltr">{d.documentNo}</span>}
                        <span className="ms-2 text-xs text-slate-500" dir="ltr">
                          {[d.issuedAt?.slice(0, 10), d.expiresAt?.slice(0, 10)].filter(Boolean).join(" → ")}
                        </span>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          <Badge tone={STATUS_TONES[d.status] ?? "slate"}>{t(`status_${d.status}`)}</Badge>
                          {d.verifiedAt && (
                            <Badge tone="green"><Icon name="check" className="h-3 w-3 me-0.5" />{t("verified")}</Badge>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        {!d.verifiedAt && (
                          <Btn variant="ghost" onClick={() => verifyDoc(d.id)} className="!px-2.5 !py-1.5 !text-xs !text-emerald-700">
                            {t("verify")}
                          </Btn>
                        )}
                        <Btn variant="ghost" onClick={() => openDocModal(d)} className="!px-2.5 !py-1.5 !text-xs">
                          {t("editDocument")}
                        </Btn>
                        <Btn variant="ghost" onClick={() => deleteDoc(d.id)} className="!px-2.5 !py-1.5 !text-xs !text-rose-700">
                          {t("delete")}
                        </Btn>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}
        </div>
      )}

      {tab === "types" && (
        <Card>
          {types.length === 0 ? (
            <EmptyState icon="documents" title={t("noDocuments")} />
          ) : (
            <ul className="space-y-2">
              {types.map((dt) => (
                <li key={dt.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 px-4 py-3 text-sm">
                  <div className="min-w-0">
                    <span className="font-bold text-slate-900">{locale === "ar" ? dt.nameAr : dt.nameEn}</span>
                    <span className="ms-2 font-mono text-xs text-slate-400" dir="ltr">{dt.code}</span>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      {dt.requiredForHire && <Badge tone="blue">{t("requiredForHire")}</Badge>}
                      {dt.validityMonths != null && <Badge tone="slate">{dt.validityMonths}m</Badge>}
                    </div>
                  </div>
                  <Btn variant="ghost" onClick={() => openTypeModal(dt)} className="!px-2.5 !py-1.5 !text-xs">
                    {t("editType")}
                  </Btn>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {showDocModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form onSubmit={saveDoc} className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-extrabold tracking-tight text-slate-900">{editingDoc ? t("editDocument") : t("addDocument")}</h2>
            <div className="mt-4 grid gap-4">
              <Field label={t("docType")}>
                <select required value={docForm.documentTypeId}
                  onChange={(e) => setDocForm({ ...docForm, documentTypeId: e.currentTarget.value })} className={fieldInput}>
                  <option value="">—</option>
                  {types.map((dt) => <option key={dt.id} value={dt.id}>{locale === "ar" ? dt.nameAr : dt.nameEn}</option>)}
                </select>
              </Field>
              <Field label={t("docNo")}>
                <input value={docForm.documentNo} dir="ltr"
                  onChange={(e) => setDocForm({ ...docForm, documentNo: e.currentTarget.value })} className={fieldInput} />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label={t("issuedAt")}>
                  <input type="date" value={docForm.issuedAt}
                    onChange={(e) => setDocForm({ ...docForm, issuedAt: e.currentTarget.value })} className={fieldInput} />
                </Field>
                <Field label={t("expiresAt")}>
                  <input type="date" value={docForm.expiresAt}
                    onChange={(e) => setDocForm({ ...docForm, expiresAt: e.currentTarget.value })} className={fieldInput} />
                </Field>
              </div>
              <Field label={t("notes")}>
                <input value={docForm.notes}
                  onChange={(e) => setDocForm({ ...docForm, notes: e.currentTarget.value })} className={fieldInput} />
              </Field>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Btn variant="outline" type="button" onClick={() => setShowDocModal(false)}>{t("cancel")}</Btn>
              <Btn variant="primary" type="submit">{t("save")}</Btn>
            </div>
          </form>
        </div>
      )}

      {showTypeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form onSubmit={saveType} className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-extrabold tracking-tight text-slate-900">{editingType ? t("editType") : t("addType")}</h2>
            <div className="mt-4 grid gap-4">
              <Field label="Code">
                <input required value={typeForm.code} dir="ltr"
                  onChange={(e) => setTypeForm({ ...typeForm, code: e.currentTarget.value })} className={fieldInput} />
              </Field>
              <Field label={t("typeNameAr")}>
                <input required value={typeForm.nameAr}
                  onChange={(e) => setTypeForm({ ...typeForm, nameAr: e.currentTarget.value })} className={fieldInput} />
              </Field>
              <Field label={t("typeNameEn")}>
                <input required value={typeForm.nameEn} dir="ltr"
                  onChange={(e) => setTypeForm({ ...typeForm, nameEn: e.currentTarget.value })} className={fieldInput} />
              </Field>
              <Field label={t("validityMonths")}>
                <input type="number" min="1" value={typeForm.validityMonths} dir="ltr"
                  onChange={(e) => setTypeForm({ ...typeForm, validityMonths: e.currentTarget.value })} className={fieldInput} />
              </Field>
              <label className="flex cursor-pointer items-center gap-2.5 rounded-xl bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700">
                <input type="checkbox" checked={typeForm.requiredForHire}
                  onChange={(e) => setTypeForm({ ...typeForm, requiredForHire: e.currentTarget.checked })}
                  className="h-4 w-4 rounded accent-blue-700" />
                {t("requiredForHire")}
              </label>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Btn variant="outline" type="button" onClick={() => setShowTypeModal(false)}>{t("cancel")}</Btn>
              <Btn variant="primary" type="submit">{t("save")}</Btn>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
