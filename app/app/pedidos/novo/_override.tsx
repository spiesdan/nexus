"use client";

import * as React from "react";

import { Label } from "@/components/ui/label";
import { useT } from "@/hooks/i18n/useT";

/**
 * OVERRIDE DE LIMITES — decisão 3 (20/11/2026).
 *
 * Antes, `ignorar_estoque`/`ignorar_credito` existiam só na API: o poder ficava
 * invisível — quem mandasse um curl com o cookie certo passava por cima do
 * limite e ninguém, na tela, sabia que aquilo era possível.
 *
 * Agora o gerente vê o controle **quando há algo a ignorar** (crédito estourado
 * ou falta de estoque), marca o que está liberando e escreve o **motivo**. O
 * motivo é obrigatório: é ele que vai para a auditoria junto do nome de quem
 * liberou. Sem motivo, a tela não deixa gerar.
 *
 * O servidor continua sendo o gate (papel + motivo + auditoria). Este bloco é a
 * superfície de um poder que já existia — não a fonte dele.
 */
export interface EstadoDoOverride {
  estoque: boolean;
  credito: boolean;
  motivo: string;
}

export function BlocoDeOverride({
  estado,
  creditoExcedido,
  faltaEstoque,
  aoMarcar,
  aoMotivo,
}: {
  estado: EstadoDoOverride;
  creditoExcedido: boolean;
  faltaEstoque: boolean;
  aoMarcar: (qual: "estoque" | "credito", valor: boolean) => void;
  aoMotivo: (valor: string) => void;
}) {
  const t = useT();

  return (
    <section
      data-testid="override-de-limites"
      className="space-y-3 rounded-lg border border-warning/40 bg-warning-bg p-3 text-sm text-warning-fg"
    >
      <div>
        <p className="font-medium">{t("Ignorar um limite")}</p>
        <p className="text-xs">
          {t("Só gerente. O que for ignorado fica na auditoria com o seu nome e o motivo.")}
        </p>
      </div>

      {creditoExcedido ? (
        <label className="flex items-start gap-2">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={estado.credito}
            onChange={(e) => aoMarcar("credito", e.target.checked)}
          />
          <span>{t("Ignorar o limite de crédito do cliente neste pedido")}</span>
        </label>
      ) : null}

      {faltaEstoque ? (
        <label className="flex items-start gap-2">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={estado.estoque}
            onChange={(e) => aoMarcar("estoque", e.target.checked)}
          />
          <span>{t("Ignorar a falta de estoque deste pedido")}</span>
        </label>
      ) : null}

      <div className="space-y-1.5">
        <Label htmlFor="motivo-override">{t("Motivo")}</Label>
        <textarea
          id="motivo-override"
          data-testid="motivo-override"
          value={estado.motivo}
          onChange={(e) => aoMotivo(e.target.value)}
          rows={2}
          maxLength={500}
          placeholder={t("Ex.: cliente antigo, liberado pelo dono nesta semana.")}
          className="w-full rounded-lg border border-border-control bg-background px-3 py-2 text-sm text-text placeholder:text-text-muted"
        />
      </div>
    </section>
  );
}
