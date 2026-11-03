"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { nexusToast as toast } from "@/components/nexus-ui/feedback/nexus-toast";
import { showApiError } from "@/components/feedback/ApiErrorToast";
import { Button } from "@/components/ui/button";
import { useTagDeIdioma } from "@/hooks/i18n/useLocaleDeData";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";

/**
 * "Sincronizar agora" — o mesmo caminho do cron, com o resultado na tela.
 *
 * Não é um botão otimista: ele mostra quantas notas vieram, quantas
 * atualizaram, e quando a SEFAZ manda esperar (656) diz o horário da próxima
 * tentativa em vez de deixar o operador clicando até tomar bloqueio.
 */
export function BotaoSincronizar({ compacto = false }: { compacto?: boolean }) {
  const t = useT();
  const tagIdioma = useTagDeIdioma();
  const router = useRouter();
  const [rodando, setRodando] = React.useState(false);

  async function sincronizar() {
    setRodando(true);
    try {
      const corpo = await apiClient.post<{
        data: {
          novas: number;
          atualizadas: number;
          erros: number;
          aviso: string | null;
          cstat: string | null;
          proximaTentativa: string | null;
        };
      }>("/api/v1/fiscal-entradas", {});
      const d = corpo.data;
      toast.success(
        t(`${d.novas} nova(s), ${d.atualizadas} atualizada(s), ${d.erros} erro(s).`),
      );
      if (d.aviso === "AGUARDAR_1H" || d.cstat === "656") {
        const quando = d.proximaTentativa
          ? new Date(d.proximaTentativa).toLocaleTimeString(tagIdioma, {
              hour: "2-digit",
              minute: "2-digit",
            })
          : null;
        toast.warning(
          quando
            ? t(`A SEFAZ pediu para aguardar. Próxima tentativa a partir de ${quando}.`)
            : t("A SEFAZ pediu para aguardar cerca de 1 hora."),
        );
      }
      router.refresh();
    } catch (e) {
      showApiError(e);
    } finally {
      setRodando(false);
    }
  }

  return (
    <Button onClick={sincronizar} disabled={rodando} size={compacto ? "sm" : "default"}>
      {rodando ? t("Buscando na SEFAZ…") : t("Sincronizar agora")}
    </Button>
  );
}
