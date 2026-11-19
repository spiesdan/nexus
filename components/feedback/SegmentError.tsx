"use client";

import { useEffect, useState } from "react";
import { useT } from "@/hooks/i18n/useT";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { copyToClipboard } from "@/lib/clipboard";

export interface SegmentErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
  segment?: string;
}

export function SegmentError({ error, reset, segment }: SegmentErrorProps) {
  const t = useT();
  const [eventId, setEventId] = useState<string | undefined>(undefined);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let vivo = true;
    // Mesmo motivo do global-error: o boundary está no grafo de toda rota; o
    // SDK só é buscado quando há erro de verdade.
    void import("@sentry/nextjs")
      .then((Sentry) => {
        if (!vivo) return;
        setEventId(Sentry.captureException(error, { tags: segment ? { segment } : undefined }));
      })
      .catch(() => {
        // sem chunk, o ID cai no `error.digest`.
      });
    return () => {
      vivo = false;
    };
  }, [error, segment]);

  const displayId = eventId ?? error.digest ?? "—";

  function copyId() {
    void copyToClipboard(displayId).then((ok) => {
      if (ok) {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    });
  }

  return (
    <main className="flex min-h-[60vh] items-center justify-center p-8">
      <Card className="hover-raise w-full max-w-md p-8 text-center">
        <h1 className="text-xl font-semibold">{t("Algo deu errado")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("Tente novamente em instantes. Se persistir, contate o suporte com o ID abaixo.")}
        </p>
        <div className="mt-4 break-all rounded-md bg-muted px-3 py-2 font-mono text-xs">
          ID: {displayId}
        </div>
        <div className="mt-4 flex justify-center gap-2">
          <Button type="button" variant="outline" onClick={copyId}>
            {copied ? t("Copiado!") : t("Copiar ID")}
          </Button>
          <Button type="button" onClick={() => reset()}>
            {t("Tentar de novo")}
          </Button>
        </div>
      </Card>
    </main>
  );
}
