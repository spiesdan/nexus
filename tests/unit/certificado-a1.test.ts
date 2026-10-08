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
  const pfx = (over: Partial<Parameters<typeof decidirCertificado>[0]> = {}) =>
    decidirCertificado({
      size: 2048,
      cabecalho: CABECALHO_PKCS12,
      nomeOriginal: "empresa.pfx",
      ...over,
    });

  it("aceita um PKCS#12 dentro do tamanho", () => {
    const r = pfx();
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.tamanho).toBe(2048);
      expect(r.caminhoNoHost).toBe(`${DIRETORIO_DE_CERTIFICADOS_NO_APP}/${NOME_DO_CERTIFICADO}`);
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
      expect(r.caminhoNoHost).toBe(`${DIRETORIO_DE_CERTIFICADOS_NO_APP}/${NOME_DO_CERTIFICADO}`);
    }
  });
});

describe("onde o certificado fica", () => {
  it("NUNCA no Storage público", () => {
    // O bucket público transformaria a credencial que assina nota fiscal num
    // arquivo com URL adivinhável. Esta é a regra que o seletor de arquivo
    // antigo contradizia.
    const r = decidirCertificado({
      size: 2048,
      cabecalho: CABECALHO_PKCS12,
      nomeOriginal: "empresa.pfx",
    });
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
