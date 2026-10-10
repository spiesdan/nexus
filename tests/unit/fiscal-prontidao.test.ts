/**
 * O ALERTA DO MEU DIA NOMEIA O BLOQUEIO REAL.
 *
 * ─── O defeito, medido em produção ─────────────────────────────────────────
 *
 * Org `4bc721ce…`, 10/10/2026. O alerta dizia:
 *
 *   "A instalação não tem provedor que confirme a emissão. Configure o provedor
 *    fiscal, ou confirme a nota fora do sistema."
 *
 * E o bloqueio real era:
 *
 *   - `provedor` = `stub`          (o que o alerta dizia)
 *   - `emitente_documento` vazio   ← CNPJ do emitente
 *   - `ie` vazio                   ← Inscrição Estadual
 *   - `codigo_municipio` vazio     ← código IBGE
 *   - `uf` vazio
 *
 * Quem obedecesse a advice configurava o provedor, emissionava, e recebia
 * `Falta CNPJ do emitente (configuração fiscal)` — e o alerta continuava igual.
 *
 * ─── O custo real ──────────────────────────────────────────────────────────
 *
 * Não é a mensagem errada. É a pessoa achar que resolveu. Um alerta que aponta
 * para o lado errado é pior que nenhum, porque transforma "não sei por que não
 * emite" em "eu já fiz o que o sistema pediu e não funciona" — e essa é a
 * conclusão que faz uma pessoa desistir de usar o sistema.
 *
 * ─── A ordem das pendências ────────────────────────────────────────────────
 *
 * Documento → IE → município/UF → certificado → provedor. O provedor por último
 * de propósito: é o que todo mundo pensa em arrumar primeiro, e não é o que
 * impede a emissão.
 */
import { describe, expect, it } from "vitest";

import {
  fraseDasPendencias,
  podeEmitirNota,
  pendenciasFiscais,
  provedorConfereEmissao,
  type ConfigFiscalParaProntidao,
} from "@/lib/fiscal/prontidao";

/** A configuração que a org real tem hoje — copiei do banco. */
const DA_ORG_REAL: ConfigFiscalParaProntidao = {
  provedor: "stub",
  emitente_documento: null,
  ie: null,
  uf: null,
  codigo_municipio: null,
  municipio: null,
  cep: null,
  logradouro: null,
  numero_end: null,
  bairro: null,
  certificado_path: "certificado.pfx",
};

/** Completa, com um provedor que de fato consulta a SEFAZ. */
const COMPLETA: ConfigFiscalParaProntidao = {
  provedor: "spednfe",
  emitente_documento: "12345678000199",
  ie: "1234567",
  uf: "SC",
  codigo_municipio: "4202907",
  municipio: "Canoinhas",
  cep: "89460000",
  logradouro: "Rua X",
  numero_end: "100",
  bairro: "Centro",
  certificado_path: "certificado.pfx",
};

describe("a configuração real da org", () => {
  it("diz TODAS as pendências, não só o provedor", () => {
    // O teste que trava o defeito: o alerta antigo citava UMA das cinco.
    const p = pendenciasFiscais(DA_ORG_REAL);
    const chaves = p.map((x) => x.chave);
    expect(chaves).toContain("emitente_documento");
    expect(chaves).toContain("ie");
    expect(chaves).toContain("codigo_municipio");
    expect(chaves).toContain("uf");
    expect(chaves).toContain("provedor");
  });

  it("o CNPJ vem antes de tudo — sem ele nada mais é aceito", () => {
    // A ordem é a ordem em que a pessoa desbloqueia, não a ordem do formulário.
    expect(pendenciasFiscais(DA_ORG_REAL)[0]?.chave).toBe("emitente_documento");
  });

  it("o provedor é a ÚLTIMA pendência, não a primeira", () => {
    // É o que todo mundo pensa em arrumar primeiro, e não é o que trava. Se o
    // provedor viesse primeiro, a pessoa configuraria ele e o erro continuaria.
    const p = pendenciasFiscais(DA_ORG_REAL);
    expect(p[p.length - 1]?.chave).toBe("provedor");
  });

  it("cada pendência diz ONDE achar — um rótulo sozinho não é acionável", () => {
    for (const p of pendenciasFiscais(DA_ORG_REAL)) {
      expect(p.rotulo.length, `sem rótulo para ${p.chave}`).toBeGreaterThan(0);
      expect(p.onde.length, `sem "onde" para ${p.chave}`).toBeGreaterThan(20);
    }
  });

  it("a IE diz que NÃO está no certificado — que é a dúvida de todo mundo", () => {
    // A pergunta que trava a emissão na prática: "está no .pfx e não achei".
    const ie = pendenciasFiscais(DA_ORG_REAL).find((p) => p.chave === "ie");
    expect(ie?.onde.toLowerCase()).toContain("certificado");
  });

  it("não pode emitir", () => {
    expect(podeEmitirNota(DA_ORG_REAL)).toBe(false);
  });
});

