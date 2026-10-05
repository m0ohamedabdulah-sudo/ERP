"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

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

/** Dashboard home: headcounts + today's per-site position. */
export default function DashboardPage() {
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

  if (error) {
    return <p className="text-red-700">{t("loadError")}</p>;
  }
  if (!summary) {
    return <p className="text-slate-500">{t("title")}…</p>;
  }

  const cards = [
    { label: t("activeEmployees"), value: summary.employees.active },
    { label: t("activeSites"), value: summary.sites.active },
    { label: t("presentToday"), value: summary.today.present },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">{t("title")}</h1>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        {cards.map((c) => (
          <div
            key={c.label}
            className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200"
          >
            <p className="text-sm text-slate-500">{c.label}</p>
            <p className="mt-1 text-3xl font-bold text-slate-900">{c.value}</p>
          </div>
        ))}
      </div>

      <h2 className="mt-8 text-lg font-semibold text-slate-900">
        {t("siteStatus")}
      </h2>
      {summary.today.sites.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">{t("noSites")}</p>
      ) : (
        <div className="mt-3 overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-start text-slate-500">
                <th className="px-4 py-3 text-start font-medium">{t("site")}</th>
                <th className="px-4 py-3 text-start font-medium">{t("staff")}</th>
                <th className="px-4 py-3 text-start font-medium">
                  {t("required")}
                </th>
                <th className="px-4 py-3 text-start font-medium">
                  {t("present")}
                </th>
                <th className="px-4 py-3 text-start font-medium">{t("short")}</th>
              </tr>
            </thead>
            <tbody>
              {summary.today.sites.map((s) => {
                const short = Math.max(0, s.required - s.present);
                return (
                  <tr key={s.id} className="border-b border-slate-100">
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {s.name}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{s.employees}</td>
                    <td className="px-4 py-3 text-slate-600">{s.required}</td>
                    <td className="px-4 py-3 text-slate-600">{s.present}</td>
                    <td className="px-4 py-3">
                      {short > 0 ? (
                        <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700">
                          {short}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
