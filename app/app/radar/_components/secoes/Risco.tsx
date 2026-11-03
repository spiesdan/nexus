"use client";

import { useT } from "@/hooks/i18n/useT";
import { useAtRiskLeads } from "@/hooks/leads/useAtRiskLeads";

import { RiskRadarList } from "../RiskRadarList";

/**
 * O RISCO — as demandas abertas que esfriaram.
 *
 * É a tela da promessa do Radar: nenhuma demanda morre sem resposta. A lista
 * (e o assumir a demanda) vive no componente de sempre; aqui ficam o título
 * que a operação procura e a contagem que diz se há trabalho.
 */
export function RiscoDoRadar() {
  const t = useT();
  const { data: risco } = useAtRiskLeads();

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-medium text-text">{t("Radar de risco")}</h2>
        {risco && risco.total > 0 && (
          <span className="text-xs text-muted-foreground tabular-nums">
            {risco.total} {t("demandas no radar")}
          </span>
        )}
      </div>
      <p className="text-sm text-muted-foreground">
        {t("Demanda aberta sem atividade recente ou sem próximo passo. Assumir é o primeiro passo.")}
      </p>
      <RiskRadarList />
    </div>
  );
}
