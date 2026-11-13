import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * A IMAGEM PUBLICADA TEM DE SER BAIXÁVEL POR QUEM NÃO TEM CONTA.
 *
 * ## O que aconteceu
 *
 * Na v1.52.0 — a primeira release que publicou o `nexus-rota` (o solver VRPTW)
 * — as sete imagens construíram, subiram, `imagens-ok` ficou verde e o
 * `promover-stable` moveu o canal. Tudo certo, menos uma coisa que nenhum gate
 * olhava: **o pacote novo nasceu PRIVADO**. Medido no registro, sem credencial:
 *
 *     nexus:1.52.0         200
 *     nexus-rota:1.52.0    401 Unauthorized
 *
 * Todo pacote recém-criado no GHCR nasce privado, e repositório público não
 * muda isso (é o que `docs/doctrine/packaging.md` já avisava no checklist de
 * release). O efeito é o pior possível: `docker compose pull` de TODA VPS falha
 * no serviço `rota` — que está no compose com `pull_policy: always` e sem
 * profile —, e como um `pull` que falha aborta a operação inteira, a
 * atualização morre depois do `git checkout` e do banco. O defeito não apareceu
 * em build, nem em teste, nem em health: apareceu na instalação do cliente.
 *
 * ## O que este arquivo guarda
 *
 * A sonda anônima dentro de `imagens-ok` — a que mede o que a VPS faz, sem
 * token do repositório. Ele NÃO prova o comportamento do registro (isso só um
 * push de tag real prova); prova que a sonda existe, cobre as sete imagens,
 * roda no evento certo e reprova alto. A prova de efeito foi feita à mão em
 * 2026-11-13, com o mesmo `curl` anônimo, e está registrada no handoff.
 */
const RAIZ = process.cwd();
const publish = readFileSync(join(RAIZ, ".github/workflows/publish-image.yml"), "utf8");

/**
 * O nome de cada imagem da matriz — a fonte da verdade das outras listas.
 *
 * Lido da própria matriz do `build-and-push` (`- name: nexus-rota` dentro de
 * `matrix.include`): se alguém acrescentar uma oitava imagem, ela aparece aqui
 * sem ninguém editar o teste.
 */
const IMAGENS_DA_MATRIZ = [...publish.matchAll(/^\s+- name: (nexus[a-z-]*)\s*$/gm)].map(
  (m) => m[1]!,
);

/** O corpo de um job, do cabeçalho até o próximo job (mesmo helper do canal). */
function job(yml: string, nome: string): string {
  const linhas = yml.split("\n");
  const iJobs = linhas.findIndex((l) => /^jobs:\s*$/.test(l));
  if (iJobs === -1) return "";
  const i = linhas.findIndex((l, n) => n > iJobs && l === `  ${nome}:`);
  if (i === -1) return "";
  const fim = linhas.findIndex((l, n) => n > i && /^ {2}[A-Za-z0-9_-]+:\s*$/.test(l));
  return linhas.slice(i, fim === -1 ? undefined : fim).join("\n");
}

/** O passo da sonda, isolado: o cabeçalho `- name:` até o próximo passo. */
function passoDaSonda(yml: string): string {
  const linhas = yml.split("\n");
  const i = linhas.findIndex((l) => l.includes("- name: As sete imagens são baixáveis"));
  if (i === -1) return "";
  const fim = linhas.findIndex((l, n) => n > i && /^ {6}- /.test(l));
  return linhas.slice(i, fim === -1 ? undefined : fim).join("\n");
}

describe("a sonda de download anônimo em imagens-ok", () => {
  it("o instrumento está vivo: enxerga o job e a matriz", () => {
    // Controle positivo: um helper que parou de casar devolve "" e todas as
    // asserções abaixo passariam por vacuidade.
    expect(job(publish, "imagens-ok")).not.toBe("");
    expect(IMAGENS_DA_MATRIZ.length).toBeGreaterThanOrEqual(7);
    expect(IMAGENS_DA_MATRIZ).toContain("nexus-rota");
    expect(passoDaSonda(publish)).not.toBe("");
  });

  it("a sonda pede token ANÔNIMO — é isso que a VPS faz", () => {
    const t = passoDaSonda(publish);
    expect(t, "a sonda tem de usar o endpoint anônimo do GHCR").toContain("ghcr.io/token");
    expect(t, "sem escopo de pull anônimo a sonda mede outra coisa").toContain(":pull&service=ghcr.io");
    // Um token do repositório mediria a credencial de quem publica, e passaria
    // verde num pacote privado — o defeito que este gate existe para pegar.
    expect(t, "a sonda não pode usar segredo do repositório").not.toContain("secrets.");
  });

  it("token anônimo recusado conta como FALHA, não como 'não deu para medir'", () => {
    const t = passoDaSonda(publish);
    // É assim que o registro responde a pacote privado: nem token anônimo ele
    // entrega. Tratar isso como sucesso foi o buraco original.
    expect(t).toContain('status=401');
    expect(t).toMatch(/\[ "\$status" = "200" \]/);
    expect(t, "o passo tem de reprovar o job").toMatch(/exit "\$falhou"/);
    expect(t, "a mensagem tem de dizer o que fazer").toContain("::error::");
    expect(t, "a mensagem tem de nomear a visibilidade do pacote").toContain("PRIVADO");
  });

  it("cobre todas as imagens da matriz — nem uma a menos", () => {
    const t = passoDaSonda(publish);
    for (const img of IMAGENS_DA_MATRIZ) {
      expect(t, `a sonda não mede ${img}`).toContain(img);
    }
  });

  it("só roda em push de tag — em PR a imagem é construída e NÃO publicada", () => {
    const cond = /if:\s*(.+)/.exec(passoDaSonda(publish))?.[1] ?? "";
    // `imagens-ok` é check obrigatório em PR; uma sonda que rodasse ali
    // reprovaria todo PR por um pacote que ainda não devia existir.
    expect(cond).toContain("github.event_name == 'push'");
    expect(cond).toContain("github.ref_type == 'tag'");
  });

  it("o job continua sem permissão nenhuma", () => {
    // A sonda é anônima de propósito; `permissions: {}` é o que garante que ela
    // não ganhou credencial sem alguém decidir isso (ver
    // `tests/unit/workflows-tem-permissions.test.ts`).
    expect(job(publish, "imagens-ok")).toMatch(/^ {4}permissions: \{\}$/m);
  });
});
