/**
 * GET /api/v1/device/catalog — o catálogo que o aparelho pode levar para a rua.
 *
 * ─── Por que uma rota só, e não as três da tela ────────────────────────────
 *
 * `/products`, `/contacts` e `/price-tables` são telas autenticadas por sessão,
 * com filtros, ordenação e regras de visibilidade de papel. O shell precisa de
 * um retrato pequeno e estável: id, nome, preço, estoque, documento e limite.
 * Reusar as três obrigaria a abrir autenticação de dispositivo em cada uma —
 * três lugares para alguém esquecer o filtro de organização.
 *
 * Aqui a organização vem do TOKEN (nunca de query/body) e o service role só é
 * usado com esse filtro explícito em toda query.
 *
 * ─── Paginação ─────────────────────────────────────────────────────────────
 *
 * Contatos paginam por `id` (cursor opaco, `?cursor=`), 200 por página — a
 * mesma razão do catálogo da tela: uma base grande não pode virar uma resposta
 * só no 3G do vendedor. Produtos e tabelas vêm na primeira página (500
 * produtos é o teto que o sync existente já assumia); não se repetem nas
 * seguintes, para não duplicar payload a cada página.
 *
 * ─── O que NÃO vai ────────────────────────────────────────────────────────
 *
 * CPF (cifrado, não sai na lista em lugar nenhum), e-mail, telefone, endereço.
 * O aparelho precisa de nome, cidade, CNPJ e limite para vender e avisar sobre
 * crédito. Cada coluna a mais é dado pessoal no celular do vendedor.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { autenticarDispositivo, ESCOPO_CATALOGO } from "@/lib/auth/device-token";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const CONTATOS_POR_PAGINA = 200;
const PRODUTOS_MAX = 500;
const TABELAS_MAX = 100;

interface Cursor {
  id: string;
}

function lerCursor(bruto: string | null): Cursor | null {
  if (!bruto) return null;
  try {
    const json = Buffer.from(bruto, "base64url").toString("utf8");
    const p = JSON.parse(json) as Partial<Cursor>;
    if (typeof p.id !== "string") return null;
    return { id: p.id };
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();

  const auth = await autenticarDispositivo(req, ESCOPO_CATALOGO);
  if (!auth.ok) return fail(auth.code, auth.message, auth.status, { requestId });
  const orgId = auth.dispositivo.organizationId;

  const params = req.nextUrl.searchParams;
  const cursorBruto = params.get("cursor");
  const cursor = lerCursor(cursorBruto);
  if (cursorBruto && !cursor) {
    return fail("invalid_cursor", "Cursor inválido.", 400, { requestId });
  }

  const admin = createAdminClient();

  // ─── Contatos (paginados) ────────────────────────────────────────────────
  let contatosQuery = admin
    .from("contacts")
    .select("id, display_name, name, cnpj, cidade, limite_credito_cents")
    .eq("organization_id", orgId)
    // Mesmo recorte da lista da tela: anonimizado é dado que a LGPD mandou
    // apagar; mesclado é ponteiro para a pessoa canônica.
    .eq("is_anonymized", false)
    .is("is_merged_into", null)
    .order("id", { ascending: true })
    .limit(CONTATOS_POR_PAGINA + 1);
  if (cursor) contatosQuery = contatosQuery.gt("id", cursor.id);

  const { data: contatosBrutos, error: erroContatos } = await contatosQuery;
  if (erroContatos) {
    return fail("internal_error", erroContatos.message, 500, { requestId });
  }
  const linhasDeContato = (contatosBrutos ?? []) as Array<{
    id: string;
    display_name: string | null;
    name: string | null;
    cnpj: string | null;
    cidade: string | null;
    limite_credito_cents: number | null;
  }>;
  const temMais = linhasDeContato.length > CONTATOS_POR_PAGINA;
  const paginaDeContatos = temMais
    ? linhasDeContato.slice(0, CONTATOS_POR_PAGINA)
    : linhasDeContato;
  const ultimo = paginaDeContatos[paginaDeContatos.length - 1];
  const proximoCursor =
    temMais && ultimo
      ? Buffer.from(JSON.stringify({ id: ultimo.id }), "utf8").toString("base64url")
      : null;

  const contatos = paginaDeContatos.map((c) => ({
    id: c.id,
    nome: c.display_name ?? c.name ?? "",
    documento: c.cnpj,
    cidade: c.cidade,
    limite_cents: c.limite_credito_cents,
  }));

  // ─── Produtos e tabelas: só na primeira página ───────────────────────────
  let produtos: unknown[] = [];
  let tabelas: unknown[] = [];

  if (!cursor) {
    const { data: produtosBrutos, error: erroProdutos } = await admin
      .from("catalog_products")
      .select("id, codigo, nome, preco_cents, controla_estoque, quantidade, ativo")
      .eq("organization_id", orgId)
      .order("nome", { ascending: true })
      .limit(PRODUTOS_MAX);
    if (erroProdutos) return fail("internal_error", erroProdutos.message, 500, { requestId });

    produtos = (produtosBrutos ?? []) as unknown[];

    const { data: tabelasBrutas, error: erroTabelas } = await admin
      .from("price_tables")
      .select("id, nome, desconto_pct, ativo")
      .eq("organization_id", orgId)
      .eq("ativo", true)
      .order("nome", { ascending: true })
      .limit(TABELAS_MAX);
    if (erroTabelas) return fail("internal_error", erroTabelas.message, 500, { requestId });

    const tabelasAtivas = (tabelasBrutas ?? []) as Array<{
      id: string;
      nome: string;
      desconto_pct: number;
    }>;
    if (tabelasAtivas.length > 0) {
      const { data: itens, error: erroItens } = await admin
        .from("price_table_items")
        .select("price_table_id, product_id, preco_cents")
        .eq("organization_id", orgId)
        .in(
          "price_table_id",
          tabelasAtivas.map((t) => t.id),
        );
      if (erroItens) return fail("internal_error", erroItens.message, 500, { requestId });

      const porTabela = new Map<string, unknown[]>();
      for (const item of (itens ?? []) as Array<{
        price_table_id: string;
        product_id: string;
        preco_cents: number | null;
      }>) {
        const lista = porTabela.get(item.price_table_id) ?? [];
        lista.push({ produto_id: item.product_id, preco_cents: item.preco_cents });
        porTabela.set(item.price_table_id, lista);
      }

      tabelas = tabelasAtivas.map((t) => ({
        id: t.id,
        nome: t.nome,
        desconto_pct: t.desconto_pct,
        itens: porTabela.get(t.id) ?? [],
      }));
    }
  }

  return ok(
    { produtos, contatos, tabelas },
    {
      requestId,
      meta: {
        cursor: proximoCursor,
        has_more: temMais,
        contatos_por_pagina: CONTATOS_POR_PAGINA,
      },
    },
  );
}
