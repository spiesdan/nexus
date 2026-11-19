/**
 * A LÓGICA DO CATÁLOGO DO MERCOS — pura, sem navegador e sem banco.
 *
 * Mora separada de propósito: o coletor fala com um ERP de terceiro (Playwright,
 * credencial, rede) e o importador fala com o Supabase (service role). Nenhum
 * dos dois dá para exercitar num teste. O que DÁ para exercitar é a decisão —
 * que coluna é qual, o que é preço, o que é divergência, o que o pareamento
 * aceita e o que ele só reporta —, e é aqui que ela mora.
 *
 * ─── AS DUAS REGRAS QUE NÃO SE NEGOCIAM ───────────────────────────────────
 *
 * 1. **Código é identidade; nome não é.** `(organization_id, codigo)` é o índice
 *    único de `catalog_products`. O pareamento de item histórico é por código
 *    EXATO — e só.
 * 2. **Nome só entra como CANDIDATO, nunca como decisão.** Medido em produção
 *    em 18/11/2026: dos 616 itens sem `product_id`, apenas 3 casariam por nome
 *    normalizado, e de forma ambígua (dois produtos "ESPONJA COM 4 UN", códigos
 *    806 e 8147). Um casamento por nome ali escolheria o NCM errado — erro
 *    fiscal, não conveniência. O relatório mostra os candidatos; aplicar exige
 *    decisão humana.
 */

/** Códigos do Mercos são texto. `trim` e nada mais: mudar o código é mudar a identidade. */
export function normalizarCodigo(valor) {
  if (valor === null || valor === undefined) return null;
  const limpo = String(valor)
    .replace(/\u00a0/g, " ")
    .trim();
  return limpo === "" ? null : limpo;
}

/** Nome normalizado — a MESMA régua que o resto do repositório usa (upper + espaços). */
export function normalizarNome(valor) {
  if (valor === null || valor === undefined) return null;
  const limpo = String(valor)
    .normalize("NFKC")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
  return limpo === "" ? null : limpo;
}

/**
 * A chave "sem zeros à esquerda" — usada SÓ para relatório.
 *
 * `411` e `0411` são o mesmo produto aos olhos de quem digita, mas não são o
 * mesmo código. Igualar aqui seria inventar identidade: o relatório mostra o
 * candidato e quem decide é o dono do catálogo.
 */
export function chaveSemZeros(codigo) {
  const c = normalizarCodigo(codigo);
  if (!c) return null;
  return /^\d+$/.test(c) ? c.replace(/^0+(?=\d)/, "") : null;
}

/**
 * Preço do Mercos → centavos. `R$ 1.234,56`, `1.234,56` e `1234,56` valem o
 * mesmo; `1,234.56` (formato inglês) também, porque o parse decide pelo ÚLTIMO
 * separador em vez de assumir o locale.
 */
export function precoParaCents(valor) {
  if (valor === null || valor === undefined) return null;
  const bruto = String(valor)
    .replace(/[^\d.,-]/g, "")
    .trim();
  if (bruto === "") return null;

  const ultimaVirgula = bruto.lastIndexOf(",");
  const ultimoPonto = bruto.lastIndexOf(".");
  let normalizado = bruto;

  const separadores = (bruto.match(/[.,]/g) ?? []).length;

  if (separadores === 2) {
    // Dois separadores: o ÚLTIMO é o decimal, o outro é milhar.
    if (ultimaVirgula > ultimoPonto) normalizado = bruto.replace(/\./g, "").replace(",", ".");
    else normalizado = bruto.replace(/,/g, "");
  } else if (separadores === 1) {
    // Um separador só: 3 dígitos depois dele é MILHAR (`1.234` = mil duzentos e
    // trinta e quatro). Menos que isso é decimal (`49.9`, `49,90`). O caso
    // "3 dígitos que são centavos" não existe em preço de ERP — centavos são 2.
    const pos = Math.max(ultimaVirgula, ultimoPonto);
    const depois = bruto.length - pos - 1;
    const separador = bruto[pos];
    normalizado = depois === 3 ? bruto.replace(separador, "") : bruto.replace(separador, ".");
  } else {
    normalizado = bruto;
  }

  const n = Number.parseFloat(normalizado);
  if (!Number.isFinite(n)) return null;
  const cents = Math.round(n * 100);
  return cents >= 0 ? cents : null;
}

