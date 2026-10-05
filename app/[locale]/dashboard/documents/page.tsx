"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations, useLocale } from "next-intl";

interface Envelope { success: boolean; data?: unknown; error?: { message?: string } }
interface Emp { id: string; fullNameAr: string; cardNumber: string }
interface DocType { id: string; code: string; nameAr: string; nameEn: string; requiredForHire: boolean; validityMonths: number | null }
interface EmpDoc {
  id: string; documentTypeId: string; documentNo: string | null;
  issuedAt: string | null; expiresAt: string | null;
  status: string; verifiedAt: string | null; notes: string | null;
  documentType?: { nameAr: string; nameEn: string };
}

const inputCls = "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none";
const labelCls = "block text-sm font-medium text-slate-700";

const STATUS_COLORS: Record<string, string> = {
  VALID: "bg-green-100 text-green-700",
  EXPIRING: "bg-amber-100 text-amber-700",
  EXPIRED: "bg-red-100 text-red-700",
  MISSING: "bg-slate-200 text-slate-600",
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
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">{t("title")}</h1>
        {tab === "employees" && employee && (
          <button onClick={() => openDocModal()}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white">{t("addDocument")}</button>
        )}
        {tab === "types" && (
          <button onClick={() => openTypeModal()}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white">{t("addType")}</button>
        )}
      </div>

      <div className="mt-4 flex gap-1 rounded-xl bg-slate-100 p-1 w-fit">
        {(["employees", "types"] as Tab[]).map((tb) => (
          <button key={tb} onClick={() => setTab(tb)}
            className={`rounded-lg px-5 py-2 text-sm font-medium ${tab === tb ? "bg-white shadow-sm text-slate-900" : "text-slate-500"}`}>
            {t(tb === "employees" ? "tabEmployees" : "tabTypes")}
          </button>
        ))}
      </div>

      {msg && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{msg}</p>}

      {tab === "employees" && (
        <div className="mt-4">
          <div className="relative max-w-md">
            <input value={empQuery} onChange={(e) => setEmpQuery(e.currentTarget.value)}
              placeholder={t("searchEmployee")}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            {empResults.length > 0 && (
              <ul className="absolute z-10 mt-1 w-full rounded-lg bg-white shadow-lg ring-1 ring-slate-200">
                {empResults.map((e) => (
                  <li key={e.id}><button onClick={() => pickEmployee(e)}
                    className="block w-full px-3 py-2 text-start text-sm hover:bg-slate-50">
                    {e.fullNameAr} <span className="font-mono text-xs text-slate-400">{e.cardNumber}</span>
                  </button></li>
                ))}
              </ul>
            )}
          </div>

          {!employee && (
            <p className="mt-8 text-center text-sm text-slate-500">{t("selectEmployee")}</p>
          )}

          {employee && (
            <div className="mt-4 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
              <h3 className="font-semibold text-slate-900">{employee.fullNameAr}
                <span className="ms-2 font-mono text-xs font-normal text-slate-400">{employee.cardNumber}</span></h3>
              {docs.length === 0
                ? <p className="mt-2 text-sm text-slate-500">{t("noDocuments")}</p>
                : (
                  <ul className="mt-3 space-y-2">
                    {docs.map((d) => (
                      <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2.5">
                        <div className="text-sm">
                          <strong>{typeName(d.documentType)}</strong>
                          {d.documentNo && <span className="ms-2 font-mono text-xs text-slate-500" dir="ltr">{d.documentNo}</span>}
                          <span className="ms-2 text-xs text-slate-500" dir="ltr">
                            {[d.issuedAt?.slice(0, 10), d.expiresAt?.slice(0, 10)].filter(Boolean).join(" → ")}
                          </span>
                          <span className={`ms-2 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[d.status] ?? "bg-slate-200 text-slate-600"}`}>
                            {t(`status_${d.status}`)}
                          </span>
                          {d.verifiedAt && <span className="ms-1 text-xs text-green-700">✓ {t("verified")}</span>}
                        </div>
                        <div className="flex gap-2">
                          {!d.verifiedAt && (
                            <button onClick={() => verifyDoc(d.id)} className="text-xs font-medium text-green-700">{t("verify")}</button>
                          )}
                          <button onClick={() => openDocModal(d)} className="text-xs font-medium text-slate-600">{t("editDocument")}</button>
                          <button onClick={() => deleteDoc(d.id)} className="text-xs font-medium text-red-600">{t("delete")}</button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
            </div>
          )}
        </div>
      )}

      {tab === "types" && (
        <div className="mt-4 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <ul className="space-y-2">
            {types.map((dt) => (
              <li key={dt.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2.5 text-sm">
                <div>
                  <strong>{locale === "ar" ? dt.nameAr : dt.nameEn}</strong>
                  <span className="ms-2 font-mono text-xs text-slate-400">{dt.code}</span>
                  {dt.requiredForHire && <span className="ms-2 rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700">{t("requiredForHire")}</span>}
                  {dt.validityMonths != null && <span className="ms-2 text-xs text-slate-500">{dt.validityMonths}m</span>}
                </div>
                <button onClick={() => openTypeModal(dt)} className="text-xs font-medium text-slate-600">{t("editType")}</button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {showDocModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form onSubmit={saveDoc} className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-bold text-slate-900">{editingDoc ? t("editDocument") : t("addDocument")}</h2>
            <div className="mt-4 grid gap-4">
              <label className={labelCls}>{t("docType")}
                <select required value={docForm.documentTypeId}
                  onChange={(e) => setDocForm({ ...docForm, documentTypeId: e.currentTarget.value })} className={inputCls}>
                  <option value="">—</option>
                  {types.map((dt) => <option key={dt.id} value={dt.id}>{locale === "ar" ? dt.nameAr : dt.nameEn}</option>)}
                </select></label>
              <label className={labelCls}>{t("docNo")}
                <input value={docForm.documentNo} dir="ltr"
                  onChange={(e) => setDocForm({ ...docForm, documentNo: e.currentTarget.value })} className={inputCls} /></label>
              <div className="grid grid-cols-2 gap-4">
                <label className={labelCls}>{t("issuedAt")}
                  <input type="date" value={docForm.issuedAt}
                    onChange={(e) => setDocForm({ ...docForm, issuedAt: e.currentTarget.value })} className={inputCls} /></label>
                <label className={labelCls}>{t("expiresAt")}
                  <input type="date" value={docForm.expiresAt}
                    onChange={(e) => setDocForm({ ...docForm, expiresAt: e.currentTarget.value })} className={inputCls} /></label>
              </div>
              <label className={labelCls}>{t("notes")}
                <input value={docForm.notes}
                  onChange={(e) => setDocForm({ ...docForm, notes: e.currentTarget.value })} className={inputCls} /></label>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => setShowDocModal(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium">{t("cancel")}</button>
              <button type="submit" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white">{t("save")}</button>
            </div>
          </form>
        </div>
      )}

      {showTypeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form onSubmit={saveType} className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-bold text-slate-900">{editingType ? t("editType") : t("addType")}</h2>
            <div className="mt-4 grid gap-4">
              <label className={labelCls}>Code
                <input required value={typeForm.code} dir="ltr"
                  onChange={(e) => setTypeForm({ ...typeForm, code: e.currentTarget.value })} className={inputCls} /></label>
              <label className={labelCls}>{t("typeNameAr")}
                <input required value={typeForm.nameAr}
                  onChange={(e) => setTypeForm({ ...typeForm, nameAr: e.currentTarget.value })} className={inputCls} /></label>
              <label className={labelCls}>{t("typeNameEn")}
                <input required value={typeForm.nameEn} dir="ltr"
                  onChange={(e) => setTypeForm({ ...typeForm, nameEn: e.currentTarget.value })} className={inputCls} /></label>
              <label className={labelCls}>{t("validityMonths")}
                <input type="number" min="1" value={typeForm.validityMonths} dir="ltr"
                  onChange={(e) => setTypeForm({ ...typeForm, validityMonths: e.currentTarget.value })} className={inputCls} /></label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={typeForm.requiredForHire}
                  onChange={(e) => setTypeForm({ ...typeForm, requiredForHire: e.currentTarget.checked })} />
                {t("requiredForHire")}</label>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => setShowTypeModal(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium">{t("cancel")}</button>
              <button type="submit" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white">{t("save")}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
