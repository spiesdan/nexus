/**
 * POST /api/v1/commercial-orders/importar-ia — o "Adicionar com IA" do pedido.
 *
 * Recebe UMA imagem, PDF, áudio, CSV/TXT ou texto colado; devolve a lista de
 * produtos que o modelo conseguiu ler, já casada com o catálogo da organização.
 *
 * ─── Por que a rota NÃO cria o pedido ───────────────────────────────────────
 *
 * O Mercos, no caminho feliz, chama `adicionar_itens_por_ia` e fecha o modal.
 * Aqui a rota devolve uma PROPOSTA e o editor só acrescenta depois do clique em
 * "Adicionar ao pedido". O motivo não é excesso de zelo: OCR de manuscrito erra
 * nome e quantidade, e um item errado num pedido é dinheiro e estoque errados.
 * A conferência é uma tela, não um toast.
 *
 * ─── Por que o catálogo não vai para o modelo ──────────────────────────────
 *
 * O modelo recebe só o conteúdo do pedido. O casamento nome→produto acontece
 * no servidor com `buscarComRelaxamento`, a MESMA busca do agente. Assim o
 * custo não cresce com o catálogo e um empate vira candidato para conferência,
 * não um chute do modelo.
 */
import { randomUUID } from "node:crypto";

import { generateObject, type ModelMessage } from "ai";
import { type NextRequest } from "next/server";

import { normalizarErro } from "@/lib/agent-engine/edge/llm/run-model-call";
import { DEFAULT_BOT_MODEL } from "@/lib/ai/gateway";
import { resolverModeloDoPonto } from "@/lib/ai/gateway-binding";
import { checkRateLimit } from "@/lib/ai/dispatcher/rate-limit";
import { computeCostCents } from "@/lib/ai/runtime/cost";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import {
  casarItensComCatalogo,
  extracaoParaOModelo,
  extracaoParaOModeloFechado,
  LIMITE_DE_ITENS,
  PROMPT_DE_EXTRACAO,
  type Extracao,
} from "@/lib/comercial/importar-ia";
import { detectarTipoImagem, mimeDaImagem } from "@/lib/comercial/imagem";
import { lerComOcr, ocrConfigurado } from "@/lib/comercial/ocr";
import { lerPedidoComOcr } from "@/lib/comercial/pedido-ocr";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { apiTranscriptionProvider } from "@/lib/messaging/media/transcription";
import { COLUNAS_DO_PRODUTO, type Produto } from "@/lib/schemas/produtos";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { providerDoModelo } from "@/lib/ai/log-invocation";

export const dynamic = "force-dynamic";
/** O modelo lê imagem/PDF; no self-host não há limite de função, mas o Vercel usa isto. */
export const maxDuration = 120;

const MAX_BYTES = 20 * 1024 * 1024;
const MAX_TEXTO = 20_000;
const MAX_PRODUTOS = 2_000;

type Conteudo =
  | { tipo: "texto"; texto: string }
  | { tipo: "arquivo"; bytes: Buffer; mediaType: string; nome: string };

