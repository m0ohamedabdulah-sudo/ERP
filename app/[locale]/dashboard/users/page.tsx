"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";

interface Envelope { success: boolean; data?: unknown; error?: { message?: string }; page?: { totalPages: number } }
interface User { id: string; email: string; fullName: string; phone: string | null; roleId: string; roleName: string; isActive: boolean; lastLoginAt: string | null }
interface Role { id: string; name: string; description: string | null; userCount: number; permissionIds: string[] }
interface Permission { id: string; key: string; module: string; description: string | null }

const inputCls = "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none";
const labelCls = "block text-sm font-medium text-slate-700";

type Tab = "users" | "roles";

/** Users & roles administration. */
export default function UsersPage() {
  const t = useTranslations("users");
  const [tab, setTab] = useState<Tab>("users");

  const [users, setUsers] = useState<User[]>([]);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ email: "", password: "", fullName: "", phone: "", roleId: "" });
  const [editing, setEditing] = useState<User | null>(null);
  const [editForm, setEditForm] = useState({ fullName: "", phone: "", roleId: "", password: "" });
  const [editRolePerms, setEditRolePerms] = useState<Role | null>(null);
  const [permSelection, setPermSelection] = useState<string[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

  const loadUsers = useCallback(async () => {
    try {
      const qs = new URLSearchParams({ page: "1", pageSize: "100" });
      if (search.trim()) qs.set("search", search.trim());
      if (roleFilter) qs.set("roleId", roleFilter);
      const res = await fetch(`/api/v1/users?${qs}`);
      const b = (await res.json()) as Envelope;
      if (b.success) setUsers((b.data as User[]) ?? []);
    } catch { /* noop */ }
  }, [search, roleFilter]);

  const loadRoles = useCallback(async () => {
    try {
      const [r1, r2] = await Promise.all([
        fetch("/api/v1/roles").then((r) => r.json()),
        fetch("/api/v1/permissions").then((r) => r.json()),
      ]);
      const b1 = r1 as Envelope; const b2 = r2 as Envelope;
      if (b1.success) setRoles((b1.data as Role[]) ?? []);
      if (b2.success) setPermissions((b2.data as Permission[]) ?? []);
    } catch { /* noop */ }
  }, []);

  useEffect(() => { loadUsers(); }, [loadUsers]);
  useEffect(() => { loadRoles(); }, [loadRoles]);

  async function addUser(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    try {
      const res = await fetch("/api/v1/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: form.email.trim(), password: form.password,
          fullName: form.fullName.trim(), phone: form.phone.trim() || undefined,
          roleId: form.roleId,
        }),
      });
      const b = (await res.json()) as Envelope;
      if (b.success) {
        setShowAdd(false);
        setForm({ email: "", password: "", fullName: "", phone: "", roleId: "" });
        loadUsers();
      } else setMsg(b.error?.message ?? "Error");
    } catch { setMsg("Error"); }
  }

  function openEdit(u: User) {
    setEditing(u);
    setEditForm({ fullName: u.fullName, phone: u.phone ?? "", roleId: u.roleId, password: "" });
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setMsg(null);
    try {
      const body: Record<string, unknown> = {
        fullName: editForm.fullName.trim(),
        phone: editForm.phone.trim() || null,
        roleId: editForm.roleId,
      };
      if (editForm.password) body.password = editForm.password;
      const res = await fetch(`/api/v1/users/${editing.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const b = (await res.json()) as Envelope;
      if (b.success) { setEditing(null); loadUsers(); }
      else setMsg(b.error?.message ?? "Error");
    } catch { setMsg("Error"); }
  }

  async function toggleActive(u: User) {
    const ok = window.confirm(t(u.isActive ? "deactivateConfirm" : "activateConfirm"));
    if (!ok) return;
    try {
      const res = await fetch(`/api/v1/users/${u.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ isActive: !u.isActive }),
      });
      const b = (await res.json()) as Envelope;
      if (b.success) loadUsers();
      else setMsg(b.error?.message ?? "Error");
    } catch { /* noop */ }
  }

  function openRolePerms(r: Role) {
    setEditRolePerms(r);
    setPermSelection([...r.permissionIds]);
  }

  async function saveRolePerms() {
    if (!editRolePerms) return;
    try {
      const res = await fetch(`/api/v1/roles/${editRolePerms.id}/permissions`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ permissionIds: permSelection }),
      });
      const b = (await res.json()) as Envelope;
      if (b.success) { setEditRolePerms(null); loadRoles(); }
      else setMsg(b.error?.message ?? "Error");
    } catch { /* noop */ }
  }

  const permsByModule = permissions.reduce<Record<string, Permission[]>>((acc, p) => {
    (acc[p.module] = acc[p.module] ?? []).push(p);
    return acc;
  }, {});

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">{t("title")}</h1>
        {tab === "users" && (
          <button onClick={() => setShowAdd(true)}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white">{t("addUser")}</button>
        )}
      </div>

      <div className="mt-4 flex gap-1 rounded-xl bg-slate-100 p-1 w-fit">
        {(["users", "roles"] as Tab[]).map((tb) => (
          <button key={tb} onClick={() => setTab(tb)}
            className={`rounded-lg px-5 py-2 text-sm font-medium ${tab === tb ? "bg-white shadow-sm text-slate-900" : "text-slate-500"}`}>
            {t(tb === "users" ? "tabUsers" : "tabRoles")}
          </button>
        ))}
      </div>

      {msg && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{msg}</p>}

      {tab === "users" && (
        <>
          <div className="mt-4 flex flex-wrap items-end gap-2">
            <label className={labelCls}>{t("search")}
              <input value={search} onChange={(e) => setSearch(e.currentTarget.value)}
                className="mt-1 block w-56 rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal" /></label>
            <label className={labelCls}>{t("role")}
              <select value={roleFilter} onChange={(e) => setRoleFilter(e.currentTarget.value)}
                className="mt-1 block rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal">
                <option value="">{t("allRoles")}</option>
                {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select></label>
          </div>

          <div className="mt-4 overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-slate-200 text-slate-500">
                <th className="px-4 py-3 text-start font-medium">{t("fullName")}</th>
                <th className="px-4 py-3 text-start font-medium">{t("email")}</th>
                <th className="px-4 py-3 text-center font-medium">{t("role")}</th>
                <th className="px-4 py-3 text-center font-medium">{t("active")}</th>
                <th className="px-4 py-3 text-end font-medium">—</th>
              </tr></thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-slate-100">
                    <td className="px-4 py-2.5 font-medium text-slate-900">{u.fullName}</td>
                    <td className="px-4 py-2.5 text-xs" dir="ltr">{u.email}</td>
                    <td className="px-4 py-2.5 text-center">
                      <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">{u.roleName}</span></td>
                    <td className="px-4 py-2.5 text-center">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${u.isActive ? "bg-green-100 text-green-700" : "bg-slate-200 text-slate-500"}`}>
                        {u.isActive ? t("active") : t("inactive")}</span></td>
                    <td className="px-4 py-2.5 text-end">
                      <div className="flex justify-end gap-2">
                        <button onClick={() => openEdit(u)} className="text-xs font-medium text-slate-600">{t("edit")}</button>
                        <button onClick={() => toggleActive(u)}
                          className={`text-xs font-medium ${u.isActive ? "text-red-600" : "text-green-700"}`}>
                          {u.isActive ? t("deactivate") : t("activate")}</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {users.length === 0 && <p className="px-4 py-8 text-center text-sm text-slate-500">{t("noUsers")}</p>}
          </div>
        </>
      )}

      {tab === "roles" && (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {roles.map((r) => (
            <div key={r.id} className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-slate-900" dir="ltr">{r.name}</h3>
                  <p className="text-xs text-slate-500">{r.userCount} {t("usersCount")} · {r.permissionIds.length} {t("permissions").toLowerCase()}</p>
                </div>
                {r.name !== "SUPER_ADMIN" && (
                  <button onClick={() => openRolePerms(r)}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium">{t("permissions")}</button>
                )}
              </div>
              {r.name === "SUPER_ADMIN" && (
                <p className="mt-2 text-xs text-slate-400">{t("protectedRole")}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form onSubmit={addUser} className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-bold text-slate-900">{t("addUser")}</h2>
            <div className="mt-4 grid gap-4">
              <label className={labelCls}>{t("fullName")}
                <input required value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.currentTarget.value })} className={inputCls} /></label>
              <label className={labelCls}>{t("email")}
                <input required type="email" value={form.email} dir="ltr"
                  onChange={(e) => setForm({ ...form, email: e.currentTarget.value })} className={inputCls} /></label>
              <label className={labelCls}>{t("password")}
                <input required type="password" value={form.password} dir="ltr" minLength={8}
                  onChange={(e) => setForm({ ...form, password: e.currentTarget.value })} className={inputCls} /></label>
              <div className="grid grid-cols-2 gap-4">
                <label className={labelCls}>{t("phone")}
                  <input value={form.phone} dir="ltr" onChange={(e) => setForm({ ...form, phone: e.currentTarget.value })} className={inputCls} /></label>
                <label className={labelCls}>{t("role")}
                  <select required value={form.roleId} onChange={(e) => setForm({ ...form, roleId: e.currentTarget.value })} className={inputCls}>
                    <option value="">—</option>
                    {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select></label>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => setShowAdd(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium">{t("cancel")}</button>
              <button type="submit" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white">{t("save")}</button>
            </div>
          </form>
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form onSubmit={saveEdit} className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-bold text-slate-900">{t("edit")} — {editing.fullName}</h2>
            <div className="mt-4 grid gap-4">
              <label className={labelCls}>{t("fullName")}
                <input required value={editForm.fullName} onChange={(e) => setEditForm({ ...editForm, fullName: e.currentTarget.value })} className={inputCls} /></label>
              <div className="grid grid-cols-2 gap-4">
                <label className={labelCls}>{t("phone")}
                  <input value={editForm.phone} dir="ltr" onChange={(e) => setEditForm({ ...editForm, phone: e.currentTarget.value })} className={inputCls} /></label>
                <label className={labelCls}>{t("role")}
                  <select required value={editForm.roleId} onChange={(e) => setEditForm({ ...editForm, roleId: e.currentTarget.value })} className={inputCls}>
                    {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select></label>
              </div>
              <label className={labelCls}>{t("setPassword")}
                <span className="block text-xs font-normal text-slate-400">{t("leaveBlank")}</span>
                <input type="password" value={editForm.password} dir="ltr" minLength={8}
                  onChange={(e) => setEditForm({ ...editForm, password: e.currentTarget.value })} className={inputCls} /></label>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => setEditing(null)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium">{t("cancel")}</button>
              <button type="submit" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white">{t("save")}</button>
            </div>
          </form>
        </div>
      )}

      {editRolePerms && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-bold text-slate-900">{t("permissions")} — <span dir="ltr">{editRolePerms.name}</span></h2>
            <div className="mt-4 space-y-4">
              {Object.entries(permsByModule).map(([mod, perms]) => (
                <div key={mod}>
                  <h3 className="text-sm font-semibold text-slate-700" dir="ltr">{mod}</h3>
                  <div className="mt-1.5 space-y-1">
                    {perms.map((p) => (
                      <label key={p.id} className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm">
                        <input type="checkbox" checked={permSelection.includes(p.id)}
                          onChange={(e) => setPermSelection(
                            e.currentTarget.checked
                              ? [...permSelection, p.id]
                              : permSelection.filter((id) => id !== p.id)
                          )} />
                        <span dir="ltr" className="font-mono text-xs font-medium">{p.key}</span>
                        {p.description && <span className="text-xs text-slate-500">{p.description}</span>}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button onClick={() => setEditRolePerms(null)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium">{t("cancel")}</button>
              <button onClick={saveRolePerms}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white">{t("savePermissions")}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
