"use client";

import { useState } from "react";

import { useT } from "@/hooks/i18n/useT";
import { useChangeNome } from "@/hooks/team/useChangeNome";

/**
 * Célula editável do nome de exibição.
 *
 * É o nome que a Equipe lista, o inbox mostra e a assinatura usa — um nome
 * só, em todo lugar. Salva no blur/Enter (cada PATCH é auditoria
 * `team.nome_changed`).
 */
export function NomeCell({
  userId,
  nome,
  email,
  podeEditar,
}: {
  userId: string;
  nome: string | null;
  email: string | null;
  podeEditar: boolean;
}) {
  const t = useT();
  const mudar = useChangeNome();
  const [valor, setValor] = useState<string | null>(null);
  const visivel = valor ?? nome ?? "";

  if (!podeEditar) {
    return <span className="text-sm font-medium">{nome ?? email ?? "—"}</span>;
  }

  const salvar = () => {
    const limpo = visivel.trim();
    if (limpo === (nome ?? "")) {
      setValor(null);
      return;
    }
    if (limpo.length < 2) {
      setValor(null);
      return;
    }
    mudar.mutate({ userId, nome: limpo }, { onSettled: () => setValor(null) });
  };

  return (
    <input
      className="w-[160px] rounded-md border border-border bg-surface px-2 py-1 text-sm font-medium"
      value={visivel}
      maxLength={80}
      placeholder={t("Nome (ex.: Ana)")}
      aria-label={t("Nome de exibição")}
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