async function lerConteudoDaRequisicao(
  form: FormData,
): Promise<{ conteudo: Conteudo } | { erro: string }> {
  const arquivo = form.get("arquivo");
  const texto = String(form.get("texto") ?? "").trim();

  if (arquivo instanceof File) {
    if (arquivo.size <= 0) return { erro: "O arquivo está vazio." };
    if (arquivo.size > MAX_BYTES) {
      return { erro: "O arquivo passa de 20 MB. Reduza a imagem ou o PDF e tente de novo." };
    }

    const bytes = Buffer.from(await arquivo.arrayBuffer());
    const mime = (arquivo.type || "").split(";")[0]!.trim().toLowerCase();
    const nome = arquivo.name || "arquivo";

    // Imagem: o tipo sai dos BYTES, não do header que quem sobe declarou.
    // É a mesma função do comprovante de entrega e da foto do produto.
    const imagem = detectarTipoImagem(bytes);
    if (imagem !== null) {
      return { conteudo: { tipo: "arquivo", bytes, mediaType: mimeDaImagem(imagem), nome } };
    }

    const ehPdf =
      mime === "application/pdf" || bytes.subarray(0, 5).toString("latin1") === "%PDF-";
    if (ehPdf) {
      return { conteudo: { tipo: "arquivo", bytes, mediaType: "application/pdf", nome } };
    }

    if (mime.startsWith("audio/")) {
      if (!env.OPENAI_API_KEY) {
        return {
          erro:
            "Para enviar áudio, configure OPENAI_API_KEY. Foto, PDF e texto funcionam sem ela.",
        };
      }
      try {
        const transcricao = await apiTranscriptionProvider({
          apiKey: env.OPENAI_API_KEY,
        }).transcribe(bytes, mime);
        if (transcricao.trim() === "") {
          return { erro: "Não consegui entender o áudio. Tente gravar de novo ou cole o texto." };
        }
        return { conteudo: { tipo: "texto", texto: transcricao.trim() } };
      } catch {
        return { erro: "Não consegui transcrever o áudio agora. Tente de novo em instantes." };
      }
    }

    // Planilha em CSV/TXT entra como texto. XLSX/DOCX exigiria uma biblioteca
    // que o repositório não tem (e a doutrina evita dependência só para um
    // formato); a mensagem diz o que fazer em vez de aceitar e falhar depois.
    const ehTexto =
      mime.startsWith("text/") || /\.(csv|txt|tsv)$/i.test(nome);
    if (ehTexto) {
      const decodificado = bytes.toString("utf8").trim();
      if (decodificado === "") return { erro: "O arquivo de texto está vazio." };
      return { conteudo: { tipo: "texto", texto: decodificado } };
    }

    return {
      erro:
        "Formato não suportado. Envie foto (JPG, PNG ou WebP), PDF, áudio ou um arquivo CSV/TXT.",
    };
  }

  if (texto === "") {
    return { erro: "Envie uma foto, um PDF, um áudio ou cole o texto do pedido." };
  }
  if (texto.length > MAX_TEXTO) {
    return { erro: `O texto passa de ${MAX_TEXTO.toLocaleString("pt-BR")} caracteres.` };
  }
  return { conteudo: { tipo: "texto", texto } };
}

function mensagensDoPedido(conteudo: Conteudo): ModelMessage[] {
  if (conteudo.tipo === "texto") {
    return [
      {
        role: "user",
        content: `${PROMPT_DE_EXTRACAO}\n\n<pedido>\n${conteudo.texto}\n</pedido>`,
      },
    ];
  }

  return [
    {
      role: "user",
      content: [
        { type: "text", text: PROMPT_DE_EXTRACAO },
        { type: "file", data: conteudo.bytes, mediaType: conteudo.mediaType },
      ],
    },
  ];
}

/**
 * Telemetria em `llm_calls` — a tabela única desde a 0130.
 *
 * Fire-and-forget, como o resto do repo: uma falha de log não pode transformar
 * uma leitura que deu certo em erro para o vendedor.
 */
function registrarUso(args: {
  organizationId: string;
  modelId: string;
  origem: "binding" | "padrao";
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
}): void {
  void (async () => {
    try {
      const provider = providerDoModelo(args.modelId);
      const cost = await computeCostCents({
        provider,
        model: args.modelId,
        inputTokens: args.inputTokens,
        outputTokens: args.outputTokens,
      });
      const admin = createAdminClient();
      const { error } = await admin.from("llm_calls").insert({
        organization_id: args.organizationId,
        purpose: "pedido_por_ia",
        provider,
        model: args.modelId,
        input_tokens: args.inputTokens,
        output_tokens: args.outputTokens,
        cost_cents: cost,
        latency_ms: args.latencyMs,
        status: "ok",
        origem_da_escolha: args.origem,
      });
      if (error) {
        logger.warn("[importar-ia] falha ao registrar llm_calls", {
          organization_id: args.organizationId,
          motivo: error.message,
        });
      }
    } catch (err) {
      logger.warn("[importar-ia] falha ao registrar llm_calls", {
        organization_id: args.organizationId,
        motivo: err instanceof Error ? err.message : String(err),
      });
    }
  })();
}

