/**
 * AS CIDADES QUE EXISTEM NA ORGANIZAÇÃO — canônicas, pelo município do IBGE.
 *
 * ─── O DEFEITO QUE ISSO CONSERTA ───────────────────────────────────────────
 *
 * `contacts.cidade` é texto livre e o seletor listava o valor cru. Numa
 * instalação real isso virou **162 opções** para uma carteira com muito menos
 * municípios: `CANOINHAS`, `Canoinhas` e `canoinhas` eram três entradas, e
 * `AGROCOMERCIAL SCHULTZ LTDA ME` — nome de empresa digitado no campo errado —
 * aparecia como cidade.
 *
 * O produto já tem a tabela oficial (`lib/fiscal/municipio-ibge.ts`, 5.571
 * municípios, usada para o `cMun` da NF-e). Aqui ela vira o filtro:
 *
 *   1. cada valor cru é resolvido por `municipioIbge(cidade, uf)`;
 *   2. o que resolve é agrupado pelo **nome oficial + UF** (com acento do
 *      IBGE: "Canoinhas/SC"), e todas as grafias vistas entram em `variantes`;
 *   3. o que NÃO resolve (empresa, bairro, erro de digitação) não vira opção;
 *   4. `sem_municipio` conta os contatos que ficaram de fora (cidade vazia ou
 *      não-município), para o dado ruim não sumir sem número.
 *
 * ─── Por que devolver as VARIANTES ─────────────────────────────────────────
 *
 * Não há migration nesta fatia e `ILIKE` não resolve acento (`União da Vitória`
 * × `UNIAO DA VITORIA`). O seletor manda as variantes da cidade escolhida e a
 * consulta usa `IN (...)`, casando todas as grafias SEM tocar no schema. A
 * lista de variantes vem do banco (por isso é confiável) e o filtro só alcança
 * linhas da própria organização (o `organization_id` continua explícito).
 *
 * ─── Ordem ─────────────────────────────────────────────────────────────────
 *
 * Alfabética pt-BR sobre o rótulo `Nome/UF`, com `Intl.Collator` sensível a
 * acento na posição certa ("Água" antes de "Ave") — a mesma régua da lista.
 */

import { municipioIbge } from "@/lib/fiscal/municipio-ibge";

export interface LinhaComCidade {
  cidade?: string | null;
  uf?: string | null;
}

export interface CidadeCanonica {
  /** Nome oficial do IBGE, com acento ("Canoinhas"). */
  nome: string;
  uf: string;
  /** O que a tela mostra: "Canoinhas/SC". */
  rotulo: string;
  /**
   * Grafias cruas do banco que resolvem para este município, sem repetição.
   * O filtro usa `IN (variantes)` — é o que faz `UNIAO DA VITORIA` casar com
   * `União da Vitória` sem `unaccent` e sem migration.
   */
  variantes: string[];
}

export interface CidadesDaOrganizacao {
  cidades: CidadeCanonica[];
  /** Contatos cujo `cidade` está vazio OU não é município do IBGE. */
  sem_municipio: number;
}

export function cidadesCanonicas(linhas: LinhaComCidade[]): CidadesDaOrganizacao {
  const porMunicipio = new Map<
    string,
    { nome: string; uf: string; variantes: Set<string> }
  >();
  let semMunicipio = 0;

  for (const linha of linhas) {
    const bruto = typeof linha.cidade === "string" ? linha.cidade.trim().replace(/\s+/g, " ") : "";
    if (!bruto) {
      semMunicipio += 1;
      continue;
    }

    const municipio = municipioIbge(bruto, linha.uf ?? null);
    if (!municipio) {
      // Nome de empresa, bairro, bairro com número, erro de digitação: não é
      // cidade. Conta em `sem_municipio` e NÃO entra no seletor.
      semMunicipio += 1;
      continue;
    }

    const chave = `${municipio.nome}/${municipio.uf}`;
    const atual = porMunicipio.get(chave) ?? {
      nome: municipio.nome,
      uf: municipio.uf,
      variantes: new Set<string>(),
    };
    atual.variantes.add(bruto);
    porMunicipio.set(chave, atual);
  }

  const collator = new Intl.Collator("pt-BR", { sensitivity: "base" });
  const cidades = [...porMunicipio.values()]
    .map<CidadeCanonica>((m) => ({
      nome: m.nome,
      uf: m.uf,
      rotulo: `${m.nome}/${m.uf}`,
      variantes: [...m.variantes].sort((a, b) => collator.compare(a, b) || a.localeCompare(b)),
    }))
    .sort((a, b) => collator.compare(a.rotulo, b.rotulo) || a.rotulo.localeCompare(b.rotulo));

  return { cidades, sem_municipio: semMunicipio };
}
