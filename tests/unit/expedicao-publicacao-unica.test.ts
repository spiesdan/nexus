/**
 * PUBLICAR TEM UM CAMINHO SÓ — e ele salva a ordem antes de iniciar.
 *
 * ═══ O DEFEITO ═══════════════════════════════════════════════════════════
 *
 * O banner "Pronta para sair" da ficha chamava `mudarStatus("em_rota")`, que
 * fazia `POST /rota/iniciar` direto. Publicar pela tela de rota, ao lado, faz
 * outra coisa: `publicarRota` grava a ordem (`PATCH /rota/ordem`) e só então
 * inicia. Com dois caminhos, o operador que ajustava a sequência e clicava no
 * banner publicava a sequência ANTERIOR — o entregador recebia a ordem velha e
 * o cliente era avisado de uma rota que não estava na tela.
 *
 * ═══ O QUE ESTE TESTE TRAVA ══════════════════════════════════════════════
 *
 * 1. `_client.tsx` não chama mais `/rota/iniciar` — o único `mudarStatus(` com
 *    argumento é o de `concluida`.
 * 2. O banner leva para `/rota` com rótulo que diz o que acontece.
 * 3. Em `_roteirizador.tsx`, `publicarRota` grava a ordem ANTES de iniciar.
 *
 * ═══ POR QUE O LEITOR TIRA COMENTÁRIO ═════════════════════════════════════
 *
 * Os dois arquivos CITAM o defeito nos comentários que explicam o conserto
 * (`mudarStatus("em_rota")`, `/rota/iniciar`). Ler o texto cru faria o
 * `not.toContain` reprovar pela própria documentação — o mesmo motivo do
 * leitor de `tests/unit/expedicao-banner-fixo.test.ts`.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const RAIZ = process.cwd();
const FICHA = join(RAIZ, "app/app/expedicao/[id]/_client.tsx");
const ROTEIRIZADOR = join(RAIZ, "app/app/expedicao/[id]/_roteirizador.tsx");

/** Código sem `{/* ... *\/}`, `/** ... *\/` nem `// ...`. */
function semComentario(texto: string): string {
  return texto
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, " ");
}

const CODIGO_DA_FICHA = semComentario(readFileSync(FICHA, "utf8"));
const CODIGO_DO_ROTEIRIZADOR = semComentario(readFileSync(ROTEIRIZADOR, "utf8"));

/** Do marcador até `tamanho` caracteres — o bastante para o bloco da ação. */
function aPartirDe(texto: string, marcador: string, tamanho: number): string {
  const i = texto.indexOf(marcador);
  expect(i, `marcador ausente: ${marcador}`).toBeGreaterThanOrEqual(0);
  return texto.slice(i, i + tamanho);
}

/** O corpo de `publicarRota` — até a próxima declaração de função. */
function corpoDePublicarRota(): string {
  const inicio = CODIGO_DO_ROTEIRIZADOR.indexOf("async function publicarRota");
  expect(inicio, "publicarRota sumiu do roteirizador").toBeGreaterThanOrEqual(0);
  const resto = CODIGO_DO_ROTEIRIZADOR.slice(inicio + 1);
  const fim = resto.indexOf("\n  async function ");
  return fim < 0 ? resto : resto.slice(0, fim);
}

describe("publicação da rota — um caminho só, e ele salva antes de iniciar", () => {
  it("a ficha não publica: nenhuma chamada a mudarStatus(\"em_rota\")", () => {
    const chamadas = CODIGO_DA_FICHA.match(/mudarStatus\("/g) ?? [];
    expect(chamadas).toHaveLength(1);
    expect(CODIGO_DA_FICHA).toContain('mudarStatus("concluida")');
  });

  it("nenhum /rota/iniciar sobra em _client.tsx", () => {
    expect(CODIGO_DA_FICHA).not.toContain('"iniciar"');
    expect(CODIGO_DA_FICHA).not.toContain("/rota/iniciar");
    // O que sobrou da função muda status é concluir — e concluir carimba o fim.
    expect(CODIGO_DA_FICHA).toContain("/rota/finalizar");
  });

  it("o banner 'Pronta para sair' leva para /rota, com rótulo que diz o que acontece", () => {
    const banner = aPartirDe(CODIGO_DA_FICHA, 't("Pronta para sair")', 900);
    expect(banner).toContain("/app/expedicao/${cargaId}/rota");
    expect(banner).toContain('t("Revisar e publicar")');
    expect(banner).not.toContain("mudarStatus");
    // Navegação, não ação de rede: o banner é um link.
    expect(banner).toContain("<Link");
  });

  it("o banner não fala com a API: nada de apiClient no bloco da ação", () => {
    // O defeito era um POST disparado da ficha, sem passar pela tela que salva.
    // Um link que carrega a ação primária não chama API nenhuma.
    const banner = aPartirDe(CODIGO_DA_FICHA, 't("Pronta para sair")', 900);
    expect(banner).not.toContain("apiClient");
    expect(banner).not.toContain("fetch(");
  });

  it("publicarRota grava a ordem ANTES de iniciar", () => {
    const corpo = corpoDePublicarRota();
    const salvar = corpo.indexOf("/rota/ordem");
    const iniciar = corpo.indexOf("/rota/iniciar");
    expect(salvar, "publicarRota não grava /rota/ordem").toBeGreaterThanOrEqual(0);
    expect(iniciar, "publicarRota não inicia /rota/iniciar").toBeGreaterThanOrEqual(0);
    expect(salvar).toBeLessThan(iniciar);
  });
});