/**
 * Do `<thead>` para o índice de cada coluna.
 *
 * O legado (`docs/legacy/mercos-scrape/extrair-catalogo.ts`) usa posição fixa
 * (2=código, 3=nome, 7=preço). Posição fixa quebra em silêncio quando o ERP
 * reordena uma coluna — e o sintoma é preço no lugar do nome. Aqui o cabeçalho
 * MANDA; a posição é só o plano B declarado, e quem cai nele é marcado.
 */
export function mapearColunas(cabecalho) {
  const chaves = (cabecalho ?? []).map((c) => normalizarNome(c) ?? "");
  const achar = (padroes) => {
    for (const [i, titulo] of chaves.entries()) {
      if (padroes.some((p) => p.test(titulo))) return i;
    }
    return null;
  };

  const mapa = {
    codigo: achar([/^C[OÓ]DIGO$/, /^C[OÓ]D\.?$/, /SKU/, /REFER[EÊ]NCIA/]),
    nome: achar([/^PRODUTO$/, /^NOME$/, /^DESCRI[CÇ][AÃ]O$/, /^DESCRI/]),
    unidade: achar([/^UN(IDADE)?\.?$/, /^UNID/]),
    preco: achar([/PRE[CÇ]O/, /^VALOR/, /VENDA/]),
    ipi: achar([/^IPI/]),
    comissao: achar([/COMISS/]),
    estoque: achar([/ESTOQUE/, /SALDO/, /QTD/]),
  };

  const faltando = ["codigo", "nome"].filter((k) => mapa[k] === null);
  return {
    mapa,
    // Sem código OU sem nome não há linha utilizável — e o relatório precisa
    // dizer POR QUE o lote inteiro foi recusado, não só que foi.
    completo: faltando.length === 0,
    faltando,
  };
}

/**
 * A ROTA DO CATÁLOGO NÃO É `/<empresa>/produtos/`.
 *
 * Medido em produção em 18/11/2026, dentro do `crm-mercos-1`:
 * `https://app.mercos.com/338282/produtos/` responde **404** e o `goto` não
 * lança — a página de erro tem `<h1>` e texto. O coletor então lia zero linhas
 * e terminava com `{"produtos_lidos":0,"paginas":0,"cabecalho_lido":false}` e
 * **exit 0**: o mesmo silêncio que ele existe para eliminar.
 *
 * A rota real desta instalação é `/industria/<empresa>/produtos/`, e é ela que
 * o menu autenticado aponta. O segmento do meio muda com o tipo de conta, então
 * a primeira candidata é sempre a do menu (descoberta, não adivinhada); as
 * fixas ficam como rede.
 */
export function rotasDoCatalogo(empresa, status = "1") {
  const consulta = `?p=1&status=${status}&nome_codigo=`;
  return [
    `https://app.mercos.com/industria/${empresa}/produtos/${consulta}`,
    `https://app.mercos.com/${empresa}/produtos/${consulta}`,
  ];
}

/**
 * O `status` do filtro da grade — medido em 19/11/2026, no `crm-mercos-1`.
 *
 * A pílula de paginação carrega o filtro (`.?p=2&status=1&nome_codigo=`), e o
 * contador de registros confirma o que cada valor significa:
 *
 *   status=1 → **601** produtos (só ativos; é o padrão da tela)
 *   status=0 → **847** produtos (**todos**, 246 inativos no meio)
 *   status=2 → só os inativos (15 de 15 na primeira página)
 *
 * Era isso que faltava: `?situacao=inativos`, `?inativos=true`, `?ativos=false`
 * e `?status=inativos` não mudam nada — o parâmetro é `status` e o valor é
 * numérico. O menu de exportação ("apenas ativos" × "todos") é o mesmo filtro,
 * entregue por e-mail; não é preciso esperar o e-mail.
 */
