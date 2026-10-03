import { useTranslations } from "next-intl";
import Link from "next/link";
import { isLocale } from "../../i18n-routing";

/**
 * Minimal Phase 0 home page — proves [locale] routing, RTL/LTR, and the
 * dictionary pipeline work. Module admin UIs land in later phases;
 * the API is the contract for now (docs/API.md).
 */
export default function HomePage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  const t = useTranslations("home");
  const common = useTranslations("common");
  const other: "ar" | "en" = isLocale(locale) && locale === "ar" ? "en" : "ar";

  const modules = [
    {
      href: `/${locale}/clients`,
      title: t("clientsTitle"),
      desc: t("clientsDesc"),
    },
    {
      href: `/${locale}/contracts`,
      title: t("contractsTitle"),
      desc: t("contractsDesc"),
    },
    {
      href: `/${locale}/invoices`,
      title: t("invoicesTitle"),
      desc: t("invoicesDesc"),
    },
  ];

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <header className="flex items-start justify-between gap-6">
        <div>
          <p className="text-sm font-medium text-slate-500">
            {common("appName")}
          </p>
          <h1 className="mt-2 text-3xl font-bold">{t("title")}</h1>
          <p className="mt-3 max-w-2xl text-slate-600">{t("subtitle")}</p>
        </div>
        <Link
          href={`/${other}`}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-100"
        >
          {common("language")}: {common("locales." + other)}
        </Link>
      </header>

      <section className="mt-10">
        <h2 className="text-xl font-semibold">{t("modulesTitle")}</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          {modules.map((m) => (
            <div
              key={m.href}
              className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <h3 className="font-semibold">{m.title}</h3>
              <p className="mt-2 text-sm text-slate-600">{m.desc}</p>
            </div>
          ))}
        </div>
        <p className="mt-6 text-sm text-slate-500">{t("phaseNote")}</p>
      </section>
    </main>
  );
}
