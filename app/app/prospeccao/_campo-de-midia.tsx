"use client";

/**
 * O CAMPO DE UM SLOT DE MÍDIA — link público OU arquivo enviado.
 *
 * O valor que a campanha guarda é estável (`bucket://whatsapp-media/…`), e a
 * URL assinada nasce só na hora do envio — campanha dura semanas e link
 * assinado vence. Ver `lib/channels/templates/midia.ts`.
 *
 * Colar um link `https://` continua valendo: quem já hospeda a imagem num CDN
 * não precisa subir nada.
 */
import * as React from "react";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { nexusToast as toast } from "@/components/nexus-ui/feedback/nexus-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useT } from "@/hooks/i18n/useT";
import { ApiError, type ApiErrorBody } from "@/lib/api/types";
import { caminhoDaReferencia } from "@/lib/channels/templates/midia";

const FORMATOS: Record<string, { accept: string; dica: string }> = {
  image: { accept: "image/jpeg,image/png", dica: "JPG ou PNG, até 5 MB." },
  video: { accept: "video/mp4", dica: "MP4, até 16 MB." },
  document: { accept: "application/pdf", dica: "PDF, até 20 MB." },
};

export function CampoDeMidia({
  id,
  expects,
  valor,
  onChange,
}: {
  id: string;
  expects: string;
  valor: string;
  onChange: (valor: string) => void;
}) {
  const t = useT();
  const [enviando, setEnviando] = React.useState(false);
  const arquivoRef = React.useRef<HTMLInputElement | null>(null);
  const formato = FORMATOS[expects] ?? FORMATOS.image!;
  const referencia = caminhoDaReferencia(valor);
  const linkPublico = valor.trim().startsWith("https://");

  async function enviar(file: File) {
    setEnviando(true);
    try {
      const form = new FormData();
      form.append("file", file, file.name);
      const res = await fetch("/api/v1/prospecting/campaigns/midia", {
        method: "POST",
        body: form,
      });
      const json = (await res.json()) as Partial<ApiErrorBody> & {
        data?: { referencia?: string };
      };
      if (!res.ok || !json.data?.referencia) {
        const e = json.error;
        throw new ApiError(
          res.status,
          e?.code ?? "upload_failed",
          e?.details,
          e?.request_id ?? "",
          e?.message,
        );
      }
      onChange(json.data.referencia);
      toast.success(t("Arquivo enviado. Ele será usado em todos os envios desta campanha."));
    } catch (e) {
      showApiError(e);
    } finally {
      setEnviando(false);
      if (arquivoRef.current) arquivoRef.current.value = "";
    }
  }

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-2">
        <Input
          id={id}
          value={valor}
          onChange={(e) => onChange(e.target.value)}
          placeholder={t("https://… ou envie um arquivo")}
          maxLength={4000}
          className="min-w-48 flex-1"
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={enviando}
          onClick={() => arquivoRef.current?.click()}
        >
          {enviando ? t("Enviando…") : t("Enviar arquivo")}
        </Button>
        <input
          ref={arquivoRef}
          type="file"
          accept={formato.accept}
          className="hidden"
          aria-label={t("Escolher arquivo do computador")}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void enviar(file);
          }}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        {referencia
          ? t("Arquivo enviado — o link é renovado automaticamente em cada envio.")
          : linkPublico
            ? t("Link público será baixado pela Meta no envio.")
            : t(`Use um link https:// público ou envie um arquivo. ${formato.dica}`)}
      </p>
    </div>
  );
}
