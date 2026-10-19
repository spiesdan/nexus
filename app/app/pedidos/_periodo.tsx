"use client";

/**
 * FILTRO POR PERÍODO — "todos os pedidos do dia 14/10".
 *
 * ═══ POR QUE UM COMPONENTE E NÃO DOIS `<input type="date">` AVULSOS ═════════
 *
 * Porque o pedido real não é "de 14/10 até 14/10" — é "o dia 14/10". E escrever
 * a mesma data nos dois campos é trabalho de quem opera, todo dia, com um erro
 * silencioso quando faz pela metade: `de` sozinho devolve do dia 14 em diante,
 * que parece um filtro e é outro filtro.
 *
 * Por isso o botão de um dia preenche **os dois** campos de uma vez, e é
 * através dele que o caso de uso chega.
 *
 * ═══ A DATA VAI CRUA, NÃO CONVERTIDA ═══════════════════════════════════════
 *
 * O campo carrega `2026-10-14` e a conversão para instante UTC acontece no
 * SERVIDOR (`lib/comercial/janela-do-dia.ts`), no fuso de quem pediu. Converter
 * aqui no navegador exigiria o fuso do cliente — e o dono muda de máquina, de
 * fuso e de horário de verão sem trocar de conta.
 *
 * ═══ OS ATALHOS ═══════════════════════════════════════════════════════════
 *
 * "Hoje" e "Ontem" porque são os dois dias que se imprimem — o lote do dia que
 * acabou de sair e o do dia anterior, quando o dono fecha o caixa. O par de
 * campos continua ali para o intervalo que ninguém nomeia.
 */
import * as React from "react";

import { useT } from "@/hooks/i18n/useT";

/** `YYYY-MM-DD` do dia, no fuso do navegador — para os atalhos e o botão do dia. */
export function hojeEmChave(offsetDias = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDias);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function FiltroPorPeriodo({
  de,
  ate,
  aoMudar,
}: {
  de: string;
  ate: string;
  aoMudar: (patch: { de?: string; ate?: string }) => void;
}) {
  const t = useT();

  // Atalhos que dependem do que JÁ está escolhido — o de "ayer" só faz sentido
  // se o filtro for o dia anterior ao que está na tela.
  const atalhos: { rotulo: string; dias: () => { de: string; ate: string } }[] = [
    { rotulo: t("Hoje"), dias: () => ({ de: hojeEmChave(0), ate: hojeEmChave(0) }) },
    { rotulo: t("Ontem"), dias: () => ({ de: hojeEmChave(-1), ate: hojeEmChave(-1) }) },
    {
      rotulo: t("Últimos 7 dias"),
      dias: () => ({ de: hojeEmChave(-6), ate: hojeEmChave(0) }),
    },
  ];

  return (
    // Rótulo colado no campo, e não "entre … e …": em 390px a frase quebrava
    // no meio, o "entre" ficava órfão no fim de uma linha e o segundo campo
    // desalinhava do primeiro. Com `<label>` de verdade cada campo diz o que é
    // — inclusive para o leitor de tela, que antes só tinha o `aria-label`.
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <label className="flex items-center gap-1.5">
        <span className="text-xs text-muted-foreground">{t("De")}</span>
        <input
          type="date"
          lang="pt-BR"
          value={de.slice(0, 10)}
          max={ate ? ate.slice(0, 10) : undefined}
          onChange={(e) => aoMudar({ de: e.target.value })}
          aria-label={t("De")}
          className="h-9 cursor-pointer rounded-md border border-input bg-surface px-2 text-sm"
        />
      </label>
      <label className="flex items-center gap-1.5">
        <span className="text-xs text-muted-foreground">{t("Até")}</span>
        <input
          type="date"
          lang="pt-BR"
          value={ate.slice(0, 10)}
          min={de ? de.slice(0, 10) : undefined}
          onChange={(e) => aoMudar({ ate: e.target.value })}
          aria-label={t("Até")}
          className="h-9 cursor-pointer rounded-md border border-input bg-surface px-2 text-sm"
        />
      </label>
      <span className="flex gap-1">
        {atalhos.map((a) => (
          <button
            key={a.rotulo}
            type="button"
            onClick={() => aoMudar(a.dias())}
            className="rounded-md px-1.5 py-0.5 text-xs font-semibold text-accent hover:underline"
          >
            {a.rotulo}
          </button>
        ))}
      </span>
    </div>
  );
}