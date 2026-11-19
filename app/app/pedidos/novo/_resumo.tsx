"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { comoMoeda } from "@/lib/format/moeda";
import type { Parcela } from "@/lib/schemas/pedidos";

import { rolarPara } from "@/lib/ui/movimento";
export interface TotaisDoResumo {
  subtotal: number;
  descontoCents: number;
  freteCents: number;
  total: number;
  qtdItens: number;
  qtdUnidades: number;
  margemPct: number | null;
  comissaoCents: number | null;
  parcelas: Parcela[];
  aprovacaoNecessaria: boolean;
}

/**
 * O RESUMO (§27–29): sempre visível no desktop, sticky bar no mobile.
 *
 * Margem e comissão só aparecem quando há dado (custo no produto +
 * papel com permissão): número ausente não vira zero — some com explicação
 * no código, não na tela do vendedor sem acesso.
 */
export function OrderSummary({
  totais,
  descontoMaxPct,
  descontoTexto,
  aoDesconto,
  descontoPctTexto,
  aoDescontoPct,
  freteTexto,
  aoFrete,
  enviando,
  aoSalvar,
  aoFinalizar,
  mostrarAcoes = true,
  textos,
}: {
  totais: TotaisDoResumo;
  descontoTexto: string;
  aoDesconto: (v: string) => void;
  descontoPctTexto: string;
  aoDescontoPct: (v: string) => void;
  freteTexto: string;
  aoFrete: (v: string) => void;
  enviando: boolean;
  aoSalvar: () => void;
  aoFinalizar: () => void;
  /**
   * `false` quando a tela já tem a barra de ação própria (o editor em página
   * única, como o Mercos). Dois "Gerar pedido" na mesma dobra confundem mais
   * que ajudam — e o segundo, fora do campo de visão do rodapé, era o que
   * ficava escondido no celular.
   */
  mostrarAcoes?: boolean;
  /** Teto de desconto do vendedor (política da org). */
  descontoMaxPct: number;
  textos: {
    subtotal: string;
    desconto: string;
    frete: string;
    total: string;
    salvarRascunho: string;
    finalizar: string;
    margem: string;
    comissao: string;
    aguardandoAprovacao: string;
    descontoTotal: string;
    descontosSomam: string;
    tetoDesconto: string;
    revisar: string;
    /** Nome acessível da região do resumo (o leitor de tela pula por ela). */
    resumoDoPedido: string;
    itensUnidades: (itens: number, un: number) => string;
  };
}) {
  return (
    <>
      <Card
        className="space-y-3 p-4 lg:sticky lg:top-4"
        id="resumo"
        role="region"
        aria-label={textos.resumoDoPedido}
      >
        {totais.aprovacaoNecessaria && (
          <p
            role="alert"
            className="rounded-lg border border-warning/40 bg-warning-bg px-3 py-2 text-sm text-warning-fg"
          >
            ⚠ {textos.aguardandoAprovacao}
          </p>
        )}
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">{textos.subtotal}</dt>
            <dd className="tabular-nums">{comoMoeda(totais.subtotal, "BRL")}</dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="text-muted-foreground">{textos.desconto} (R$)</dt>
            <dd>
              <Input
                id="desconto"
                aria-label={`${textos.desconto} (R$)`}
                className="w-28 text-right"
                value={descontoTexto}
                onChange={(e) => aoDesconto(e.target.value)}
                placeholder="0,00"
              />
            </dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="text-muted-foreground">{textos.desconto} (%)</dt>
            <dd>
              {/* `id` estável: é por ele que a jornada E2E preenche o desconto,
                  e é ele que liga o campo ao rótulo para o leitor de tela. */}
              <Input
                id="desconto-pct"
                aria-label={`${textos.desconto} (%)`}
                className="w-28 text-right"
                type="number"
                min={0}
                max={100}
                value={descontoPctTexto}
                onChange={(e) => aoDescontoPct(e.target.value)}
                placeholder="0"
              />
            </dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="text-muted-foreground">{textos.frete} (R$)</dt>
            <dd>
              <Input
                id="frete"
                aria-label={`${textos.frete} (R$)`}
                className="w-28 text-right"
                value={freteTexto}
                onChange={(e) => aoFrete(e.target.value)}
                placeholder="0,00"
              />
            </dd>
          </div>
          <div className="flex justify-between border-t pt-2">
            <dt className="text-muted-foreground">
              {textos.descontoTotal}
              <span className="block text-[11px]">{textos.descontosSomam}</span>
            </dt>
            <dd className="tabular-nums">{comoMoeda(totais.descontoCents, "BRL")}</dd>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {textos.tetoDesconto}: {descontoMaxPct.toLocaleString("pt-BR")}%
          </p>
          {totais.margemPct !== null && (
            <div className="flex justify-between">
              <dt className="text-muted-foreground">{textos.margem}</dt>
              <dd className="tabular-nums">{totais.margemPct.toLocaleString("pt-BR")}%</dd>
            </div>
          )}
          {totais.comissaoCents !== null && (
            <div className="flex justify-between">
              <dt className="text-muted-foreground">{textos.comissao}</dt>
              <dd className="tabular-nums">{comoMoeda(totais.comissaoCents, "BRL")}</dd>
            </div>
          )}
          <div className="flex justify-between border-t pt-2 text-base font-semibold">
            <dt>{textos.total}</dt>
            <dd className="tabular-nums">{comoMoeda(totais.total, "BRL")}</dd>
          </div>
        </dl>
        {totais.parcelas.length > 0 && (
          <ul className="space-y-1 text-xs text-muted-foreground">
            {totais.parcelas.map((p) => (
              <li key={p.n} className="flex justify-between">
                <span>
                  {p.n}ª · {p.vencimento}
                </span>
                <span className="tabular-nums">{comoMoeda(p.valor_cents, "BRL")}</span>
              </li>
            ))}
          </ul>
        )}
        {mostrarAcoes ? (
          <div className="flex flex-col gap-2">
            <Button variant="outline" disabled={enviando} onClick={aoSalvar}>
              {textos.salvarRascunho}
            </Button>
            <Button disabled={enviando} onClick={aoFinalizar}>
              {textos.finalizar}
            </Button>
          </div>
        ) : null}
      </Card>

      {/* Barra mobile (§41): o resumo viaja com o vendedor. */}
      {mostrarAcoes ? (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-background p-3 lg:hidden">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <p className="text-sm text-muted-foreground">
              {textos.itensUnidades(totais.qtdItens, totais.qtdUnidades)}
            </p>
            <p className="whitespace-nowrap text-lg font-semibold tabular-nums">
              {comoMoeda(totais.total, "BRL")}
            </p>
            <Button size="sm" onClick={() => rolarPara(document.getElementById("resumo"))}>
              {textos.revisar}
            </Button>
          </div>
        </div>
      ) : null}
    </>
  );
}
