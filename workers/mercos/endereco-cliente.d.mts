/** Tipos do enriquecimento de endereço da ficha do cliente (JS puro). */

export interface EnderecoDaFicha {
  logradouro: string | null;
  numero_end: string | null;
  complemento: string | null;
  bairro: string | null;
  cep: string | null;
  cidade: string | null;
  uf: string | null;
}

export interface EntradaDeCache {
  lido_em: string;
  endereco: EnderecoDaFicha;
}

export type CacheDeEnderecos = Record<string, EntradaDeCache>;

export declare const DIAS_VALIDADE_CACHE: 30;

export function lerEnderecoDaFicha(linhas: readonly (string | null | undefined)[]): EnderecoDaFicha;
export function temEndereco(endereco: EnderecoDaFicha | null | undefined): boolean;
export function chaveCache(documento: string | null | undefined): string | null;
export function cacheValido(entrada: EntradaDeCache | null | undefined, agoraMs?: number, dias?: number): boolean;
export function carregarCache(caminho: string, agoraMs?: number, dias?: number): CacheDeEnderecos;
export function salvarCache(caminho: string, cache: CacheDeEnderecos): void;
export function selecionarParaEnriquecer(
  documentos: readonly (string | null | undefined)[],
  cache: CacheDeEnderecos,
  limite?: number,
): string[];