export const STATUS_DA_GRADE = Object.freeze({ ativos: "1", todos: "0", inativos: "2" });

/**
 * ZERO NÃO É SUCESSO — o motivo, ou `null` quando a coleta valeu.
 *
 * `paginas === 0` = nem abriu a grade (rota errada, sessão caída, seletor
 * quebrado). `produtos_lidos === 0` = abriu e não achou linha utilizável.
 * Os dois viravam "fim" com exit 0; agora viram falha declarada com o motivo,
 * separado, porque a ação de quem lê o log é diferente em cada caso.
 */
export function motivoDoVazio({ paginas, produtosLidos }) {
  if (!Number.isFinite(paginas) || paginas <= 0) return "nenhuma pagina lida";
  if (!Number.isFinite(produtosLidos) || produtosLidos <= 0)
    return "pagina lida, nenhuma linha utilizavel";
  return null;
}

/**
 * A COLETA LEU MENOS DO QUE O ERP DISSE TER?
 *
 * O contador do próprio ERP (`/contar_produtos/<rep>/`) informa o total do
 * filtro — 601 com `status=1`, 847 com `status=0`. Se a coleta parar antes
 * (paginação que não avança, aba que dorme), esse número não bate.
 *
 * Existe porque aconteceu: em 19/11/2026 a mesma coleta parou em **75 de 601** e
 * em **495 de 601**, e as duas terminaram com `ok: true` — um catálogo pela
 * metade que se anuncia completo é pior que uma falha.
 *
 * `--limite` é a única razão legítima para ler menos (amostra declarada).
 * Total desconhecido (`null`) não vira falha: não dá para cobrar uma régua que
 * o ERP não entregou.
 */
export function coletaIncompleta({ lidos, totalNoErp, limite }) {
  if (!Number.isFinite(totalNoErp)) return false;
  if (Number.isFinite(limite) && lidos >= limite) return false;
  return lidos < totalNoErp;
}

/** Plano B declarado do legado. Só usado quando o `<thead>` não foi lido. */
export const COLUNAS_LEGADO = Object.freeze({
  codigo: 2,
  nome: 3,
  ipi: 4,
  unidade: 5,
  comissao: 6,
  preco: 7,
});

/**
 * AS LINHAS QUE VÃO PARA O UPSERT — onde mora a regra de não desativar ninguém.
 *
 * Três decisões, nesta ordem:
 *
 * 1. **Produto que já existe mantém o `ativo` do banco.** Importar do ERP nunca
 *    desativa catálogo: quem desativou aqui foi uma pessoa, e o ERP não é
 *    autoridade sobre o que a loja vende. (É por isso que ler "todos" — com
 *    inativos — não apaga nem esconde o que já está publicado.)
 * 2. **Produto NOVO nasce como o ERP disse.** Se a fonte afirma que ele está
 *    inativo, ele entra inativo: criar um produto inativo como ativo o colocaria
 *    na vitrine e na tabela de preço sem ninguém ter pedido isso.
 * 3. **Sem informação da fonte (`null`), nasce ativo** — é o comportamento de
 *    antes, e a grade só lista ativos de qualquer forma.
 *
 * Nome e foto também têm dono: o nome do BANCO vence (divergência vai para o
 * relatório) e a foto só preenche o vazio.
 */
