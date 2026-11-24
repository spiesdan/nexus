/**
 * MONTA OS DADOS DO CATÁLOGO — uma só leitura para prévia e download.
 *
 * Toda query filtra `organization_id` explicitamente (service role bypassa
 * RLS). O gerador recebe SOMENTE foto, nome e código por produto — nenhum
 * campo de preço entra neste módulo.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { COLUNAS_DO_PRODUTO } from "@/lib/schemas/produtos";
import { COLUNAS_DA_CATEGORIA } from "@/lib/schemas/precos";

import {
  agruparProdutos,
  chaveDaCategoria,
  ordenarChaves,
  pendenciasDaSelecao,
  podeGerar,
  type CategoriaDoCatalogo,
  type PendenciaDoCatalogo,
  type ProdutoDoCatalogo,
} from "./agrupamento";
import { fonteDaImagem } from "./pdf/imagens";
import type { ContracapaDoPdf, DadosDoCatalogoPdf, SecaoDoPdf } from "./pdf/CatalogoPdf";

export interface ConfigDoCatalogo {
  id: string;
  nome: string;
  logo_path: string | null;
  incluir_contracapa: boolean;
  produto_ids: string[];
  ordem_categorias: string[];
}

const CONFIG_VAZIA: Omit<ConfigDoCatalogo, "id"> = {
  nome: "Catálogo",
  logo_path: null,
  incluir_contracapa: false,
  produto_ids: [],
  ordem_categorias: [],
};

function comoTexto(valor: unknown): string | null {
  const texto = typeof valor === "string" ? valor.trim() : "";
  return texto !== "" ? texto : null;
}

/** Dados empresariais REAIS cadastrados; sem eles a contracapa é omitida. */
export function contracapaDe(org: Record<string, unknown> | null | undefined): ContracapaDoPdf | null {
  if (!org) return null;
  const razao = comoTexto(org.legal_name);
  if (!razao || /^(empresa|razão social|minha empresa|n\/a|-)$/i.test(razao)) return null;
  const cnpj = comoTexto(org.cnpj);
  const telefone = comoTexto(org.phone);
  const endereco = [org.logradouro, org.numero_end, org.bairro, org.cidade, org.uf]
    .map((parte) => comoTexto(parte))
    .filter(Boolean)
    .join(" — ");
  // Sem nenhum dado de contato além da razão social, não há contracapa útil.
  if (!cnpj && !telefone && !endereco) return null;
  return { razaoSocial: razao, cnpj, telefone, endereco: endereco || null };
}

export async function carregarConfig(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<ConfigDoCatalogo> {
  const { data } = await supabase
    .from("product_catalog_exports")
    .select("id, nome, logo_path, incluir_contracapa, produto_ids, ordem_categorias")
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!data) return { id: "", ...CONFIG_VAZIA };
  return {
    id: String(data.id),
    nome: String(data.nome ?? "Catálogo"),
    logo_path: data.logo_path == null ? null : String(data.logo_path),
    incluir_contracapa: data.incluir_contracapa === true,
    produto_ids: Array.isArray(data.produto_ids) ? data.produto_ids.map(String) : [],
    ordem_categorias: Array.isArray(data.ordem_categorias)
      ? data.ordem_categorias.map(String)
      : [],
  };
}

