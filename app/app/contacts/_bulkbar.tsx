"use client";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { useT } from "@/hooks/i18n/useT";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { apiClient } from "@/lib/api/client";

/** O tipo vem da ROTA, não é redigitado aqui. */
export type { BulkTagResult } from "@/app/api/v1/contacts/bulk-tag/route";
import type { BulkTagResult } from "@/app/api/v1/contacts/bulk-tag/route";

/**
 * Barra de ações em massa (§22): etiqueta até 50 clientes de uma vez.
 * O servidor ignora anonimizados (LGPD) e ausentes sem abortar o lote —
 * o resumo volta na resposta e aparece no toast.
 */
export function BulkTagBar({
  selecionados,
  onLimpar,
}: {
  selecionados: string[];
  onLimpar: () => void;
}) {
  const t = useT();
  const qc = useQueryClient();
  const [tag, setTag] = useState("");
  const [modo, setModo] = useState<"add" | "remove">("add");
  const [busy, setBusy] = useState(false);

  async function aplicar() {
    const nome = tag.trim();
    if (!nome || selecionados.length === 0 || busy) return;
    setBusy(true);
    try {
      const r = await apiClient.post<{ data: BulkTagResult }>("/api/v1/contacts/bulk-tag", {
        ids: selecionados.slice(0, 50),
        tags: [nome],
        modo,
      });
      const d = r.data;
      await qc.invalidateQueries({ queryKey: ["contacts"] });
      const partes = [`${d.atualizados.length} ${t("atualizados")}`];
      if (d.ignorados_anonimizados.length > 0) {
        partes.push(`${d.ignorados_anonimizados.length} ${t("ignorados (anonimizados)")}`);
      }
      if (d.nao_encontrados.length > 0) {
        partes.push(`${d.nao_encontrados.length} ${t("não encontrados")}`);
      }
      toast.success(`${t("Etiquetas aplicadas")}: ${partes.join(", ")}.`);
      setTag("");
      onLimpar();
    } catch {
      toast.error(t("Não foi possível aplicar as etiquetas."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="hover-raise flex flex-col gap-2 p-3 sm:flex-row sm:items-center">
      <p className="text-sm font-medium text-text">
        {selecionados.length} {selecionados.length === 1 ? t("selecionado") : t("selecionados")}
      </p>
      <div className="flex gap-1" role="group" aria-label={t("Modo")}>
        <Button variant={modo === "add" ? "primary" : "outline"} size="sm" onClick={() => setModo("add")}>
          {t("Adicionar")}
        </Button>
        <Button variant={modo === "remove" ? "primary" : "outline"} size="sm" onClick={() => setModo("remove")}>
          {t("Remover")}
        </Button>
      </div>
      <Input
        value={tag}
        onChange={(e) => setTag(e.target.value)}
        placeholder={t("Nome da etiqueta…")}
        className="h-9 sm:w-56"
        maxLength={60}
        onKeyDown={(e) => {
          if (e.key === "Enter") void aplicar();
        }}
      />
      <div className="flex gap-2">
        <Button size="sm" onClick={() => void aplicar()} disabled={busy || tag.trim().length === 0}>
          {busy ? t("Aplicando…") : t("Aplicar")}
        </Button>
        <Button variant="ghost" size="sm" onClick={onLimpar}>
          {t("Limpar seleção")}
        </Button>
      </div>
    </Card>
  );
}
