import { describe, expect, it } from "vitest";

import {
  LIMITE_TITULO_TAREFA,
  descricaoDaTarefaEspelhada,
  tarefaEspelhadaParaAtualizar,
  tarefaEspelhadaParaCriar,
  tituloDaTarefaEspelhada,
  type ProspectDaTarefa,
} from "@/lib/prospeccao/tarefa";

const prospect: ProspectDaTarefa = {
  id: "11111111-2222-4333-8444-555555555555",
  nome: "Restaurante X",
  categoria: "Restaurantes",
  cidade: "Canoinhas",
  contact_id: null,
  owner_user_id: "99999999-8888-4777-8666-555555555555",
};

const ctx = {
  organizationId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  usuarioId: "99999999-8888-4777-8666-555555555555",
  hoje: "2026-10-01",
};

describe("tarefa espelhada da prospecção (FASE 12, §31)", () => {
  it("título = ação - nome, no molde do §31", () => {
    expect(tituloDaTarefaEspelhada("Contatar", "Restaurante X")).toBe("Contatar - Restaurante X");
    // passo é frase livre (placeholder do drawer: "ligar amanhã de manhã")
    expect(tituloDaTarefaEspelhada("  ligar amanhã de manhã  ", "Padaria Y")).toBe(
      "ligar amanhã de manhã - Padaria Y",
    );
  });

  it("título corta em pontos de código, com reticências e sem surrogate solto", () => {
    const nome = "👍".repeat(400); // par surrogato por emoji: cortar no meio abriria inválido
    const titulo = tituloDaTarefaEspelhada("Contatar", nome);
    expect(Array.from(titulo).length).toBeLessThanOrEqual(LIMITE_TITULO_TAREFA);
    expect(titulo.endsWith("…")).toBe(true);
    expect(titulo).not.toMatch(/[\uD800-\uDBFF]$/); // sem alto solto no fim
    expect(titulo).not.toMatch(/^[\uDC00-\uDFFF]/); // sem baixo solto no início
  });

  it("criação: row completo — tipo honesto, dia do contexto e vínculo", () => {
    const row = tarefaEspelhadaParaCriar(prospect, "Contatar", ctx);
    expect(row).toEqual({
      organization_id: ctx.organizationId,
      titulo: "Contatar - Restaurante X",
      descricao: "Tarefa criada a partir da fila de prospecção — Restaurantes · Canoinhas.",
      tipo: "outro",
      status: "pendente",
      contact_id: null,
      responsavel_user_id: prospect.owner_user_id,
      agendada_para: ctx.hoje,
      prospect_id: prospect.id,
      created_by: ctx.usuarioId,
    });
  });

  it("criação sem dono cai no editor; sem categoria/cidade a proveniência fica genérica", () => {
    const semDono = { ...prospect, owner_user_id: null, categoria: null, cidade: null };
    const row = tarefaEspelhadaParaCriar(semDono, "Contatar", ctx);
    expect(row.responsavel_user_id).toBe(ctx.usuarioId);
    expect(row.descricao).toBe("Tarefa criada a partir da fila de prospecção.");
    expect(descricaoDaTarefaEspelhada({ categoria: "Padarias", cidade: null })).toBe(
      "Tarefa criada a partir da fila de prospecção — Padarias.",
    );
  });

  it("atualização leva o que deriva da fonte e reabre; não mexe em data/tipo/vínculo", () => {
    const row = tarefaEspelhadaParaAtualizar(prospect, "Ligar segunda", { usuarioId: ctx.usuarioId });
    expect(row).toEqual({
      titulo: "Ligar segunda - Restaurante X",
      descricao: "Tarefa criada a partir da fila de prospecção — Restaurantes · Canoinhas.",
      contact_id: null,
      responsavel_user_id: prospect.owner_user_id,
      status: "pendente",
    });
    expect(row).not.toHaveProperty("agendada_para");
    expect(row).not.toHaveProperty("tipo");
    expect(row).not.toHaveProperty("prospect_id");
    expect(row).not.toHaveProperty("organization_id");
    expect(row).not.toHaveProperty("created_by");
  });
});
