"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import QRCode from "qrcode";
import { useTranslations } from "next-intl";
import { Badge, Btn, Card, EmptyState, Icon, PageHeader, Spinner } from "../../../_ui";

interface QrDto {
  siteId: string;
  siteName: string;
  token: string;
  expiresAt: string;
  checkinUrl: string;
  rotated: boolean;
}

interface Envelope { success: boolean; data?: unknown; error?: { message?: string } }

/** Per-site check-in QR: view, print for the site entrance, rotate on demand. */
export default function SiteQrPage({
  params: { locale, siteId },
}: {
  params: { locale: string; siteId: string };
}) {
  const t = useTranslations("operations");
  const tc = useTranslations("common");
  const [qr, setQr] = useState<QrDto | null>(null);
  const [dataUrl, setDataUrl] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (rotate = false) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/operations/qr/${siteId}${rotate ? "?rotate=1" : ""}`);
      const body = (await res.json()) as Envelope;
      if (!body.success || !body.data) throw new Error(body.error?.message ?? "error");
      const dto = body.data as QrDto;
      setQr(dto);
      setDataUrl(await QRCode.toDataURL(dto.checkinUrl, { width: 480, margin: 2 }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "error");
    } finally {
      setLoading(false);
    }
  }, [siteId]);

  useEffect(() => { load(); }, [load]);

  const validUntil = qr
    ? new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-GB", {
        day: "numeric", month: "long", hour: "2-digit", minute: "2-digit",
      }).format(new Date(qr.expiresAt))
    : "";

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <PageHeader
        title={t("qrCode")}
        subtitle={qr?.siteName}
        actions={
          <Link href={`/${locale}/dashboard/operations`}>
            <Btn variant="ghost">{tc("back")}</Btn>
          </Link>
        }
      />

      {loading && !qr ? (
        <div className="flex justify-center py-16"><Spinner className="h-8 w-8 text-blue-700" /></div>
      ) : error || !qr ? (
        <Card><EmptyState icon="x" title={t("loadError")} hint={error ?? undefined} /></Card>
      ) : (
        <>
          <Card className="text-center">
            <div className="mx-auto w-fit rounded-3xl border-4 border-slate-900 bg-white p-4">
              {dataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={dataUrl} alt="QR" width={320} height={320} className="h-80 w-80" />
              ) : (
                <Spinner className="h-10 w-10 text-slate-400" />
              )}
            </div>
            <h2 className="mt-4 text-xl font-extrabold text-slate-900">{qr.siteName}</h2>
            <p className="mt-1 text-sm text-slate-500 break-all" dir="ltr">{qr.checkinUrl}</p>
            <div className="mt-3 flex justify-center">
              <Badge tone="blue">{validUntil}</Badge>
            </div>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <Btn onClick={() => window.print()}>
                <Icon name="upload" className="h-4 w-4" />
                {locale === "ar" ? "طباعة" : "Print"}
              </Btn>
              <Btn variant="outline" onClick={() => load(true)} disabled={loading}>
                <Icon name="clock" className="h-4 w-4" />
                {locale === "ar" ? "كود جديد" : "New code"}
              </Btn>
            </div>
            <p className="mx-auto mt-4 max-w-md text-xs leading-relaxed text-slate-400">
              {locale === "ar"
                ? "اطبع الكود وعلّقه على مدخل الموقع — الحارس يمسحه بموبايله لتسجيل الدخول والخروج. الكود يتجدد تلقائيًا كل يوم."
                : "Print and post the code at the site entrance — guards scan it with their phones to check in/out. The code rotates automatically every day."}
            </p>
          </Card>
          <style>{`@media print { aside, header { display: none !important; } main { padding: 0 !important; } }`}</style>
        </>
      )}
    </div>
  );
}
