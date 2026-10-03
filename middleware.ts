import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n-routing";

export default createMiddleware(routing);

export const config = {
  // Match localized pages only — /api/* stays locale-free.
  matcher: ["/", "/(ar|en)/:path*"],
};