describe("o provedor `stub`", () => {
  it("não confere emissão", () => {
    expect(provedorConfereEmissao("stub")).toBe(false);
    expect(provedorConfereEmissao("STUB")).toBe(false);
    expect(provedorConfereEmissao(" Stub ")).toBe(false);
  });

  it("é a ÚLTIMA pendência mesmo sendo o que todo mundo quer trocar", () => {
    const p = pendenciasFiscais({ ...COMPLETA, provedor: "stub" });
    expect(p).toHaveLength(1);
    expect(p[0]?.chave).toBe("provedor");
  });

  it("diz o que o stub FAZ, e não só que ele falta", () => {
    // "Falta o provedor" faz a pessoa procurar o menu. Dizer que ele registra sem
    // conferir diz por que aquilo é um risco, e é o que convence a trocar.
    const p = pendenciasFiscais({ ...COMPLETA, provedor: "stub" });
    expect(p[0]?.onde).toContain("stub");
    expect(p[0]?.onde).toMatch(/registra.*sem consultar/i);
  });

  it("ausente e 'nenhum' contam como falta", () => {
    for (const v of [null, "", "   ", "nenhum"]) {
      expect(
        pendenciasFiscais({ ...COMPLETA, provedor: v as string }).map((p) => p.chave),
      ).toContain("provedor");
    }
  });
});

describe("configuração completa", () => {
  it("não tem pendência", () => {
    expect(pendenciasFiscais(COMPLETA)).toEqual([]);
    expect(podeEmitirNota(COMPLETA)).toBe(true);
  });

  it("a frase diz que está completa", () => {
    expect(fraseDasPendencias(pendenciasFiscais(COMPLETA))).toMatch(/completa/i);
  });
});

describe("a frase do alerta", () => {
  it("nomeia o que falta, não uma instrução genérica", () => {
    const f = fraseDasPendencias(pendenciasFiscais(DA_ORG_REAL));
    expect(f).toMatch(/CNPJ do emitente/);
    expect(f).toMatch(/Inscrição Estadual/);
    // E NÃO pode ser a frase antiga, que apontava para o lado errado.
    expect(f).not.toMatch(/^Configure o provedor fiscal/);
  });

  it("conta quantas faltam quando são mais de duas", () => {
    // As dez pendências num alerta fariam do aviso um formulário. Duas e a
    // contagem cabem na tela do Meu Dia e dizem o essencial.
    const f = fraseDasPendencias(pendenciasFiscais(DA_ORG_REAL));
    expect(f).toMatch(/e mais \d+/);
  });

  it("duas pendências não inventam um 'e mais 0'", () => {
    const f = fraseDasPendencias(pendenciasFiscais({ ...COMPLETA, ie: null, uf: null }));
    expect(f).toContain("Inscrição Estadual e UF do emitente");
    expect(f).not.toMatch(/e mais/);
  });

  it("nunca fica vazia", () => {
    // Uma frase vazia no alerta é um aviso que não diz nada — e é o que o
    // operador vê quando o problema é o próprio aviso.
    expect(fraseDasPendencias([])).not.toBe("");
    expect(fraseDasPendencias([])).toMatch(/completa/i);
  });
});

describe("sem configuração nenhuma", () => {
  it("não quebra, e diz o que fazer", () => {
    const p = pendenciasFiscais(null);
    expect(p).toHaveLength(1);
    expect(p[0]?.onde).toMatch(/Configuração fiscal/);
    expect(podeEmitirNota(null)).toBe(false);
  });
});

describe("o que NÃO é pendência", () => {
  it("espaço em branco é vazio", () => {
    // `ie: "   "` passa num `if (ie)` e reprova na SEFAZ. A forma do bug é
    // sempre a mesma: o dado existe e não é verdade.
    const p = pendenciasFiscais({ ...COMPLETA, ie: "   ", uf: "  " });
    expect(p.map((x) => x.chave)).toEqual(expect.arrayContaining(["ie", "uf"]));
  });

  it("a senha do certificado não é pendência daqui", () => {
    // Ela é validada no momento do upload, não na emissão — e listar aqui
    // mostraria algo que a pessoa já preencheu.
    // O tipo `ChaveDaPendencia` nem tem \`senha\`, e o compilador barraria um
    // \`x.chave === "senha"\` — que e o teste: a senha nao e uma pendencia
    // DESTA lista.
    const chaves: string[] = pendenciasFiscais(COMPLETA).map((x) => x.chave);
    expect(chaves).not.toContain("senha");
  });
});