export async function POST(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", {
    requestId,
    resource: "commercial_orders",
  });
  if (!authz.ok) return authz.response;

  const limite = await checkRateLimit(`pedido-ia:${authz.org.orgId}`, 10, 60);
  if (!limite.allowed) {
    return fail(
      "rate_limited",
      "Muitas leituras de pedido em pouco tempo. Espere um minuto e tente de novo.",
      429,
      { requestId, headers: { "Retry-After": "60" } },
    );
  }

  // O multipart é lido inteiro pelo `formData()`. Recusar pelo header evita
  // bufferizar um upload gigante só para descobrir que ele passa de 20 MB.
  const tamanhoDeclarado = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(tamanhoDeclarado) && tamanhoDeclarado > MAX_BYTES + 1_000_000) {
    return fail(
      "payload_too_large",
      "O envio passa de 20 MB. Reduza a imagem, o PDF ou o áudio e tente de novo.",
      413,
      { requestId },
    );
  }

  const form = await req.formData().catch(() => null);
  if (!form) {
    return fail("validation_failed", "Envie o pedido como formulário (arquivo ou texto).", 422, {
      requestId,
    });
  }

  const lido = await lerConteudoDaRequisicao(form);
  if ("erro" in lido) {
    return fail("validation_failed", lido.erro, 422, { requestId });
  }

  // Catálogo ANTES do modelo: se a organização ainda não cadastrou produto,
  // não faz sentido gastar uma chamada para devolver "não achei".
  const supabase = await createClient();
  const { data: produtos, error: erroCatalogo } = await supabase
    .from("catalog_products")
    .select(COLUNAS_DO_PRODUTO)
    .eq("organization_id", authz.org.orgId)
    .eq("ativo", true)
    .order("nome")
    .limit(MAX_PRODUTOS);

  if (erroCatalogo) {
    logger.error("[importar-ia] falha ao ler catálogo", {
      organization_id: authz.org.orgId,
      motivo: erroCatalogo.message,
    });
    return fail("internal_error", "Não consegui ler o catálogo agora.", 500, { requestId });
  }
  if (!produtos || produtos.length === 0) {
    return fail(
      "catalogo_vazio",
      "O catálogo ainda não tem produtos. Cadastre um produto antes de usar a IA.",
      422,
      { requestId },
    );
  }

  // ─── 1) OCR local primeiro: é grátis e não depende de provedor de IA ──────
  //
  // A ordem não é detalhe. Com a cota do Google esgotada, a IA responde 503;
  // o OCR no mesmo instante lê a foto e devolve a proposta. E cada foto lida
  // aqui é uma chamada de modelo que não sai da conta de quem instalou.
  //
  // O OCR só vale para IMAGEM. PDF, áudio e texto seguem para a IA: o serviço
  // não converte PDF (e o modelo lê PDF nativamente), e áudio já é transcrito
  // antes de chegar aqui.
  if (
    ocrConfigurado() &&
    lido.conteudo.tipo === "arquivo" &&
    lido.conteudo.mediaType.startsWith("image/")
  ) {
    const leitura = await lerComOcr(lido.conteudo.bytes, lido.conteudo.mediaType);
    if (leitura !== null) {
      const porOcr = lerPedidoComOcr(leitura, produtos as unknown as Produto[]);
      if (porOcr !== null) {
        logger.info("[importar-ia] pedido lido pelo OCR", {
          organization_id: authz.org.orgId,
          linhas: porOcr.linhas_lidas,
          itens: porOcr.total_extraido,
          confianca_media: porOcr.confianca_media,
          motor: leitura.motor ?? "ocr",
        });
        return ok(
          {
            itens: porOcr.itens,
            total_extraido: porOcr.total_extraido,
            origem: "ocr",
            leitura: {
              motor: leitura.motor ?? "ocr",
              confianca_media: porOcr.confianca_media,
            },
          },
          { requestId },
        );
      }
      // O OCR rodou mas não passou no portão (poucos itens reconhecidos,
      // confiança baixa). O log diz que houve tentativa — sem ele, "por que
      // esta foto gastou IA?" vira adivinhação.
      logger.info("[importar-ia] OCR não passou na conferência — usando a IA", {
        organization_id: authz.org.orgId,
        linhas: leitura.linhas.length,
      });
    }
  }

  const resolvido = await resolverModeloDoPonto(
    "pedido_por_ia",
    authz.org.orgId,
    DEFAULT_BOT_MODEL,
  );
  if (!resolvido) {
    return fail(
      "ai_indisponivel",
      "A IA está desligada — cadastre a chave em IA → Credenciais.",
      503,
      { requestId },
    );
  }

  const inicio = Date.now();
  let extracao: Extracao;
  let uso: { inputTokens?: number; outputTokens?: number };
  try {
    const resultado = await generateObject({
      model: resolvido.model,
      // O Google recusa o schema Zod completo (400 antes de ler a imagem);
      // OpenAI em modo estrito exige `additionalProperties: false`. O porquê
      // está em `ESQUEMA_DE_EXTRACAO_PARA_O_MODELO`.
      schema:
        providerDoModelo(resolvido.modelId) === "google"
          ? extracaoParaOModelo
          : extracaoParaOModeloFechado,
      messages: mensagensDoPedido(lido.conteudo),
      temperature: 0,
      // Sem teto explícito o AI SDK pede o máximo do modelo — 65.536 tokens
      // para o Claude. A OpenRouter pré-autoriza esse teto ANTES de chamar o
      // modelo: numa conta com pouco saldo a leitura de uma foto de papel
      // falhava com "request requires more credits" sem o modelo ter lido
      // nada. O schema tem no máximo 100 itens (nome + quantidade), então
      // 8.192 tokens cobrem a resposta inteira com folga e o teto deixa de
      // ser a primeira coisa que consome o saldo de quem instalou.
      maxOutputTokens: 8_192,
      abortSignal: AbortSignal.timeout(90_000),
    });
    extracao = resultado.object;
    uso = resultado.usage;
  } catch (err) {
    // A régua é a MESMA do motor (`normalizarErro`), e não um balde local.
    // Sem isso, "a conta da OpenRouter está sem saldo" virava "tente uma foto
    // mais nítida" — a pessoa fotografa o papel de novo, de novo, enquanto o
    // conserto é pagar. O caso foi medido nesta instalação em 2026-10-24.
    const diagnostico = normalizarErro(err);
    logger.warn("[importar-ia] falha na leitura do pedido", {
      organization_id: authz.org.orgId,
      model_id: resolvido.modelId,
      origem: resolvido.origem,
      error_code: diagnostico.error_code,
      http_status: diagnostico.http_status,
      motivo: diagnostico.error_message,
    });

    if (diagnostico.error_code === "limite_ou_saldo") {
      return fail(
        "ai_provider_error",
        "A IA está sem saldo no provedor. Adicione créditos na conta do provedor ou configure outra chave em IA → Credenciais.",
        503,
        { requestId },
      );
    }
    if (diagnostico.error_code === "credencial_recusada") {
      return fail(
        "ai_provider_error",
        "A chave da IA foi recusada. Confira a credencial em IA → Credenciais.",
        503,
        { requestId },
      );
    }
    if (diagnostico.error_code === "modelo_inexistente") {
      return fail(
        "ai_provider_error",
        "O modelo configurado para ler pedidos não está disponível. Escolha outro em IA → Pontos de IA.",
        503,
        { requestId },
      );
    }
    if (diagnostico.error_code === "provedor_indisponivel") {
      return fail(
        "ai_provider_error",
        "O provedor de IA não respondeu agora. Tente de novo em instantes.",
        503,
        { requestId },
      );
    }

    return fail(
      "leitura_do_pedido_falhou",
      "Não consegui ler este pedido. Tente uma foto mais nítida ou cole os itens em texto.",
      422,
      { requestId },
    );
  }

  const itens = extracao.itens
    .map((item) => ({ ...item, nome: item.nome.trim() }))
    .filter((item) => item.nome.length > 0)
    .slice(0, LIMITE_DE_ITENS);

  if (itens.length === 0) {
    return fail(
      "pedido_sem_produtos",
      "Não encontrei produtos neste pedido. Tente enquadrar melhor a foto ou colar os itens em texto.",
      422,
      { requestId },
    );
  }

  const casados = casarItensComCatalogo(itens, (produtos ?? []) as unknown as Produto[]);

  registrarUso({
    organizationId: authz.org.orgId,
    modelId: resolvido.modelId,
    origem: resolvido.origem,
    inputTokens: uso.inputTokens ?? 0,
    outputTokens: uso.outputTokens ?? 0,
    latencyMs: Date.now() - inicio,
  });

  return ok(
    {
      itens: casados,
      total_extraido: itens.length,
      origem: "ia",
      modelo: { id: resolvido.modelId, origem: resolvido.origem },
    },
    { requestId },
  );
}
