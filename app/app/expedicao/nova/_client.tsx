"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { nexusToast } from "@/components/nexus-ui/feedback/nexus-toast";
import { NexusPageHeader } from "@/components/nexus-ui/layout/NexusPageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import { diaDeReferencia, filtrarEmbarcaveisPor, temCidade } from "@/lib/expedicao/buscar-embarcavel";
import { comoMoeda, numeroDoPedido } from "@/lib/format/moeda";
import { numeroDaCarga } from "@/lib/schemas/expedicao";
import { type PedidoComercial } from "@/lib/schemas/pedidos";
import {
  CaretLeft,
  Funnel,
  MagnifyingGlass,
  Package,
  X,
} from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

/** `2026-10-26` → `26/10`; string vazia → `—` (nunca "Invalid Date"). */
function diaCurto(chave: string | null | undefined): string {
  if (!chave || chave.length < 10) return "—";
  return `${chave.slice(8, 10)}/${chave.slice(5, 7)}`;
}

/**
 * A SUBTELA DE MONTAGEM — uma tarefa, três passos, sem a fila disputando espaço.
 *
 * A ordem é a do trabalho: primeiro quem leva (veículo/motorista), depois o que
 * leva (pedidos), e por último a conferência do que vai sair. No desktop a
 * conferência acompanha a escolha na coluna da direita; no celular ela vem
 * depois da lista, com o mesmo botão de criar.
 */
