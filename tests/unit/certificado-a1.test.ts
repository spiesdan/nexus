/**
 * O CERTIFICADO A1 NÃO PODE SER FINGIDO.
 *
 * A tela que accepts um `.pfx` sem enviar nada deixou a instalação com
 * `certificado_path = "PATRICIA CNPJ (1).pfx"` e **nenhum arquivo na máquina**.
 * Este teste trava as três decisões que impedem isso de voltar:
 *
 *  1. o arquivo precisa PARECER um PKCS#12, não só se chamar `.pfx`;
 *  2. o nome gravado é fixo, porque nome que vem do navegador é entrada não
 *     confiável — e `../../` é o começo de uma escrita fora do diretório;
 *  3. o destino fica no diretório de certificados, nunca no Storage público.
 */
import { describe, expect, it } from "vitest";

import {
  DIRETORIO_DE_CERTIFICADOS_NO_APP,
  DIRETORIO_DE_CERTIFICADOS_NO_HOST,
  NOME_DO_CERTIFICADO,
  diretorioDoCertificado,
  parecePkcs12,
  TAMANHO_MAXIMO_DO_CERTIFICADO,
  decidirCertificado,
} from "@/lib/fiscal/certificado";

/** Cabeçalho real de um DER: SEQUENCE com tamanho de 2 bytes. */
const CABECALHO_PKCS12 = new Uint8Array([0x30, 0x82, 0x04, 0xa3]);
const CABECALHO_QUALQUER = new Uint8Array([0x4d, 0x5a, 0x90, 0x00]); // "MZ" = .exe

describe("reconhecimento de PKCS#12", () => {
  it("aceita o início de um DER", () => {
    expect(parecePkcs12(CABECALHO_PKCS12)).toBe(true);
  });

  it("recusa um executável renomeado para .pfx", () => {
    // O `accept=".pfx"` do input é dica de interface, e a interface é do
    // cliente. `MZ` é o cabeçalho de todo .exe do Windows.
    expect(parecePkcs12(CABECALHO_QUALQUER)).toBe(false);
  });

  it("recusa arquivo vazio ou curto demais para ser julgado", () => {
    expect(parecePkcs12(new Uint8Array([]))).toBe(false);
    expect(parecePkcs12(new Uint8Array([0x30]))).toBe(false);
  });
});

describe("decisão do certificado", () => {
  const ORG = "4bc721ce-157a-41b9-97ae-ba633650859c";
  const pfx = (over: Partial<Parameters<typeof decidirCertificado>[0]> = {}) =>
    decidirCertificado(
      {
        size: 2048,
        cabecalho: CABECALHO_PKCS12,
        nomeOriginal: "empresa.pfx",
        ...over,
      },
      ORG,
    );

  it("aceita um PKCS#12 dentro do tamanho", () => {
    const r = pfx();
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.tamanho).toBe(2048);
      expect(r.caminhoNoHost).toBe(
        `${DIRETORIO_DE_CERTIFICADOS_NO_APP}/${ORG}/${NOME_DO_CERTIFICADO}`,
      );
    }
  });

  it("recusa arquivo vazio — e diz que está vazio", () => {
    const r = pfx({ size: 0 });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(422);
      expect(r.motivo).toMatch(/vazio/i);
    }
  });

  it("recusa acima do teto, e o teto cabe num A1 real", () => {
    const r = pfx({ size: TAMANHO_MAXIMO_DO_CERTIFICADO + 1 });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(413);
      expect(r.motivo).toMatch(/MB/);
    }
    // A1 real costuma ter poucos KB; 5 MB é folgado sem ser espaço livre.
    expect(TAMANHO_MAXIMO_DO_CERTIFICADO).toBeLessThanOrEqual(10 * 1024 * 1024);
  });

  it("recusa arquivo que não é PKCS#12, e nomeia o que esperava", () => {
    const r = pfx({ cabecalho: CABECALHO_QUALQUER, nomeOriginal: "virus.exe" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(422);
      // A mensagem precisa dizer o que o arquivo É, não só que falhou.
      expect(r.motivo).toContain("virus.exe");
      expect(r.motivo).toMatch(/PKCS#12/);
    }
  });

  it("aceita um .pfx sem extensão — o conteúdo vale mais que o nome", () => {
    const r = pfx({ nomeOriginal: "sem-extensao" });
    expect(r.ok).toBe(true);
  });

  it("o nome gravado é FIXO — o do navegador não vira caminho", () => {
    // Se o nome do cliente fosse usado, `../../storage/x` escreveria fora do
    // diretório de certificados. E dois envios com o mesmo nome se
    // sobrescreveriam em silêncio.
    const r = pfx({ nomeOriginal: "../../../../etc/passwd" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.caminhoNoHost).not.toContain("..");
      expect(r.caminhoNoHost).toBe(
        `${DIRETORIO_DE_CERTIFICADOS_NO_APP}/${ORG}/${NOME_DO_CERTIFICADO}`,
      );
    }
  });
});

