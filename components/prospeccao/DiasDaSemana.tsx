"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useT } from "@/hooks/i18n/useT";

/**
 * OS DIAS DA SEMANA DE UMA CAMPANHA — uma peça só, usada pelos DOIS
 * formulários de agendamento (o disparo da prospecção e a campanha de
 * recuperação do radar).
 *
 * ═══ POR QUE COMPONENTE, E NÃO O BLOCO COPIADO ═══════════════════════════
 *
 * Os dois formulários já compartilham o MOTOR (`lib/prospeccao/agendado.ts`):
 * uma mensagem por minuto, dentro da janela, no período, com cota. Se o
 * "quando" fosse desenhado duas vezes, a recuperação ficaria sem o "de segunda
 * a sexta" — e o operador que aprendeu uma tela na outra acharia que o
 * agendamento "não pegou". A régua tem de ser a mesma nos dois lugares.
 *
 * ═══ A NUMERAÇÃO É A DO MOTOR, NÃO A DA TELA ═════════════════════════════
 *
 * 0 = domingo … 6 = sábado é o `getUTCDay()` que `lib/prospeccao/agendamento`
 * usa. Uma tela que numerasse de segunda (1) chegaria no banco com os dias
 * deslocados em um — e a campanha mandaria no domingo.
 */

export const DIAS_SEMANA = [
  { valor: 0, curto: "dom", nome: "domingo" },
  { valor: 1, curto: "seg", nome: "segunda" },
  { valor: 2, curto: "ter", nome: "terça" },
  { valor: 3, curto: "qua", nome: "quarta" },
  { valor: 4, curto: "qui", nome: "quinta" },
  { valor: 5, curto: "sex", nome: "sexta" },
  { valor: 6, curto: "sáb", nome: "sábado" },
] as const;

/**
 * O padrão da tela: segunda a sexta. Disparo frio em massa no fim de semana é
 * a exceção, não a regra — e o operador que quer sábado marca o sábado.
 */
export const DIAS_UTEIS: number[] = [1, 2, 3, 4, 5];

const TODOS_OS_DIAS: number[] = [0, 1, 2, 3, 4, 5, 6];

/** "todos os dias" / "seg a sex" / "seg, qua, sex" — o que o resumo diz. */
export function resumoDosDias(dias: number[]): string {
  if (dias.length === 7) return "todos os dias";
  const ordenados = [...dias].sort((a, b) => a - b);
  if (ordenados.join(",") === DIAS_UTEIS.join(",")) return "seg a sex";
  return DIAS_SEMANA.filter((d) => dias.includes(d.valor))
    .map((d) => d.curto)
    .join(", ");
}

export function DiasDaSemana({
  dias,
  onChange,
  idPrefixo = "dias",
}: {
  dias: number[];
  onChange: (dias: number[]) => void;
  /** Para os `id`/`htmlFor` não colidirem quando dois diálogos existirem. */
  idPrefixo?: string;
}) {
  const t = useT();
  const vazio = dias.length === 0;

  function alternar(valor: number) {
    onChange(
      dias.includes(valor)
        ? dias.filter((d) => d !== valor)
        : [...dias, valor].sort((a, b) => a - b),
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Label id={`${idPrefixo}-rotulo`}>{t("Dias da semana")}</Label>
        <Button type="button" size="sm" variant="ghost" onClick={() => onChange(DIAS_UTEIS)}>
          {t("Seg a Sex")}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => onChange(TODOS_OS_DIAS)}>
          {t("Todos")}
        </Button>
      </div>
      <div className="flex flex-wrap gap-1" role="group" aria-labelledby={`${idPrefixo}-rotulo`}>
        {DIAS_SEMANA.map((d) => {
          const ativo = dias.includes(d.valor);
          return (
            <button
              key={d.valor}
              type="button"
              aria-pressed={ativo}
              title={t(d.nome)}
              onClick={() => alternar(d.valor)}
              className={`h-8 w-12 rounded-md border text-xs font-medium transition ${
                ativo
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-input bg-background text-muted-foreground hover:bg-muted"
              }`}
            >
              {t(d.curto)}
            </button>
          );
        })}
      </div>
      {vazio ? (
        <p className="text-xs text-destructive">
          {t("Escolha ao menos um dia da semana para a campanha poder mandar.")}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          {t(
            "A campanha só manda nestes dias. Sábado e domingo ficam de fora do padrão — marque-os se quiser que ela fale no fim de semana.",
          )}
        </p>
      )}
    </div>
  );
}
