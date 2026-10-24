import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import {
  avaliarTemplateParaCampanha,
  carregarTemplateParaCampanha,
  listarTemplatesParaCampanha,
  renderizarCorpoDoTemplate,
  type TemplateParaCampanha,
} from "./para-campanha";

type Linha = Record<string, unknown>;

const COMPONENTES_TEXTO = [
  { type: "BODY", text: "Olá {{1}}, falamos com {{2}} sobre o seu negócio." },
];

const LINHA_APROVADA: Linha = {
  organization_id: "org-1",
  channel_session_id: "sess-oficial",
  name: "boas_vindas",
  language: "pt_BR",
  status: "APPROVED",
  category: "MARKETING",
  rejected_reason: null,
  quality_score: null,
  parameter_format: "POSITIONAL",
  contract_hash: "hash-1",
  components: COMPONENTES_TEXTO,
  synced_at: "2026-10-23T12:00:00.000Z",
};

/** Mini-PostgREST com os filtros que a leitura usa. */
class Query {
  private filtros: Array<[string, unknown]> = [];

  constructor(
    private readonly linha: Linha[],
    private readonly tabela: string,
  ) {}

  select(): this {
    return this;
  }
  eq(col: string, val: unknown): this {
    this.filtros.push([col, val]);
    return this;
  }
  order(): this {
    return this;
  }
  maybeSingle(): Promise<{ data: Linha | null; error: null }> {
    return Promise.resolve({ data: this.linhas()[0] ?? null, error: null });
  }
  then<T>(onFulfilled: (r: { data: Linha[]; error: null }) => T): Promise<T> {
    return Promise.resolve({ data: this.linhas(), error: null }).then(onFulfilled);
  }
  private linhas(): Linha[] {
    const linhas = this.tabela === "meta_templates" ? this.linha : [];
    return linhas.filter((l) => this.filtros.every(([c, v]) => l[c] === v));
  }
}

function db(linhas: Linha[]): SupabaseClient {
  return {
    from: (tabela: string) => new Query(linhas, tabela),
  } as unknown as SupabaseClient;
}

function template(extra: Partial<TemplateParaCampanha> = {}): TemplateParaCampanha {
  return {
    name: "boas_vindas",
    language: "pt_BR",
    status: "APPROVED",
    category: "MARKETING",
    rejectedReason: null,
    parameterFormat: "POSITIONAL",
    contractHash: "hash-1",
    syncedAt: "2026-10-23T12:00:00.000Z",
    slots: [
      { slotKey: "1", key: "1", expects: "text", onde: "corpo", contexto: "Olá {{1}}" },
      { slotKey: "2", key: "2", expects: "text", onde: "corpo", contexto: "com {{2}}" },
    ],
    previews: [{ onde: "corpo", text: COMPONENTES_TEXTO[0]!.text }],
    components: COMPONENTES_TEXTO,
    aceito: true,
    motivo: null,
    ...extra,
  };
}

describe("listarTemplatesParaCampanha", () => {
  it("mapeia slots com slotKey, prévia e aceite do modelo aprovado", async () => {
    const [m] = await listarTemplatesParaCampanha(db([LINHA_APROVADA]), "org-1");

    expect(m).toMatchObject({
      name: "boas_vindas",
      language: "pt_BR",
      status: "APPROVED",
      contractHash: "hash-1",
      aceito: true,
      motivo: null,
    });
    expect(m!.slots.map((s) => s.slotKey)).toEqual(["1", "2"]);
    expect(m!.slots[0]).toMatchObject({ key: "1", onde: "corpo", expects: "text" });
    expect(m!.previews).toEqual([
      { onde: "corpo", text: "Olá {{1}}, falamos com {{2}} sobre o seu negócio." },
    ]);
  });

  it("modelo NÃO aprovado aparece com o motivo, em vez de sumir da lista", async () => {
    const [m] = await listarTemplatesParaCampanha(
      db([{ ...LINHA_APROVADA, status: "PENDING" }]),
      "org-1",
    );

    expect(m!.aceito).toBe(false);
    expect(m!.motivo).toContain("PENDING");
  });

  it("modelo com slot de MÍDIA não é aceito por campanha — mas o motivo é visível", async () => {
    const [m] = await listarTemplatesParaCampanha(
      db([
        {
          ...LINHA_APROVADA,
          components: [
            { type: "HEADER", format: "IMAGE" },
            { type: "BODY", text: "Olá {{1}}" },
          ],
        },
      ]),
      "org-1",
    );

    expect(m!.aceito).toBe(false);
    expect(m!.motivo).toContain("image");
    expect(m!.slots.map((s) => s.slotKey)).toEqual(["header:1", "1"]);
  });

  it("filtra pela CONEXÃO quando o chamador sabe qual é", async () => {
    const outra = { ...LINHA_APROVADA, channel_session_id: "sess-outra", name: "outro" };
    const modelos = await listarTemplatesParaCampanha(db([LINHA_APROVADA, outra]), "org-1", {
      channelSessionId: "sess-oficial",
    });

    expect(modelos.map((m) => m.name)).toEqual(["boas_vindas"]);
  });
});

