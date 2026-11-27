import { describe, expect, it } from "vitest";

import {
  bloquear,
  concluirTermo,
  criarProgresso,
  iniciarTermo,
  proximoTermo,
  registrarFalha,
  resumo,
  retomar,
  TENTATIVAS_POR_TERMO,
  TIMEOUT_TERMO_MS,
} from "./checkpoint";

/**
 * A máquina de checkpoint do plano v5 (§4). O que decide:
 * - termo morto no meio NÃO fecha; o tick seguinte o reexecuta;
 * - termo concluído NÃO repete;
 * - 3 tentativas por termo; depois falha fechada e o próximo assume;
 * - bloqueio pausa; `parcial` é derivado, não um status novo.
 */

const TERMOS = ["oficina|Canoinhas", "oficina|Joinville", "padaria|Canoinhas"];

describe("checkpoint — retomada por termo", () => {
  it("começa no primeiro termo e com o total certo", () => {
    const p = criarProgresso(TERMOS);
    expect(p.termos_total).toBe(3);
    expect(p.termo_atual).toBe(TERMOS[0]);
    expect(proximoTermo(p, TERMOS)).toBe(TERMOS[0]);
  });

  it("termo concluído não repete; o próximo assume", () => {
    let p = criarProgresso(TERMOS);
    p = concluirTermo(p, TERMOS[0]!);
    expect(proximoTermo(p, TERMOS)).toBe(TERMOS[1]);
    p = iniciarTermo(p, TERMOS[1]!);
    expect(p.tentativas).toBe(0);
  });

  it("termo morto (1 falha) fica atual e reexecuta", () => {
    let p = criarProgresso(TERMOS);
    p = registrarFalha(p, TERMOS[0]!, "timeout");
    expect(p.termo_atual).toBe(TERMOS[0]);
    expect(p.tentativas).toBe(1);
    expect(proximoTermo(p, TERMOS)).toBe(TERMOS[0]);
    expect(resumo(p, TERMOS).motivo).toContain("reexecução");
  });

  it("três falhas fecham o termo como falho e o próximo assume", () => {
    let p = criarProgresso(TERMOS);
    p = registrarFalha(p, TERMOS[0]!, "timeout");
    p = registrarFalha(p, TERMOS[0]!, "timeout");
    p = registrarFalha(p, TERMOS[0]!, "timeout");
    expect(p.termos_falhos).toEqual([TERMOS[0]]);
    expect(p.termo_atual).toBeNull();
    expect(proximoTermo(p, TERMOS)).toBe(TERMOS[1]);
    const r = resumo(p, TERMOS);
    expect(r.falhos).toBe(1);
    expect(r.parcial).toBe(true);
  });

  it("termo concluído depois de falhas sai da lista de falhos", () => {
    let p = criarProgresso(TERMOS);
    p = registrarFalha(p, TERMOS[0]!, "timeout");
    p = concluirTermo(p, TERMOS[0]!);
    expect(p.termos_concluidos).toContain(TERMOS[0]);
    expect(p.termos_falhos).not.toContain(TERMOS[0]);
  });

  it("todos concluídos = completa, 100%, sem parcial", () => {
    let p = criarProgresso(TERMOS);
    for (const t of TERMOS) p = concluirTermo(p, t);
    const r = resumo(p, TERMOS);
    expect(r.completa).toBe(true);
    expect(r.parcial).toBe(false);
    expect(r.percentual).toBe(100);
    expect(proximoTermo(p, TERMOS)).toBeNull();
  });

  it("bloqueio pausa a busca e retomar libera", () => {
    let p = criarProgresso(TERMOS);
    p = bloquear(p, "BLOQUEIO_DETECTADO: CAPTCHA", "2026-11-27T10:00:00Z");
    expect(proximoTermo(p, TERMOS)).toBeNull();
    const r = resumo(p, TERMOS);
    expect(r.bloqueada).toBe(true);
    expect(r.motivo).toContain("CAPTCHA");
    p = retomar(p);
    expect(proximoTermo(p, TERMOS)).toBe(TERMOS[0]);
  });

  it("a busca não fica completa enquanto houver termo pendente", () => {
    let p = criarProgresso(TERMOS);
    p = concluirTermo(p, TERMOS[0]!);
    const r = resumo(p, TERMOS);
    expect(r.completa).toBe(false);
    expect(r.parcial).toBe(true);
    expect(r.pendentes).toBe(2);
  });
});

describe("checkpoint — constantes do plano", () => {
  it("120 s por termo e 3 tentativas", () => {
    expect(TIMEOUT_TERMO_MS).toBe(120_000);
    expect(TENTATIVAS_POR_TERMO).toBe(3);
  });
});