export function NovaCargaClient({
  embarcaveis,
  cidadePorContato,
  textos,
}: {
  embarcaveis: PedidoComercial[];
  /** `contact_id` → "CIDADE/UF". A cidade do cadastro, para o filtro achar quem não tem endereço no pedido. */
  cidadePorContato: Record<string, string>;
  textos: { titulo: string; subtitulo: string; voltar: string };
}) {
  const t = useT();
  const router = useRouter();

  const [placa, setPlaca] = React.useState("");
  const [veiculo, setVeiculo] = React.useState("");
  const [motorista, setMotorista] = React.useState("");
  const [busca, setBusca] = React.useState("");
  const [cidade, setCidade] = React.useState("");
  const [de, setDe] = React.useState("");
  const [ate, setAte] = React.useState("");
  const [filtrosAbertos, setFiltrosAbertos] = React.useState(false);
  const [selecionados, setSelecionados] = React.useState<string[]>([]);
  const [enviando, setEnviando] = React.useState(false);

  const cidadeDoContato = React.useCallback(
    (id: string | null | undefined) => (id ? (cidadePorContato[id] ?? null) : null),
    [cidadePorContato],
  );

  const filtrando = busca.trim() !== "" || cidade.trim() !== "" || de !== "" || ate !== "";
  const filtroDePedidoAtivo = cidade.trim() !== "" || de !== "" || ate !== "";

  /**
   * Os ESCOLHIDOS saem do filtro de propósito.
   *
   * Sem isto, quem marca três pedidos, digita o número do quarto e não acha o
   * quarto percebe que os três sumiram da tela — e a carga é montada no escuro:
   * a pessoa acredita que marcou, clica em criar, e o servidor leva o que
   * estava marcado. A seleção é o que vira carga, então ela fica num bloco
   * próprio, sempre visível; o filtro é só uma forma de achar mais rápido o que
   * ainda FALTA marcar.
   *
   * Por isso eles saem da lista de baixo também, e não aparecem duas vezes: sem
   * esta exclusão, um selecionado que casasse com a busca reapareceria ali com
   * a caixa DESMARCADA — marcar de novo não faria nada e desmarcar tiraria da
   * carga, sem nenhum dos dois fazer o que a caixa diz.
   */
  const jaSelecionados = React.useMemo(
    () => embarcaveis.filter((p) => selecionados.includes(p.id)),
    [embarcaveis, selecionados],
  );
  /**
   * O filtro é aplicado ANTES de tirar os selecionados: a contagem "3 de 10"
   * precisa falar do que o filtro achou, e não do que sobrou para marcar —
   * senão o número muda para menos a cada pedido marcado, sem explicação.
   */
  const resultadosDoFiltro = React.useMemo(
    () => filtrarEmbarcaveisPor(embarcaveis, { busca, cidade, de, ate }, cidadeDoContato),
    [embarcaveis, busca, cidade, de, ate, cidadeDoContato],
  );
  const filtrados = React.useMemo(
    () => resultadosDoFiltro.filter((p) => !selecionados.includes(p.id)),
    [resultadosDoFiltro, selecionados],
  );

  /**
   * Quantos pedidos o filtro de cidade NÃO tem como julgar.
   *
   * Sem isto, filtrar por cidade devolve uma lista curta (ou vazia) e a pessoa
   * conclui que o pedido não está na fila — quando o que falta é o cadastro.
   * O endereço de entrega é digitado por pedido e a maioria não tem; quem não
   * tem endereço nem cidade no contato fica invisível para o filtro.
   */
  const semCidade = React.useMemo(
    () =>
      cidade.trim() === ""
        ? 0
        : embarcaveis.filter((p) => !temCidade(p, cidadeDoContato)).length,
    [cidade, embarcaveis, cidadeDoContato],
  );

  const totalSelecionado = React.useMemo(
    () => jaSelecionados.reduce((soma, p) => soma + (p.total_cents || 0), 0),
    [jaSelecionados],
  );

  function alternar(id: string) {
    setSelecionados((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  function limparFiltroDePedido() {
    setCidade("");
    setDe("");
    setAte("");
  }

  async function criar() {
    if (selecionados.length === 0) {
      nexusToast.error(t("Selecione ao menos 1 pedido para embarcar."));
      return;
    }
    setEnviando(true);
    try {
      const corpo = await apiClient.post<{ data: { id: string; numero: number } | null }>(
        `/api/v1/shipments`,
        {
          ...(placa.trim() ? { placa: placa.trim() } : {}),
          ...(veiculo.trim() ? { veiculo_tipo: veiculo.trim() } : {}),
          ...(motorista.trim() ? { motorista_nome: motorista.trim() } : {}),
          order_ids: selecionados,
        },
      );
      const carga = corpo?.data;
      if (!carga) throw new Error(t("A carga foi criada mas o servidor não devolveu o resumo."));
      nexusToast.success(`${t("Carga criada")}: ${numeroDaCarga(carga.numero)}`);
      router.push(`/app/expedicao/${carga.id}`);
    } catch (e) {
      showApiError(e);
      setEnviando(false);
    }
  }

  return (
    <div className="min-h-full space-y-5 p-4 sm:p-6">
      <div>
        <Link
          href="/app/expedicao"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-text"
        >
          <CaretLeft className="h-3.5 w-3.5" aria-hidden />
          {textos.voltar}
        </Link>
      </div>

      <NexusPageHeader
        title={textos.titulo}
        subtitle={textos.subtitulo}
        actions={
          <Badge variant={embarcaveis.length > 0 ? "default" : "neutral"}>
            {embarcaveis.length}{" "}
            {embarcaveis.length === 1 ? t("pedido na fila") : t("pedidos na fila")}
          </Badge>
        }
      />

      {/* ── 1. Quem leva ─────────────────────────────────────────────────── */}
      <Card className="p-4">
        <fieldset className="space-y-3">
          <legend className="w-full">
            <span className="text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
              {t("1 · Quem leva")}
            </span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              {t("Veículo e motorista são opcionais, mas é o que sai no romaneio.")}
            </span>
          </legend>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="placa" className="text-xs">
                {t("Placa")}
              </Label>
              <Input
                id="placa"
                value={placa}
                onChange={(e) => setPlaca(e.target.value)}
                placeholder="ABC1D23"
                autoComplete="off"
                className="h-10"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="veiculo" className="text-xs">
                {t("Veículo")}
              </Label>
              <Input
                id="veiculo"
                value={veiculo}
                onChange={(e) => setVeiculo(e.target.value)}
                placeholder={t("Ex.: HR")}
                autoComplete="off"
                className="h-10"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="motorista" className="text-xs">
                {t("Motorista")}
              </Label>
              <Input
                id="motorista"
                value={motorista}
                onChange={(e) => setMotorista(e.target.value)}
                autoComplete="off"
                className="h-10"
              />
            </div>
          </div>
        </fieldset>
      </Card>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        {/* ── 2. O que leva ───────────────────────────────────────────────── */}
        <Card className="overflow-hidden p-0">
          <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border bg-stage-2/60 px-4 py-3">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                {t("2 · O que leva")}
              </p>
              <h2 className="text-base font-medium text-text">{t("Pedidos na fila")}</h2>
            </div>
            <Button
              type="button"
              size="sm"
              variant={filtroDePedidoAtivo ? "default" : "outline"}
              className="h-8"
              aria-expanded={filtrosAbertos}
              onClick={() => setFiltrosAbertos((v) => !v)}
            >
              <Funnel size={14} />
              {t("Cidade e período")}
              {filtroDePedidoAtivo ? " ·" : ""}
            </Button>
          </header>

          <div className="space-y-3 p-4">
            {embarcaveis.length > 0 && (
              <>
                <div className="relative">
                  <MagnifyingGlass
                    size={15}
                    className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-text-subtle"
                  />
                  <Input
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    placeholder={t("Número, cliente, cidade ou CNPJ")}
                    aria-label={t("Buscar pedido")}
                    data-testid="carga-busca"
                    className="h-10 pl-9"
                  />
                </div>

                {(filtrosAbertos || filtroDePedidoAtivo) && (
                  <div className="grid gap-2 rounded-xl border border-border bg-stage-2/60 p-2 sm:grid-cols-[1fr_auto_auto]">
                    <div className="space-y-1">
                      <Label htmlFor="carga-cidade" className="text-xs">
                        {t("Cidade")}
                      </Label>
                      <Input
                        id="carga-cidade"
                        value={cidade}
                        onChange={(e) => setCidade(e.target.value)}
                        placeholder={t("Ex.: Canoinhas")}
                        data-testid="carga-cidade"
                        className="h-9 bg-surface"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="carga-de" className="text-xs">
                        {t("De")}
                      </Label>
                      <Input
                        id="carga-de"
                        type="date"
                        value={de}
                        max={ate || undefined}
                        onChange={(e) => setDe(e.target.value)}
                        data-testid="carga-de"
                        className="h-9 bg-surface"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="carga-ate" className="text-xs">
                        {t("Até")}
                      </Label>
                      <Input
                        id="carga-ate"
                        type="date"
                        value={ate}
                        min={de || undefined}
                        onChange={(e) => setAte(e.target.value)}
                        data-testid="carga-ate"
                        className="h-9 bg-surface"
                      />
                    </div>
                    {filtroDePedidoAtivo && (
                      <div className="sm:col-span-3">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs"
                          onClick={limparFiltroDePedido}
                        >
                          <X size={12} /> {t("Limpar cidade e período")}
                        </Button>
                      </div>
                    )}
                  </div>
                )}

                {filtrando && (
                  <p className="text-xs text-muted-foreground" data-testid="carga-busca-conta">
                    {`${resultadosDoFiltro.length} de ${embarcaveis.length} pedidos`}
                  </p>
                )}
                {semCidade > 0 && (
                  <p className="text-xs text-warning-fg" data-testid="carga-sem-cidade">
                    {t("{n} pedido(s) sem cidade no cadastro").replace("{n}", String(semCidade))}
                  </p>
                )}
              </>
            )}

            {/* Busca sem resultado é "não achei", e é diferente de "não há
                pedidos": a pessoa precisa saber se o pedido não existe ou se
                digitou diferente. */}
            {embarcaveis.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border px-4 py-10 text-center">
                <Package className="h-6 w-6 text-text-subtle" aria-hidden />
                <p className="text-sm text-muted-foreground">
                  {t("Nenhum pedido aprovado aguardando embarque.")}
                </p>
                <p className="max-w-sm text-xs text-text-subtle">
                  {t("Um pedido entra na fila quando é aprovado ou faturado.")}
                </p>
                <Button asChild size="sm" variant="outline" className="mt-1">
                  <Link href="/app/pedidos">{t("Ver pedidos")}</Link>
                </Button>
              </div>
            ) : filtrados.length === 0 ? (
              <div
                className="rounded-xl border border-dashed border-border px-4 py-8 text-center"
                data-testid="carga-busca-vazia"
              >
                <p className="text-sm text-muted-foreground">
                  {resultadosDoFiltro.length > 0
                    ? t("Todos os pedidos encontrados já estão na carga.")
                    : t("Nenhum pedido encontrado com esse termo.")}
                </p>
                {(filtrando || jaSelecionados.length > 0) && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="mt-1"
                    onClick={() => {
                      setBusca("");
                      limparFiltroDePedido();
                    }}
                  >
                    {t("Limpar busca")}
                  </Button>
                )}
              </div>
            ) : (
              <ul
                className="max-h-[26rem] divide-y divide-border overflow-y-auto rounded-xl border border-border fill-well xl:max-h-[calc(100vh-27rem)] xl:min-h-[16rem]"
                data-testid="carga-embarcaveis"
              >
                {filtrados.map((p) => {
                  const dia = diaDeReferencia(p);
                  const cidadeDoPedido = cidadeDoContato(p.contact_id);
                  return (
                    <li key={p.id}>
                      <label
                        className={cn(
                          "flex cursor-pointer items-center gap-3 px-3.5 py-3 text-sm transition-colors hover:bg-muted/40",
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={false}
                          onChange={() => alternar(p.id)}
                          data-testid={`carga-pedido-${p.numero}`}
                          className="h-4 w-4 shrink-0 accent-accent"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-1.5">
                            <span className="font-semibold whitespace-nowrap tabular-nums">
                              {numeroDoPedido(p.numero)}
                            </span>
                            {cidadeDoPedido && (
                              <span
                                className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
                                data-testid={`carga-cidade-${p.numero}`}
                              >
                                {cidadeDoPedido}
                              </span>
                            )}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {p.cliente_nome}
                          </span>
                        </span>
                        <span className="shrink-0 text-right">
                          <span className="block text-sm font-semibold tabular-nums">
                            {comoMoeda(p.total_cents, p.moeda)}
                          </span>
                          <span className="block text-[10px] text-text-subtle tabular-nums">
                            {diaCurto(dia)}
                          </span>
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </Card>

        {/* ── 3. O que vai ────────────────────────────────────────────────── */}
        <aside className="min-w-0 space-y-4 xl:sticky xl:top-6">
          <Card className="overflow-hidden p-0">
            <header className="flex items-center justify-between gap-2 border-b border-border bg-accent-soft px-4 py-2.5">
              <div>
                <p className="text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                  {t("3 · O que vai")}
                </p>
                <h2 className="text-sm font-medium text-accent">
                  {t("Na carga")} ({jaSelecionados.length})
                </h2>
              </div>
              {jaSelecionados.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSelecionados([])}
                  className="text-xs text-muted-foreground underline underline-offset-4 hover:text-text"
                >
                  {t("Limpar seleção")}
                </button>
              )}
            </header>

            <div className="space-y-3 p-3.5" data-testid="carga-selecionados">
              {jaSelecionados.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border px-3 py-5 text-center text-xs text-muted-foreground">
                  {t("Nenhum pedido marcado ainda. Marque na lista ao lado.")}
                </p>
              ) : (
                <ul className="max-h-60 space-y-1 overflow-y-auto">
                  {jaSelecionados.map((p) => (
                    <li key={p.id}>
                      <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-transparent bg-surface px-2.5 py-2 text-sm transition-colors hover:border-accent/40">
                        <input
                          type="checkbox"
                          checked
                          onChange={() => alternar(p.id)}
                          data-testid={`carga-selecionado-${p.numero}`}
                          className="h-4 w-4 shrink-0 accent-accent"
                        />
                        <span className="font-medium whitespace-nowrap tabular-nums">
                          {numeroDoPedido(p.numero)}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-xs">{p.cliente_nome}</span>
                        <span className="shrink-0 text-xs font-semibold tabular-nums">
                          {comoMoeda(p.total_cents, p.moeda)}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}

              <dl className="flex items-baseline justify-between gap-2 border-t border-border pt-3">
                <dt className="text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
                  {t("Total da carga")}
                </dt>
                <dd className="text-base font-semibold text-text tabular-nums">
                  {comoMoeda(totalSelecionado, "BRL")}
                </dd>
              </dl>

              <Button
                className="w-full"
                disabled={enviando || selecionados.length === 0}
                onClick={() => void criar()}
              >
                {enviando
                  ? t("Criando…")
                  : selecionados.length > 0
                    ? `${t("Criar carga")} (${selecionados.length})`
                    : t("Criar carga")}
              </Button>
              <p className="text-center text-[11px] leading-relaxed text-text-subtle">
                {t("Criar não dá baixa nos pedidos — eles saem da fila e entram na carga.")}
              </p>
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );
}
