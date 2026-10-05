"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { nexusToast as toast } from "@/components/nexus-ui/feedback/nexus-toast";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { useT } from "@/hooks/i18n/useT";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiClient } from "@/lib/api/client";
import {
  extrasFiscaisSchema,
  FORMAS_DE_PAGAMENTO,
  MODALIDADES_DE_FRETE,
  ROTULO_DA_FORMA_DE_PAGAMENTO,
  ROTULO_DA_MODALIDADE_DE_FRETE,
  type ConfigFiscalSalva,
  type ExtrasFiscais,
  type FormaDePagamento,
  type ModalidadeDeFrete,
} from "@/lib/schemas/fiscal";
import { type PedidoComercial } from "@/lib/schemas/pedidos";
import { comoMoeda, numeroDoPedido } from "@/lib/format/moeda";
import { Receipt } from "@/lib/ui/icons";

import type { Textos } from "./textos";

type Transporte = NonNullable<ExtrasFiscais["transporte"]>;
type Cobranca = NonNullable<ExtrasFiscais["cobranca"]>;
type Adicionais = NonNullable<ExtrasFiscais["adicionais"]>;
type Entrega = NonNullable<ExtrasFiscais["entrega"]>;

/** Tudo vira string no formulário; a conversão acontece na montagem dos extras. */
export type ExtrasDoFormulario = {
  modalidade: string;
  transportadorNome: string;
  transportadorDocumento: string;
  volumesQuantidade: string;
  volumesEspecie: string;
  pesoLiquido: string;
  pesoBruto: string;
  formaPagamento: string;
  descricaoPagamento: string;
  parcelas: string;
  primeiroVencimento: string;
  diasEntre: string;
  informacoesComplementares: string;
  informacoesFisco: string;
  entregaLogradouro: string;
  entregaNumero: string;
  entregaComplemento: string;
  entregaBairro: string;
  entregaMunicipio: string;
  entregaCodigoMunicipio: string;
  entregaUf: string;
  entregaCep: string;
};

/**
 * Estado inicial — `modalidade` já em `9` (sem operação de frete, o padrão da
 * NF-e) e `parcelas` em `1` (à vista): o formulário começa sem diferença em
 * relação a não enviar extras, e o grupo só é gravado quando alguém mexe.
 */
export const EXTRAS_VAZIOS: ExtrasDoFormulario = {
  modalidade: "9",
  transportadorNome: "",
  transportadorDocumento: "",
  volumesQuantidade: "",
  volumesEspecie: "",
  pesoLiquido: "",
  pesoBruto: "",
  formaPagamento: "",
  descricaoPagamento: "",
  parcelas: "1",
  primeiroVencimento: "",
  diasEntre: "30",
  informacoesComplementares: "",
  informacoesFisco: "",
  entregaLogradouro: "",
  entregaNumero: "",
  entregaComplemento: "",
  entregaBairro: "",
  entregaMunicipio: "",
  entregaCodigoMunicipio: "",
  entregaUf: "",
  entregaCep: "",
};

function ehModalidade(v: string): v is ModalidadeDeFrete {
  return (MODALIDADES_DE_FRETE as readonly string[]).includes(v);
}

function ehForma(v: string): v is FormaDePagamento {
  return (FORMAS_DE_PAGAMENTO as readonly string[]).includes(v);
}

