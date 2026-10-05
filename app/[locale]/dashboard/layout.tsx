"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

interface MeEnvelope {
  success: boolean;
  data?: { user?: { fullName?: string; email?: string } };
}

/**
 * Dashboard shell: sidebar nav + header with user + logout.
 * Server middleware already blocks unauthenticated visits; this
 * guard handles client-side transitions (expired session etc.).
 */
export default function DashboardLayout({
  children,
  params: { locale },
}: {
  children: React.ReactNode;
  params: { locale: string };
}) {
  const t = useTranslations("dashboard");
  const router = useRouter();
  const pathname = usePathname();
  const [userName, setUserName] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    fetch("/api/v1/auth/me")
      .then((r) => r.json())
      .then((j: unknown) => {
        const body = j as MeEnvelope;
        if (!body.success) {
          router.replace(`/${locale}/login?next=${encodeURIComponent(pathname)}`);
          return;
        }
        setUserName(
          body.data?.user?.fullName ?? body.data?.user?.email ?? null,
        );
        setChecked(true);
      })
      .catch(() => router.replace(`/${locale}/login`));
  }, [locale, pathname, router]);

  async function logout() {
    try {
      await fetch("/api/v1/auth/logout", { method: "POST" });
    } catch {
      /* still leave */
    }
    router.replace(`/${locale}/login`);
  }

  const base = `/${locale}/dashboard`;
  const links = [
    { href: base, label: t("navDashboard"), exact: true },
    { href: `${base}/employees`, label: t("navEmployees"), exact: false },
    { href: `${base}/sites`, label: t("navSites"), exact: false },
    { href: `${base}/attendance`, label: t("navAttendance"), exact: false },
    { href: `${base}/clients`, label: t("navClients"), exact: false },
    { href: `${base}/contracts`, label: t("navContracts"), exact: false },
    { href: `${base}/invoices`, label: t("navInvoices"), exact: false },
    { href: `${base}/payroll`, label: t("navPayroll"), exact: false },
    { href: `${base}/roster`, label: t("navRoster"), exact: false },
    { href: `${base}/analytics`, label: t("navAnalytics"), exact: false },
    { href: `${base}/recruitment`, label: t("navRecruitment"), exact: false },
    { href: `${base}/documents`, label: t("navDocuments"), exact: false },
  ];

  if (!checked) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50">
        <p className="text-slate-500">{t("title")}…</p>
      </main>
    );
  }

  return (
    <div className="flex min-h-screen bg-slate-100">
      <aside className="w-56 shrink-0 bg-slate-900 text-white">
        <div className="border-b border-slate-700 px-5 py-5">
          <p className="text-lg font-bold">Security ERP</p>
          {userName && (
            <p className="mt-1 truncate text-sm text-slate-300">
              {t("welcome")}، {userName}
            </p>
          )}
        </div>
        <nav className="flex flex-col gap-1 p-3">
          {links.map((l) => {
            const active = l.exact
              ? pathname === l.href
              : pathname.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`rounded-lg px-4 py-2.5 text-sm font-medium transition ${
                  active
                    ? "bg-slate-700 text-white"
                    : "text-slate-300 hover:bg-slate-800 hover:text-white"
                }`}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-3">
          <button
            onClick={logout}
            className="w-full rounded-lg border border-slate-700 px-4 py-2.5 text-sm font-medium text-slate-300 hover:bg-slate-800 hover:text-white"
          >
            {t("logout")}
          </button>
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-6">{children}</main>
    </div>
  );
}
