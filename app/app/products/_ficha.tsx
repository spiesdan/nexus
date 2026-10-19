"use client";

import * as React from "react";
import { Plus } from "lucide-react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useT } from "@/hooks/i18n/useT";
import type { Categoria } from "@/lib/schemas/precos";

/**
 * A FICHA DO PRODUTO — a mesma nos dois formulários (cadastro e edição).
 *
 * ═══ POR QUE UMA PEÇA SÓ ═════════════════════════════════════════════════
 *
 * A ficha existe duas vezes na tela (criar e editar) e as duas cresceram com a
 * cópia do Mercos: IPI, comissão, observações, múltiplo, peso e dimensões,
 * variações. Duplicar isso é garantir que o cadastro ganhe um campo que a
 * edição esquece — o defeito que o dono descreve como "cadastrei e depois não
 * consigo corrigir".
 *
 * ═══ POR QUE AS ABAS USAM `forceMount` ═══════════════════════════════════
 *
 * O NCM é preenchido SOZINHO enquanto a pessoa digita o nome (0256), e a
 * sugestão mora na aba "Informações gerais" — que pode estar fechada. Com o
 * desmonte padrão do Radix, o campo oculto nem existiria no DOM e a busca
 * escreveria num input que não está lá. `forceMount` mantém os quatro painéis
 * montados (o inativo fica `hidden`, invisível e não focável): a sugestão cai
 * no campo real e o ponto na aba avisa que há algo novo lá dentro.
 *
 * ═══ O QUE ESTA FICHA NÃO FAZ ════════════════════════════════════════════
 *
 * Variações NÃO geram SKU filho como no Mercos: grava cores e tamanhos e os
 * devolve na tela. Gerar a matriz de SKUs é outro produto (tabela de variantes,
 * preço e estoque por combinação) — ver o comentário da migration 0275.
 */

/** O que o formulário edita, tudo como texto (o parse é no envio). */
export interface Rascunho {
  codigo: string;
  nome: string;
  marca: string;
  categoria: string;
  /** Moeda do preço de tabela. Hoje só BRL circula, mas o valor é o do produto. */
  moeda: string;
  preco: string;
  custo: string;
  quantidade: string;
  controla_estoque: boolean;
  ncm: string;
  unidade: string;
  multiplo: string;
  ipi: string;
  comissao: string;
  observacoes: string;
  pesoBruto: string;
  largura: string;
  altura: string;
  comprimento: string;
  caixaPeso: string;
  caixaLargura: string;
  caixaAltura: string;
  caixaComprimento: string;
  /** Cores separadas por vírgula ("azul, verde") — a tela mostra em chips. */
  cores: string;
  /** Tamanhos separados por vírgula ("500 ml, 1 L"). */
  tamanhos: string;
  destaque: boolean;
  emPromocao: boolean;
  precoPromocional: string;
  promocaoAte: string;
}

export const RASCUNHO_VAZIO: Rascunho = {
  codigo: "",
  nome: "",
  marca: "",
  categoria: "",
  moeda: "BRL",
  preco: "",
  custo: "",
  quantidade: "0",
  controla_estoque: true,
  ncm: "",
  unidade: "",
  multiplo: "1",
  ipi: "",
  comissao: "",
  observacoes: "",
  pesoBruto: "",
  largura: "",
  altura: "",
  comprimento: "",
  caixaPeso: "",
  caixaLargura: "",
  caixaAltura: "",
  caixaComprimento: "",
  cores: "",
  tamanhos: "",
  destaque: false,
  emPromocao: false,
  precoPromocional: "",
  promocaoAte: "",
};

/** Vírgula (ou ponto e vírgula) separa; espaço nas pontas e vazio saem. */
export function listaDeTexto(texto: string): string[] {
  return [
    ...new Set(
      texto
        .split(/[,;]/)
        .map((v) => v.trim())
        .filter((v) => v !== ""),
    ),
  ];
}

/** O inverso: array → "azul, verde", para o campo de edição. */
export function textoDeLista(valores: string[] | undefined): string {
  return (valores ?? []).join(", ");
}

const CLASSE_DO_CAMPO = "mt-1 h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm";

function Campo({
  id,
  rotulo,
  valor,
  onChange,
  placeholder,
  tipo = "text",
  inputMode,
  className,
  obrigatorio,
  dica,
}: {
  id: string;
  rotulo: string;
  valor: string;
  onChange: (v: string) => void;
  placeholder?: string;
  tipo?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  className?: string;
  obrigatorio?: boolean;
  dica?: React.ReactNode;
}) {
  const t = useT();
  return (
    <label className={`text-sm ${className ?? ""}`} htmlFor={id}>
      <span className="font-medium">
        {obrigatorio ? <span aria-hidden="true">* </span> : null}
        {t(rotulo)}
      </span>
      <input
        id={id}
        data-testid={id}
        type={tipo}
        inputMode={inputMode}
        value={valor}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={CLASSE_DO_CAMPO}
      />
      {dica}
    </label>
  );
}