describe("carregarTemplateParaCampanha", () => {
  it("devolve null quando o par (name, language) não existe no espelho", async () => {
    const r = await carregarTemplateParaCampanha(db([]), "org-1", "sumiu", "pt_BR");
    expect(r).toBeNull();
  });

  it("casa o par exato — pt_BR e pt são modelos distintos", async () => {
    const r = await carregarTemplateParaCampanha(db([LINHA_APROVADA]), "org-1", "boas_vindas", "pt");
    expect(r).toBeNull();
  });
});

describe("avaliarTemplateParaCampanha", () => {
  const valores = { "1": "Maria", "2": "Belo Horizonte" };

  it("bind íntegro passa", () => {
    const v = avaliarTemplateParaCampanha(template(), valores, "hash-1");
    expect(v).toMatchObject({ ok: true, codigo: "ok", pausar: false });
    expect(v.template?.name).toBe("boas_vindas");
  });

  it("modelo ausente do espelho pausa, com o caminho de conserto", () => {
    const v = avaliarTemplateParaCampanha(null, valores, "hash-1");
    expect(v).toMatchObject({ ok: false, codigo: "missing", pausar: true });
    expect(v.erro).toContain("Sincronize");
  });

  it("modelo reprovado/pendente pausa ANTES de reclamar de hash", () => {
    const v = avaliarTemplateParaCampanha(
      template({ status: "REJECTED" }),
      valores,
      "hash-antigo",
    );
    expect(v).toMatchObject({ ok: false, codigo: "not_approved", pausar: true });
  });

  it("hash divergente pausa: o modelo mudou na Meta desde a configuração", () => {
    const v = avaliarTemplateParaCampanha(template(), valores, "hash-de-antes");
    expect(v).toMatchObject({ ok: false, codigo: "stale", pausar: true });
    expect(v.erro).toContain("mudou na Meta");
  });

  it("slot de mídia é recusado com o tipo no texto — campanha só monta texto", () => {
    const v = avaliarTemplateParaCampanha(
      template({
        slots: [
          { slotKey: "header:1", key: "1", expects: "image", onde: "cabeçalho", contexto: "" },
          { slotKey: "1", key: "1", expects: "text", onde: "corpo", contexto: "Olá {{1}}" },
        ],
      }),
      valores,
      "hash-1",
    );
    expect(v).toMatchObject({ ok: false, codigo: "media_nao_suportada", pausar: true });
    expect(v.erro).toContain("image");
  });

  it("valor em branco é ausente e o veredito diz QUAL slot falta", () => {
    const v = avaliarTemplateParaCampanha(template(), { "1": "Maria", "2": "  " }, "hash-1");
    expect(v).toMatchObject({ ok: false, codigo: "missing_values", pausar: true });
    expect(v.faltando).toEqual(["2"]);
    expect(v.erro).toContain("{{2}}");
  });
});

describe("renderizarCorpoDoTemplate", () => {
  it("junta header e body com os valores, na ordem que o cliente lê", () => {
    const texto = renderizarCorpoDoTemplate(
      {
        name: "boas_vindas",
        language: "pt_BR",
        parameterFormat: "POSITIONAL",
        components: [
          { type: "HEADER", text: "Olá {{1}}" },
          { type: "BODY", text: "Falamos sobre {{2}}." },
        ],
      },
      { "header:1": "Maria", "2": "seu negócio" },
    );

    expect(texto).toBe("Olá Maria\n\nFalamos sobre seu negócio.");
  });

  it("sem valor, o placeholder fica LITERAL — quem recusa é o missingSlots, não o render", () => {
    const texto = renderizarCorpoDoTemplate(
      {
        name: "x",
        language: "pt_BR",
        parameterFormat: "POSITIONAL",
        components: [{ type: "BODY", text: "Olá {{1}}" }],
      },
      {},
    );
    expect(texto).toBe("Olá {{1}}");
  });
});
