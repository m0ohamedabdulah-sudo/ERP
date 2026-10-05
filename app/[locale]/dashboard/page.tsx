"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Badge, Card, EmptyState, Icon, PageHeader, Spinner, Stat } from "./_ui";

interface Summary {
  date: string;
  employees: { active: number };
  sites: { active: number };
  today: {
    present: number;
    sites: {
      id: string;
      name: string;
      required: number;
      present: number;
      employees: number;
    }[];
  };
}

interface Envelope {
  success: boolean;
  data?: Summary;
}

/** Dashboard home: headcounts + today's per-site coverage. */
export default function DashboardPage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  const t = useTranslations("dashboard");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch("/api/v1/dashboard/summary")
      .then((r) => r.json())
      .then((j: unknown) => {
        const body = j as Envelope;
        if (body.success && body.data) setSummary(body.data);
        else setError(true);
      })
      .catch(() => setError(true));
  }, []);

  const greeting = (() => {
    try {
      const h = new Date().getHours();
      if (locale === "ar") return h < 12 ? "صباح الخير" : "مساء الخير";
      return h < 12 ? "Good morning" : "Good evening";
    } catch {
      return "";
    }
  })();

  if (error) {
    return (
      <Card>
        <EmptyState icon="dashboard" title={t("loadError")} />
      </Card>
    );
  }
  if (!summary) {
    return (
      <div className="flex items-center justify-center py-24">
        <Spinner className="h-8 w-8 text-blue-700" />
      </div>
    );
  }

  const totalShortage = summary.today.sites.reduce(
    (s, x) => s + Math.max(0, x.required - x.present),
    0,
  );

  return (
    <div>
      <PageHeader
        title={`${greeting} 👋`}
        subtitle={
          summary.date
            ? new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-GB", {
                weekday: "long",
                day: "numeric",
                month: "long",
                timeZone: "UTC",
              }).format(new Date(summary.date + "T00:00:00Z"))
            : undefined
        }
        actions={
          <Link
            href={`/${locale}/dashboard/attendance`}
            className="inline-flex items-center gap-1.5 rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_1px_2px_rgba(29,78,216,0.4)] hover:bg-blue-800"
          >
            <Icon name="attendance" className="h-4 w-4" />
            {t("navAttendance")}
          </Link>
        }
      />

      <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label={t("activeEmployees")} value={summary.employees.active} icon="users" tone="blue" />
        <Stat label={t("activeSites")} value={summary.sites.active} icon="sites" tone="purple" />
        <Stat label={t("presentToday")} value={summary.today.present} icon="check" tone="green" />
        <Stat
          label={t("short")}
          value={totalShortage}
          icon="clock"
          tone={totalShortage > 0 ? "red" : "green"}
        />
      </div>

      <div className="mt-6 flex items-center justify-between">
        <h2 className="text-[17px] font-extrabold tracking-tight text-slate-900">
          {t("siteStatus")}
        </h2>
        <Link
          href={`/${locale}/dashboard/analytics`}
          className="text-sm font-semibold text-blue-700 hover:text-blue-800"
        >
          {t("navAnalytics")} ←
        </Link>
      </div>

      {summary.today.sites.length === 0 ? (
        <Card className="mt-3">
          <EmptyState icon="sites" title={t("noSites")} />
        </Card>
      ) : (
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          {summary.today.sites.map((s) => {
            const short = Math.max(0, s.required - s.present);
            const pct = s.required > 0 ? Math.min(100, Math.round((s.present / s.required) * 100)) : 100;
            return (
              <Card key={s.id} className="!p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[15px] font-bold text-slate-900">{s.name}</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {s.employees} {t("staff")} · {s.present}/{s.required} {t("present")}
                    </p>
                  </div>
                  {short > 0 ? (
                    <Badge tone="red">-{short} {t("short")}</Badge>
                  ) : (
                    <Badge tone="green">{t("present")}</Badge>
                  )}
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100" dir="ltr">
                  <div
                    className={`h-full rounded-full transition-all ${pct >= 100 ? "bg-emerald-500" : pct >= 70 ? "bg-amber-500" : "bg-rose-500"}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <p className="mt-1.5 text-right text-xs font-semibold tabular-nums text-slate-500" dir="ltr">
                  {pct}%
                </p>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
