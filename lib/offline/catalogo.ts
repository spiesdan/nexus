/**
 * O CATÁLOGO NO BOLSO — produtos, clientes e tabelas para escolher offline.
 *
 * ─── Por que baixar antes ───────────────────────────────────────────────────
 *
 * Sem catálogo não há pedido offline: o vendedor precisa do nome, do preço e
 * do cliente. A regra é explícita na tela — "sem catálogo sincronizado, o
 * botão de novo pedido nem aparece" — porque um pedido digitado à mão com
 * preço chutado é o que o servidor vai recusar no sync, e aí o trabalho da
 * viagem inteira vira retrabalho.
 *
 * ─── O que cada tabela guarda (e o que NÃO guarda) ──────────────────────────
 *
 * Só o que a captura precisa: id, nome, preço, estoque (para avisar, não para
 * travar — a trava é do servidor no sync), cliente com documento e limite
 * (para o mesmo aviso). Nada de foto, descrição longa ou histórico: cada byte
 * aqui é bateria e espaço no aparelho do vendedor.
 *
 * ─── O carimbo ─────────────────────────────────────────────────────────────
 *
 * `catalogo_sincronizado_em` em `meta`. A tela mostra "catálogo de 3 dias
 * atrás" — preço velho é o segundo motivo de 422 no sync (o primeiro é
 * crédito), e o vendedor precisa saber que está vendendo com preço velho
 * ANTES de prometer.
 */

import type { Db } from "./outbox";

export const SCHEMA_DO_CATALOGO = `
CREATE TABLE IF NOT EXISTS catalogo_produtos (
  id TEXT PRIMARY KEY,
  codigo TEXT,
  nome TEXT NOT NULL,
  preco_cents INTEGER NOT NULL,
  controla_estoque INTEGER NOT NULL DEFAULT 0,
  quantidade REAL,
  ativo INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS catalogo_contatos (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  documento TEXT,
  cidade TEXT,
  limite_cents INTEGER
);
CREATE TABLE IF NOT EXISTS catalogo_tabelas (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  desconto_pct REAL NOT NULL DEFAULT 0,
  itens TEXT NOT NULL DEFAULT '[]'
);
CREATE TABLE IF NOT EXISTS meta (
  chave TEXT PRIMARY KEY,
  valor TEXT NOT NULL
);
`;

export interface ProdutoEmCache {
  id: string;
  codigo: string | null;
  nome: string;
  preco_cents: number;
  controla_estoque: boolean;
  quantidade: number | null;
  ativo: boolean;
}

export interface ContatoEmCache {
  id: string;
  nome: string;
  documento: string | null;
  cidade: string | null;
  limite_cents: number | null;
}

type GetJson = (url: string) => Promise<{ status: number; corpo: () => Promise<unknown> }>;

/**
 * Baixa tudo e troca o cache de uma vez.
 *
 * Troca e não mescla: mesclar deixaria produto desativado no servidor ainda
 * vendável no aparelho. O que o servidor não mandou, não existe mais.
 */
