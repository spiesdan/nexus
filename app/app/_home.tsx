"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";

import { BrainRecomendacoes } from "@/components/nexus-ui/intelligence/BrainRecomendacoes";
import { CrmSalesChart } from "@/components/nexus-ui/crm/crm-sales-chart";
import { NexusKpi, NexusKpiGrid } from "@/components/nexus-ui/kpi/nexus-kpi";
import { Card } from "@/components/ui/card";
import { showApiError } from "@/components/feedback/ApiErrorToast";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import { comoMoeda } from "@/lib/format/moeda";
import { atualizarQueryDaUrl } from "@/lib/navigation/shallow";
import { NAV_DESTINATIONS } from "@/lib/navigation/registry";
import { deslocarMes } from "@/lib/comercial/visao-do-mes";
import { ClientesParaAgir, SalesRadar, SalesRoadmap } from "./_home-secoes";
import { Atividade } from "./indicadores/_atividade";

export interface DadosDashboard {
  nome: string | null;
  hora: number;
  mes: string;
  mesAtual: string;
  ehMesAtual: boolean;
  rotuloMes: string;
  diaHoje: number;
  serie: {
    dia: number;
    vendaAc: number;
    metaAc: number | null;
    projecao: number | null;
    mesAnt: number | null;
    mesAno: number | null;
  }[];
  vendidoMes: number;
  qtdMes: number;
  vendidoHoje: number;
  objetivo: number | null;
  pctObjetivo: number | null;
  necessarioDia: number | null;
  diasUteisRestantes: number;
  previsaoMes: number;
  cortado: boolean;
}

/**
 * Só o que MUDA com o mês — o contrato de `GET /api/v1/home/mes`. `nome` e
 * `hora` (o cumprimento) não têm o que ver com a troca, e por isso ficam de
 * fora: o fetch do seletor não tem por que reenviá-los.
 */
export type DadosDoMes = Omit<DadosDashboard, "nome" | "hora">;

function brl(cents: number): string {
  return comoMoeda(cents, "BRL");
}

// Acesso rápido: o uso diário, na ordem que o dia acontece. Ícones, rótulos e
// descrições vêm do `NAV_DESTINATIONS` — a fonte única —, não duplicados aqui.
const ATALHOS = ["/app/inbox", "/app/radar", "/app/indicadores", "/app/financeiro", "/app/pedidos", "/app/contacts"];

