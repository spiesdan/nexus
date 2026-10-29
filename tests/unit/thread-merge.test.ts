import { describe, expect, it } from "vitest";
import { mergeThreadItems } from "@/components/inbox/ChatThread";

describe("mergeThreadItems", () => {
  it("intercala mensagens e notas por tempo", () => {
    const msgs = [
      { id: "m1", sent_at: "2026-07-23T10:00:00Z" },
      { id: "m2", sent_at: "2026-07-23T10:02:00Z" },
    ] as never;
    const notes = [{ id: "n1", created_at: "2026-07-23T10:01:00Z" }] as never;
    const out = mergeThreadItems(msgs, notes);
    expect(out.map((i) => i.data.id)).toEqual(["m1", "n1", "m2"]);
    expect(out[1]!.kind).toBe("note");
  });

  it("sem notas → só mensagens", () => {
    const msgs = [{ id: "m1", sent_at: "2026-07-23T10:00:00Z" }] as never;
    expect(mergeThreadItems(msgs, []).every((i) => i.kind === "message")).toBe(true);
  });

  it("empate de timestamp mantém ordem estável (mensagem antes da nota)", () => {
    const msgs = [{ id: "m1", sent_at: "2026-07-23T10:00:00Z" }] as never;
    const notes = [{ id: "n1", created_at: "2026-07-23T10:00:00Z" }] as never;
    const out = mergeThreadItems(msgs, notes);
    expect(out.map((i) => i.data.id)).toEqual(["m1", "n1"]);
  });

  it("array vazio de ambos retorna vazio", () => {
    expect(mergeThreadItems([], [])).toEqual([]);
  });

  it("[DISCRIMINA] deduplica mensagem repetida na borda de duas páginas", () => {
    // Realtime + refetch podem sobrepor a fronteira: a mesma mensagem entra
    // duas vezes no `flatMap`. Duplicata no meio da conversa não parece
    // "duplicata", parece desordem — e no WhatsApp não existe.
    const msgs = [
      { id: "m1", sent_at: "2026-07-23T10:00:00Z" },
      { id: "m2", sent_at: "2026-07-23T10:01:00Z" },
      { id: "m2", sent_at: "2026-07-23T10:01:00Z" },
    ] as never;
    const out = mergeThreadItems(msgs, []);
    expect(out.map((i) => i.data.id)).toEqual(["m1", "m2"]);
  });

  it("deduplica nota repetida sem confundir com mensagem de mesmo id", () => {
    const msgs = [{ id: "x", sent_at: "2026-07-23T10:00:00Z" }] as never;
    const notes = [
      { id: "x", created_at: "2026-07-23T10:00:00Z" },
      { id: "x", created_at: "2026-07-23T10:00:00Z" },
    ] as never;
    const out = mergeThreadItems(msgs, notes);
    expect(out.map((i) => i.kind)).toEqual(["message", "note"]);
  });

  it("[DISCRIMINA] empate de instante desempata por id ASC — a ordem da consulta", () => {
    // O servidor pagina por `sent_at desc, id desc` e inverte a página; no fio
    // isso é `sent_at asc, id asc`. Sem o desempate a ordem saía da ordem das
    // PÁGINAS e duas mensagens do mesmo segundo trocavam de lugar a cada
    // refetch.
    const msgs = [
      { id: "m3", sent_at: "2026-07-23T10:00:00Z" },
      { id: "m1", sent_at: "2026-07-23T10:00:00Z" },
      { id: "m2", sent_at: "2026-07-23T10:00:00Z" },
    ] as never;
    const out = mergeThreadItems(msgs, []);
    expect(out.map((i) => i.data.id)).toEqual(["m1", "m2", "m3"]);
  });

  it("timestamp ausente/inválido vai para o começo, sem quebrar a leitura", () => {
    const msgs = [
      { id: "m1", sent_at: "2026-07-23T10:00:00Z" },
      { id: "m2", sent_at: "não é data" },
    ] as never;
    const out = mergeThreadItems(msgs, []);
    expect(out.map((i) => i.data.id)).toEqual(["m2", "m1"]);
  });
});
