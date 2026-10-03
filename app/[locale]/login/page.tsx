"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

interface Envelope {
  success: boolean;
  error?: { code: string; message: string };
}

export default function LoginPage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  const t = useTranslations("auth");
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // First run? → the setup page instead.
  useEffect(() => {
    fetch("/api/v1/setup")
      .then((r) => r.json())
      .then((j: unknown) => {
        const body = j as Envelope & { data?: { setupNeeded?: boolean } };
        if (body.success && body.data?.setupNeeded) {
          router.replace(`/${locale}/setup`);
        }
      })
      .catch(() => {});
  }, [locale, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const body = (await res.json()) as Envelope;
      if (!body.success) {
        setError(
          body.error?.code === "INVALID_CREDENTIALS"
            ? t("invalidCredentials")
            : (body.error?.message ?? t("invalidCredentials")),
        );
        return;
      }
      const next = searchParams.get("next");
      router.replace(
        next && next.startsWith("/") && !next.startsWith("//") ? next : `/${locale}/`,
      );
    } catch {
      setError(t("invalidCredentials"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-lg"
      >
        <h1 className="text-2xl font-bold text-slate-900">{t("loginTitle")}</h1>
        <p className="mt-1 text-sm text-slate-500">{t("loginSubtitle")}</p>

        <label className="mt-6 block">
          <span className="text-sm font-medium text-slate-700">{t("email")}</span>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.currentTarget.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-slate-500 focus:outline-none"
          />
        </label>

        <label className="mt-4 block">
          <span className="text-sm font-medium text-slate-700">{t("password")}</span>
          <input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.currentTarget.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-slate-500 focus:outline-none"
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
          {busy ? t("signingIn") : t("signIn")}
        </button>
      </form>
    </main>
  );
}