export function montarLinhasDeUpsert(organizationId, criados, atualizados, existentesPorCodigo) {
  const linhas = [];

  for (const produto of criados ?? []) {
    linhas.push({
      organization_id: organizationId,
      codigo: produto.codigo,
      nome: produto.nome,
      preco_cents: produto.preco_cents,
      moeda: "BRL",
      unidade: produto.unidade,
      imagem_url: produto.foto,
      origem: "mercos",
      ativo: produto.ativo_erp !== false,
    });
  }

  for (const produto of atualizados ?? []) {
    const existente = existentesPorCodigo?.get?.(produto.codigo) ?? null;
    linhas.push({
      organization_id: organizationId,
      codigo: produto.codigo,
      nome: produto.nome,
      preco_cents: produto.preco_cents,
      moeda: "BRL",
      unidade: produto.unidade ?? existente?.unidade ?? null,
      imagem_url: existente?.imagem_url ? existente.imagem_url : produto.foto,
      ativo: existente?.ativo ?? produto.ativo_erp !== false,
    });
  }

  return linhas;
}

/**
 * Classifica as linhas coletadas em utilizáveis, divergentes e sem código.
 *
 * Divergente é a linha que EXISTE e não dá para importar com segurança —
 * sem nome, com preço ilegível, ou com código repetido dentro do próprio lote
 * (o ERP não deveria repetir, e se repetir a última vence: o relatório avisa).
 */
export function classificarLinhas(linhas) {
  const validas = [];
  const divergentes = [];
  const semCodigo = [];
  const vistos = new Map();

  for (const [indice, linha] of (linhas ?? []).entries()) {
    const codigo = normalizarCodigo(linha?.codigo);
    const nome = normalizarNome(linha?.nome);
    const preco_cents = precoParaCents(linha?.preco);

    if (!codigo) {
      semCodigo.push({ indice, nome: linha?.nome ?? null, motivo: "sem código" });
      continue;
    }
    if (!nome) {
      divergentes.push({ indice, codigo, motivo: "sem nome" });
      continue;
    }
    if (preco_cents === null) {
      divergentes.push({ indice, codigo, nome: linha?.nome ?? null, motivo: "preço ilegível" });
      continue;
    }

    const registro = {
      codigo,
      nome: String(linha.nome).trim().slice(0, 300),
      preco_cents,
      unidade: normalizarCodigo(linha?.unidade),
      foto: normalizarCodigo(linha?.foto),
      /*
       * `true` / `false` só quando a FONTE disse. A grade diz por linha (o botão
       * de inativar/ativar de cada `<tr>`); ausência vira `null` ("não sei"), e
       * `null` não desativa nada.
       */
      ativo_erp: typeof linha?.ativo === "boolean" ? linha.ativo : null,
      bruto: linha ?? null,
    };

    const anterior = vistos.get(codigo);
    if (anterior !== undefined) {
      divergentes.push({
        indice,
        codigo,
        nome: registro.nome,
        motivo: `código repetido no lote (linha ${anterior + 1}); vale a última`,
      });
      validas[anterior] = registro;
      continue;
    }
    vistos.set(codigo, validas.length);
    validas.push(registro);
  }

  return { validas, divergentes, semCodigo };
}

/**
 * Compara o lote com o catálogo existente: criados × atualizados × divergentes.
 *
 * `divergentes` aqui é OUTRA coisa da classificação da linha: é o produto que já
 * existe com o mesmo código e **nome diferente**. Nesse caso o nome do banco é
 * preservado (quem digitou foi uma pessoa, ou uma importação anterior com
 * curadoria) e o relatório mostra os dois lado a lado — atualizar preço sim,
 * rebatizar o produto em silêncio não.
 */
export function planejarUpsert(validas, existentesPorCodigo) {
  const criados = [];
  const atualizados = [];
  const divergentes = [];

  for (const produto of validas ?? []) {
    const existente = existentesPorCodigo?.get?.(produto.codigo) ?? null;
    if (!existente) {
      criados.push(produto);
      continue;
    }

    const nomeExistente = normalizarNome(existente.nome);
    const nomeNovo = normalizarNome(produto.nome);
    if (nomeExistente && nomeNovo && nomeExistente !== nomeNovo) {
      divergentes.push({
        codigo: produto.codigo,
        nome_no_banco: existente.nome,
        nome_no_mercos: produto.nome,
        preco_no_banco_cents: existente.preco_cents ?? null,
        preco_no_mercos_cents: produto.preco_cents,
      });
    }

    atualizados.push({ ...produto, id: existente.id, nome: existente.nome });
  }

  return { criados, atualizados, divergentes };
}

