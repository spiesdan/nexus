import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * AS QUATRO CONTAGENS DO INBOX SÃO UMA VARREDURA SÓ.
 *
 * ## O defeito que este arquivo tranca
 *
 * `GET /api/v1/conversations/counts` disparava quatro `count: "exact"` em
 * paralelo. Cada um varria `conversations` inteira, e a RLS desta tabela chama
 * `fn_can_view_conversation()` e `fn_can_view_channel()` POR LINHA — cada uma
 * com três subconsultas de papel. Medido na VPS em 2026-11-13:
 *
 *   - ~1,2 s de média por contagem, pico de **7991 ms**;
 *   - `statement_timeout` do role `authenticated`: **8 s**;
 *   - resultado: HTTP 500 `57014 statement timeout` na Inbox.
 *
 * A correção é uma função SQL (`fn_conversas_contagens`, migration 0310) que
 * responde as quatro perguntas com `count(*) filter` numa varredura — 799 ms.
 *
 * ## O que este gate cobra
 *
 * A rota continua chamando o RPC (e não voltando a quatro consultas), o RPC é
 * `security invoker` (a RLS **tem** de continuar valendo — o ganho é não repetir
 * a varredura, nunca desligar a proteção) e os conjuntos de estado continuam
 * vindo do servidor (`comandosDaFila` e `CONVERSATION_TERMINAL_STATUSES`), que é
 * o que impede o badge de contar o que a aba não mostra.
 */
const RAIZ = process.cwd();
const ROTA = readFileSync(join(RAIZ, "app/api/v1/conversations/counts/route.ts"), "utf8");
const MIGRATION = readFileSync(
  join(RAIZ, "supabase/migrations/20261117120000_0310_contagens_do_inbox_em_uma_consulta.sql"),
  "utf8",
);
const BASELINE = readFileSync(join(RAIZ, "supabase/baseline.sql"), "utf8");

describe("contagens do inbox — uma varredura", () => {
  it("a rota chama o RPC, e não quatro consultas paralelas", () => {
    // Comentários citam o defeito (`count: "exact"`, `Promise.all`) — o que
    // vale é o código.
    const codigo = ROTA.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(codigo).toContain('rpc("fn_conversas_contagens"');
    expect(codigo).not.toContain('count: "exact"');
    expect(codigo).not.toContain("Promise.all");
  });

  it("o RPC é security invoker — a RLS continua valendo", () => {
    // `security definer` aqui devolveria o total da org a um agent em modo
    // `own*`: o mesmo vazamento que o listing evita.
    expect(MIGRATION).toContain("security invoker");
    expect(MIGRATION).not.toContain("security definer");
  });

  it("a função nova nasce sem EXECUTE para anon (regra 9)", () => {
    expect(MIGRATION).toMatch(
      /revoke execute on function public\.fn_conversas_contagens[\s\S]{0,120}from public, anon/,
    );
    expect(MIGRATION).toMatch(
      /grant execute on function public\.fn_conversas_contagens[\s\S]{0,160}to authenticated, service_role/,
    );
  });

  it("os conjuntos de estado vêm do servidor, não de literal na rota", () => {
    expect(ROTA).toContain("comandosDaFila(automaticoDaOrg)");
    expect(ROTA).toContain("...CONVERSATION_TERMINAL_STATUSES");
  });

  it("o baseline traz o RPC ANTES da varredura anon (senão nasce exposto em quem atualiza)", () => {
    const rpc = BASELINE.indexOf("fn_conversas_contagens");
    const varredura = BASELINE.search(/^-- ---- VARREDURA anon:/m);
    expect(rpc, "o RPC não está no baseline").toBeGreaterThan(-1);
    expect(varredura, "a varredura anon não está no baseline").toBeGreaterThan(-1);
    expect(rpc).toBeLessThan(varredura);
  });
});
