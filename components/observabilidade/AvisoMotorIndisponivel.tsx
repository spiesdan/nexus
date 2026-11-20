"use client";

import { useT } from "@/hooks/i18n/useT";
import { useTagDeIdioma } from "@/hooks/i18n/useLocaleDeData";
import type { SaudeDoMotor } from "@/hooks/observabilidade/useSaudeDoMotor";
import { Warning } from "@/lib/ui/icons";

/**
 * O AVISO QUE FALTAVA: "sem sugestão" ≠ "o motor não respondeu".
 *
 * Em 20/11/2026 a instalação tinha `LAYA_URL`/`LAYA_API_KEY` definidos e nenhum
 * serviço escutando. O cron falhava a cada 15 min, o Radar e a Prospecção
 * simplesmente não mostravam sugestão — e isso lê como "nada a sugerir". Este
 * aviso só aparece quando há **incidente aberto**: motor fora. Quando o motor
 * responde, ele some sozinho (o cron fecha o incidente no primeiro sucesso).
 */
export function AvisoMotorIndisponivel({
  saude,
  contexto,
}: {
  saude: SaudeDoMotor | undefined;
  /** "radar" | "prospeccao" — muda só a promessa que o texto faz. */
  contexto: "radar" | "prospeccao";
}) {
  const t = useT();
  const tag = useTagDeIdioma();
  if (!saude || saude.estado !== "indisponivel") return null;

  const quando = saude.ultima_falha
    ? new Date(saude.ultima_falha).toLocaleString(tag)
    : null;

  return (
    <div
      role="status"
      data-testid="aviso-motor-indisponivel"
      data-contexto={contexto}
      className="rounded-lg border border-warning-border bg-warning-bg px-3 py-2"
    >
      <p className="flex items-center gap-1.5 text-sm font-medium text-warning-fg">
        <Warning size={15} aria-hidden />
        {t("Sugestão automática desligada: o motor de decisão não respondeu.")}
      </p>
      <p className="mt-1 text-xs text-warning-fg">
        {contexto === "radar"
          ? t(
              "A ação sugerida em cada demanda não está sendo gerada enquanto o serviço estiver fora. Isto não quer dizer que não há nada a fazer — verifique LAYA_URL e se o serviço do motor está rodando.",
            )
          : t(
              "A triagem automática dos prospects não está sendo gerada enquanto o serviço estiver fora. A lista continua completa; só a nota de qualificação está parada. Verifique LAYA_URL e se o serviço do motor está rodando.",
            )}
      </p>
      {quando ? (
        // Sem `/80`: no Tailwind 4 o alpha PINTA e derrubava o par para
        // 3,72:1 sobre o bg do tema claro (piso AA 4,5). Sem alpha: 5,59:1.
        <p className="mt-1 text-xs text-warning-fg">
          {t("Última falha:")} {quando}
          {saude.detalhe ? ` — ${saude.detalhe}` : ""}
        </p>
      ) : null}
    </div>
  );
}
