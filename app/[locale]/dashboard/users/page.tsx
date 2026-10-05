"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  PageHeader, Card, Btn, Badge, Field, fieldInput, EmptyState, Icon,
} from "../_ui";

interface Envelope { success: boolean; data?: unknown; error?: { message?: string }; page?: { totalPages: number } }
interface User { id: string; email: string; fullName: string; phone: string | null; roleId: string; roleName: string; isActive: boolean; lastLoginAt: string | null }
interface Role { id: string; name: string; description: string | null; userCount: number; permissionIds: string[] }
interface Permission { id: string; key: string; module: string; description: string | null }

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
    <div className="space-y-5">
      <PageHeader
        title={t("title")}
        actions={
          tab === "users" ? (
            <Btn variant="primary" onClick={() => setShowAdd(true)}>
              <Icon name="plus" className="h-4 w-4" />{t("addUser")}
            </Btn>
          ) : undefined
        }
      />

      <div className="flex w-fit gap-1 rounded-2xl border border-slate-200/70 bg-white p-1.5 shadow-[0_1px_2px_rgba(15,23,42,0.05)]">
        {(["users", "roles"] as Tab[]).map((tb) => (
          <button key={tb} onClick={() => setTab(tb)}
            className={`rounded-xl px-5 py-2 text-sm font-semibold transition ${
              tab === tb ? "bg-slate-900 text-white shadow" : "text-slate-500 hover:text-slate-800"
            }`}>
            {t(tb === "users" ? "tabUsers" : "tabRoles")}
          </button>
        ))}
      </div>

      {msg && (
        <div className="flex items-center gap-2 rounded-xl bg-rose-50 px-4 py-2.5 text-sm font-medium text-rose-700 ring-1 ring-inset ring-rose-200">
          <Icon name="x" className="h-4 w-4 shrink-0" />{msg}
        </div>
      )}

      {tab === "users" && (
        <>
          <Card className="flex flex-wrap items-end gap-3">
            <Field label={t("search")}>
              <input value={search} onChange={(e) => setSearch(e.currentTarget.value)}
                className={`${fieldInput} w-56`} />
            </Field>
            <Field label={t("role")}>
              <select value={roleFilter} onChange={(e) => setRoleFilter(e.currentTarget.value)}
                className={`${fieldInput} min-w-40`}>
                <option value="">{t("allRoles")}</option>
                {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </Field>
          </Card>

          <div className="overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.05)]">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-slate-100 bg-slate-50/60 text-slate-500">
                  <th className="px-4 py-3 text-start font-semibold">{t("fullName")}</th>
                  <th className="px-4 py-3 text-start font-semibold">{t("email")}</th>
                  <th className="px-4 py-3 text-center font-semibold">{t("role")}</th>
                  <th className="px-4 py-3 text-center font-semibold">{t("active")}</th>
                  <th className="px-4 py-3 text-end font-semibold">—</th>
                </tr></thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                      <td className="px-4 py-2.5 font-semibold text-slate-900">{u.fullName}</td>
                      <td className="px-4 py-2.5 text-xs" dir="ltr">{u.email}</td>
                      <td className="px-4 py-2.5 text-center">
                        <Badge tone={u.roleName === "SUPER_ADMIN" ? "purple" : "slate"}><span dir="ltr">{u.roleName}</span></Badge>
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <Badge tone={u.isActive ? "green" : "slate"}>{u.isActive ? t("active") : t("inactive")}</Badge>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex justify-end gap-1">
                          <Btn variant="ghost" onClick={() => openEdit(u)} className="!px-2.5 !py-1.5 !text-xs">
                            {t("edit")}
                          </Btn>
                          <Btn variant="ghost" onClick={() => toggleActive(u)}
                            className={`!px-2.5 !py-1.5 !text-xs ${u.isActive ? "!text-rose-700" : "!text-emerald-700"}`}>
                            {u.isActive ? t("deactivate") : t("activate")}
                          </Btn>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {users.length === 0 && <EmptyState icon="users" title={t("noUsers")} />}
          </div>
        </>
      )}

      {tab === "roles" && (
        <div className="grid gap-4 md:grid-cols-2">
          {roles.map((r) => (
            <Card key={r.id} className="!p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-extrabold tracking-tight text-slate-900" dir="ltr">{r.name}</h3>
                    {r.name === "SUPER_ADMIN" && <Badge tone="amber">{t("protectedRole")}</Badge>}
                  </div>
                  <p className="mt-1.5 text-xs text-slate-500">
                    <span className="font-bold text-slate-700">{r.userCount}</span> {t("usersCount")} · <span className="font-bold text-slate-700">{r.permissionIds.length}</span> {t("permissions").toLowerCase()}
                  </p>
                </div>
                {r.name !== "SUPER_ADMIN" && (
                  <Btn variant="outline" onClick={() => openRolePerms(r)} className="!px-3 !py-1.5 !text-xs">
                    {t("permissions")}
                  </Btn>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form onSubmit={addUser} className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-extrabold tracking-tight text-slate-900">{t("addUser")}</h2>
            <div className="mt-4 grid gap-4">
              <Field label={t("fullName")}>
                <input required value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.currentTarget.value })} className={fieldInput} />
              </Field>
              <Field label={t("email")}>
                <input required type="email" value={form.email} dir="ltr"
                  onChange={(e) => setForm({ ...form, email: e.currentTarget.value })} className={fieldInput} />
              </Field>
              <Field label={t("password")}>
                <input required type="password" value={form.password} dir="ltr" minLength={8}
                  onChange={(e) => setForm({ ...form, password: e.currentTarget.value })} className={fieldInput} />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label={t("phone")}>
                  <input value={form.phone} dir="ltr" onChange={(e) => setForm({ ...form, phone: e.currentTarget.value })} className={fieldInput} />
                </Field>
                <Field label={t("role")}>
                  <select required value={form.roleId} onChange={(e) => setForm({ ...form, roleId: e.currentTarget.value })} className={fieldInput}>
                    <option value="">—</option>
                    {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                </Field>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Btn variant="outline" type="button" onClick={() => setShowAdd(false)}>{t("cancel")}</Btn>
              <Btn variant="primary" type="submit">{t("save")}</Btn>
            </div>
          </form>
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form onSubmit={saveEdit} className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-extrabold tracking-tight text-slate-900">{t("edit")} — {editing.fullName}</h2>
            <div className="mt-4 grid gap-4">
              <Field label={t("fullName")}>
                <input required value={editForm.fullName} onChange={(e) => setEditForm({ ...editForm, fullName: e.currentTarget.value })} className={fieldInput} />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label={t("phone")}>
                  <input value={editForm.phone} dir="ltr" onChange={(e) => setEditForm({ ...editForm, phone: e.currentTarget.value })} className={fieldInput} />
                </Field>
                <Field label={t("role")}>
                  <select required value={editForm.roleId} onChange={(e) => setEditForm({ ...editForm, roleId: e.currentTarget.value })} className={fieldInput}>
                    {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                </Field>
              </div>
              <Field label={t("setPassword")}>
                <span className="mt-0.5 block text-xs font-normal text-slate-400">{t("leaveBlank")}</span>
                <input type="password" value={editForm.password} dir="ltr" minLength={8}
                  onChange={(e) => setEditForm({ ...editForm, password: e.currentTarget.value })} className={fieldInput} />
              </Field>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Btn variant="outline" type="button" onClick={() => setEditing(null)}>{t("cancel")}</Btn>
              <Btn variant="primary" type="submit">{t("save")}</Btn>
            </div>
          </form>
        </div>
      )}

      {editRolePerms && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-extrabold tracking-tight text-slate-900">{t("permissions")} — <span dir="ltr">{editRolePerms.name}</span></h2>
            <div className="mt-4 space-y-5">
              {Object.entries(permsByModule).map(([mod, perms]) => (
                <div key={mod}>
                  <h3 className="text-sm font-bold text-slate-800" dir="ltr">{mod}</h3>
                  <div className="mt-2 space-y-1.5">
                    {perms.map((p) => (
                      <label key={p.id} className="flex cursor-pointer items-center gap-3 rounded-xl bg-slate-50 px-3.5 py-2.5 text-sm hover:bg-slate-100/70">
                        <input type="checkbox" checked={permSelection.includes(p.id)}
                          className="h-4 w-4 shrink-0 rounded accent-blue-700"
                          onChange={(e) => setPermSelection(
                            e.currentTarget.checked
                              ? [...permSelection, p.id]
                              : permSelection.filter((id) => id !== p.id)
                          )} />
                        <span dir="ltr" className="font-mono text-xs font-semibold text-slate-800">{p.key}</span>
                        {p.description && <span className="text-xs text-slate-500">{p.description}</span>}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Btn variant="outline" onClick={() => setEditRolePerms(null)}>{t("cancel")}</Btn>
              <Btn variant="primary" onClick={saveRolePerms}>{t("savePermissions")}</Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