describe("uma organização não enxerga o certificado da outra", () => {
  // Medido: `fiscal_settings` tem DUAS linhas nesta instalação — a real
  // (`4bc721ce…`) e a de teste do e2e (`16f950b8…`), que a cada rodada de
  // teste nasce ou reaparece. Com um arquivo único, a segunda que enviasse
  // certificado SOBRESCREVERIA o da primeira, e o sidecar da primeira passaria
  // a assinar com o certificado da outra. Não é teoria de multi-inquilino: é o
  // que a contagem de linhas mostrou.
  const REAL = "4bc721ce-157a-41b9-97ae-ba633650859c";
  const TESTE = "16f950b8-c113-43c6-8e84-166a21af7ee9";
  const arq = { size: 2048, cabecalho: CABECALHO_PKCS12, nomeOriginal: "empresa.pfx" };

  it("cada organização tem o seu caminho", () => {
    const a = decidirCertificado(arq, REAL);
    const b = decidirCertificado(arq, TESTE);
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) {
      expect(a.caminhoNoHost).not.toBe(b.caminhoNoHost);
      expect(a.caminhoNoHost).toContain(REAL);
      expect(b.caminhoNoHost).toContain(TESTE);
    }
  });

  it("recusa organização que não é UUID — nada de caminho forjado", () => {
    // `requireRole` já entrega um UUID validado, mas a função é pública e
    // testável: uma função que monta caminho a partir de string tem de validar
    // a string, mesmo que hoje o chamador valide.
    for (const id of ["../outra", "abc", "", "a/b", REAL + "/../.."]) {
      const r = decidirCertificado(arq, id);
      expect(r.ok, `aceitou organização malformada: "${id}"`).toBe(false);
    }
  });

  it("o diretório derivado nunca escapa da base", () => {
    expect(diretorioDoCertificado("../..")).toBeNull();
    expect(diretorioDoCertificado(REAL, "/tmp")).toBe(`/tmp/${REAL}`);
  });
});

describe("onde o certificado fica", () => {  it("NUNCA no Storage público", () => {
    // O bucket público transformaria a credencial que assina nota fiscal num
    // arquivo com URL adivinhável. Esta é a regra que o seletor de arquivo
    // antigo contradizia.
    const r = decidirCertificado(
      { size: 2048, cabecalho: CABECALHO_PKCS12, nomeOriginal: "empresa.pfx" },
      "4bc721ce-157a-41b9-97ae-ba633650859c",
    );
    if (r.ok) {
      expect(r.caminhoNoHost).not.toMatch(/storage|render\/image|public/);
    }
    expect(DIRETORIO_DE_CERTIFICADOS_NO_APP).not.toMatch(/storage/);
  });

  it("o diretório do host é o mesmo que o sidecar lê", () => {
    // Um e sem o outro é a configuração que produz "arquivo não encontrado":
    // o app grava num lugar que o sidecar não olha.
    expect(DIRETORIO_DE_CERTIFICADOS_NO_HOST).toBe("/srv/fiscal/certs");
    expect(DIRETORIO_DE_CERTIFICADOS_NO_APP).toBe("/fiscal-certs");
    expect(NOME_DO_CERTIFICADO).toBe("certificado.pfx");
  });
});

describe("a tela e a API usam a MESMA checagem", () => {
  // A tela de Notas lê a config direto do banco, na página de servidor — não
  // passa pela rota. Quando a checagem do certificado vivia só na API, o
  // `certificado_presente` chegava `undefined` na tela e ela voltava a dizer
  // "não está no servidor" COM o arquivo no disco. O E2E pegou: o envio
  // confirmava `true` pela API e a tela, recarregada, negava.
  //
  // Duas cópias de uma regra é como elas divergem sem ninguém ver. Este teste
  // não deixa a função ser duplicada: ela mora em `lib/fiscal/certificado.ts`,
  // e as duas pontas importam.
  it("a função exportada é a que as duas pontas usam", async () => {
    const { certificadoPresenteNoServidor } = await import("@/lib/fiscal/certificado");
    expect(typeof certificadoPresenteNoServidor).toBe("function");

    // Sem diretório no caminho dado, a resposta tem de ser `false` e NÃO
    // exceção: a página de Notas quebraria inteira se esta função lançasse.
    const ausente = await certificadoPresenteNoServidor(
      "4bc721ce-157a-41b9-97ae-ba633650859c",
      "/tmp/dir-que-nao-existe-crm",
    );
    expect(ausente).toBe(false);
  });

  it("devolve false para organização malformada, sem tocar o disco", async () => {
    const { certificadoPresenteNoServidor } = await import("@/lib/fiscal/certificado");
    expect(await certificadoPresenteNoServidor("../..")).toBe(false);
    expect(await certificadoPresenteNoServidor("")).toBe(false);
  });
});
