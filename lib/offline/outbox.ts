/**
 * A FILA DE SAÍDA DOS PEDIDOS OFFLINE.
 *
 * ─── O que esta fila é ──────────────────────────────────────────────────────
 *
 * O vendedor sem área captura o pedido; o pedido espera aqui até o sinal
 * voltar. Cada linha tem um UUID que é TAMBÉM a `chave_sincronizacao` do
 * servidor (0263): o retry devolve o pedido existente em vez de duplicar.
 *
 * ─── Por que estas funções recebem o banco pronto ───────────────────────────
 *
 * Porque o banco real é o SQLite do Capacitor (nativo no celular, jeep-sqlite
 * no navegador) e o teste precisa de um fake em memória. A interface `Db` é o
 * contrato mínimo — `query` com `values` — e é o que impede o teste de medir o
 * fake em vez da regra.
 *
 * ─── Os estados ─────────────────────────────────────────────────────────────
 *
 *   pendente  → esperando sinal. O sincronizador tenta nesta ordem.
 *   enviando  → um drain pegou; trava contra dois drains simultâneos.
 *   aceito    → o servidor respondeu 200/201. Linha FINAL: nunca reenvia.
 *   rejeitado → o servidor respondeu 422 (crédito, preço, estoque). NÃO tenta
 *               sozinho: alguém precisa olhar o motivo e decidir. Tentar de
 *               novo sem mudar nada repetiria o mesmo 422 para sempre.
 *
 * ─── O número provisório ────────────────────────────────────────────────────
 *
 * `OFF-0001`, sequência POR APARELHO guardada em `meta`. Não é o número fiscal
 * (esse nasce no servidor) — é para o vendedor apontar "o OFF-0007" no meio da
 * fazenda. O definitivo chega no sync e a tela mostra os dois.
 */

export type EstadoDoPendente = "pendente" | "enviando" | "aceito" | "rejeitado";

/**
 * O contrato mínimo com o banco.
 *
 * Duas operações porque o SQLite real devolve coisas diferentes: `query` traz
 * linhas, `execute` traz `{ changes }`. Juntar as duas num retorno só faria o
 * fake adivinhar qual o chamador queria — e é assim que o teste passa medindo
 * o fake.
 */
export interface Db {
  query(sql: string, params?: unknown[]): Promise<{ values?: Record<string, unknown>[] }>;
  execute(sql: string, params?: unknown[]): Promise<{ changes: number }>;
}

export interface PedidoNaFila {
  uuid: string;
  numero_provisorio: string;
  payload: Record<string, unknown>;
  status: EstadoDoPendente;
  tentativas: number;
  ultimo_erro: string | null;
  criado_em: string;
  enviado_em: string | null;
  pedido_id: string | null;
  pedido_numero: number | null;
}

export const SCHEMA_DA_FILA = `
CREATE TABLE IF NOT EXISTS pedidos_pendentes (
  uuid TEXT PRIMARY KEY,
  numero_provisorio TEXT NOT NULL,
  payload TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pendente',
  tentativas INTEGER NOT NULL DEFAULT 0,
  ultimo_erro TEXT,
  criado_em TEXT NOT NULL,
  enviado_em TEXT,
  pedido_id TEXT,
  pedido_numero INTEGER
);
CREATE INDEX IF NOT EXISTS pedidos_pendentes_status_idx
  ON pedidos_pendentes (status, criado_em);
`;

function linhaParaPedido(l: Record<string, unknown>): PedidoNaFila {
  return {
    uuid: l.uuid as string,
    numero_provisorio: l.numero_provisorio as string,
    payload: JSON.parse(l.payload as string) as Record<string, unknown>,
    status: l.status as EstadoDoPendente,
    tentativas: Number(l.tentativas ?? 0),
    ultimo_erro: (l.ultimo_erro as string | null) ?? null,
    criado_em: l.criado_em as string,
    enviado_em: (l.enviado_em as string | null) ?? null,
    pedido_id: (l.pedido_id as string | null) ?? null,
    pedido_numero: l.pedido_numero != null ? Number(l.pedido_numero) : null,
  };
}

/**
 * Enfileira um pedido capturado offline.
 *
 * O UUID nasce aqui e é a identidade do pedido até o servidor responder — é
 * ele que vai em `chave_sincronizacao`. Gerar no servidor seria impossível
 * (sem sinal) e gerar na hora do sync quebraria o retry (cada tentativa teria
 * uma chave e o servidor criaria N pedidos).
 */
export async function enfileirarPedido(
  db: Db,
  args: {
    uuid: string;
    numero_provisorio: string;
    payload: Record<string, unknown>;
    agora: string;
  },
): Promise<void> {
  await db.execute(
    `INSERT INTO pedidos_pendentes (uuid, numero_provisorio, payload, status, tentativas, criado_em)
     VALUES (?, ?, ?, 'pendente', 0, ?)`,
    [args.uuid, args.numero_provisorio, JSON.stringify(args.payload), args.agora],
  );
}

