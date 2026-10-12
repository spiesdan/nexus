/**
 * A CHAVE DA ORGANIZAÇÃO LIGA O PASSE DE IA.
 *
 * Este arquivo é a prova do defeito que existiu: a rota lia só
 * `env.GEMINI_API_KEY`, então cadastrar a chave do Google pela tela de
 * Credenciais deixava o recurso desligado. O teste abaixo falharia na versão
 * antiga — é a mutação que prova que a trava segura.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createAdminClient } from "@/lib/supabase/admin";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

const ORG = "4bc721ce-157a-41b9-97ae-ba633650859c";

/** Importado depois do reset de módulos — ver o `beforeEach`. */
async function resolver(org: string) {
  const { resolverChaveDeNcm } = await import("@/lib/catalogo/chave-ncm");
  return resolverChaveDeNcm(org);
}

/** Falso do admin com uma credencial Google devolvida. */
function adminComCredenciais(
  linhas: Array<{
    label: string;
    api_key_encrypted: Buffer;
    api_key_iv: Buffer;
    api_key_tag: Buffer;
  }>,
) {
  const filtros: Record<string, unknown> = {};
  const cadeia = {
    select: () => cadeia,
    eq: (coluna: string, valor: unknown) => {
      filtros[coluna] = valor;
      return cadeia;
    },
    not: (coluna: string, _op: string, valor: unknown) => {
      filtros[coluna] = valor;
      return cadeia;
    },
    order: () => Promise.resolve({ data: linhas, error: null }),
  };
  vi.mocked(createAdminClient).mockReturnValue({ from: () => cadeia } as never);
  return filtros;
}

/**
 * Envelope AES-GCM DE VERDADE, para a decifragem passar de verdade.
 *
 * Não é um envelope falso: se fosse, o teste passaria por um caminho que a
 * produção nunca percorre, e a mutação "a decifragem foi removida" não
 * reprovaria nada.
 */
async function criptografar(texto: string) {
  const { byteaToBuffer, encryptKey } = await import("@/lib/crypto/aes_gcm");
  const env = encryptKey(texto);
  return {
    api_key_encrypted: byteaToBuffer(env.ciphertext),
    api_key_iv: byteaToBuffer(env.iv),
    api_key_tag: byteaToBuffer(env.tag),
  };
}

describe("resolverChaveDeNcm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // A ordem importa: `lib/env` faz parse no IMPORT e guarda o resultado. O
    // reset vem ANTES do stub, senão o módulo já em cache enxerga o env de
    // quando foi importado pela primeira vez neste arquivo.
    vi.resetModules();
    // A cifra da credencial é a mesma de produção (AI_CRED_AES_KEY). Sem ela o
    // módulo de cripto recusa trabalhar — e o teste viraria um teste do env.
    vi.stubEnv("AI_CRED_AES_KEY", Buffer.alloc(32, 7).toString("base64"));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("usa a credencial Google da organização (o defeito que este arquivo cobre)", async () => {
    const envelope = await criptografar("chave-do-google-da-org");
    const filtros = adminComCredenciais([{ label: "produc", ...envelope }]);

    const r = await resolver(ORG);

    expect(r).not.toBeNull();
    expect(r?.origem).toBe("credencial_da_organizacao");
    expect(r?.rotulo).toBe("produc");
    expect(r?.apiKey).toBe("chave-do-google-da-org");
    // A busca é escopada na organização e só em chave ativa E validada: sem
    // esses três filtros, uma chave desativada da outra org entraria aqui.
    expect(filtros.organization_id).toBe(ORG);
    expect(filtros.provider).toBe("google");
    expect(filtros.is_active).toBe(true);
    expect(filtros.validated_at).toBeNull();
  });

  it("avisa quando há mais de uma chave Google ativa", async () => {
    const primeira = await criptografar("a-mais-antiga");
    const segunda = await criptografar("a-mais-nova");
    adminComCredenciais([
      { label: "produção", ...primeira },
      { label: "produc", ...segunda },
    ]);

    const r = await resolver(ORG);

    expect(r?.rotulo).toBe("produção");
    expect(r?.avisos.join(" ")).toContain("2 chaves Google ativas");
  });

  it("cai na chave da instalação quando a org não tem credencial", async () => {
    adminComCredenciais([]);
    vi.stubEnv("GEMINI_API_KEY", "chave-da-vps");
    const r = await resolver(ORG);
    expect(r?.origem).toBe("chave_da_instalacao");
    expect(r?.apiKey).toBe("chave-da-vps");
  });

  it("sem chave nenhuma devolve null — o lote usa só a regra", async () => {
    adminComCredenciais([]);
    vi.stubEnv("GEMINI_API_KEY", "");
    expect(await resolver(ORG)).toBeNull();
  });

  it("falha de decifragem vira null, nunca chave pela metade", async () => {
    vi.mocked(createAdminClient).mockImplementation(() => {
      throw new Error("chave de cifra ausente");
    });
    vi.stubEnv("GEMINI_API_KEY", "");
    expect(await resolver(ORG)).toBeNull();
  });
});
