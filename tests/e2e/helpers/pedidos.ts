import { expect, type Page } from "@playwright/test";

/**
 * Seeds de pedido/produto/contato pela API autenticada (cookie da sessão do
 * teste). Usados pelas specs de jornada que PRECISAM de um pedido pronto como
 * precondição — a criação pela tela não é o que elas medem (isso é a Jornada
 * 1, `jornada-venda.spec.ts`).
 *
 * Todos os caminhos devolvem 201 com o shape `{ data: … }` de `ok()`: produto
 * e pedido trazem `id` direto; contato traz `data.contact.id`.
 */

interface OpcoesDeProduto {
  precoCents?: number;
  /** Padrão `false`: a maior parte das jornadas não mede estoque. */
  controlaEstoque?: boolean;
  /** NCM de 8 dígitos — a pre-validação do SPED cobra por item (jornada fiscal). */
  ncm?: string;
}

export async function semearProduto(page: Page, nome: string, opcoes: OpcoesDeProduto = {}) {
  const codigo = `E2E${Date.now()}${Math.floor(Math.random() * 900 + 100)}`;
  const resposta = await page.request.post("/api/v1/products", {
    data: {
      codigo,
      nome,
      preco_cents: opcoes.precoCents ?? 4990,
      controla_estoque: opcoes.controlaEstoque ?? false,
      ...(opcoes.ncm ? { ncm: opcoes.ncm } : {}),
    },
  });
  expect(resposta.status(), `não deu para semear o produto "${nome}"`).toBe(201);
  const corpo = (await resposta.json()) as { data: { id: string } };
  return corpo.data.id;
}

export async function semearContato(page: Page, nome: string) {
  const resposta = await page.request.post("/api/v1/contacts", {
    data: { display_name: nome, source: "manual" },
  });
  expect(resposta.status(), `não deu para semear o contato "${nome}"`).toBe(201);
  // O corpo é `{ data: { contact: { id } } }`, não `{ data: { id } }`.
  const corpo = (await resposta.json()) as { data: { contact: { id: string } } };
  return corpo.data.contact.id;
}

interface OpcoesDePedido {
  produtoId: string;
  contactId?: string;
  status?: "rascunho" | "em_analise" | "aprovado";
  precoCents?: number;
  condicao?: string;
}

export async function semearPedido(page: Page, clienteNome: string, opcoes: OpcoesDePedido) {
  const resposta = await page.request.post("/api/v1/commercial-orders", {
    data: {
      ...(opcoes.contactId ? { contact_id: opcoes.contactId } : {}),
      cliente_nome: clienteNome,
      status: opcoes.status ?? "aprovado",
      origem: "vendedor",
      desconto_cents: 0,
      frete_cents: 0,
      ...(opcoes.condicao ? { condicao_pagamento: opcoes.condicao } : {}),
      itens: [
        {
          product_id: opcoes.produtoId,
          quantidade: 1,
          preco_unit_cents: opcoes.precoCents ?? 4990,
        },
      ],
    },
  });
  expect(resposta.status(), `não deu para semear o pedido de "${clienteNome}"`).toBe(201);
  const corpo = (await resposta.json()) as { data: { id: string; numero: number } };
  return { id: corpo.data.id, numero: corpo.data.numero };
}

/** `PED-0001` — o formato do `numeroDoPedido` de `lib/format/moeda.ts`. */
export function rotuloDoPedido(numero: number): string {
  return `PED-${String(numero).padStart(4, "0")}`;
}
