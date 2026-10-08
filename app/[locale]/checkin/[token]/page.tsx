"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Badge, Icon, Spinner } from "../../dashboard/_ui";

interface TokenInfo {
  valid: boolean;
  siteId: string;
  siteName: string;
  expiresAt: string;
}

interface CheckinData {
  checkinId: string;
  siteName: string;
  employeeName: string;
  cardNumber: string;
  checkedInAt: string;
  status?: "on-time" | "late" | "unscheduled";
  shiftName?: string | null;
  checkedOutAt?: string;
}

interface Envelope {
  success: boolean;
  data?: unknown;
  error?: { code?: string; message?: string };
}

type Phase =
  | { kind: "loading" }
  | { kind: "invalid" }
  | { kind: "form" }
  | { kind: "done"; action: "in" | "out"; data: CheckinData }
  | { kind: "error"; message: string };

/**
 * Public guard check-in page — opened by scanning the site QR.
 * Token-gated: no login required.
 */
export default function CheckinPage({
  params: { locale, token },
}: {
  params: { locale: string; token: string };
}) {
  const t = useTranslations("checkin");
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [siteName, setSiteName] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch(`/api/v1/operations/token/${token}`)
      .then(async (r) => {
        const body = (await r.json()) as Envelope;
        if (body.success && body.data) {
          const info = body.data as TokenInfo;
          setSiteName(info.siteName);
          setPhase({ kind: "form" });
        } else {
          setPhase({ kind: "invalid" });
        }
      })
      .catch(() => setPhase({ kind: "invalid" }));
  }, [token]);

  function errorMessage(code?: string): string {
    switch (code) {
      case "INVALID_QR_TOKEN": return t("invalidToken");
      case "EMPLOYEE_NOT_FOUND": return t("employeeNotFound");
      case "ALREADY_CHECKED_IN": return t("alreadyIn");
      case "NO_OPEN_CHECKIN": return t("noOpen");
      default: return t("tryAgain");
    }
  }

  async function submit(action: "in" | "out") {
    const card = cardNumber.trim();
    if (!card || busy) return;
    setBusy(true);
    try {
      const res = await fetch(
        action === "in" ? "/api/v1/operations/checkin" : "/api/v1/operations/checkout",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ qrToken: token, cardNumber: card }),
        },
      );
      const body = (await res.json()) as Envelope;
      if (body.success && body.data) {
        setPhase({ kind: "done", action, data: body.data as CheckinData });
      } else {
        setPhase({ kind: "error", message: errorMessage(body.error?.code) });
      }
    } catch {
      setPhase({ kind: "error", message: t("tryAgain") });
    } finally {
      setBusy(false);
    }
  }

  const otherLocale = locale === "ar" ? "en" : "ar";

  return (
    <main className="flex min-h-screen flex-col items-center bg-gradient-to-b from-slate-950 to-slate-900 px-4 py-8">
      <div className="flex w-full max-w-md items-center justify-between">
        <p className="text-[15px] font-extrabold tracking-tight text-white">
          Security <span className="text-blue-400">ERP</span>
        </p>
        <Link
          href={`/${otherLocale}/checkin/${token}`}
          className="rounded-xl border border-white/15 px-3 py-1.5 text-xs font-bold text-slate-300"
        >
          {otherLocale === "ar" ? "العربية" : "English"}
        </Link>
      </div>

      <div className="mt-8 w-full max-w-md">
        {phase.kind === "loading" && (
          <div className="flex flex-col items-center gap-3 py-20 text-slate-400">
            <Spinner className="h-10 w-10 text-blue-400" />
            <p className="text-sm">{t("loading")}</p>
          </div>
        )}

        {phase.kind === "invalid" && (
          <div className="rounded-3xl bg-white p-8 text-center shadow-2xl">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-100 text-rose-600">
              <Icon name="x" className="h-8 w-8" />
            </div>
            <p className="mt-4 text-lg font-extrabold text-slate-900">{t("invalidToken")}</p>
          </div>
        )}

        {phase.kind === "form" && (
          <div className="rounded-3xl bg-white p-6 shadow-2xl sm:p-8">
            <p className="text-center text-sm text-slate-500">{t("welcome")}</p>
            <h1 className="mt-1 text-center text-2xl font-extrabold text-slate-900">{siteName}</h1>

            <label className="mt-6 block text-sm font-bold text-slate-700">
              {t("cardNumber")}
              <input
                value={cardNumber}
                onChange={(e) => setCardNumber(e.target.value)}
                placeholder={t("cardNumberPh")}
                dir="ltr"
                inputMode="text"
                autoComplete="off"
                autoCapitalize="characters"
                className="mt-2 block w-full rounded-2xl border-2 border-slate-200 bg-slate-50 px-4 py-4 text-center font-mono text-lg font-bold tracking-wide text-slate-900 placeholder:font-sans placeholder:text-base placeholder:font-normal placeholder:text-slate-400 focus:border-blue-600 focus:bg-white focus:outline-none"
              />
            </label>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                onClick={() => submit("in")}
                disabled={busy || !cardNumber.trim()}
                className="rounded-2xl bg-emerald-600 px-4 py-5 text-lg font-extrabold text-white shadow-lg shadow-emerald-600/30 transition active:scale-[0.98] disabled:opacity-40"
              >
                {busy ? <Spinner className="mx-auto h-6 w-6" /> : t("checkIn")}
              </button>
              <button
                onClick={() => submit("out")}
                disabled={busy || !cardNumber.trim()}
                className="rounded-2xl border-2 border-rose-200 bg-rose-50 px-4 py-5 text-lg font-extrabold text-rose-700 transition active:scale-[0.98] disabled:opacity-40"
              >
                {busy ? <Spinner className="mx-auto h-6 w-6" /> : t("checkOut")}
              </button>
            </div>
          </div>
        )}

        {phase.kind === "done" && (
          <div className="rounded-3xl bg-white p-8 text-center shadow-2xl">
            <div className={`mx-auto flex h-16 w-16 items-center justify-center rounded-2xl ${phase.action === "in" ? "bg-emerald-100 text-emerald-600" : "bg-blue-100 text-blue-600"}`}>
              <Icon name="check" className="h-8 w-8" />
            </div>
            <p className="mt-4 text-lg font-extrabold text-slate-900">
              {phase.action === "in" ? t("successIn") : t("successOut")}
            </p>
            <p className="mt-1 text-[15px] font-semibold text-slate-600">{phase.data.employeeName}</p>
            <p className="font-mono text-xs text-slate-400" dir="ltr">{phase.data.cardNumber}</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {phase.data.shiftName && (
                <Badge tone="slate">{t("shift")}: {phase.data.shiftName}</Badge>
              )}
              {phase.data.status && (
                <Badge tone={phase.data.status === "on-time" ? "green" : phase.data.status === "late" ? "amber" : "blue"}>
                  {t(phase.data.status === "on-time" ? "onTime" : phase.data.status === "late" ? "late" : "unscheduled")}
                </Badge>
              )}
            </div>
            <button
              onClick={() => { setPhase({ kind: "form" }); setCardNumber(""); }}
              className="mt-6 w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm font-bold text-slate-600"
            >
              {t("tryAgain")}
            </button>
          </div>
        )}

        {phase.kind === "error" && (
          <div className="rounded-3xl bg-white p-8 text-center shadow-2xl">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-100 text-amber-600">
              <Icon name="x" className="h-8 w-8" />
            </div>
            <p className="mt-4 text-lg font-extrabold text-slate-900">{phase.message}</p>
            <button
              onClick={() => setPhase({ kind: "form" })}
              className="mt-6 w-full rounded-2xl bg-slate-900 px-4 py-3 text-sm font-bold text-white"
            >
              {t("tryAgain")}
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