export async function sincronizarCatalogo(
  db: Db,
  buscar: GetJson,
  agora: () => string = () => new Date().toISOString(),
): Promise<{ produtos: number; contatos: number; tabelas: number }> {
  const produtos = await baixarProdutos(buscar);
  const contatos = await baixarContatos(buscar);
  const tabelas = await baixarTabelas(buscar);

  await db.execute(`DELETE FROM catalogo_produtos`);
  for (const p of produtos) {
    await db.execute(
      `INSERT INTO catalogo_produtos (id, codigo, nome, preco_cents, controla_estoque, quantidade, ativo)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        p.id,
        p.codigo,
        p.nome,
        p.preco_cents,
        p.controla_estoque ? 1 : 0,
        p.quantidade,
        p.ativo ? 1 : 0,
      ],
    );
  }

  await db.execute(`DELETE FROM catalogo_contatos`);
  for (const c of contatos) {
    await db.execute(
      `INSERT INTO catalogo_contatos (id, nome, documento, cidade, limite_cents)
       VALUES (?, ?, ?, ?, ?)`,
      [c.id, c.nome, c.documento, c.cidade, c.limite_cents],
    );
  }

  await db.execute(`DELETE FROM catalogo_tabelas`);
  for (const t of tabelas) {
    await db.execute(
      `INSERT INTO catalogo_tabelas (id, nome, desconto_pct, itens) VALUES (?, ?, ?, ?)`,
      [t.id, t.nome, t.desconto_pct, JSON.stringify(t.itens)],
    );
  }

  await db.execute(
    `INSERT INTO meta (chave, valor) VALUES ('catalogo_sincronizado_em', ?)
     ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`,
    [agora()],
  );

  return { produtos: produtos.length, contatos: contatos.length, tabelas: tabelas.length };
}

async function baixarProdutos(buscar: GetJson): Promise<ProdutoEmCache[]> {
  // O servidor entrega até 500 por chamada, sem paginação. Acima disso, o
  // vendedor ficaria com catálogo parcial sem saber — e parcial silencioso é
  // pior que erro barulhento. Se um dia bater no teto, o servidor precisa de
  // paginação real — e este comentário é o lembrete.
  const r = await buscar("/api/v1/products");
  if (r.status !== 200) throw new Error(`produtos: servidor respondeu ${r.status}`);
  const corpo = (await r.corpo()) as { data?: Record<string, unknown>[] };
  return (corpo.data ?? []).map((p) => ({
    id: String(p.id),
    codigo: (p.codigo as string | null) ?? null,
    nome: String(p.nome ?? ""),
    preco_cents: Number(p.preco_cents ?? 0),
    controla_estoque: Boolean(p.controla_estoque),
    quantidade: p.quantidade != null ? Number(p.quantidade) : null,
    ativo: p.ativo !== false,
  }));
}

async function baixarContatos(buscar: GetJson): Promise<ContatoEmCache[]> {
  const todos: ContatoEmCache[] = [];
  let cursor: string | null = null;
  // Teto de segurança: 20 páginas. Sem ele, um cursor quebrado em loop
  // baixaria a base inteira para sempre — e o vendedor sem bateria.
  for (let pagina = 0; pagina < 20; pagina++) {
    const r = await buscar(
      `/api/v1/contacts${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
    );
    if (r.status !== 200) throw new Error(`contatos: servidor respondeu ${r.status}`);
    const corpo = (await r.corpo()) as {
      data?: Record<string, unknown>[];
      meta?: { cursor?: string | null; has_more?: boolean };
    };
    for (const c of corpo.data ?? []) {
      // Os nomes são os da API real (`SELECT_COLS` em contacts/_handler.ts):
      // `cnpj` em texto (o CPF é cifrado e não sai na lista), limite em
      // `limite_credito_cents`. Chutar nome de campo aqui baixa coluna vazia
      // sem erro — e o vendedor vende sem limite à mostra.
      todos.push({
        id: String(c.id),
        nome: String((c.display_name ?? c.name ?? "") as string),
        documento: (c.cnpj as string | null) ?? null,
        cidade: (c.cidade as string | null) ?? null,
        limite_cents: c.limite_credito_cents != null ? Number(c.limite_credito_cents) : null,
      });
    }
    if (!corpo.meta?.has_more || !corpo.meta?.cursor) break;
    cursor = corpo.meta.cursor;
  }
  return todos;
}

async function baixarTabelas(
  buscar: GetJson,
): Promise<{ id: string; nome: string; desconto_pct: number; itens: unknown[] }[]> {
  const r = await buscar("/api/v1/price-tables");
  if (r.status !== 200) throw new Error(`tabelas: servidor respondeu ${r.status}`);
  const corpo = (await r.corpo()) as {
    data?: { id: string; nome: string; desconto_pct: number }[];
  };
  const saida: { id: string; nome: string; desconto_pct: number; itens: unknown[] }[] = [];
  for (const t of corpo.data ?? []) {
    const ri = await buscar(`/api/v1/price-tables/${t.id}/items`);
    if (ri.status !== 200) continue;
    const ci = (await ri.corpo()) as { data?: unknown[] };
    saida.push({
      id: t.id,
      nome: t.nome,
      desconto_pct: Number(t.desconto_pct ?? 0),
      itens: ci.data ?? [],
    });
  }
  return saida;
}

/** Quando o catálogo foi baixado — `null` = nunca (e sem ele não há pedido). */
export async function carimboDoCatalogo(db: Db): Promise<string | null> {
  const r = await db.query(`SELECT valor FROM meta WHERE chave = 'catalogo_sincronizado_em'`);
  const v = r.values?.[0]?.valor;
  return typeof v === "string" ? v : null;
}

export async function contarCatalogo(db: Db): Promise<{ produtos: number; contatos: number }> {
  const [p, c] = await Promise.all([
    db.query(`SELECT COUNT(*) as n FROM catalogo_produtos`),
    db.query(`SELECT COUNT(*) as n FROM catalogo_contatos`),
  ]);
  return {
    produtos: Number(p.values?.[0]?.n ?? 0),
    contatos: Number(c.values?.[0]?.n ?? 0),
  };
}

/** Busca local para o vendedor digitar o nome como cadastrou. */
export async function buscarProdutos(
  db: Db,
  termo: string,
  limite = 30,
): Promise<ProdutoEmCache[]> {
  const r = await db.query(
    `SELECT * FROM catalogo_produtos
     WHERE ativo = 1 AND (nome LIKE '%' || ? || '%' OR codigo LIKE '%' || ? || '%')
     ORDER BY nome LIMIT ?`,
    [termo, termo, limite],
  );
  return (r.values ?? []).map((p) => ({
    id: p.id as string,
    codigo: (p.codigo as string | null) ?? null,
    nome: p.nome as string,
    preco_cents: Number(p.preco_cents),
    controla_estoque: Number(p.controla_estoque) === 1,
    quantidade: p.quantidade != null ? Number(p.quantidade) : null,
    ativo: true,
  }));
}

export async function buscarContatos(
  db: Db,
  termo: string,
  limite = 30,
): Promise<ContatoEmCache[]> {
  const r = await db.query(
    `SELECT * FROM catalogo_contatos WHERE nome LIKE '%' || ? || '%' ORDER BY nome LIMIT ?`,
    [termo, limite],
  );
  return (r.values ?? []).map((c) => ({
    id: c.id as string,
    nome: c.nome as string,
    documento: (c.documento as string | null) ?? null,
    cidade: (c.cidade as string | null) ?? null,
    limite_cents: c.limite_cents != null ? Number(c.limite_cents) : null,
  }));
}
