import { describe, expect, it } from "vitest";

import { ordenarConversas } from "@/lib/inbox/ordem-da-conversa";

/**
 * A LISTA NA TELA TEM UMA ORDEM SÓ — a mesma que o servidor já devolve.
 *
 * O cliente reordena por dois motivos que o servidor não alcança: página em
 * cache de antes de um deploy e a borda sobreposta de duas páginas (realtime +
 * refetch). Sem isso, a lista "parece desordenada" mesmo com a consulta certa.
 *
 * ⚠️ Os testes de empate DISCRIMINAM: sem o desempate por `id` a ordem passaria
 * a depender da ordem de chegada, e duas conversas do mesmo instante trocariam
 * de lugar a cada refetch.
 */

const c = (id: string, last_message_at: string | null) => ({ id, last_message_at });

describe("ordenarConversas", () => {
  it("[DISCRIMINA] mais recente primeiro — o relógio que a linha mostra", () => {
    const out = ordenarConversas([
      c("a", "2026-10-28T12:00:00Z"),
      c("b", "2026-10-28T12:05:00Z"),
      c("c", "2026-10-28T11:59:00Z"),
    ]);
    expect(out.map((x) => x.id)).toEqual(["b", "a", "c"]);
  });

  it("conversa sem mensagem fica no FIM — nunca acima de quem acabou de falar", () => {
    const out = ordenarConversas([
      c("sem-mensagem", null),
      c("recente", "2026-10-28T12:05:00Z"),
      c("antiga", "2026-10-01T09:00:00Z"),
    ]);
    expect(out.map((x) => x.id)).toEqual(["recente", "antiga", "sem-mensagem"]);
  });

  it("timestamp inválido é tratado como ausente, não como 1970 no topo", () => {
    const out = ordenarConversas([
      c("invalida", "ontem às três"),
      c("valida", "2026-10-28T12:05:00Z"),
    ]);
    expect(out.map((x) => x.id)).toEqual(["valida", "invalida"]);
  });

  it("deduplica por id e mantém a PRIMEIRA ocorrência (páginas vêm da mais nova)", () => {
    const primeira = {
      id: "a",
      last_message_at: "2026-10-28T12:05:00Z",
      last_message_preview: "nova",
    };
    const copiaVelha = {
      id: "a",
      last_message_at: "2026-10-28T10:00:00Z",
      last_message_preview: "velha",
    };
    const out = ordenarConversas([primeira, copiaVelha, c("b", "2026-10-28T11:00:00Z")]);

    expect(out).toHaveLength(2);
    expect(out[0]).toBe(primeira);
  });

  it("empate de instante desempata por id DESC, como a consulta", () => {
    const out = ordenarConversas([
      c("a", "2026-10-28T12:00:00Z"),
      c("c", "2026-10-28T12:00:00Z"),
      c("b", "2026-10-28T12:00:00Z"),
    ]);
    expect(out.map((x) => x.id)).toEqual(["c", "b", "a"]);
  });

  it("não muta o array recebido", () => {
    const entrada = [c("a", "2026-10-28T12:00:00Z"), c("b", "2026-10-28T12:05:00Z")];
    const copia = [...entrada];
    ordenarConversas(entrada);
    expect(entrada).toEqual(copia);
  });
});
