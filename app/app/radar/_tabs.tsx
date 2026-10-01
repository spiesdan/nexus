"use client";
import * as React from "react";

import { useT } from "@/hooks/i18n/useT";
import { Button } from "@/components/ui/button";
import { RadarDashboard } from "./_components/RadarDashboard";
import { RecuperacaoLista } from "./_components/RecuperacaoLista";
import { NovosProspects } from "./_components/NovosProspects";

/**
 * Navegação por seções do Radar — página única, todo o conteúdo renderizado.
 *
 * Por que botões que rolam em vez de abas que trocam: os e2e `recompra-radar`,
 * `risk-radar` e `retorno-anti-morte` leem a lista clássica, os testids do
 * risco e o cabeçalho "Radar de risco" SEM clique intermediário. Esconder uma
 * seção atrás de aba quebraria os três; rolar até ela, não.
 *
 * A quarta seção é a antiga /app/recuperacao, movida para cá na fusão
 * (S100) — mesma razão: o conteúdo nasce visível e o botão só rola.
 * A quinta (Prospecção) nasceu na FASE 11 da spec 19 (§30): novos prospects
 * com as 3 ações — mesmo molde, conteúdo visível sem clique.
 */
const SECOES = [
  { id: "radar-visao", rotulo: "Visão geral" },
  { id: "radar-oportunidades", rotulo: "Recompra" },
  { id: "radar-demandas", rotulo: "Risco de demandas" },
  { id: "radar-recuperacao", rotulo: "Recuperação" },
  { id: "radar-prospeccao", rotulo: "Prospecção" },
] as const;

export function RadarTabs({
  temBase,
  podeOperar,
  usuarioId,
}: {
  temBase: boolean;
  /** agent+ (ou platform admin) — libera fila/conversa na seção de prospecção. */
  podeOperar: boolean;
  usuarioId: string;
}) {
  const t = useT();
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2" role="navigation" aria-label={t("Seções do radar")}>
        {SECOES.map((s) => (
          <Button
            key={s.id}
            size="sm"
            variant="outline"
            onClick={() => document.getElementById(s.id)?.scrollIntoView({ behavior: "smooth", block: "start" })}
          >
            {t(s.rotulo)}
          </Button>
        ))}
      </div>
      <div id="radar-visao" className="scroll-mt-20">
        <RadarDashboard />
      </div>
      <div id="radar-recuperacao" className="scroll-mt-20 space-y-3">
        <h2 className="text-base font-medium text-text">{t("Recuperação de clientes")}</h2>
        <RecuperacaoLista temBase={temBase} />
      </div>
      <NovosProspects podeOperar={podeOperar} usuarioId={usuarioId} />
    </div>
  );
}
