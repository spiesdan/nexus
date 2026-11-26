/**
 * Clientes duplicados — os tipos da fila de revisão humana (0355).
 *
 * A regra de QUAIS grupos entram e a fusão em si moram no banco
 * (`fn_contatos_duplicados` / `fn_fundir_contatos`), porque é lá que a
 * descoberta de tabelas com `contact_id` não envelhece. Este arquivo é só o
 * contrato entre a API e a tela — nenhum merge acontece aqui.
 *
 * `chave` é estável dentro da organização (`nome_normalizado|cidade_normalizada`)
 * e é o que a tela devolve em "não é a mesma pessoa": o grupo descartado não
 * volta na próxima varredura.
 */

export interface FichaDuplicada {
  id: string;
  nome: string;
  telefone: string | null;
  email: string | null;
  cidade: string | null;
  uf: string | null;
  bairro: string | null;
  cep: string | null;
  pedidos: number;
  conversas: number;
  leads: number;
  ultima_compra: string | null;
  criado_em: string;
  tem_endereco: boolean;
}

export interface GrupoDuplicado {
  chave: string;
  nome: string;
  cidade: string | null;
  uf: string | null;
  total_fichas: number;
  pedidos: number;
  conversas: number;
  leads: number;
  fichas: FichaDuplicada[];
}

export interface DuplicadosMeta {
  total_grupos: number;
  total_fichas: number;
  limite: number;
  truncado: boolean;
}

export interface ResultadoFusao {
  aplicado: boolean;
  motivo?: "ja_mesclado";
  vencedor_id: string;
  contatos_mesclados: number;
  conversas_fundidas?: number;
  repontados: Record<string, number>;
  conflitos: Record<string, string>;
}

/** Soma o que a confirmação promete mover para o vencedor. */
export function totaisParaFundir(
  grupo: GrupoDuplicado,
  vencedorId: string,
): {
  pedidos: number;
  conversas: number;
  leads: number;
  fichas: number;
} {
  const perdedores = grupo.fichas.filter((f) => f.id !== vencedorId);
  return perdedores.reduce(
    (acc, f) => ({
      pedidos: acc.pedidos + f.pedidos,
      conversas: acc.conversas + f.conversas,
      leads: acc.leads + f.leads,
      fichas: acc.fichas + 1,
    }),
    { pedidos: 0, conversas: 0, leads: 0, fichas: 0 },
  );
}
