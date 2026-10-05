"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Icon, Spinner } from "./_ui";

interface MeEnvelope {
  success: boolean;
  data?: { user?: { fullName?: string; email?: string } };
}

interface NavLink {
  href: string;
  label: string;
  icon: Parameters<typeof Icon>[0]["name"];
  exact?: boolean;
}

interface NavGroup {
  title: string;
  links: NavLink[];
}

/**
 * Dashboard shell: premium sidebar with grouped icon nav,
 * slim topbar with user chip, soft content canvas.
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
  const [navOpen, setNavOpen] = useState(false);

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
  const groups: NavGroup[] = [
    {
      title: t("navGroupMain"),
      links: [{ href: base, label: t("navDashboard"), icon: "dashboard", exact: true }],
    },
    {
      title: t("navGroupOps"),
      links: [
        { href: `${base}/attendance`, label: t("navAttendance"), icon: "attendance" },
        { href: `${base}/roster`, label: t("navRoster"), icon: "roster" },
        { href: `${base}/employees`, label: t("navEmployees"), icon: "users" },
        { href: `${base}/sites`, label: t("navSites"), icon: "sites" },
      ],
    },
    {
      title: t("navGroupFinance"),
      links: [
        { href: `${base}/payroll`, label: t("navPayroll"), icon: "payroll" },
        { href: `${base}/invoices`, label: t("navInvoices"), icon: "invoices" },
        { href: `${base}/contracts`, label: t("navContracts"), icon: "contracts" },
        { href: `${base}/clients`, label: t("navClients"), icon: "clients" },
      ],
    },
    {
      title: t("navGroupPeople"),
      links: [
        { href: `${base}/recruitment`, label: t("navRecruitment"), icon: "recruitment" },
        { href: `${base}/documents`, label: t("navDocuments"), icon: "documents" },
        { href: `${base}/analytics`, label: t("navAnalytics"), icon: "analytics" },
      ],
    },
    {
      title: t("navGroupAdmin"),
      links: [
        { href: `${base}/users`, label: t("navUsers"), icon: "shield" },
        { href: `${base}/audit`, label: t("navAudit"), icon: "clock" },
      ],
    },
  ];

  if (!checked) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50">
        <Spinner className="h-8 w-8 text-blue-700" />
      </main>
    );
  }

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="px-5 pb-4 pt-6">
        <p className="text-[17px] font-extrabold tracking-tight text-white">
          Security <span className="text-blue-400">ERP</span>
        </p>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 pb-4">
        {groups.map((g) => (
          <div key={g.title} className="mb-4">
            <p className="px-3 pb-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">
              {g.title}
            </p>
            <div className="space-y-0.5">
              {g.links.map((l) => {
                const active = l.exact
                  ? pathname === l.href
                  : pathname === l.href || pathname.startsWith(l.href + "/");
                return (
                  <Link
                    key={l.href}
                    href={l.href}
                    onClick={() => setNavOpen(false)}
                    className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13.5px] font-medium transition ${
                      active
                        ? "bg-blue-600/15 text-white"
                        : "text-slate-400 hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    <span
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition ${
                        active
                          ? "bg-blue-600 text-white"
                          : "bg-white/5 text-slate-400 group-hover:text-slate-200"
                      }`}
                    >
                      <Icon name={l.icon} className="h-[18px] w-[18px]" />
                    </span>
                    {l.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
      <div className="border-t border-white/10 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-600/20 text-sm font-bold text-blue-300">
            {(userName ?? "?").trim().charAt(0).toUpperCase()}
          </div>
          <p className="min-w-0 flex-1 truncate text-[13px] font-medium text-slate-200">
            {userName}
          </p>
          <button
            onClick={logout}
            title={t("logout")}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-400 hover:bg-white/5 hover:text-white"
          >
            <Icon name="logout" className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-slate-100">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-[248px] shrink-0 bg-slate-950 lg:block">
        {sidebar}
      </aside>
      {/* Mobile drawer */}
      {navOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-slate-950/60"
            onClick={() => setNavOpen(false)}
          />
          <aside className="absolute inset-y-0 start-0 w-72 bg-slate-950 shadow-2xl">
            {sidebar}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Slim topbar (mobile menu + brand) */}
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-slate-200/70 bg-white/80 px-4 py-3 backdrop-blur lg:hidden">
          <button
            onClick={() => setNavOpen(true)}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-700"
            aria-label="menu"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
              <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
            </svg>
          </button>
          <p className="text-[15px] font-extrabold tracking-tight text-slate-900">
            Security <span className="text-blue-700">ERP</span>
          </p>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">
          {children}
        </main>
      </div>
    </div>
  );
}