export function DashboardHome(inicial: DadosDashboard) {
  const t = useT();

  /**
   * O MÊS vive AQUI, em estado local — a página entrega o primeiro render
   * (deep-link `?mes=` honrado) e, a partir daí, o seletor de "Evolução de
   * Vendas" troca o agregado por `GET /api/v1/home/mes` + `replaceState`,
   * sem refetch do RSC do /app. O clique antigo (`router.push(?mes=)`) custava
   * ~2s em produção (auditoria de 2026-09-30) porque recomputava o dashboard
   * inteiro no servidor a cada seta.
   */
  const [dados, setDados] = useState(inicial);
  const [carregandoMes, setCarregandoMes] = useState(false);
  const [mesNavegado, setMesNavegado] = useState(false);
  const buscandoMes = useRef(false);

  /**
   * O COMPARAR da legenda vive aqui como nos Indicadores: a alavanca é do
   * painel direito do gráfico, e ela é que deixa "Mês passado"/"Ano passado"
   * desenháveis (clicar num desses itens com ela desligada acende a
   * comparação — regra do próprio gráfico). Sobrevive à troca de mês, porque
   * é preferência de tela, não dado do mês.
   */
  const [comparar, setComparar] = useState(false);

  const navegarMes = useCallback(
    async (delta: number) => {
      if (buscandoMes.current) return;
      const prox = deslocarMes(dados.mes, delta);
      // Trava do futuro, a mesma do gráfico: mês ainda não vivido = série vazia.
      if (prox > dados.mesAtual) return;
      buscandoMes.current = true;
      setCarregandoMes(true);
      try {
        const corpo = await apiClient.get<{ data: DadosDoMes }>(
          `/api/v1/home/mes?mes=${encodeURIComponent(prox)}`,
        );
        const novo = corpo.data;
        setDados((d) => ({ ...d, ...novo }));
        setMesNavegado(true);
        atualizarQueryDaUrl((q) => {
          if (novo.mes === novo.mesAtual) q.delete("mes");
          else q.set("mes", novo.mes);
        });
      } catch (e) {
        showApiError(e);
      } finally {
        buscandoMes.current = false;
        setCarregandoMes(false);
      }
    },
    [dados.mes, dados.mesAtual],
  );

  const cumprimento =
    dados.hora >= 5 && dados.hora < 12 ? t("Bom dia") : dados.hora >= 12 && dados.hora < 18 ? t("Boa tarde") : t("Boa noite");
  const primeiro = dados.nome?.trim().split(/\s+/)[0];
  const ticket = dados.qtdMes > 0 ? dados.vendidoMes / dados.qtdMes : null;

  const atalhos = ATALHOS
    .map((href) => NAV_DESTINATIONS.find((d) => d.href === href))
    .filter((d) => d !== undefined);

  return (
    <div className="space-y-4 p-4 sm:space-y-6 sm:p-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {cumprimento}
          {primeiro ? `, ${primeiro}` : ""}.
        </h1>
        <p className="text-sm text-muted-foreground">
          {t("Visão geral do mês")} · {dados.rotuloMes}
        </p>
      </div>

      <NexusKpiGrid>
        <NexusKpi
          label={t("Vendido hoje")}
          value={brl(dados.vendidoHoje)}
          comparison={t("hoje")}
        />
        <NexusKpi
          label={t("Vendido no mês")}
          value={brl(dados.vendidoMes)}
          comparison={ticket != null ? t("ticket médio") + " " + brl(Math.round(ticket)) : undefined}
        />
        <NexusKpi
          label={t("Meta do mês")}
          value={dados.objetivo != null ? brl(dados.objetivo) : "—"}
          variation={dados.objetivo != null && dados.pctObjetivo != null ? `${dados.pctObjetivo.toFixed(1)}%` : undefined}
          trend={(dados.pctObjetivo ?? 0) >= 100 ? "up" : "down"}
          comparison={dados.necessarioDia != null ? brl(Math.round(dados.necessarioDia)) + " " + t("por dia útil") : undefined}
        />
        <NexusKpi
          label={t("Previsão de fechamento")}
          value={brl(dados.previsaoMes)}
          comparison={`${dados.diasUteisRestantes} ${t("dias úteis")}`}
        />
      </NexusKpiGrid>

      {(dados.serie.length > 0 || mesNavegado) && (
        <CrmSalesChart
          pontos={dados.serie.map((s) => ({
            dia: s.dia,
            vendidoAc: s.vendaAc,
            metaAc: s.metaAc,
            projecao: s.projecao,
            mesAnt: s.mesAnt,
            mesAno: s.mesAno,
          }))}
          metaAc={dados.objetivo ?? 0}
          projecao={dados.serie[dados.serie.length - 1]?.projecao ?? 0}
          previsaoMes={dados.previsaoMes}
          mes={dados.mes}
          diaHoje={dados.diaHoje}
          vendidoMes={dados.vendidoMes}
          vendidoHoje={dados.vendidoHoje}
          objetivo={dados.objetivo}
          pctObjetivo={dados.pctObjetivo}
          necessarioDia={dados.necessarioDia}
          diasUteisRestantes={dados.diasUteisRestantes}
          ehMesAtual={dados.ehMesAtual}
          mesAtual={dados.mesAtual}
          comparar={{ ativo: comparar, onToggle: () => setComparar((v) => !v) }}
          onNavegarMes={navegarMes}
          carregando={carregandoMes}
        />
      )}

      <ClientesParaAgir />

      <SalesRoadmap />

      <SalesRadar />

      <BrainRecomendacoes />

      <section aria-label={t("Acesso rápido")}>
        <h2 className="mb-3 text-sm font-semibold tracking-wide text-foreground">{t("Acesso rápido")}</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {atalhos.map((item) => {
            if (!item) return null;
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href} className="block">
                <Card className="hover-raise flex h-full gap-3 p-4 transition-colors hover:border-border-strong">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-soft">
                    <Icon size={20} weight="regular" aria-hidden className="text-accent" />
                  </span>
                  <div>
                    <h3 className="text-sm font-medium text-foreground">{t(item.label)}</h3>
                    <p className="mt-1 text-xs text-muted-foreground">{t(item.description)}</p>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      </section>

      <div>
        <Atividade />
      </div>

      {dados.cortado && (
        <p className="text-xs text-muted-foreground">
          {t("Janela limitada a 5 mil linhas — os totais consideram o período cortado.")}
        </p>
      )}
    </div>
  );
}