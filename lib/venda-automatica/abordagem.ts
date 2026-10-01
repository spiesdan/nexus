/**
 * A PRIMEIRA MENSAGEM da Venda Automática (spec 18 §7/§8).
 *
 * Irmã da `gerarAbordagemDeFormulario` (`lib/agent-engine/agent/`), com a
 * mesma forma: system com o MODO (autoridade), user com o CONTEÚDO (dados da
 * empresa), `runModelCall` sem tools — quem envia é o worker, com janela,
 * throttle e opt-out.
 *
 * O que NÃO muda em relação ao resto do produto: nada de preço inventado. O
 * catálogo real (`catalog_products`) entra aqui só com NOMES — preço em
 * primeira mensagem fria é spam, e preço que a IA "lembra" é preço inventado.
 * A fonte de verdade do preço continua sendo o catálogo, consultado quando o
 * cliente pedir.
 */
import { randomUUID } from "node:crypto";

import type pg from "pg";
import type { ModelMessage } from "ai";

import { runModelCall, type LlmEdgeConfig } from "@/lib/agent-engine/edge/llm/run-model-call";

/** O que a campanha manda dizer — tudo vindo do banco, nada de inventar. */
export interface EntradaDaAbordagem {
  tenantId: string;
  /** contact_id do destinatário (o seam usa `leadId` para contato). */
  contactId: string;
  empresa: {
    nome: string;
    categoria: string;
    cidade: string;
    /** Perfil de abordagem da campanha ("Restaurante", "Hotel"…). */
    perfil: string | null;
  };
  /** NOMES dos produtos do catálogo real escolhidos na campanha. */
  produtos: string[];
  /** Nome da organização que fala (a marca resolvida vem do banco). */
  remetente: string;
}

/**
 * O system — a moldura da situação E as regras de fronteira, junto. Aqui não
 * há dados públicos de empresa no system: tudo que vem do Radar é CONTEÚDO e
 * vai no user, dentro do bloco com nonce (mesma defesa da irmã).
 */
export function systemDaAbordagem(): string {
  return (
    "[MODO ABORDAGEM - VENDA AUTOMATICA]\n" +
    "Voce escreve a PRIMEIRA mensagem de WhatsApp de uma prospecao comercial. " +
    "Ninguem trocou mensagem ainda; a pessoa nao esta esperando por voce neste segundo.\n\n" +
    "Regras:\n" +
    "- Cumprimente e diga em uma frase por que voce esta falando com ela.\n" +
    "- Use a empresa, a categoria e a cidade para personalizar — quem recebe percebe quando a mensagem serviria para qualquer um.\n" +
    "- Fale dos produtos relevantes do SEU catalogo pelo nome, de forma natural (um ou dois no maximo).\n" +
    "- NAO invente preco, promocao, prazo, estoque, entrega ou desconto. Se pedirem preco, diga que envia as opcoes — quem sabe o preco e o time comercial.\n" +
    "- NAO invente informacao sobre a empresa que os dados nao tragam.\n" +
    "- Curta: no maximo 4 frases. E WhatsApp, nao e-mail.\n" +
    "- Termine com UMA pergunta aberta.\n" +
    "- Responda SO com o texto da mensagem — sem aspas, sem assinatura, sem comentarios."
  );
}

/** O user — CONTEÚDO puro, entre aspas com nonce (campo do Radar é público). */
export function conteudoDaAbordagem(entrada: EntradaDaAbordagem, nonce: string): string {
  const produtos =
    entrada.produtos.length > 0
      ? entrada.produtos.map((p) => `- ${p}`).join("\n")
      : "(o catalogo da campanha nao trouxe produtos)";
  return (
    `<dados id="${nonce}">\n` +
    `Empresa que fala: ${entrada.remetente}\n` +
    `Empresa prospectada: ${entrada.empresa.nome}\n` +
    `Categoria: ${entrada.empresa.categoria}\n` +
    `Cidade: ${entrada.empresa.cidade}\n` +
    `Perfil comercial: ${entrada.empresa.perfil ?? entrada.empresa.categoria}\n` +
    `Produtos do catalogo (nomes reais, sem preco):\n${produtos}\n` +
    `</dados id="${nonce}">`
  );
}

export type ResultadoDaAbordagem = { ok: true; texto: string } | { ok: false; reason: string };

export async function gerarAbordagem(
  db: pg.Pool,
  llmCfg: LlmEdgeConfig,
  entrada: EntradaDaAbordagem,
): Promise<ResultadoDaAbordagem> {
  // Nonce por chamada: o nome da empresa vem do Radar (dado público), e não
  // pode fechar o delimitador para se tornar instrução.
  const nonce = randomUUID().slice(0, 8);
  const messages: ModelMessage[] = [
    { role: "user", content: conteudoDaAbordagem(entrada, nonce) },
  ];

  try {
    const { result } = await runModelCall(db, llmCfg, {
      tenantId: entrada.tenantId,
      leadId: entrada.contactId,
      jobId: null,
      purpose: 'automatic_sales_message',
      system: systemDaAbordagem(),
      messages,
      // SEM model e SEM llmOverride: o ponto resolve pelo painel de provedores
      // (`ai_purpose_bindings`) ou pelo padrão da org — mesma precedência de
      // qualquer ponto configurável.
    });
    const texto = (result.text ?? "").trim();
    if (!texto) return { ok: false, reason: "texto_vazio" };
    return { ok: true, texto };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }
}
