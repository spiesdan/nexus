import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Portão do emissor NF-e (sidecar PHP).
 *
 * POR QUE ESTE ARQUIVO EXISTE: a primeira emissão de verdade deste produto —
 * feita em homologação, contra a SEFAZ, em 19/10/2026 — voltou assim:
 *
 *   SEFAZ/sidecar [XML_INVALIDO]: Element '{...}verProc': [facet 'maxLength']
 *   The value has a length of '27'; this exceeds the allowed maximum of '20'.
 *
 * Ou seja: **nenhuma nota emitia**, em instalação nenhuma, e o defeito morava
 * numa única string literal de um arquivo PHP que nenhum teste do repositório
 * abria. O XSD do leiaute 4.00 recusa o XML inteiro por causa dela.
 *
 * O sidecar é PHP e não tem suíte própria; o harness de testes é o do
 * repositório (vitest). Este arquivo é a ponte: lê o PHP como TEXTO e cobra as
 * duas invariantes que o mantêm emissível.
 */
const RAIZ = process.cwd();
const DIRETORIO = path.join(RAIZ, "fiscal", "sidecar", "src");

/** Limite do XSD para `verProc` (leiaute 4.00), lido da recusa da SEFAZ. */
const VERPROC_MAX = 20;

/**
 * Marca do fornecedor. O produto é revendido (white-label): o `verProc` viaja
 * no XML autorizado e fica visível no portal da SEFAZ do cliente, então ele é
 * a única string do sidecar que NÃO pode carregar o nome de quem o escreveu.
 */
const MARCA_DO_FORNECEDOR = /deskcomm/i;

function arquivosPhp(): string[] {
  return fs
    .readdirSync(DIRETORIO)
    .filter((f) => f.endsWith(".php"))
    .map((f) => path.join(DIRETORIO, f));
}

/** Linhas que não são comentário — comentário pode citar a marca sem vazá-la. */
function semLinhasDeComentario(php: string): string[] {
  return php
    .split("\n")
    .filter((l) => !/^\s*(\/\/|#|\*|\/\*)/.test(l));
}

describe("emissor NF-e do sidecar", () => {
  it("o diretório do sidecar tem os serviços esperados", () => {
    // Trava a premissa do teste: se o sidecar for movido/renomeado, isto cai
    // aqui em vez de fazer os outros testes passarem vazios.
    expect(fs.existsSync(DIRETORIO)).toBe(true);
    expect(arquivosPhp().length).toBeGreaterThan(0);
  });

  it("o verProc cabe no XSD (maxLength 20) — foi o que travou a 1ª emissão", () => {
    const src = fs.readFileSync(path.join(DIRETORIO, "ServicoNfe.php"), "utf8");
    const extraido = /'verProc'\s*=>\s*'([^']*)'/.exec(src);

    expect(extraido, "verProc não encontrado em ServicoNfe.php").not.toBeNull();
    const verProc = extraido![1]!;

    expect(verProc.length).toBeGreaterThan(0); // o XSD exige minLength 1
    expect(verProc.length).toBeLessThanOrEqual(VERPROC_MAX);
  });

  it("o verProc não carrega a marca do fornecedor (white-label)", () => {
    const src = fs.readFileSync(path.join(DIRETORIO, "ServicoNfe.php"), "utf8");
    const verProc = /'verProc'\s*=>\s*'([^']*)'/.exec(src)![1]!;
    expect(verProc).not.toMatch(MARCA_DO_FORNECEDOR);
  });

  it("nenhum literal do sidecar carrega a marca do fornecedor", () => {
    // Varre os VALORES (string entre aspas), não os comentários: o comentário
    // da correção do verProc cita a string antiga de propósito.
    const culpados: string[] = [];
    for (const arquivo of arquivosPhp()) {
      const linhas = semLinhasDeComentario(fs.readFileSync(arquivo, "utf8"));
      for (const linha of linhas) {
        for (const m of linha.matchAll(/'([^']*)'|"([^"]*)"/g)) {
          const valor = m[1] ?? m[2] ?? "";
          if (MARCA_DO_FORNECEDOR.test(valor)) culpados.push(`${path.basename(arquivo)}: ${valor}`);
        }
      }
    }
    expect(culpados).toEqual([]);
  });
});