/**
 * O PAREAMENTO DOS ITENS HISTÓRICOS — por código exato, e só.
 *
 * Recebe os itens sem `product_id` e o catálogo indexado. Devolve:
 *
 *  - `porCodigo`: o único conjunto que se aplica. Casamento EXATO de
 *    `produto_codigo` (trim) com `catalog_products.codigo`;
 *  - `porZero`: código que casa só depois de tirar zeros à esquerda — CANDIDATO,
 *    não decisão (`411` e `0411` podem ser o mesmo produto; podem não ser);
 *  - `porNome`: nome normalizado igual ao de UM produto, quando não houve
 *    código — CANDIDATO, e o mais perigoso de todos: foi assim que os dois
 *    "ESPONJA COM 4 UN" apareceram;
 *  - `ambiguos`: nome normalizado que casa com MAIS DE UM produto. Nunca entra
 *    em `porNome`, nem como candidato único — é a definição de "não adivinhe";
 *  - `semProduto`: o resto. O relatório conta por código, para o dono ver QUAIS
 *    códigos faltam no catálogo (é a lista de compras da coleta).
 */
export function planejarPareamento(itens, catalogo) {
  const porCodigo = [];
  const porZero = [];
  const porNome = [];
  const ambiguos = [];
  const semProduto = [];

  for (const item of itens ?? []) {
    const codigo = normalizarCodigo(item.produto_codigo);
    const nome = normalizarNome(item.produto_nome);

    if (codigo) {
      const exato = catalogo.porCodigo.get(codigo);
      if (exato) {
        porCodigo.push({ itemId: item.id, codigo, produtoId: exato.id });
        continue;
      }
      const zero = chaveSemZeros(codigo);
      if (zero) {
        const candidato = catalogo.porCodigoSemZeros.get(zero);
        if (candidato) {
          porZero.push({
            itemId: item.id,
            codigo,
            produtoId: candidato.id,
            produtoCodigo: candidato.codigo,
          });
          continue;
        }
      }
    }

    if (nome) {
      const candidatos = catalogo.porNome.get(nome) ?? [];
      if (candidatos.length === 1) {
        porNome.push({
          itemId: item.id,
          nome,
          produtoId: candidatos[0].id,
          produtoCodigo: candidatos[0].codigo,
        });
        continue;
      }
      if (candidatos.length > 1) {
        ambiguos.push({
          itemId: item.id,
          nome,
          candidatos: candidatos.map((p) => p.codigo),
        });
        continue;
      }
    }

    semProduto.push({ itemId: item.id, codigo, nome });
  }

  return { porCodigo, porZero, porNome, ambiguos, semProduto };
}

/** Índice do catálogo nas três chaves que o pareamento usa. */
export function indexarCatalogo(produtos) {
  const porCodigo = new Map();
  const porCodigoSemZeros = new Map();
  const porNome = new Map();

  for (const produto of produtos ?? []) {
    const codigo = normalizarCodigo(produto.codigo);
    if (codigo) {
      porCodigo.set(codigo, produto);
      const zero = chaveSemZeros(codigo);
      // Se dois códigos colapsam sem zeros, o índice guarda o primeiro e o
      // pareamento por zero vira CANDIDATO — a ambiguidade aparece no relatório.
      if (zero && !porCodigoSemZeros.has(zero)) porCodigoSemZeros.set(zero, produto);
    }
    const nome = normalizarNome(produto.nome);
    if (nome) {
      const lista = porNome.get(nome) ?? [];
      lista.push(produto);
      porNome.set(nome, lista);
    }
  }

  return { porCodigo, porCodigoSemZeros, porNome, total: (produtos ?? []).length };
}
