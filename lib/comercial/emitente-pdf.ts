/**
 * O EMITENTE DO PDF — quem assina o documento impresso.
 *
 * Reúne, numa chamada só, o que o cabeçalho do pedido precisa: nome + CNPJ +
 * telefone + endereço (migration 0255, gravados em Configurações) e o LOGO
 * da empresa. Servem as duas rotas — a de um pedido e a do lote — para o
 * impresso não sair diferente dependendo de por onde se chegou nele.
 *
 * ## O logo é baixado AQUI, não pelo render
 *
 * `@react-pdf/renderer` aceita `<Image src="https://…">` e faz o download
 * DURANTE o render — lançando se a URL falhar. Um Storage indisponível
 * derrubaria o PDF do pedido inteiro por causa de uma imagem. Então quem
 * busca é este módulo: falhou, virou `logo: null`, e o cabeçalho sai sem
 * imagem com o documento inteiro.
 *
 * ## A marca resolve do banco, nunca de literal
 *
 * `marcaDaSaida()` é a porta certa para saída sem DOM (a mesma que o convite
 * de time e o e-mail de LGPD usam): organização → instalação → `.env` →
 * padrão, com a organização vencendo. Escrever "Deskcomm" ou pegar um hex à
 * mão aqui reprovaria `tests/unit/branding.test.ts` — este documento vai para
 * o cliente do revendedor, e o nome nele é o do negócio dele.
 */
import { marcaDaSaida } from "@/lib/branding/saida";
import { enderecoEmLinha } from "@/lib/contacts/endereco-em-linha";
import { createClient } from "@/lib/supabase/server";

import type { PedidoPdfEmitente, PedidoPdfLogo } from "./pedido-pdf";

type ClienteServidor = Awaited<ReturnType<typeof createClient>>;

/** Teto do download: logo de documento é KB, não MB. Corta lixo na borda. */
const TETO_DO_LOGO = 3_000_000;

const TEMPO_DO_LOGO_MS = 5_000;

export async function emitenteDoPdf(
  supabase: ClienteServidor,
  organizationId: string,
): Promise<PedidoPdfEmitente> {
  const { data } = await supabase
    .from("organizations")
    .select("display_name, legal_name, cnpj, phone, logradouro, numero_end, complemento, bairro, cidade, uf, cep")
    .eq("id", organizationId)
    .maybeSingle();

  const org = (data ?? null) as {
    display_name: string | null;
    legal_name: string | null;
    cnpj: string | null;
    phone: string | null;
    logradouro: string | null;
    numero_end: string | null;
    complemento: string | null;
    bairro: string | null;
    cidade: string | null;
    uf: string | null;
    cep: string | null;
  } | null;

  const endereco = org
    ? enderecoEmLinha({
        logradouro: org.logradouro,
        numero_end: org.numero_end,
        complemento: org.complemento,
        bairro: org.bairro,
        cidade: org.cidade,
        uf: org.uf,
        cep: org.cep,
      })
    : "";

  return {
    nome: org?.legal_name ?? org?.display_name ?? "Empresa",
    documento: org?.cnpj ?? null,
    telefone: org?.phone ?? null,
    endereco: endereco || null,
    logo: await baixarLogo(organizationId),
  };
}

/**
 * Baixa o logo e devolve base64 + formato, ou `null`.
 *
 * NUNCA lança: todo caminho de erro (sem logo, rede fora, status 4xx/5xx,
 * content-type que não é imagem raster, arquivo grande demais) devolve
 * `null`. Só `png` e `jpeg` entram — é o que o bucket `brand-logos` aceita e
 * o que `@react-pdf` renderiza; SVG e o resto ficam de fora porque o
 * renderizador não os desenha e a falha seria no meio do documento.
 */
async function baixarLogo(organizationId: string): Promise<PedidoPdfLogo | null> {
  let url: string | null;
  try {
    url = (await marcaDaSaida(organizationId)).logoUrl;
  } catch {
    return null;
  }
  if (!url || !/^https?:\/\//i.test(url)) return null;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(TEMPO_DO_LOGO_MS) });
    if (!res.ok) return null;
    const tipo = (res.headers.get("content-type") ?? "").split(";")[0]?.trim().toLowerCase();
    const format = tipo === "image/png" ? "png" : tipo === "image/jpeg" ? "jpeg" : null;
    if (!format) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length === 0 || buffer.length > TETO_DO_LOGO) return null;
    return { data: buffer.toString("base64"), format };
  } catch {
    return null;
  }
}