export function FichaDoProduto({
  prefixo,
  rascunho,
  setRascunho,
  categorias,
  aoMudarNome,
  aoMudarNcm,
  badgeNcm,
  fotoSlot,
}: {
  /** `produto` no cadastro, `editar` na edição — é o prefixo dos `data-testid`. */
  prefixo: "produto" | "editar";
  rascunho: Rascunho;
  setRascunho: React.Dispatch<React.SetStateAction<Rascunho>>;
  categorias: Categoria[];
  aoMudarNome: (nome: string) => void;
  aoMudarNcm: (ncm: string) => void;
  /** O selo "Sugerido · descrição" que a busca de NCM produz (pode ser null). */
  badgeNcm: React.ReactNode;
  /** A coluna da foto (o mesmo componente da lista, com upload). */
  fotoSlot?: React.ReactNode;
}) {
  const t = useT();
  const [variacoesAbertas, setVariacoesAbertas] = React.useState(
    rascunho.cores.trim() !== "" || rascunho.tamanhos.trim() !== "",
  );

  /** Categoria é lista, não texto: o Mercos oferece as que a loja cadastrou. */
  const nomesDeCategoria = React.useMemo(() => {
    const nomes = categorias.map((c) => c.nome);
    if (rascunho.categoria && !nomes.includes(rascunho.categoria)) {
      nomes.push(rascunho.categoria);
    }
    return nomes;
  }, [categorias, rascunho.categoria]);

  const cores = listaDeTexto(rascunho.cores);
  const tamanhos = listaDeTexto(rascunho.tamanhos);

  return (
    <div className="space-y-4">
      {/* O topo é o mesmo em todas as abas do Mercos: foto, nome, código,
          unidade, múltiplo e categoria ficam SEMPRE visíveis. */}
      <div className="grid gap-3 md:grid-cols-[120px_minmax(0,1fr)_200px]">
        <div className="space-y-1">
          <span className="text-sm font-medium">{t("Foto")}</span>
          <div className="flex h-24 w-20 items-center justify-center rounded-lg border bg-muted/30">
            {fotoSlot ?? (
              <span className="px-2 text-center text-[11px] text-muted-foreground">
                {t("salve para enviar")}
              </span>
            )}
          </div>
        </div>
        <Campo
          id={`${prefixo}-nome`}
          rotulo="Nome"
          obrigatorio
          valor={rascunho.nome}
          onChange={aoMudarNome}
          placeholder={t("Ex.: Água sanitária 5 L")}
        />
        <Campo
          id={`${prefixo}-codigo`}
          rotulo="Código"
          valor={rascunho.codigo}
          onChange={(v) => setRascunho((r) => ({ ...r, codigo: v }))}
          placeholder={t("SKU ou referência")}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Campo
          id={`${prefixo}-unidade`}
          rotulo="Unidade de medida"
          valor={rascunho.unidade}
          onChange={(v) => setRascunho((r) => ({ ...r, unidade: v }))}
          placeholder="Kg, Cx, Un, Pç, etc."
        />
        <Campo
          id={`${prefixo}-multiplo`}
          rotulo="Venda em múltiplos de"
          valor={rascunho.multiplo}
          onChange={(v) => setRascunho((r) => ({ ...r, multiplo: v }))}
          inputMode="numeric"
          placeholder="1"
        />
        <label className="text-sm" htmlFor={`${prefixo}-categoria`}>
          <span className="font-medium">{t("Categoria")}</span>
          <select
            id={`${prefixo}-categoria`}
            data-testid={`${prefixo}-categoria`}
            value={rascunho.categoria}
            onChange={(e) => setRascunho((r) => ({ ...r, categoria: e.target.value }))}
            className={CLASSE_DO_CAMPO}
          >
            <option value="">{t("Sem categoria")}</option>
            {nomesDeCategoria.map((nome) => (
              <option key={nome} value={nome}>
                {nome}
              </option>
            ))}
          </select>
        </label>
      </div>

      <Tabs defaultValue="preco">
        <TabsList aria-label={t("Abas da ficha do produto")}>
          <TabsTrigger value="preco">{t("Tabelas de preço")}</TabsTrigger>
          <TabsTrigger value="gerais">
            {t("Informações gerais")}
            {badgeNcm ? (
              <span
                className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-accent"
                aria-label={t("há um NCM sugerido")}
              />
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="variacoes">{t("Variações")}</TabsTrigger>
          <TabsTrigger value="peso">{t("Peso e dimensões")}</TabsTrigger>
        </TabsList>

        {/* forceMount: ver o bloco do topo do arquivo. */}
        <TabsContent value="preco" forceMount className="space-y-3 pt-2">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm" htmlFor={`${prefixo}-moeda`}>
              <span className="font-medium">{t("Moeda")}</span>
              <select
                id={`${prefixo}-moeda`}
                data-testid={`${prefixo}-moeda`}
                value={rascunho.moeda || "BRL"}
                onChange={(e) => setRascunho((r) => ({ ...r, moeda: e.target.value }))}
                className={CLASSE_DO_CAMPO}
              >
                <option value="BRL">R$ (BRL)</option>
                {/* Uma moeda diferente da lista não pode sumir: o produto já é
                    vendido nela, e trocar para BRL mudaria o preço às escondidas. */}
                {rascunho.moeda && rascunho.moeda !== "BRL" ? (
                  <option value={rascunho.moeda}>{rascunho.moeda}</option>
                ) : null}
              </select>
            </label>
            <Campo
              id={`${prefixo}-preco`}
              rotulo="Preço de Tabela"
              obrigatorio
              valor={rascunho.preco}
              onChange={(v) => setRascunho((r) => ({ ...r, preco: v }))}
              inputMode="decimal"
              placeholder="0,00"
            />
            <Campo
              id={`${prefixo}-custo`}
              rotulo="Custo (R$)"
              valor={rascunho.custo}
              onChange={(v) => setRascunho((r) => ({ ...r, custo: v }))}
              inputMode="decimal"
              placeholder="4.100,00"
            />
            <Campo
              id={`${prefixo}-marca`}
              rotulo="Marca"
              valor={rascunho.marca}
              onChange={(v) => setRascunho((r) => ({ ...r, marca: v }))}
            />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              data-testid={`${prefixo}-destaque`}
              checked={rascunho.destaque}
              onChange={(e) => setRascunho((r) => ({ ...r, destaque: e.target.checked }))}
            />
            {t("Destacar na vitrine")}
          </label>

          <div className="space-y-2 rounded-lg border p-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                data-testid={`${prefixo}-em-promocao`}
                checked={rascunho.emPromocao}
                onChange={(e) => setRascunho((r) => ({ ...r, emPromocao: e.target.checked }))}
              />
              {t("Preço promocional")}
            </label>
            {rascunho.emPromocao ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <Campo
                  id={`${prefixo}-preco-promocional`}
                  rotulo="Preço promocional (R$)"
                  valor={rascunho.precoPromocional}
                  onChange={(v) => setRascunho((r) => ({ ...r, precoPromocional: v }))}
                  inputMode="decimal"
                  placeholder="0,00"
                />
                <Campo
                  id={`${prefixo}-promocao-ate`}
                  rotulo="Promoção até"
                  valor={rascunho.promocaoAte}
                  onChange={(v) => setRascunho((r) => ({ ...r, promocaoAte: v }))}
                  tipo="date"
                />
              </div>
            ) : null}
          </div>
        </TabsContent>

        <TabsContent value="gerais" forceMount className="space-y-3 pt-2">
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo
              id={`${prefixo}-ncm`}
              rotulo="NCM"
              valor={rascunho.ncm}
              onChange={aoMudarNcm}
              inputMode="numeric"
              placeholder="8 dígitos"
              dica={badgeNcm}
            />
            <Campo
              id={`${prefixo}-ipi`}
              rotulo="IPI (%)"
              valor={rascunho.ipi}
              onChange={(v) => setRascunho((r) => ({ ...r, ipi: v }))}
              inputMode="decimal"
              placeholder="0,00"
            />
            <Campo
              id={`${prefixo}-comissao`}
              rotulo="Comissão (%)"
              valor={rascunho.comissao}
              onChange={(v) => setRascunho((r) => ({ ...r, comissao: v }))}
              inputMode="decimal"
              placeholder="0,00"
            />
          </div>

          <label className="block text-sm" htmlFor={`${prefixo}-observacoes`}>
            <span className="font-medium">{t("Observações")}</span>
            <textarea
              id={`${prefixo}-observacoes`}
              data-testid={`${prefixo}-observacoes`}
              value={rascunho.observacoes}
              onChange={(e) => setRascunho((r) => ({ ...r, observacoes: e.target.value }))}
              placeholder={t("Descreva informações adicionais deste produto")}
              className="mt-1 min-h-20 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm"
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-3">
            <Campo
              id={`${prefixo}-quantidade`}
              rotulo="Estoque"
              valor={rascunho.quantidade}
              onChange={(v) => setRascunho((r) => ({ ...r, quantidade: v }))}
              inputMode="numeric"
            />
            <label className="flex items-end gap-2 pb-2 text-sm">
              <input
                type="checkbox"
                data-testid={`${prefixo}-controla-estoque`}
                checked={rascunho.controla_estoque}
                onChange={(e) =>
                  setRascunho((r) => ({ ...r, controla_estoque: e.target.checked }))
                }
              />
              {t("Controla estoque")}
            </label>
          </div>
        </TabsContent>

        <TabsContent value="variacoes" forceMount className="space-y-3 pt-2">
          <p className="text-xs text-muted-foreground">
            {t(
              "Cores e tamanhos deste produto. Não gera um código por combinação — o produto continua sendo um só.",
            )}
          </p>
          {!variacoesAbertas ? (
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-sm"
              onClick={() => setVariacoesAbertas(true)}
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              {t("Definir cores e tamanhos")}
            </button>
          ) : (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <Campo
                  id={`${prefixo}-cores`}
                  rotulo="Cores"
                  valor={rascunho.cores}
                  onChange={(v) => setRascunho((r) => ({ ...r, cores: v }))}
                  placeholder={t("azul, verde, incolor")}
                />
                <Campo
                  id={`${prefixo}-tamanhos`}
                  rotulo="Tamanhos"
                  valor={rascunho.tamanhos}
                  onChange={(v) => setRascunho((r) => ({ ...r, tamanhos: v }))}
                  placeholder={t("500 ml, 1 L, 5 L")}
                />
              </div>
              {(cores.length > 0 || tamanhos.length > 0) && (
                <div className="space-y-1.5">
                  {cores.length > 0 && (
                    <p className="flex flex-wrap items-center gap-1 text-xs">
                      <span className="text-muted-foreground">{t("Cores:")}</span>
                      {cores.map((c) => (
                        <span key={c} className="rounded-full bg-muted px-2 py-0.5">
                          {c}
                        </span>
                      ))}
                    </p>
                  )}
                  {tamanhos.length > 0 && (
                    <p className="flex flex-wrap items-center gap-1 text-xs">
                      <span className="text-muted-foreground">{t("Tamanhos:")}</span>
                      {tamanhos.map((tam) => (
                        <span key={tam} className="rounded-full bg-muted px-2 py-0.5">
                          {tam}
                        </span>
                      ))}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="peso" forceMount className="space-y-4 pt-2">
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">{t("Peso e dimensões unitárias")}</legend>
            <div className="grid gap-3 sm:grid-cols-4">
              <Campo
                id={`${prefixo}-peso-bruto`}
                rotulo="Peso bruto (kg)"
                valor={rascunho.pesoBruto}
                onChange={(v) => setRascunho((r) => ({ ...r, pesoBruto: v }))}
                inputMode="decimal"
              />
              <Campo
                id={`${prefixo}-largura`}
                rotulo="Largura (cm)"
                valor={rascunho.largura}
                onChange={(v) => setRascunho((r) => ({ ...r, largura: v }))}
                inputMode="decimal"
              />
              <Campo
                id={`${prefixo}-altura`}
                rotulo="Altura (cm)"
                valor={rascunho.altura}
                onChange={(v) => setRascunho((r) => ({ ...r, altura: v }))}
                inputMode="decimal"
              />
              <Campo
                id={`${prefixo}-comprimento`}
                rotulo="Comprimento (cm)"
                valor={rascunho.comprimento}
                onChange={(v) => setRascunho((r) => ({ ...r, comprimento: v }))}
                inputMode="decimal"
              />
            </div>
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">
              {t("Peso e dimensões da caixa master")}
            </legend>
            <div className="grid gap-3 sm:grid-cols-4">
              <Campo
                id={`${prefixo}-caixa-peso`}
                rotulo="Peso bruto (kg)"
                valor={rascunho.caixaPeso}
                onChange={(v) => setRascunho((r) => ({ ...r, caixaPeso: v }))}
                inputMode="decimal"
              />
              <Campo
                id={`${prefixo}-caixa-largura`}
                rotulo="Largura (cm)"
                valor={rascunho.caixaLargura}
                onChange={(v) => setRascunho((r) => ({ ...r, caixaLargura: v }))}
                inputMode="decimal"
              />
              <Campo
                id={`${prefixo}-caixa-altura`}
                rotulo="Altura (cm)"
                valor={rascunho.caixaAltura}
                onChange={(v) => setRascunho((r) => ({ ...r, caixaAltura: v }))}
                inputMode="decimal"
              />
              <Campo
                id={`${prefixo}-caixa-comprimento`}
                rotulo="Comprimento (cm)"
                valor={rascunho.caixaComprimento}
                onChange={(v) => setRascunho((r) => ({ ...r, caixaComprimento: v }))}
                inputMode="decimal"
              />
            </div>
          </fieldset>
        </TabsContent>
      </Tabs>
    </div>
  );
}
