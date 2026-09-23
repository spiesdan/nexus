"use client";

import Link from "next/link";

import { CrmSalesChart } from "@/components/uimaxxing/crm/crm-sales-chart";
import { CrmKpi, CrmKpiGrid } from "@/components/uimaxxing/crm/crm-kpi";
import { Card } from "@/components/ui/card";
import { useT } from "@/hooks/i18n/useT";
import { comoMoeda } from "@/lib/format/moeda";
import { NAV_DESTINATIONS } from "@/lib/navigation/registry";
import { Atividade } from "./indicadores/_atividade";

export interface DadosDashboard {
  nome: string | null;
  hora: number;
  mes: string;
  rotuloMes: string;
  serie: { dia: number; vendaAc: number; metaAc: number | null; projecao: number | null }[];
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

function brl(cents: number): string {
  return comoMoeda(cents, "BRL");
}

// Acesso rápido: o uso diário, na ordem que o dia acontece. Ícones, rótulos e
// descrições vêm do `NAV_DESTINATIONS` — a fonte única —, não duplicados aqui.
const ATALHOS = ["/app/inbox", "/app/radar", "/app/indicadores", "/app/financeiro", "/app/pedidos", "/app/contacts"];

export function DashboardHome(dados: DadosDashboard) {
  const t = useT();
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

      <CrmKpiGrid>
        <CrmKpi
          label={t("Vendido hoje")}
          value={brl(dados.vendidoHoje)}
          comparison={t("hoje")}
        />
        <CrmKpi
          label={t("Vendido no mês")}
          value={brl(dados.vendidoMes)}
          comparison={ticket != null ? t("ticket médio") + " " + brl(Math.round(ticket)) : undefined}
        />
        <CrmKpi
          label={t("Meta do mês")}
          value={dados.objetivo != null ? brl(dados.objetivo) : "—"}
          variation={dados.objetivo != null && dados.pctObjetivo != null ? `${dados.pctObjetivo.toFixed(1)}%` : undefined}
          trend={(dados.pctObjetivo ?? 0) >= 100 ? "up" : "down"}
          comparison={dados.necessarioDia != null ? brl(Math.round(dados.necessarioDia)) + " " + t("por dia útil") : undefined}
        />
        <CrmKpi
          label={t("Previsão de fechamento")}
          value={brl(dados.previsaoMes)}
          comparison={`${dados.diasUteisRestantes} ${t("dias úteis")}`}
        />
      </CrmKpiGrid>

      {dados.serie.length > 0 && (
        <CrmSalesChart
          pontos={dados.serie.map((s) => ({
            dia: s.dia,
            vendidoAc: s.vendaAc,
            metaAc: s.metaAc,
            projecao: s.projecao,
          }))}
          metaAc={dados.objetivo ?? 0}
          projecao={dados.serie[dados.serie.length - 1]?.projecao ?? 0}
          previsaoMes={dados.previsaoMes}
        />
      )}

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
          {t("Janela limitada a 25 mil linhas — os totais consideram o período cortado.")}
        </p>
      )}
    </div>
  );
}