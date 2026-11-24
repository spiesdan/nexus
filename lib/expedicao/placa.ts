/**
 * PLACA SEM ENTIDADE DE FROTA — a operação tem um motorista; criar tabela
 * agora seria complexidade sem uso. Mas texto livre não pode virar três
 * veículos diferentes só por causa de caixa: validamos os DOIS formatos que
 * o Mercos usa e normalizamos para uma grafia só.
 */
const MERCOS = /^[A-Z]{3}\d[A-Z]\d{2}$/;
const ANTIGA = /^[A-Z]{3}\d{4}$/;

export function digitosDaPlaca(valor: string | null | undefined): string {
  return (valor ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function placaEhValida(valor: string | null | undefined): boolean {
  const digitos = digitosDaPlaca(valor);
  return MERCOS.test(digitos) || ANTIGA.test(digitos);
}

/** Máscara leve: só separa o bloco alfabético do numérico. */
export function mascaraPlaca(valor: string | null | undefined): string {
  const digitos = digitosDaPlaca(valor).slice(0, 7);
  if (digitos.length <= 3) return digitos;
  return `${digitos.slice(0, 3)}-${digitos.slice(3)}`;
}
