"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { NexusPageHeader } from "@/components/nexus-ui/layout/NexusPageHeader";
import { useT } from "@/hooks/i18n/useT";
import { urlDoCatalogo } from "@/lib/catalogo/paginacao";
import type { Produto } from "@/lib/schemas/produtos";
import type { Categoria, TabelaDePreco } from "@/lib/schemas/precos";
import type { FotoDoProduto } from "@/lib/comercial/fotos-dos-produtos";

import { ProdutosClient } from "./_client";
import { CategoriasClient } from "./_categorias";
import { TabelasClient } from "./_tabelas";

/**
 * O CATÁLOGO EM ABAS — a fileira de cima é a do Mercos.
 *
 * Produtos · Promoções · Destaques · Configurações. As três primeiras são o
 * MESMO catálogo com um filtro diferente, e por isso viajam na URL
 * (`?promo=1`, `?destaque=1`): filtro que mora em `useState` filtra a fatia de
 * 50 já baixada e responde "nenhuma promoção" com o catálogo cheio delas.
 * "Configurações" guarda o que o Mercos separa da listagem: categorias e
 * tabelas de preço.
 *
 * Sem entrada nova na sidebar de propósito: catálogo é um módulo só, e o
 * grupo CRM já tem Funis, Contatos, Produtos e Pedidos na dobra.
 */
export function CatalogoClient({
  produtos,
  fotosPorProduto,
  categorias,
  tabelas,
  podeEditar,
  textosProdutos,
  buscaInicial,
  semFoto,
  categoriaInicial,
  statusInicial,
  promoInicial,
  destaqueInicial,
  configInicial,
  total,
  pagina,
  porPagina,
}: {
  produtos: Produto[];
  /** Fotos prontas, montadas no servidor: chegam no HTML inicial. */
  fotosPorProduto: Record<string, FotoDoProduto[]>;
  categorias: Categoria[];
  tabelas: TabelaDePreco[];
  podeEditar: boolean;
  textosProdutos: React.ComponentProps<typeof ProdutosClient>["textos"];
  buscaInicial?: string;
  /** Vem da lista de ids (exata, sem depender do `count`): a aba "Importar fotos". */
  semFoto?: boolean;
  /** Os filtros da barra, todos do SERVIDOR (ver `page.tsx` e `urlDoCatalogo`). */
  categoriaInicial?: string;
  statusInicial?: "todos" | "ativos" | "inativos";
  promoInicial?: boolean;
  destaqueInicial?: boolean;
  configInicial?: "categorias" | "tabelas" | null;
  /** Total EXATO (tamanho da lista de ids): nunca chute, nunca amostra. */
  total: number;
  pagina: number;
  porPagina: number;
}) {
  const t = useT();
  const router = useRouter();

  /** Qual das quatro fileiras está acesa — a URL é a única fonte. */
  const abaSuperior: "produtos" | "promocoes" | "destaques" | "configuracoes" = configInicial
    ? "configuracoes"
    : promoInicial
      ? "promocoes"
      : destaqueInicial
        ? "destaques"
        : "produtos";

  const filtros = {
    busca: buscaInicial,
    categoria: categoriaInicial,
    status: statusInicial,
    semFoto,
  };

  function aoMudarAbaSuperior(valor: string) {
    if (valor === "promocoes") {
      router.replace(urlDoCatalogo({ ...filtros, semFoto: false, promo: true, pagina: 1 }));
      return;
    }
    if (valor === "destaques") {
      router.replace(urlDoCatalogo({ ...filtros, semFoto: false, destaque: true, pagina: 1 }));
      return;
    }
    if (valor === "configuracoes") {
      router.replace(urlDoCatalogo({ ...filtros, semFoto: false, config: "categorias" }));
      return;
    }
    router.replace(urlDoCatalogo({ ...filtros, semFoto: false, pagina: 1 }));
  }

  const produtosEmAba = (aba: "produtos" | "promocoes" | "destaques") => (
    <ProdutosClient
      inicial={produtos}
      fotosIniciais={fotosPorProduto}
      podeEditar={podeEditar}
      textos={textosProdutos}
      esconderCabecalho
      buscaInicial={buscaInicial}
      semFotoInicial={semFoto}
      categoriaInicial={categoriaInicial}
      statusInicial={statusInicial}
      promoInicial={promoInicial}
      destaqueInicial={destaqueInicial}
      categorias={categorias}
      tabelas={tabelas}
      total={total}
      pagina={pagina}
      porPagina={porPagina}
    />
  );

  return (
    <div className="w-full space-y-4 p-4 sm:p-6">
      <NexusPageHeader
        title={t("Catálogo")}
        subtitle={t("Produtos, categorias e tabelas de preço da loja.")}
      />
      <Tabs value={abaSuperior} onValueChange={aoMudarAbaSuperior}>
        <TabsList aria-label={t("Abas do catálogo")}>
          <TabsTrigger value="produtos">{t("Produtos")}</TabsTrigger>
          <TabsTrigger value="promocoes">{t("Promoções")}</TabsTrigger>
          <TabsTrigger value="destaques">{t("Destaques")}</TabsTrigger>
          <TabsTrigger value="configuracoes">{t("Configurações")}</TabsTrigger>
        </TabsList>

        {/*
          Só a aba acesa monta: cada uma carrega o MESMO componente, com um
          filtro de servidor diferente. As inativas nem existem no DOM — não há
          três catálogos escondidos consumindo estado.
        */}
        <TabsContent value="produtos" className="mt-4">
          {abaSuperior === "produtos" ? produtosEmAba("produtos") : null}
        </TabsContent>
        <TabsContent value="promocoes" className="mt-4">
          {abaSuperior === "promocoes" ? produtosEmAba("promocoes") : null}
        </TabsContent>
        <TabsContent value="destaques" className="mt-4">
          {abaSuperior === "destaques" ? produtosEmAba("destaques") : null}
        </TabsContent>
        <TabsContent value="configuracoes" className="mt-4">
          <Tabs
            value={configInicial ?? "categorias"}
            onValueChange={(valor) =>
              router.replace(
                urlDoCatalogo({
                  ...filtros,
                  semFoto: false,
                  config: valor === "tabelas" ? "tabelas" : "categorias",
                }),
              )
            }
          >
            <TabsList aria-label={t("Configurações do catálogo")}>
              <TabsTrigger value="categorias">{t("Categorias")}</TabsTrigger>
              <TabsTrigger value="tabelas">{t("Tabelas de preço")}</TabsTrigger>
            </TabsList>
            <TabsContent value="categorias" className="mt-4">
              <CategoriasClient inicial={categorias} podeEditar={podeEditar} />
            </TabsContent>
            <TabsContent value="tabelas" className="mt-4">
              <TabelasClient inicial={tabelas} produtos={produtos} podeEditar={podeEditar} />
            </TabsContent>
          </Tabs>
        </TabsContent>
      </Tabs>
    </div>
  );
}
