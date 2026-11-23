"use client";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { comoMoeda } from "@/lib/format/moeda";
import type { CustoDeProvider } from "@/lib/prospeccao/custos";
import {
  faixaProspeccao,
  guardOrcamento,
  simulacaoMidia,
  type LiberacaoDeOrcamento,
} from "@/lib/prospeccao/simulacao-gastos";

/**
 * A SIMULAÇÃO AO LADO DO NÚMERO — premissas visíveis, nunca número órfão.
 *
 * A faixa de prospecção e a estimativa de mídia usam as funções puras de
 * `lib/prospeccao/simulacao-gastos`. O gasto de mídia é LANÇAMENTO MANUAL até
 * existir Marketing API: a tela diz isso em toda renderização, inclusive quando
 * o valor é zero.
 */
export function SimulacaoDeGastosCard({
  celulas,
  custo,
  verbaCents,
  cpm,
  ctr,
  gastoCents,
  limiteCents,
  liberacao,
}: {
  celulas: number;
  custo: CustoDeProvider;
  verbaCents: number;
  cpm?: number | null;
  ctr?: number | null;
  gastoCents: number;
  limiteCents: number | null;
  liberacao?: LiberacaoDeOrcamento | null;
}) {
  const faixa = faixaProspeccao({ celulas, custo });
  const midia = simulacaoMidia({ verbaCents, cpm, ctr });
  const guarda = guardOrcamento({ gastoCents, limiteCents, liberacao });

  return (
    <Card className="space-y-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-semibold">Simulação de gastos</p>
        <Badge variant={guarda.estado === "bloqueio" ? "destructive" : "outline"}>
          {guarda.estado === "bloqueio"
            ? "bloqueio"
            : guarda.estado === "aviso" || guarda.estado === "reducao"
              ? "atenção"
              : "ok"}
        </Badge>
      </div>

      <dl className="grid gap-2 text-sm">
        <div>
          <dt className="text-xs text-muted-foreground">Prospecção — células estimadas: {celulas}</dt>
          <dd>
            mínimo {comoMoeda(faixa.minimo, "BRL")} · esperado {comoMoeda(faixa.esperado, "BRL")} ·
            máximo {comoMoeda(faixa.maximo, "BRL")}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Mídia Meta — estimativa</dt>
          <dd>
            ≈ {midia.impressoes.toLocaleString("pt-BR")} impressões ·{" "}
            {midia.cliques.toLocaleString("pt-BR")} cliques
          </dd>
        </div>
      </dl>

      <ul className="space-y-1 text-xs text-muted-foreground">
        <li>Premissa de custo: busca {custo.busca}¢ + detalhe {custo.detalhe}¢ por célula.</li>
        {midia.premissas.map((premissa) => (
          <li key={premissa}>{premissa}</li>
        ))}
        <li>Gasto de mídia é LANÇAMENTO MANUAL até existir Marketing API — nada é importado ou inferido.</li>
      </ul>

      <p className="text-xs">
        Orçamento da organização: {guarda.pct}% · {guarda.proximoPasso}
        {guarda.liberado ? " (override de gerente auditado)" : ""}
      </p>
    </Card>
  );
}