function numero(s: string): number {
  const n = Number(s.trim().replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

/**
 * Do formulário para o objeto que a nota guarda (jsonb). `undefined` quando
 * ninguém tocou em nada — aí a nota fica sem extras e a emissão segue como
 * sempre foi. Os grupos aqui existem: um grupo preenchido pela metade é erro
 * do zod, não motivo para emitir incompleto.
 */
export function montarExtras(v: ExtrasDoFormulario): ExtrasFiscais | undefined {
  const extras: ExtrasFiscais = {};

  const documento = v.transportadorDocumento.replace(/\D/g, "");
  const temTransportador = v.transportadorNome.trim() !== "" || documento !== "";
  const temVolumes = v.volumesQuantidade.trim() !== "";
  if (v.modalidade !== "9" || temTransportador || temVolumes) {
    const transporte: Transporte = {
      modalidade_frete: ehModalidade(v.modalidade) ? v.modalidade : "9",
    };
    if (temTransportador) {
      transporte.transportador = { nome: v.transportadorNome.trim(), documento };
    }
    if (temVolumes) {
      transporte.volumes = { quantidade: Math.trunc(numero(v.volumesQuantidade)) };
      const especie = v.volumesEspecie.trim();
      if (especie !== "") transporte.volumes.especie = especie;
      if (v.pesoLiquido.trim() !== "") transporte.volumes.peso_liquido_kg = numero(v.pesoLiquido);
      if (v.pesoBruto.trim() !== "") transporte.volumes.peso_bruto_kg = numero(v.pesoBruto);
    }
    extras.transporte = transporte;
  }

  if (v.formaPagamento !== "") {
    const cobranca: Cobranca = {
      forma_pagamento: ehForma(v.formaPagamento) ? v.formaPagamento : "99",
      parcelas: Math.trunc(numero(v.parcelas)),
      dias_entre: Math.trunc(numero(v.diasEntre)),
    };
    if (v.primeiroVencimento.trim() !== "") cobranca.primeiro_vencimento = v.primeiroVencimento.trim();
    const descricao = v.descricaoPagamento.trim();
    if (descricao !== "") cobranca.descricao = descricao;
    extras.cobranca = cobranca;
  }

  const complementares = v.informacoesComplementares.trim();
  const fisco = v.informacoesFisco.trim();
  if (complementares !== "" || fisco !== "") {
    const adicionais: Adicionais = {};
    if (complementares !== "") adicionais.informacoes_complementares = complementares;
    if (fisco !== "") adicionais.informacoes_fisco = fisco;
    extras.adicionais = adicionais;
  }

  const endereco = {
    logradouro: v.entregaLogradouro.trim(),
    numero: v.entregaNumero.trim(),
    complemento: v.entregaComplemento.trim(),
    bairro: v.entregaBairro.trim(),
    municipio: v.entregaMunicipio.trim(),
    codigo_municipio: v.entregaCodigoMunicipio.trim(),
    uf: v.entregaUf.trim().toUpperCase(),
    cep: v.entregaCep.replace(/\D/g, ""),
  };
  const temEntrega = Object.values(endereco).some((c) => c !== "");
  if (temEntrega) {
    extras.entrega = {
      logradouro: endereco.logradouro,
      numero: endereco.numero,
      bairro: endereco.bairro,
      municipio: endereco.municipio,
      codigo_municipio: endereco.codigo_municipio,
      uf: endereco.uf,
      ...(endereco.complemento !== "" && { complemento: endereco.complemento }),
      ...(endereco.cep !== "" && { cep: endereco.cep }),
    } as Entrega;
  }

  return Object.keys(extras).length > 0 ? extras : undefined;
}

/**
 * Aba "Emitir" — uma tarefa por tela, como nos emissores dedicados: escolhe
 * o pedido faturado, vê o resumo (cliente + valor), valida e emite. O
 * resultado cai na grade (aba Notas) via refresh.
 */
export function EmitirNota({
  faturados,
  configInicial,
  textos,
}: {
  faturados: PedidoComercial[];
  configInicial: ConfigFiscalSalva | null;
  textos: Textos;
}) {
  const t = useT();
  const router = useRouter();
  const [pedidoId, setPedidoId] = React.useState("");
  const [emitindo, setEmitindo] = React.useState(false);
  const [pendencias, setPendencias] = React.useState<{ campo: string; mensagem: string; onde: string }[] | null>(null);
  const [extras, setExtras] = React.useState<ExtrasDoFormulario>(EXTRAS_VAZIOS);

  const alterar =
    (campo: keyof ExtrasDoFormulario) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      setExtras((a) => ({ ...a, [campo]: e.target.value }));
    };

  const escolhido = faturados.find((p) => p.id === pedidoId) ?? null;

  async function emitir() {
    if (!pedidoId) {
      toast.error(t("Escolha o pedido faturado."));
      return;
    }
    // Os extras são conferidos aqui e não na rota: quem aciona o botão precisa
    // ver "Informe o primeiro vencimento" na tela que está aberta, e não um
    // 422 genérico de volta de uma requisição que ele nem vê o corpo.
    const candidato = montarExtras(extras);
    let extrasValidados: ExtrasFiscais | null = null;
    if (candidato) {
      const checagem = extrasFiscaisSchema.safeParse(candidato);
      if (!checagem.success) {
        toast.error(checagem.error.issues[0]?.message ?? t("Dados adicionais inválidos."));
        return;
      }
      extrasValidados = checagem.data;
    }
    setEmitindo(true);
    setPendencias(null);
    try {
      // Pré-validação: a SEFAZ nunca é a primeira a dizer que falta NCM.
      // O envelope `ok()` chega como `{data}` — ler `prev.ok` em cima dele era
      // `undefined`, caía no ramo de pendências com `pendencias === undefined`
      // e o render derrubava o boundary (`undefined.length`).
      const prev = await apiClient.post<{ data: { ok: boolean; pendencias: { campo: string; mensagem: string; onde: string }[] } }>(
        "/api/v1/invoices/validar",
        { order_id: pedidoId },
      );
      if (!prev.data.ok) {
        setPendencias(prev.data.pendencias);
        return;
      }
      await apiClient.post("/api/v1/invoices", {
        order_id: pedidoId,
        ...(extrasValidados ? { extras: extrasValidados } : {}),
      });
      toast.success(t("Nota enfileirada para emissão"));
      setPedidoId("");
      router.push("/app/notas?aba=notas");
      router.refresh();
    } catch (e) {
      showApiError(e);
    } finally {
      setEmitindo(false);
    }
  }

  return (
    <Card className="hover-raise space-y-4 p-4 sm:p-5">
      <div>
        <div className="flex items-center gap-2">
          <Receipt size={18} className="text-muted-foreground" />
          <h2 className="text-base font-medium text-text">{textos.emitir}</h2>
        </div>
        <p className="mt-0.5 text-sm text-muted-foreground">{textos.subtituloEmitir}</p>
      </div>

      {!configInicial && (
        <p className="rounded-lg border border-warning/40 bg-warning-bg p-3 text-sm text-warning-fg">
          {textos.semConfig}
        </p>
      )}

      {faturados.length === 0 ? (
        <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
          {textos.semFaturados}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="max-w-xl space-y-1.5">
            <Label htmlFor="pedido-nota">{textos.escolherPedido}</Label>
            <select
              id="pedido-nota"
              className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
              value={pedidoId}
              onChange={(e) => {
                setPedidoId(e.target.value);
                setPendencias(null);
              }}
            >
              <option value="">{textos.selecione}</option>
              {faturados.map((p) => (
                <option key={p.id} value={p.id}>
                  {numeroDoPedido(p.numero)} · {p.cliente_nome} · {comoMoeda(p.total_cents, p.moeda)}
                </option>
              ))}
            </select>
          </div>

          {escolhido && (
            <div className="grid max-w-xl grid-cols-3 gap-3 rounded-lg border border-border bg-muted/30 p-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">{textos.escolherPedido}</p>
                <p className="font-medium tabular-nums">{numeroDoPedido(escolhido.numero)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{textos.cliente}</p>
                <p className="truncate font-medium" title={escolhido.cliente_nome}>
                  {escolhido.cliente_nome}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{textos.valor}</p>
                <p className="font-medium tabular-nums">{comoMoeda(escolhido.total_cents, escolhido.moeda)}</p>
              </div>
            </div>
          )}

          <details className="max-w-xl rounded-lg border border-border bg-muted/30 p-3">
            <summary className="cursor-pointer text-sm font-medium text-text">
              {t("Dados adicionais da emissão (opcional)")}
            </summary>
            <div className="mt-3 space-y-4">
              <p className="text-xs text-muted-foreground">
                {t("Ficam gravados nesta nota: reemitir não pede de novo.")}
              </p>

              <section className="space-y-2">
                <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t("Transporte")}
                </h3>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="space-y-1.5 sm:col-span-3">
                    <Label htmlFor="ex-modalidade">{t("Modalidade do frete")}</Label>
                    <select
                      id="ex-modalidade"
                      aria-label={t("Modalidade do frete")}
                      className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
                      value={extras.modalidade}
                      onChange={alterar("modalidade")}
                    >
                      {MODALIDADES_DE_FRETE.map((m) => (
                        <option key={m} value={m}>
                          {ROTULO_DA_MODALIDADE_DE_FRETE[m]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5 sm:col-span-3">
                    <Label htmlFor="ex-transp-nome">{t("Transportador — nome ou razão social")}</Label>
                    <Input
                      id="ex-transp-nome"
                      value={extras.transportadorNome}
                      onChange={alterar("transportadorNome")}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="ex-transp-doc">{t("CPF ou CNPJ")}</Label>
                    <Input
                      id="ex-transp-doc"
                      inputMode="numeric"
                      maxLength={14}
                      value={extras.transportadorDocumento}
                      onChange={alterar("transportadorDocumento")}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="ex-vol-qtd">{t("Volumes")}</Label>
                    <Input
                      id="ex-vol-qtd"
                      type="number"
                      min={1}
                      placeholder={t("Qtd.")}
                      value={extras.volumesQuantidade}
                      onChange={alterar("volumesQuantidade")}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="ex-vol-especie">{t("Espécie")}</Label>
                    <Input
                      id="ex-vol-especie"
                      maxLength={60}
                      placeholder={t("Ex.: CAIXAS")}
                      value={extras.volumesEspecie}
                      onChange={alterar("volumesEspecie")}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="ex-vol-peso-l">{t("Peso líquido (kg)")}</Label>
                    <Input
                      id="ex-vol-peso-l"
                      type="number"
                      min={0}
                      step="0.01"
                      value={extras.pesoLiquido}
                      onChange={alterar("pesoLiquido")}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="ex-vol-peso-b">{t("Peso bruto (kg)")}</Label>
                    <Input
                      id="ex-vol-peso-b"
                      type="number"
                      min={0}
                      step="0.01"
                      value={extras.pesoBruto}
                      onChange={alterar("pesoBruto")}
                    />
                  </div>
                </div>
              </section>

              <section className="space-y-2">
                <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t("Cobrança")}
                </h3>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="ex-forma">{t("Forma de pagamento")}</Label>
                    <select
                      id="ex-forma"
                      aria-label={t("Forma de pagamento")}
                      className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
                      value={extras.formaPagamento}
                      onChange={alterar("formaPagamento")}
                    >
                      <option value="">{t("Não informar")}</option>
                      {FORMAS_DE_PAGAMENTO.map((f) => (
                        <option key={f} value={f}>
                          {ROTULO_DA_FORMA_DE_PAGAMENTO[f]}
                        </option>
                      ))}
                    </select>
                  </div>

                  {extras.formaPagamento !== "" && (
                    <>
                      <div className="space-y-1.5">
                        <Label htmlFor="ex-parcelas">{t("Parcelas")}</Label>
                        <Input
                          id="ex-parcelas"
                          type="number"
                          min={1}
                          max={120}
                          value={extras.parcelas}
                          onChange={alterar("parcelas")}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="ex-dias">{t("Dias entre vencimentos")}</Label>
                        <Input
                          id="ex-dias"
                          type="number"
                          min={0}
                          max={365}
                          value={extras.diasEntre}
                          onChange={alterar("diasEntre")}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="ex-vencimento">{t("Primeiro vencimento")}</Label>
                        <Input
                          id="ex-vencimento"
                          type="date"
                          value={extras.primeiroVencimento}
                          onChange={alterar("primeiroVencimento")}
                        />
                      </div>
                      <div className="space-y-1.5 sm:col-span-3">
                        <Label htmlFor="ex-descricao">
                          {t("Descrição da forma de pagamento (obrigatória em Outros)")}
                        </Label>
                        <Input
                          id="ex-descricao"
                          maxLength={60}
                          value={extras.descricaoPagamento}
                          onChange={alterar("descricaoPagamento")}
                        />
                      </div>
                    </>
                  )}
                </div>
              </section>

              <section className="space-y-2">
                <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t("Adicionais")}
                </h3>
                <div className="space-y-1.5">
                  <Label htmlFor="ex-inf-cpl">{t("Informações complementares")}</Label>
                  <Textarea
                    id="ex-inf-cpl"
                    rows={3}
                    maxLength={5000}
                    value={extras.informacoesComplementares}
                    onChange={alterar("informacoesComplementares")}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ex-inf-fisco">{t("Informações de interesse do Fisco")}</Label>
                  <Textarea
                    id="ex-inf-fisco"
                    rows={2}
                    maxLength={2000}
                    value={extras.informacoesFisco}
                    onChange={alterar("informacoesFisco")}
                  />
                </div>
              </section>

              <section className="space-y-2">
                <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t("Local de entrega")}
                </h3>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="ex-ent-logradouro">{t("Logradouro")}</Label>
                    <Input
                      id="ex-ent-logradouro"
                      maxLength={60}
                      value={extras.entregaLogradouro}
                      onChange={alterar("entregaLogradouro")}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="ex-ent-numero">{t("Número")}</Label>
                    <Input
                      id="ex-ent-numero"
                      maxLength={60}
                      value={extras.entregaNumero}
                      onChange={alterar("entregaNumero")}
                    />
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="ex-ent-complemento">{t("Complemento")}</Label>
                    <Input
                      id="ex-ent-complemento"
                      maxLength={60}
                      value={extras.entregaComplemento}
                      onChange={alterar("entregaComplemento")}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="ex-ent-bairro">{t("Bairro")}</Label>
                    <Input
                      id="ex-ent-bairro"
                      maxLength={60}
                      value={extras.entregaBairro}
                      onChange={alterar("entregaBairro")}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="ex-ent-municipio">{t("Município")}</Label>
                    <Input
                      id="ex-ent-municipio"
                      maxLength={60}
                      value={extras.entregaMunicipio}
                      onChange={alterar("entregaMunicipio")}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="ex-ent-cod-mun">{t("Código IBGE")}</Label>
                    <Input
                      id="ex-ent-cod-mun"
                      inputMode="numeric"
                      maxLength={7}
                      placeholder="0000000"
                      value={extras.entregaCodigoMunicipio}
                      onChange={alterar("entregaCodigoMunicipio")}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="ex-ent-uf">{t("UF")}</Label>
                    <Input
                      id="ex-ent-uf"
                      maxLength={2}
                      placeholder="SP"
                      value={extras.entregaUf}
                      onChange={alterar("entregaUf")}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="ex-ent-cep">{t("CEP")}</Label>
                    <Input
                      id="ex-ent-cep"
                      inputMode="numeric"
                      maxLength={9}
                      placeholder="00000-000"
                      value={extras.entregaCep}
                      onChange={alterar("entregaCep")}
                    />
                  </div>
                </div>
              </section>
            </div>
          </details>

          <div>
            <Button onClick={() => void emitir()} disabled={emitindo || !configInicial || !pedidoId}>
              {emitindo ? t("Enviando…") : textos.emitir}
            </Button>
          </div>
        </div>
      )}

      {pendencias !== null && pendencias.length > 0 && (
        <div className="rounded-lg border border-warning/40 bg-warning-bg p-3 text-sm" role="alert">
          <p className="font-medium">
            {pendencias.length} {textos.pendencias}
          </p>
          <ul className="mt-1 space-y-1">
            {pendencias.map((p, i) => (
              <li key={i}>
                <Link href={p.onde} className="underline underline-offset-4">
                  {p.mensagem}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
