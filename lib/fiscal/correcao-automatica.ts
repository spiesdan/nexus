/**
 * CORREÇÃO AUTOMÁTICA DO DESTINATÁRIO — o que a máquina sabe consertar sozinha,
 * e o que ela tem de devolver para quem opera.
 *
 * ─── O PROBLEMA QUE ISSO RESOLVE ───────────────────────────────────────────
 *
 * A fila de notas para por rejeição de cadastro do destinatário: IE ausente
 * (232), endereço incompleto (726), CNPJ divergente. O dado que falta quase
 * sempre existe em cadastro público — e o operador estava redigitando à mão o
 * que a Receita já publica.
 *
 * Esta função é PURA de propósito: recebe o que a tela tem, o que a consulta
 * pública trouxe, e devolve **o plano** — o que preencher, com que valor, por
 * que, e o que NÃO dá para consertar. Quem aplica é a tela, depois de o
 * operador ver a lista. Nada é gravado aqui.
 *
 * ─── AS TRÊS REGRAS ────────────────────────────────────────────────────────
 *
 * 1. **Nunca sobrescreve dado digitado.** Só preenche campo vazio. Um valor
 *    humano pode ser mais novo ou mais correto que o público — e apagar o que
 *    alguém acabou de digitar é o pior jeito de "ajudar".
 *
 * 2. **Nunca inventa dado fiscal.** IE só entra a da UF do destinatário, vinda
 *    de cadastro público. Se não existe IE publicada, o campo fica vazio e a
 *    pendência explica as opções (ISENTO × não contribuinte) — porque o
 *    `indIEDest` da NF-e é consequência disso, não enfeite.
 *
 * 3. **O que não dá para consertar aparece na lista.** CFOP depende da
 *    operação; NCM só existe se o cadastro do produto tiver; documento com
 *    dígito inválido é erro de cadastro que a máquina não pode adivinhar.
 *    Esconder isso faria a tela dizer "corrigido" e a SEFAZ recusar de novo.
 */

import { isValidCnpj } from "@/lib/brasil/cnpj";
import type { InscricaoEstadual } from "@/lib/brasil/inscricao-estadual";

/** Só o que o formulário de correção tem, para a função continuar pura. */
export interface DestinatarioDaTela {
  nome: string;
  documento: string | null;
  ie: string | null;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
  cep: string;
}

export interface ItemDaTela {
  order_item_id: string;
  descricao: string;
  ncm: string;
  cfop: string;
  unidade: string;
  /** NCM do cadastro do produto — a fonte que a nota pode herdar. */
  ncm_do_cadastro?: string | null;
}

/** O que a consulta pública devolveu. `null` = não consultado ou indisponível. */
export interface CadastroPublico {
  razao_social: string;
  logradouro: string | null;
  numero: string | null;
  bairro: string | null;
  municipio: string | null;
  uf: string | null;
  cep: string | null;
  /** IE já escolhida para a UF pedida (pode ser `null` se não houver). */
  ie: string | null;
  /** UFs em que o CNPJ tem IE ativa — para explicar quando a UF não bate. */
  ufs_com_inscricao: string[];
  inscricoes: InscricaoEstadual[];
}

export type FonteDaCorrecao = "cadastro-publico" | "cadastro-do-produto" | "normalizacao";

export interface Mudanca {
  campo: string;
  rotulo: string;
  de: string;
  para: string;
  motivo: string;
  fonte: FonteDaCorrecao;
}

export interface Pendencia {
  campo: string;
  rotulo: string;
  motivo: string;
  acao: string;
}

export interface PlanoDeCorrecao {
  /** Campos do destinatário que mudam — só os que mudam. */
  destinatario: Partial<DestinatarioDaTela>;
  /** Itens que mudam, por `order_item_id`. */
  itens: Array<{ order_item_id: string } & Partial<Pick<ItemDaTela, "ncm" | "cfop" | "unidade">>>;
  mudancas: Mudanca[];
  pendencias: Pendencia[];
}

const LIMITE_DO_LEIAUTE = 60;

const soDigitos = (v: string | null | undefined) => (v ?? "").replace(/\D/g, "");
const limpo = (v: string | null | undefined) => (v ?? "").trim();

const ROTULO_DO_CAMPO: Record<string, string> = {
  documento: "CPF/CNPJ",
  ie: "Inscrição Estadual",
  logradouro: "Logradouro",
  numero: "Número",
  bairro: "Bairro",
  cidade: "Cidade",
  uf: "UF",
  cep: "CEP",
  ncm: "NCM",
  cfop: "CFOP",
  unidade: "Unidade",
  descricao: "Descrição",
};

function vazio(v: string | null | undefined): boolean {
  return limpo(v) === "";
}

/**
 * Monta o plano. Determinística: mesma entrada, mesmo plano — o operador pode
 * clicar duas vezes sem medo de o segundo clique mudar outra coisa.
 */
