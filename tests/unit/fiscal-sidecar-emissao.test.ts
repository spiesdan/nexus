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

  it("o destinatário leva enderDest a partir de extras.entrega (rejeição 726)", () => {
    // A SEFAZ recusa a NF-e sem <enderDest>. O bloco `entrega` é o único do
    // contrato que carrega cMun/IBGE; o mesmo endereço alimenta <dest> e
    // <entrega>, em vez de inventar um cadastro de endereço que não existe.
    const src = fs.readFileSync(path.join(DIRETORIO, "ServicoNfe.php"), "utf8");
    expect(src).toMatch(/tagenderDest\s*\(/);
    expect(src).toMatch(/'xLgr'\s*=>\s*\$this->limitar\(\(string\)\(\$e\['logradouro'\]/);
    expect(src).toMatch(/'cMun'\s*=>\s*\(string\)\(\$e\['codigo_municipio'\]/);
  });

  it("todo texto que o XSD limita passa pelo corte (xNome de 62 travou a 4578)", () => {
    // Medido em 04/11/2026, na nota 4578 (pedido 19415):
    //
    //   XML_INVALIDO: Element '{...}xNome': [facet 'maxLength']
    //   The value has a length of '62'; this exceeds the allowed maximum of '60'.
    //
    // O nome do destinatário vinha do cadastro com 62 caracteres. A SEFAZ
    // recusa o XML INTEIRO por um campo — a nota não sai e o recado na tela
    // fala de XML, não do cadastro.
    const src = fs.readFileSync(path.join(DIRETORIO, "ServicoNfe.php"), "utf8");

    // O corte existe e é multibyte (nome com acento não pode partir no meio).
    expect(src).toMatch(/private function limitar\(string \$valor, int \$limite\): string\s*\{\s*return mb_substr\(/);

    // Emitente (60), destinatário (60) e produto (120) — os três limites do
    // leiaute que recebem texto livre do cadastro.
    expect(src).toMatch(/'xNome'\s*=>\s*\$this->limitar\(\(string\)\$c\['razao'\], 60\)/);
    expect(src).toMatch(/'xNome'\s*=>\s*\$this->limitar\(\(string\)\(\$p\['nome'\] \?\? ''\), 60\)/);
    expect(src).toMatch(/'xProd'\s*=>\s*\$this->limitar\(\(string\)\$item\['descricao'\], 120\)/);

    // E nenhum campo de texto pode voltar a ir cru para o Make.
    expect(src).not.toMatch(/'xNome'\s*=>\s*trim\(/);
    expect(src).not.toMatch(/'xProd'\s*=>\s*\(string\)\$item\['descricao'\]/);
  });

  it("sem extras.entrega o sidecar recusa antes de abrir o certificado", () => {
    const src = fs.readFileSync(path.join(DIRETORIO, "ServicoNfe.php"), "utf8");
    expect(src).toContain("extras.entrega (endereço do destinatário) é obrigatório");
  });

  it("idDest é derivado do destino — SC→PR não sai como operação interna", () => {
    // Medido na 1ª NF-e real (03/11/2026): o pedido era SC→PR e o `<ide>` ia
    // com `idDest` FIXO em '1' (interna). A SEFAZ compara idDest com a UF do
    // destinatário; a nota seria rejeitada depois de já ter consumido número.
    const src = fs.readFileSync(path.join(DIRETORIO, "ServicoNfe.php"), "utf8");
    expect(src).not.toMatch(/'idDest'\s*=>\s*'1'/);
    expect(src).toMatch(/'idDest'\s*=>\s*\$idDest/);
    expect(src).toMatch(/private function idDestino\(\): string/);
    // A UF de destino vem do endereço de entrega, não de constante.
    expect(src).toMatch(/private function ufDestino\(\): string[\s\S]{0,300}\$this->extras\['entrega'\]/);
  });

  it("CFOP troca o primeiro dígito 5↔6 conforme o destino", () => {
    // Default `5102` fixo fazia toda venda interestadual sair com CFOP de
    // operação interna. O código da operação (102) é do cadastro; só o dígito
    // que diz "dentro/fora do estado" muda.
    const src = fs.readFileSync(path.join(DIRETORIO, "ServicoNfe.php"), "utf8");
    expect(src).toMatch(/'CFOP'\s*=>\s*\$this->cfopParaDestino\(/);
    expect(src).toMatch(/private function cfopParaDestino\(string \$cfop\): string/);
  });

  it("indFinal: não contribuinte (indIEDest 9) é consumidor final — SEFAZ 696", () => {
    // Medido em 05/11/2026: notas para CNPJ sem IE (indIEDest 9) foram
    // rejeitadas com "696 — Operação com não contribuinte deve indicar
    // operação com consumidor final". A regra antiga olhava só o tamanho do
    // documento (CPF=1, CNPJ=0) e deixava todo B2B sem IE travado. O
    // indicador é o MESMO que vai em <dest><indIEDest>.
    const src = fs.readFileSync(path.join(DIRETORIO, "ServicoNfe.php"), "utf8");
    expect(src).toMatch(/'indFinal'\s*=>\s*\$this->indicadorIe\(\)\s*===\s*'9'\s*\?\s*'1'\s*:\s*'0'/);
    expect(src).toMatch(/private function indicadorIe\(\): string/);
  });

  it("IBS/CBS e IPI vão no XML — e o Make precisa do schema PL_010", () => {
    // `new Make()` usa schema 9 (PL_009) e os grupos IBSCBS são silenciosamente
    // omitidos (o build só os injeta com schema > 9). O emissor anterior emite
    // CST 000 / cClassTrib 000001 / IBS-UF 0,10% / CBS 0,90%.
    const src = fs.readFileSync(path.join(DIRETORIO, "ServicoNfe.php"), "utf8");
    expect(src).not.toMatch(/new Make\(\)/);
    expect(src).toContain("new Make('PL_010')");
    expect(src).toMatch(/tagIBSCBS\(/);
    expect(src).toMatch(/'cClassTrib'\s*=>\s*'000001'/);
    expect(src).toMatch(/tagIBSCBSTot\(/);
    expect(src).toMatch(/'CST'\s*=>\s*'53'/);
  });

  it("a validação usa o XSD PL_010 — o PL_009 não conhece IBSCBS", () => {
    // Medido na 1ª emissão com IBS/CBS: `signNFe` validava contra PL_009_V4 e
    // recusava o XML inteiro ("IBSCBS: This element is not expected"). O XSD
    // PL_010_V1.30 aceita o grupo (a única falta que acusa é a assinatura, que
    // o signNFe acrescenta).
    const src = fs.readFileSync(path.join(DIRETORIO, "ServicoNfe.php"), "utf8");
    expect(src).not.toContain("'schemes' => 'PL_009_V4'");
    expect(src).toContain("'schemes' => 'PL_010_V1.30'");
  });

  it("responsável técnico vai no XML e é recusado sem CNPJ válido", () => {
    // Medido na 1ª emissão: a SEFAZ devolveu 972 ("Obrigatória as informações
    // do responsável técnico"). O dado é do fornecedor do software e vive no
    // ambiente; CNPJ igual ao do emitente é recusado (776).
    const src = fs.readFileSync(path.join(DIRETORIO, "ServicoNfe.php"), "utf8");
    expect(src).toContain("taginfRespTec");
    expect(src).toContain("FISCAL_RESP_TEC_CNPJ");
    expect(src).toMatch(/rejeição 776|rejeicao 776/);
  });

  it("nota a prazo emite o grupo Fatura antes das duplicatas (rejeição 905)", () => {
    // Medido em 05/11/2026, nota 4587 desta instalação: `<cobr>` saía só com
    // `<dup>` (o XSD dispensa `<fat>`, e o XML passava na validação de
    // esquema) — mas a SEFAZ aplica regra de negócio e recusou com
    // `905 — Campos do grupo Fatura não informados`. A nota seguinte, com o
    // `<fat>` na frente, foi autorizada (4588, protocolo 242260530117471).
    //
    // O gate é estático porque o sidecar é PHP: ele cobra a ORDEM (fat antes
    // de dup) e os campos que a fatura precisa ter.
    const src = fs.readFileSync(path.join(DIRETORIO, "ServicoNfe.php"), "utf8");
    const inicio = src.indexOf("private function montarDuplicatas");
    expect(inicio, "montarDuplicatas não encontrada").toBeGreaterThan(-1);
    const trecho = src.slice(inicio, src.indexOf("\n    }", inicio));

    const posFat = trecho.indexOf("tagfat(");
    const posDup = trecho.indexOf("tagdup(");
    expect(posFat, "a fatura não é emitida — rejeição 905 de volta").toBeGreaterThan(-1);
    expect(posDup, "as duplicatas sumiram").toBeGreaterThan(-1);
    expect(posFat, "a fatura precisa vir ANTES das duplicatas (leiaute Y02 → Y07)").toBeLessThan(
      posDup,
    );
    for (const campo of ["'nFat'", "'vOrig'", "'vLiq'"]) {
      expect(trecho, `o grupo Fatura sem ${campo} não fecha`).toContain(campo);
    }
  });

  it("inutilização aceita o cStat 102 — e não o 1002, que não existe", () => {
    // Medido em 05/11/2026 nas três primeiras inutilizações reais desta
    // instalação: a SEFAZ homologou (102, "Inutilização de número homologado")
    // e o sidecar procurava 1002 — a tela mostrava "Erro" para número
    // inutilizado de verdade, e "Retransmitir" reenviava o que já estava feito.
    const src = fs.readFileSync(path.join(DIRETORIO, "ServicoNfe.php"), "utf8");
    expect(src).toContain("$ret['cstat'] === '102'");
    expect(src).not.toContain("'1002'");
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
