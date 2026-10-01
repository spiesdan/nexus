import { describe, expect, it } from "vitest";

import {
  CLASSIFICACOES,
  ROTULO_CLASSIFICACAO,
  classificarProspect,
} from "@/lib/prospeccao/classificacao";

const SEM_CRM = { cliente: false, temLead: false, leadAberto: false };

describe("classificarProspect (§10)", () => {
  it("cliente existente vence tudo", () => {
    expect(
      classificarProspect("novo", { cliente: true, temLead: true, leadAberto: true }),
    ).toBe("cliente_existente");
    // Vendedor marcou "cliente" sem vínculo ainda: classe continua azul.
    expect(classificarProspect("cliente", SEM_CRM)).toBe("cliente_existente");
  });

  it("lead aberto é em negociação; lead fechado é lead existente", () => {
    expect(classificarProspect("novo", { cliente: false, temLead: true, leadAberto: true })).toBe(
      "em_negociacao",
    );
    expect(classificarProspect("novo", { cliente: false, temLead: true, leadAberto: false })).toBe(
      "lead_existente",
    );
  });

  it("cobre o enum STATUS_COMERCIAL inteiro", () => {
    expect(classificarProspect("novo", SEM_CRM)).toBe("novo");
    expect(classificarProspect("nao_analisado", SEM_CRM)).toBe("aguardando_qualificacao");
    expect(classificarProspect("contato_pendente", SEM_CRM)).toBe("aguardando_qualificacao");
    expect(classificarProspect("qualificado", SEM_CRM)).toBe("qualificado");
    expect(classificarProspect("contatado", SEM_CRM)).toBe("ja_abordado");
    expect(classificarProspect("respondeu", SEM_CRM)).toBe("ja_abordado");
    expect(classificarProspect("sem_interesse", SEM_CRM)).toBe("sem_potencial");
    expect(classificarProspect("descartado", SEM_CRM)).toBe("sem_potencial");
    expect(classificarProspect("cliente", SEM_CRM)).toBe("cliente_existente");
  });

  it("desconhecido cai em novo (a coluna é text; o check garante o enum)", () => {
    expect(classificarProspect("qualquer_coisa", SEM_CRM)).toBe("novo");
  });

  it("temLead SEM leadAberto nunca vira em negociação", () => {
    // lead won/lost é lead, não oportunidade aberta.
    expect(
      classificarProspect("contatado", { cliente: false, temLead: true, leadAberto: false }),
    ).toBe("lead_existente");
  });

  it("rótulo pt-BR para toda classe, sem sobra", () => {
    for (const c of CLASSIFICACOES) {
      expect(ROTULO_CLASSIFICACAO[c]).toBeTruthy();
    }
    expect(Object.keys(ROTULO_CLASSIFICACAO).sort()).toEqual([...CLASSIFICACOES].sort());
  });
});
