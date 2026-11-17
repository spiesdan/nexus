/**
 * O ARTEFATO DE MEDIÇÃO NÃO PODE ENCOLHER.
 *
 * ─── O DEFEITO, MEDIDO ─────────────────────────────────────────────────────
 *
 * Em 16/11/2026 o instrumento foi rodado com `--rotas /app/notas` para provar a
 * V-31. Como `--grupo` cai em `inicio` por padrão, ele gravou
 * `medicoes-inicio.json` com `writeFileSync` e o artefato passou de **5 rotas
 * para 1** — quatro medições publicadas no relatório deixaram de existir no
 * arquivo. Ninguém foi avisado: o script terminou com "ok: 1 medições".
 *
 * Um instrumento de auditoria que apaga evidência é o mesmo defeito que ele
 * deveria detectar. A regra agora é mesclar: o arquivo guarda o **último
 * resultado por rota × largura**, e o que não foi remedido permanece.
 */
import { describe, expect, it } from "vitest";

import { mesclarMedicoes, montarArtefato } from "../../scripts/auditoria/medicoes.mjs";

const medicao = (rota: string, largura = "desktop", status = 200) => ({
  rota,
  largura,
  status,
  ms: 100,
  erro: null,
  arquivo: "x.png",
});

describe("mesclarMedicoes", () => {
  it("NÃO apaga as medições que não foram remedidas", () => {
    const anterior = {
      resultados: [
        medicao("/app"),
        medicao("/app/pedidos"),
        medicao("/app/kanban"),
        medicao("/app/contacts"),
        medicao("/app/ai"),
      ],
    };
    const depois = mesclarMedicoes(anterior, [medicao("/app/notas")]);

    expect(depois.map((r) => r.rota)).toEqual([
      "/app",
      "/app/pedidos",
      "/app/kanban",
      "/app/contacts",
      "/app/ai",
      "/app/notas",
    ]);
  });

  it("substitui a medição da mesma rota e largura, sem duplicar", () => {
    const anterior = { resultados: [medicao("/app", "desktop", 200)] };
    const depois = mesclarMedicoes(anterior, [medicao("/app", "desktop", 500)]);

    expect(depois).toHaveLength(1);
    expect(depois[0]?.status).toBe(500);
  });

  it("a mesma rota em outra largura é outra medição", () => {
    const anterior = { resultados: [medicao("/app", "desktop")] };
    const depois = mesclarMedicoes(anterior, [medicao("/app", "celular")]);

    expect(depois.map((r) => r.largura)).toEqual(["desktop", "celular"]);
  });

  it("arquivo ausente, vazio ou corrompido não lança", () => {
    expect(mesclarMedicoes(null, [medicao("/app")])).toHaveLength(1);
    expect(mesclarMedicoes({}, [medicao("/app")])).toHaveLength(1);
    expect(mesclarMedicoes({ resultados: "x" }, [medicao("/app")])).toHaveLength(1);
    expect(mesclarMedicoes({ resultados: [null, 3, { semRota: true }] }, [])).toEqual([]);
  });
});

describe("montarArtefato", () => {
  it("preserva os metadados da execução e carimba a data", () => {
    const artefato = montarArtefato({
      base: "http://localhost:3011",
      grupo: "inicio",
      perfil: "dono",
      urlDepoisDoLogin: "http://localhost:3011/app/inbox",
      puladas: [],
      novas: [medicao("/app/notas")],
      anterior: { resultados: [medicao("/app")], puladas: [{ rota: "/x", motivo: "sem id" }] },
    });

    expect(artefato.grupo).toBe("inicio");
    expect(artefato.perfil).toBe("dono");
    expect(artefato.resultados).toHaveLength(2);
    expect(Number.isNaN(Date.parse(artefato.atualizado_em))).toBe(false);
  });

  it("`puladas` da execução nova ganha do anterior; sem a nova, herda a antiga", () => {
    const comNova = montarArtefato({
      base: "b",
      grupo: "g",
      perfil: "dono",
      urlDepoisDoLogin: "u",
      puladas: [{ rota: "/a", motivo: "x" }],
      novas: [],
      anterior: { resultados: [], puladas: [{ rota: "/b", motivo: "y" }] },
    });
    expect(comNova.puladas).toEqual([{ rota: "/a", motivo: "x" }]);

    const semNova = montarArtefato({
      base: "b",
      grupo: "g",
      perfil: "dono",
      urlDepoisDoLogin: "u",
      puladas: undefined,
      novas: [],
      anterior: { resultados: [], puladas: [{ rota: "/b", motivo: "y" }] },
    });
    expect(semNova.puladas).toEqual([{ rota: "/b", motivo: "y" }]);
  });
});
