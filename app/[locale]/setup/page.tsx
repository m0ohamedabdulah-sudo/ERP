"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import Link from "next/link";

interface Envelope {
  success: boolean;
  data?: { setupNeeded?: boolean };
  error?: { code: string; message: string };
}

export default function SetupPage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  const t = useTranslations("setup");
  const router = useRouter();
  const [checked, setChecked] = useState(false);
  const [needed, setNeeded] = useState(true);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/v1/setup")
      .then((r) => r.json())
      .then((j: unknown) => {
        const body = j as Envelope;
        setNeeded(body.success && body.data?.setupNeeded === true);
        setChecked(true);
      })
      .catch(() => setChecked(true));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError(t("passwordMismatch"));
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/v1/setup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password, fullName }),
      });
      const body = (await res.json()) as Envelope;
      if (!body.success) {
        setError(body.error?.message ?? t("passwordMismatch"));
        return;
      }
      router.replace(`/${locale}/login`);
    } catch {
      setError(t("passwordMismatch"));
    } finally {
      setBusy(false);
    }
  }

  if (!checked) return null;

  if (!needed) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="w-full max-w-sm rounded-2xl bg-white p-8 text-center shadow-lg">
          <p className="text-slate-700">{t("alreadyDone")}</p>
          <Link
            href={`/${locale}/login`}
            className="mt-4 inline-block rounded-lg bg-slate-900 px-4 py-2.5 font-medium text-white"
          >
            {t("goToLogin")}
          </Link>
        </div>
      </main>
    );
  }

  const inputCls =
    "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-slate-500 focus:outline-none";

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-lg"
      >
        <h1 className="text-2xl font-bold text-slate-900">{t("title")}</h1>
        <p className="mt-1 text-sm text-slate-500">{t("subtitle")}</p>

        <label className="mt-6 block">
          <span className="text-sm font-medium text-slate-700">{t("fullName")}</span>
          <input
            required
            minLength={2}
            value={fullName}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFullName(e.currentTarget.value)}
            className={inputCls}
          />
        </label>

        <label className="mt-4 block">
          <span className="text-sm font-medium text-slate-700">{t("email")}</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.currentTarget.value)}
            className={inputCls}
          />
        </label>

        <label className="mt-4 block">
          <span className="text-sm font-medium text-slate-700">{t("password")}</span>
          <input
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={password}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.currentTarget.value)}
            className={inputCls}
          />
        </label>

        <label className="mt-4 block">
          <span className="text-sm font-medium text-slate-700">{t("confirmPassword")}</span>
          <input
            type="password"
            required
            autoComplete="new-password"
            value={confirm}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setConfirm(e.currentTarget.value)}
            className={inputCls}
          />
        </label>

        {error && (
          <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="mt-6 w-full rounded-lg bg-slate-900 px-4 py-2.5 font-medium text-white disabled:opacity-50"
        >
          {busy ? t("creating") : t("createAdmin")}
        </button>
      </form>
    </main>
  );
}