export function planejarCorrecaoAutomatica(entrada: {
  destinatario: DestinatarioDaTela;
  itens: readonly ItemDaTela[];
  cadastro?: CadastroPublico | null;
}): PlanoDeCorrecao {
  const { destinatario: d, itens } = entrada;
  const cadastro = entrada.cadastro ?? null;

  const plano: PlanoDeCorrecao = { destinatario: {}, itens: [], mudancas: [], pendencias: [] };

  const mudar = (
    campo: keyof DestinatarioDaTela,
    para: string,
    motivo: string,
    fonte: FonteDaCorrecao,
  ) => {
    if (limpo(para) === "") return;
    const atual = limpo(d[campo]);
    if (atual === limpo(para)) return;
    (plano.destinatario as Record<string, string>)[campo] = limpo(para);
    plano.mudancas.push({
      campo,
      rotulo: ROTULO_DO_CAMPO[campo] ?? campo,
      de: atual,
      para: limpo(para),
      motivo,
      fonte,
    });
  };

  const pendente = (campo: string, motivo: string, acao: string) => {
    plano.pendencias.push({
      campo,
      rotulo: ROTULO_DO_CAMPO[campo] ?? campo,
      motivo,
      acao,
    });
  };

  // ── Documento ────────────────────────────────────────────────────────────
  const documento = soDigitos(d.documento);
  if (documento === "") {
    pendente(
      "documento",
      "o destinatário está sem CPF/CNPJ, e a NF-e exige o documento",
      "informe o documento do cliente no cadastro — não há como deduzi-lo do endereço",
    );
  } else if (documento.length === 14 && !isValidCnpj(documento)) {
    pendente(
      "documento",
      "o CNPJ não passa no dígito verificador",
      "corrija o CNPJ no cadastro do cliente: é documento inexistente, não erro de digitação da nota",
    );
  } else if (documento.length !== 14 && documento.length !== 11) {
    pendente(
      "documento",
      "o documento tem tamanho que a SEFAZ não aceita (nem 11 nem 14 dígitos)",
      "confira o CPF/CNPJ no cadastro do cliente",
    );
  }

  // ── IE ───────────────────────────────────────────────────────────────────
  const uf = limpo(d.uf).toUpperCase();
  const ieAtual = limpo(d.ie);
  if (ieAtual === "") {
    if (cadastro?.ie) {
      mudar(
        "ie",
        cadastro.ie,
        `IE publicada para este CNPJ em ${uf} — é a que a nota exige (rejeição 232)`,
        "cadastro-publico",
      );
    } else if (documento.length === 11) {
      pendente(
        "ie",
        "destinatário pessoa física: não há IE para consultar",
        "se o cliente é contribuinte, informe a IE; se não é, deixe vazio (indIEDest 9) ou escreva ISENTO se for isento",
      );
    } else if (cadastro && cadastro.ufs_com_inscricao.length > 0) {
      pendente(
        "ie",
        `o CNPJ tem IE ativa em ${cadastro.ufs_com_inscricao.join(", ")}, mas o destinatário está em ${
          uf || "UF não informada"
        }`,
        "confira a UF do destinatário ou informe ISENTO se a operação for isenta",
      );
    } else if (cadastro) {
      pendente(
        "ie",
        "nenhuma IE publicada para este CNPJ",
        "se a empresa é isenta, escreva ISENTO; se é não contribuinte, deixe vazio",
      );
    } else {
      pendente(
        "ie",
        "o destinatário está sem IE e a consulta pública não foi feita",
        "use “Buscar pelo CNPJ” para consultar, ou informe a IE / ISENTO",
      );
    }
  }

  // ── Endereço ─────────────────────────────────────────────────────────────
  if (cadastro) {
    const doCadastro: Array<[keyof DestinatarioDaTela, string | null, string]> = [
      ["logradouro", cadastro.logradouro, "logradouro do cadastro público"],
      ["numero", cadastro.numero, "número do cadastro público"],
      ["bairro", cadastro.bairro, "bairro do cadastro público"],
      ["cidade", cadastro.municipio, "município do cadastro público"],
      ["cep", soDigitos(cadastro.cep) || null, "CEP do cadastro público"],
    ];
    for (const [campo, valor, motivo] of doCadastro) {
      // Só preenche vazio: endereço digitado pelo operador manda.
      if (vazio(d[campo] as string) && valor && limpo(valor) !== "") {
        mudar(campo, valor, motivo, "cadastro-publico");
      }
    }
    if (vazio(d.uf) && cadastro.uf) {
      mudar("uf", cadastro.uf, "UF do cadastro público", "cadastro-publico");
    } else if (!vazio(d.uf) && cadastro.uf && uf !== cadastro.uf.toUpperCase()) {
      pendente(
        "uf",
        `a UF do destinatário (${uf}) difere da UF do CNPJ (${cadastro.uf})`,
        "endereço de entrega em outra UF é permitido, mas confira se é isso mesmo antes de reenviar",
      );
    }
  }

  // O leiaute limita o TLocal a 60 caracteres por campo. O valor público é
  // melhor que campo vazio, mas se passar do limite a nota ainda para — e a
  // pendência diz exatamente qual campo encurtar.
  for (const campo of ["logradouro", "numero", "complemento", "bairro"] as const) {
    const valor = limpo((plano.destinatario[campo] ?? d[campo]) as string);
    if (valor.length > LIMITE_DO_LEIAUTE) {
      pendente(
        campo,
        `${ROTULO_DO_CAMPO[campo]} tem ${valor.length} caracteres e o leiaute aceita ${LIMITE_DO_LEIAUTE}`,
        "encurte o campo no cadastro do cliente e reenvie",
      );
    }
  }

  // Endereço continua incompleto mesmo depois do plano: o que ainda falta.
  const depois = { ...d, ...plano.destinatario };
  for (const [campo, rotulo] of [
    ["logradouro", "logradouro"],
    ["numero", "número do endereço"],
    ["bairro", "bairro"],
    ["cidade", "cidade"],
    ["uf", "UF"],
  ] as const) {
    if (vazio(depois[campo] as string)) {
      pendente(
        campo,
        `${rotulo} está vazio e a NF-e exige o endereço de entrega completo`,
        cadastro
          ? "o cadastro público não publica este campo — preencha no cadastro do cliente"
          : "use “Buscar pelo CNPJ” para trazer o endereço, ou preencha à mão",
      );
    }
  }
  const cepDepois = soDigitos(depois.cep);
  if (cepDepois.length !== 8) {
    pendente("cep", "CEP ausente ou incompleto", "informe os 8 dígitos do CEP do destinatário");
  }

  // ── Itens ────────────────────────────────────────────────────────────────
  for (const item of itens) {
    const mudancaNoItem: { order_item_id: string } & Record<string, string> = {
      order_item_id: item.order_item_id,
    };

    const ncm = soDigitos(item.ncm);
    if (ncm.length !== 8) {
      const doCadastro = soDigitos(item.ncm_do_cadastro);
      if (doCadastro.length === 8) {
        mudancaNoItem.ncm = doCadastro;
        plano.mudancas.push({
          campo: "ncm",
          rotulo: `${ROTULO_DO_CAMPO.ncm} · ${item.descricao || item.order_item_id}`,
          de: item.ncm,
          para: doCadastro,
          motivo: "NCM do cadastro do produto — a nota herda o que já está classificado",
          fonte: "cadastro-do-produto",
        });
      } else {
        pendente(
          "ncm",
          `NCM ausente ou fora de 8 dígitos em “${item.descricao || item.order_item_id}”, e o produto não tem NCM no cadastro`,
          "classifique o produto (NCM de 8 dígitos) e reenvie",
        );
      }
    }

    if (limpo(item.cfop) === "") {
      pendente(
        "cfop",
        `CFOP vazio em “${item.descricao || item.order_item_id}”`,
        "o CFOP depende da operação (dentro/fora do estado, contribuinte ou não) — escolha o correto",
      );
    }
    if (limpo(item.unidade) === "") {
      pendente(
        "unidade",
        `unidade vazia em “${item.descricao || item.order_item_id}”`,
        "informe a unidade comercial (UN, KG, CX…)",
      );
    }
    if (limpo(item.descricao) === "") {
      pendente(
        "descricao",
        "item sem descrição",
        "a NF-e exige a descrição do produto — corrija o item do pedido",
      );
    }

    if (Object.keys(mudancaNoItem).length > 1) {
      plano.itens.push(mudancaNoItem as PlanoDeCorrecao["itens"][number]);
    }
  }

  // Normalização: o documento vai sem máscara, e a UF em maiúscula.
  if (!vazio(d.documento) && limpo(d.documento) !== documento) {
    mudar("documento", documento, "documento sem máscara, como o leiaute espera", "normalizacao");
  }
  if (!vazio(d.uf) && limpo(d.uf) !== uf) {
    mudar("uf", uf, "UF em maiúscula, como o leiaute espera", "normalizacao");
  }

  return plano;
}

/** Resumo curto para o cabeçalho da tela: "3 campos preenchidos · 2 pendências". */
export function resumirPlano(plano: PlanoDeCorrecao): string {
  const n = plano.mudancas.length;
  const p = plano.pendencias.length;
  if (n === 0 && p === 0) return "Nada a corrigir — o destinatário já está completo.";
  const partes: string[] = [];
  partes.push(
    n === 0
      ? "Nenhum campo preenchido"
      : `${n} ${n === 1 ? "campo preenchido" : "campos preenchidos"}`,
  );
  if (p > 0) partes.push(`${p} ${p === 1 ? "pendência" : "pendências"}`);
  return partes.join(" · ");
}
