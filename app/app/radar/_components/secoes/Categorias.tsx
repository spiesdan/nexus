"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useT } from "@/hooks/i18n/useT";
import { useAtRiskLeads } from "@/hooks/leads/useAtRiskLeads";
import { filtrarLinhas } from "@/lib/comercial/radar-score";

import {
  useCriarTarefaDoRadar,
  useLinhasDoRadar,
  useRadarDados,
  useVendedoresDoRadar,
} from "../../_dados";
import { FiltrosDoRadar } from "../FiltrosDoRadar";
import { RadarCategorias } from "../RadarCategorias";
import { paraLinha, zapHref } from "../comum";

/**
 * AS CATEGORIAS — o board de trabalho: risco, recompra, oportunidade,
 * follow-up, perda e cobrança, cada um com a próxima ação.
 *
 * É a tela que responde "quem eu contato agora, e por quê". O recorte da visão
 * geral vale aqui — filtrar "Joinville" e vir para cá mostra a cidade, não a
 * carteira inteira — e a barra fica visível para a pessoa saber sob que
 * recorte está olhando.
 */
export function CategoriasDoRadar() {
  const t = useT();
  const { filtros } = useRadarDados();
  const { linhas, falhou, recarregar } = useLinhasDoRadar();
  const vendedores = useVendedoresDoRadar();
  const { data: risco } = useAtRiskLeads();
  const { criarTarefa, tarefaEmCurso } = useCriarTarefaDoRadar();

  const linhasRadar = React.useMemo(() => (linhas ?? []).map(paraLinha), [linhas]);
  const filtradas = React.useMemo(
    () => filtrarLinhas(linhasRadar, filtros),
    [linhasRadar, filtros],
  );
  const nomesVendedores = React.useMemo(
    () => new Map(vendedores.map((v) => [v.user_id, v.full_name ?? v.user_id.slice(0, 8)])),
    [vendedores],
  );

  if (linhas === null) {
    if (falhou) {
      return (
        <Card className="hover-raise p-8 text-center">
          <p className="font-medium">{t("Não consegui ler os pedidos.")}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("Verifique a conexão e tente de novo.")}
          </p>
          <Button className="mt-4" onClick={recarregar}>
            {t("Tentar novamente")}
          </Button>
        </Card>
      );
    }
    return (
      <div className="space-y-3" aria-live="polite">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <FiltrosDoRadar linhas={linhasRadar} vendedores={vendedores} onAtualizar={recarregar} />
      <RadarCategorias
        linhas={filtradas}
        nomesVendedores={nomesVendedores}
        risco={risco}
        montarZap={zapHref}
        onCriarTarefa={(l) => void criarTarefa(l)}
        tarefaEmCurso={tarefaEmCurso}
      />
    </div>
  );
}