/** A fila na ordem de captura (FIFO): a numeração do servidor segue a ordem. */
export async function filaPendente(db: Db): Promise<PedidoNaFila[]> {
  const r = await db.query(
    `SELECT * FROM pedidos_pendentes WHERE status = 'pendente' ORDER BY criado_em ASC`,
  );
  return (r.values ?? []).map(linhaParaPedido);
}

/** Tudo que ainda não terminou, para a tela do vendedor. */
export async function filaAberta(db: Db): Promise<PedidoNaFila[]> {
  const r = await db.query(
    `SELECT * FROM pedidos_pendentes WHERE status IN ('pendente','enviando','rejeitado') ORDER BY criado_em ASC`,
  );
  return (r.values ?? []).map(linhaParaPedido);
}

export async function contarAbertos(db: Db): Promise<{ pendentes: number; rejeitados: number }> {
  const r = await db.query(
    `SELECT status, COUNT(*) as n FROM pedidos_pendentes
     WHERE status IN ('pendente','enviando','rejeitado') GROUP BY status`,
  );
  let pendentes = 0;
  let rejeitados = 0;
  for (const l of r.values ?? []) {
    if (l.status === "rejeitado") rejeitados += Number(l.n);
    else pendentes += Number(l.n);
  }
  return { pendentes, rejeitados };
}

/**
 * Reserva uma linha para o drain atual.
 *
 * O `WHERE status = 'pendente'` é a trava: dois drains simultâneos (app aberto
 * + evento `online` ao mesmo tempo) não pegam a mesma linha, porque o segundo
 * UPDATE não casa em nada. Sem isto, o mesmo pedido seria POSTado duas vezes —
 * e aí só a idempotência do servidor salvaria.
 */
export async function reservarParaEnvio(db: Db, uuid: string): Promise<boolean> {
  const r = await db.execute(
    `UPDATE pedidos_pendentes SET status = 'enviando' WHERE uuid = ? AND status = 'pendente'`,
    [uuid],
  );
  return r.changes > 0;
}

/** O servidor aceitou: grava o definitivo e encerra a linha. */
export async function marcarAceito(
  db: Db,
  args: { uuid: string; pedido_id: string; pedido_numero: number; agora: string },
): Promise<void> {
  await db.execute(
    `UPDATE pedidos_pendentes
     SET status = 'aceito', pedido_id = ?, pedido_numero = ?, enviado_em = ?, ultimo_erro = NULL
     WHERE uuid = ?`,
    [args.pedido_id, args.pedido_numero, args.agora, args.uuid],
  );
}

/**
 * O servidor recusou (422): para, com o motivo à mostra.
 *
 * NÃO volta para `pendente` sozinho. Crédito estourado não se resolve com
 * retry — se resolve com o gerente ou com o cliente. Tentar de novo sem mudar
 * nada é gastar bateria repetindo o mesmo 422.
 */
export async function marcarRejeitado(
  db: Db,
  args: { uuid: string; motivo: string; agora: string },
): Promise<void> {
  await db.execute(
    `UPDATE pedidos_pendentes
     SET status = 'rejeitado', ultimo_erro = ?, tentativas = tentativas + 1
     WHERE uuid = ?`,
    [args.motivo, args.uuid],
  );
}

/** Sem sinal ou timeout: volta para a fila, com a tentativa contada. */
export async function devolverParaFila(
  db: Db,
  args: { uuid: string; erro: string },
): Promise<void> {
  await db.execute(
    `UPDATE pedidos_pendentes
     SET status = 'pendente', ultimo_erro = ?, tentativas = tentativas + 1
     WHERE uuid = ?`,
    [args.erro, args.uuid],
  );
}

/** O vendedor desistiu (pedido errado, cliente cancelou na hora). */
export async function descartarPendente(db: Db, uuid: string): Promise<boolean> {
  const r = await db.execute(
    `DELETE FROM pedidos_pendentes WHERE uuid = ? AND status IN ('pendente','rejeitado')`,
    [uuid],
  );
  return r.changes > 0;
}

/**
 * Tentar de novo um rejeitado, depois de resolver o motivo fora do sistema.
 *
 * Só `rejeitado` volta: `aceito` é final (reenviar duplicaria no servidor —
 * e a idempotência devolveria o mesmo, mas o vendedor veria um envio à toa).
 */
export async function reabrirRejeitado(db: Db, uuid: string): Promise<boolean> {
  const r = await db.execute(
    `UPDATE pedidos_pendentes SET status = 'pendente', ultimo_erro = NULL WHERE uuid = ? AND status = 'rejeitado'`,
    [uuid],
  );
  return r.changes > 0;
}
