/**
 * O SQLITE NOS TRÊS LUGARES ONDE ESTE CÓDIGO RODA.
 *
 * ─── Os três lugares ────────────────────────────────────────────────────────
 *
 *   1. No celular (nativo): SQLite de verdade, arquivo no aparelho.
 *   2. No navegador de teste (Playwright): jeep-sqlite sobre IndexedDB.
 *   3. No servidor (SSR/pré-render): NÃO abre — dynamic import no cliente.
 *
 * ─── Por que import dinâmico ────────────────────────────────────────────────
 *
 * `@capacitor-community/sqlite` toca em `window`/`customElements` no import.
 * Import estático num Server Component derruba o build — e o erro aparece no
 * CI, não aqui. Todo acesso passa por `banco()`, que só importa no cliente.
 *
 * ─── Um banco só ────────────────────────────────────────────────────────────
 *
 * `crm-offline`, versão 1. O shell e o contexto remoto abrem o MESMO arquivo:
 * é ele que faz os dois lados enxergarem a mesma fila. Dois nomes diferentes
 * seriam duas filas — e o pedido capturado offline nunca apareceria no sync.
 */

import type { Db } from "./outbox";
import type { SQLiteDBConnection } from "@capacitor-community/sqlite";
import { SCHEMA_DA_FILA } from "./outbox";
import { SCHEMA_DO_CATALOGO } from "./catalogo";

const NOME_DO_BANCO = "crm-offline";

let pronta: Promise<Db> | null = null;

/** Abre (ou devolve aberta) a conexão. Só chamar no cliente. */
export function banco(): Promise<Db> {
  if (!pronta) pronta = abrir();
  return pronta;
}

async function abrir(): Promise<Db> {
  const { Capacitor } = await import("@capacitor/core");
  const { SQLiteConnection, CapacitorSQLite } = await import("@capacitor-community/sqlite");

  const sqlite = new SQLiteConnection(CapacitorSQLite);
  const naWeb = Capacitor.getPlatform() === "web";

  if (naWeb) {
    // jeep-sqlite: o elemento precisa ser DEFINIDO (o import sozinho não
    // define — e `whenDefined` sem definição trava para sempre, sem erro e sem
    // log; foi exatamente o que aconteceu no primeiro smoke test). Só depois
    // o `initWebStore` roda uma vez.
    const { defineCustomElements } = await import("jeep-sqlite/loader");
    defineCustomElements(window);
    await customElements.whenDefined("jeep-sqlite");
    await sqlite.initWebStore();
  }

  const existe = await sqlite.isConnection(NOME_DO_BANCO, false);
  const conn: SQLiteDBConnection = existe.result
    ? await sqlite.retrieveConnection(NOME_DO_BANCO, false)
    : await sqlite.createConnection(NOME_DO_BANCO, false, "no-encryption", 1, false);

  await conn.open();
  // O schema é idempotente (`IF NOT EXISTS` em tudo): abrir duas vezes, em
  // dois contextos, não quebra nada. `execute` aqui é DDL sem parâmetros.
  await conn.execute(SCHEMA_DA_FILA);
  await conn.execute(SCHEMA_DO_CATALOGO);

  return {
    async query(sql: string, params?: unknown[]) {
      const r = await conn.query(sql, (params ?? []) as unknown[]);
      return { values: (r.values as Record<string, unknown>[] | undefined) ?? [] };
    },
    async execute(sql: string, params?: unknown[]) {
      // `run` e não `execute`: o `execute` da conexão não aceita parâmetros,
      // e interpolar valor na mão seria injeção de SQL vinda do nome que o
      // vendedor digitou.
      const r = await conn.run(sql, (params ?? []) as unknown[]);
      // No navegador, o jeep-sqlite guarda em memória e só persiste no
      // IndexedDB com `saveToStore`. Sem isto, navegar de página perde tudo
      // que foi escrito — e o primeiro sintoma é "a fila some ao voltar para
      // a home". No nativo não faz nada (o SQLite já persistiu).
      if (naWeb) await sqlite.saveToStore(NOME_DO_BANCO);
      return { changes: Number(r.changes?.changes ?? 0) };
    },
  };
}

/** Fecha e esquece — para teste e para troca de usuário no aparelho. */
export async function fecharBanco(): Promise<void> {
  pronta = null;
  try {
    const { SQLiteConnection, CapacitorSQLite } = await import("@capacitor-community/sqlite");
    const sqlite = new SQLiteConnection(CapacitorSQLite);
    if ((await sqlite.isConnection(NOME_DO_BANCO, false)).result) {
      await sqlite.closeConnection(NOME_DO_BANCO, false);
    }
  } catch {
    // Fechar o que não abriu não é erro.
  }
}
