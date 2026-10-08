import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n-routing";
// Edge-safe: lib/jwt only depends on `jose`. Do NOT import lib/auth here
// (it pulls in PrismaClient, which cannot run at the edge).
import { verifyAccessToken } from "./lib/jwt";

const intlMiddleware = createMiddleware(routing);

const ACCESS_COOKIE = "er_access";

// Pages that never require a session.
const PUBLIC_PATHS = [
  /^\/login\/?$/,
  /^\/setup\/?$/,
  /^\/[^/]+\/login\/?$/,
  /^\/[^/]+\/setup\/?$/,
  // Token-gated guard check-in page (the QR token is the gate).
  /^\/[^/]+\/checkin(\/.*)?\/?$/,
];

async function hasValidSession(req: NextRequest): Promise<boolean> {
  const token = req.cookies.get(ACCESS_COOKIE)?.value;
  if (!token) return false;
  try {
    await verifyAccessToken(token);
    return true;
  } catch {
    return false;
  }
}

export default async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (!PUBLIC_PATHS.some((re) => re.test(pathname))) {
    if (!(await hasValidSession(req))) {
      const segments = pathname.split("/");
      const maybeLocale = segments[1];
      const locale =
        maybeLocale === "ar" || maybeLocale === "en"
          ? maybeLocale
          : routing.defaultLocale;
      const url = req.nextUrl.clone();
      url.pathname = `/${locale}/login`;
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }
  }

  return intlMiddleware(req);
}

export const config = {
  // Match localized pages only — /api/* stays locale-free.
  matcher: ["/", "/(ar|en)/:path*"],
};
