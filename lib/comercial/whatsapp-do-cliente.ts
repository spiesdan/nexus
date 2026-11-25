/**
 * WHATSAPP PARA O TELEFONE DO CLIENTE — e não para "escolha um contato".
 *
 * Medido em 25/11/2026: o item "Enviar por WhatsApp" da ficha abria
 * `wa.me/?text=…` mesmo com o telefone do cliente no cadastro. O WhatsApp
 * pedia para escolher alguém — trabalho manual que o sistema já podia evitar.
 *
 * O número vai em DÍGITOS com DDI (é o que o `wa.me` aceita). Sem telefone,
 * devolve o link sem destino e `direto: false`: a tela avisa em vez de fingir.
 */
export function linkWhatsAppDoCliente(
  fone: string | null | undefined,
  texto: string,
): { href: string; direto: boolean; digitos: string } {
  const digitos = (fone ?? "").replace(/\D/g, "");
  const mensagem = encodeURIComponent(texto);
  if (digitos.length >= 10) {
    return { href: `https://wa.me/${digitos}?text=${mensagem}`, direto: true, digitos };
  }
  return { href: `https://wa.me/?text=${mensagem}`, direto: false, digitos: "" };
}
