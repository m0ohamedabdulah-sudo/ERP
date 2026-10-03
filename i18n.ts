import { getRequestConfig } from "next-intl/server";
import { isLocale, routing } from "./i18n-routing";

export default getRequestConfig(async ({ requestLocale }) => {
  const locale = await requestLocale;
  if (!isLocale(locale)) {
    // next-intl types allow undefined; fall back to the default locale.
    const fallback = routing.defaultLocale;
    return {
      locale: fallback,
      messages: (await import(`./messages/${fallback}.json`)).default,
    };
  }
  return {
    locale,
    messages: (await import(`./messages/${locale}.json`)).default,
  };
});