/** Elegíveis = ativos do tenant; a seleção vem da config, nunca de outra org. */
export async function carregarElegiveis(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<ProdutoDoCatalogo[]> {
  const { data: produtos } = await supabase
    .from("catalog_products")
    .select(COLUNAS_DO_PRODUTO)
    .eq("organization_id", organizationId)
    .eq("ativo", true)
    .order("nome")
    .limit(2000);
  const linhas = (produtos ?? []) as unknown as Array<{
    id: string; codigo: string | null; nome: string | null; categoria: string | null;
  }>;
  const ids = linhas.map((p) => String(p.id));
  const capas = new Map<string, string | null>();
  if (ids.length > 0) {
    const { data: fotos } = await supabase
      .from("product_images")
      .select("product_id, storage_path, posicao")
      .eq("organization_id", organizationId)
      .in("product_id", ids)
      .order("posicao", { ascending: true });
    for (const foto of fotos ?? []) {
      const id = String(foto.product_id);
      if (capas.has(id)) continue;
      capas.set(id, comoTexto(foto.storage_path));
    }
  }
  return linhas.map((p) => ({
    id: String(p.id),
    codigo: comoTexto(p.codigo),
    nome: comoTexto(p.nome),
    categoria: comoTexto(p.categoria),
    fotoCapa: capas.get(String(p.id)) ?? null,
  }));
}

export async function carregarCategorias(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<CategoriaDoCatalogo[]> {
  const { data } = await supabase
    .from("product_categories")
    .select(COLUNAS_DA_CATEGORIA)
    .eq("organization_id", organizationId)
    .order("posicao")
    .order("nome")
    .limit(500);
  return (data ?? []).map((c) => ({
    id: String(c.id),
    nome: String(c.nome),
    parent_id: c.parent_id == null ? null : String(c.parent_id),
    posicao: Number(c.posicao) || 0,
    ativo: c.ativo === true,
  }));
}

export interface MontagemDoCatalogo {
  dados: DadosDoCatalogoPdf;
  pendencias: PendenciaDoCatalogo;
  podeGerar: boolean;
  config: ConfigDoCatalogo;
  elegiveis: ProdutoDoCatalogo[];
  categorias: CategoriaDoCatalogo[];
}

/** Prévia e download chamam ESTA função — o PDF nunca é um mockup diferente. */
export async function montarCatalogo(supabase: SupabaseClient, organizationId: string): Promise<MontagemDoCatalogo> {
  const [config, elegiveis, categorias, org] = await Promise.all([
    carregarConfig(supabase, organizationId),
    carregarElegiveis(supabase, organizationId),
    carregarCategorias(supabase, organizationId),
    supabase
      .from("organizations")
      .select("legal_name, cnpj, phone, logradouro, numero_end, bairro, cidade, uf")
      .eq("id", organizationId)
      .maybeSingle(),
  ]);

  const selecionados = config.produto_ids.length > 0
    ? elegiveis.filter((p) => config.produto_ids.includes(p.id))
    : elegiveis;
  const pendencias = pendenciasDaSelecao(selecionados, categorias);
  const secoes = agruparProdutos(selecionados, categorias, config.ordem_categorias);
  const chaves = ordenarChaves(secoes.map((s) => s.chave), categorias, config.ordem_categorias);
  const secoesOrdenadas = chaves.map((chave) => secoes.find((s) => s.chave === chave)!);

  const itensPorSecao: SecaoDoPdf[] = await Promise.all(
    secoesOrdenadas.map(async (secao) => ({
      chave: secao.chave,
      rotulo: secao.rotulo,
      produtos: await Promise.all(
        secao.produtos.map(async (produto) => ({
          nome: produto.nome?.trim() || "(sem nome)",
          codigo: produto.codigo?.trim() || "(sem código)",
          foto: await fonteDaImagem(produto.fotoCapa),
        })),
      ),
    })),
  );

  const contracapa = config.incluir_contracapa ? contracapaDe(org.data as unknown as Record<string, unknown>) : null;
  return {
    dados: {
      ano: new Date().getFullYear(),
      logo: await fonteDaImagem(config.logo_path),
      secoes: itensPorSecao,
      contracapa,
      ordemRevisada: chaves,
    },
    pendencias,
    podeGerar: podeGerar(pendencias),
    config,
    elegiveis,
    categorias,
  };
}

/** A chave normalizada é o que a tela usa para reordenar; nada de categoria nova. */
export function chaveDeOrdemDaCategoria(nome: string): string {
  return chaveDaCategoria(nome);
}
