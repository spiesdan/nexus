"use client";

import { useState } from "react";

import { useT } from "@/hooks/i18n/useT";
import { useChangeSetor } from "@/hooks/team/useChangeSetor";

/**
 * Célula editável do ramal.
 *
 * Salva no blur/Enter (não a cada tecla: cada PATCH é auditoria
 * `team.setor_changed`, e auditoria por tecla seria spam de trilha).
 * Vazio limpa o ramal — e limpar desliga a assinatura, então o placeholder
 * diz isso em vez de só "digite".
 */
export function SetorCell({ userId, nome, setor, podeEditar }: {
  userId: string;
  nome: string;
  setor: string | null;
  podeEditar: boolean;
}) {
  const t = useT();
  const mudar = useChangeSetor();
  const [valor, setValor] = useState<string | null>(null);
  const visivel = valor ?? setor ?? "";

  if (!podeEditar) {
    return <span className="text-sm">{setor ?? "—"}</span>;
  }

  const salvar = () => {
    const limpo = visivel.trim();
    // Nada mudou: sem PATCH, sem auditoria à toa.
    if ((limpo === "" ? null : limpo) === setor) {
      setValor(null);
      return;
    }
    if (limpo !== "" && limpo.length < 2) {
      setValor(null);
      return;
    }
    mudar.mutate(
      { userId, setor: limpo === "" ? null : limpo },
      { onSettled: () => setValor(null) },
    );
  };

  return (
    <input
      className="w-[140px] rounded-md border border-border bg-surface px-2 py-1 text-sm"
      value={visivel}
      maxLength={60}
      placeholder={t("Ramal (ex.: Vendas)")}
      aria-label={`${t("Ramal de")} ${nome}`}
      disabled={mudar.isPending}
      onChange={(e) => setValor(e.target.value)}
      onBlur={() => salvar()}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") setValor(null);
      }}
    />
  );
}
