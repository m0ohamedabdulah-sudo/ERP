/**
 * Thin HTTP adapter for the auth module: input parsing, cookie
 * handling, response formatting. No business logic and no Prisma here.
 */
import { cookies } from "next/headers";
import { ok, ApiError } from "../../lib/api-response";
import { getActor, ACCESS_COOKIE, REFRESH_COOKIE } from "../../lib/auth";
import { ACCESS_TTL_SECONDS, REFRESH_TTL_SECONDS } from "../../lib/jwt";
import { prisma } from "../../lib/prisma";
import { loginSchema, setupSchema } from "./auth.schema";
import {
  login as loginService,
  logout as logoutService,
  refresh as refreshService,
  setup as setupService,
  isSetupNeeded,
} from "./auth.service";

function cookieAttrs(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

function setSessionCookies(accessToken: string, refreshToken: string): void {
  const jar = cookies();
  jar.set(ACCESS_COOKIE, accessToken, cookieAttrs(ACCESS_TTL_SECONDS));
  jar.set(REFRESH_COOKIE, refreshToken, cookieAttrs(REFRESH_TTL_SECONDS));
}

function clearSessionCookies(): void {
  const jar = cookies();
  jar.set(ACCESS_COOKIE, "", { ...cookieAttrs(0), maxAge: 0 });
  jar.set(REFRESH_COOKIE, "", { ...cookieAttrs(0), maxAge: 0 });
}

export async function login(req: Request): Promise<Response> {
  const input = loginSchema.parse(await req.json());
  const result = await loginService(req, input);
  setSessionCookies(result.accessToken, result.refreshToken);
  return ok({ user: result.user });
}

export async function logout(req: Request): Promise<Response> {
  await logoutService(req);
  clearSessionCookies();
  return ok({ loggedOut: true });
}

export async function refresh(req: Request): Promise<Response> {
  const result = await refreshService(req);
  setSessionCookies(result.accessToken, result.refreshToken);
  return ok({ user: result.user });
}

export async function me(req: Request): Promise<Response> {
  const actor = await getActor(req);
  if (!actor?.userId) {
    throw new ApiError("UNAUTHENTICATED", "Authentication required", 401);
  }
  const user = await prisma.user.findUnique({
    where: { id: actor.userId },
    select: { id: true, email: true, fullName: true },
  });
  if (!user) throw new ApiError("UNAUTHENTICATED", "Authentication required", 401);
  return ok({
    user: {
      ...user,
      role: actor.role,
      permissions: actor.permissions,
    },
  });
}

export async function setupStatus(): Promise<Response> {
  return ok({ setupNeeded: await isSetupNeeded() });
}

export async function setup(req: Request): Promise<Response> {
  const input = setupSchema.parse(await req.json());
  const user = await setupService(req, input);
  return ok({ user }, undefined, 201);
}
