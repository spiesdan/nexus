/**
 * MCP read tools sobre /api/v1/contacts (Spec 11 §3.1).
 *
 * Wrappa os handlers REST extraidos na wave 2 (S-13.02). O MCP server core
 * injeta `ctx.supabase` (admin client + service-role) e `ctx.organizationId`
 * — handlers ja aplicam `.eq('organization_id', ctx.organization_id)` em
 * defesa-em-profundidade pos wave 3 (RLS continua valida quando ctx vem
 * de cookie).
 */
import { z } from "zod";

import {
  listContactsHandler,
  getContactHandler,
} from "@/app/api/v1/contacts/_handler";
import type { McpToolDefinition } from "../types";
import { CAMPOS_PROPONIVEIS, proporDadoDoContato } from "@/lib/contacts/proposta-de-dado";
import { hashCpf } from "@/lib/contacts/cpf";
import { audit } from "@/lib/audit";

const searchInputShape = {
  query: z.string().min(1).max(200).describe("Termo de busca (nome, email ou telefone)."),
  limit: z.number().int().min(1).max(50).default(10),
  cursor: z.string().optional(),
};

export const crmSearchContacts: McpToolDefinition<typeof searchInputShape> = {
  name: "crm_search_contacts",
  description:
    "Busca contatos do CRM por nome, email ou telefone. Retorna ate 50 matches com id, nome, telefone, email, tags e timestamps. Sempre escopado a organization do token.",
  inputSchema: searchInputShape,
  category: "read",
  requiresRole: "agent",
  requiresScope: "mcp:read",
  handler: async (input, ctx) => {
    const result = await listContactsHandler(
      ctx.supabase,
      {
        organization_id: ctx.organizationId,
        actor: ctx.actor,
        requestId: ctx.requestId,
      },
      {
        search: input.query,
        limit: input.limit,
        cursor: input.cursor,
      },
    );
    return {
      contacts: result.contacts.map((c) => ({
        id: c.id,
        name: c.display_name ?? c.name,
        phone: c.phone_number,
        email: c.email,
        tags: c.tags ?? [],
        is_blocked: c.is_blocked,
        is_anonymized: c.is_anonymized,
        created_at: c.created_at,
        last_activity_at: c.last_activity_at,
      })),
      cursor: result.cursor,
      has_more: result.has_more,
    };
  },
};

const getInputShape = {
  contact_id: z.string().uuid().describe("UUID do contato."),
};

export const crmGetContact: McpToolDefinition<typeof getInputShape> = {
  name: "crm_get_contact",
  description:
    "Retorna detalhes de um contato pelo UUID. Inclui tags, consent, source. CPF nunca retornado em plaintext via MCP (sempre mascarado).",
  inputSchema: getInputShape,
  category: "read",
  requiresRole: "agent",
  requiresScope: "mcp:read",
  handler: async (input, ctx) => {
    const contact = await getContactHandler(
      ctx.supabase,
      {
        organization_id: ctx.organizationId,
        actor: ctx.actor,
        requestId: ctx.requestId,
      },
      { contactId: input.contact_id, decryptPurpose: null },
    );
    return {
      id: contact.id,
      name: contact.name,
      display_name: contact.display_name,
      email: contact.email,
      phone: contact.phone_number,
      tags: contact.tags ?? [],
      source: contact.source,
      consent: contact.consent ?? {},
      is_blocked: contact.is_blocked,
      is_anonymized: contact.is_anonymized,
      cpf_available: contact.cpf_available,
      created_at: contact.created_at,
      last_activity_at: contact.last_activity_at,
    };
  },
};

// ---------------------------------------------------------------------------
// crm_propose_contact_field — o dado que o cliente disse, PROPOSTO
// ---------------------------------------------------------------------------

const propostaShape = {
  contact_id: z.string().uuid(),
  campo: z
    .enum(CAMPOS_PROPONIVEIS)
    .describe("Qual informação: email, name, phone_number, cpf ou cnpj."),
  valor: z.string().min(1).max(200).describe("O valor exatamente como a pessoa informou."),
  trecho: z
    .string()
    .max(500)
    .optional()
    .describe("O que a pessoa escreveu, para quem for confirmar poder conferir."),
};

/**
 * ⚠️ Esta ferramenta NÃO grava o dado. Ela cria uma proposta que uma pessoa
 * confirma — e o `description` diz isso ao modelo em primeiro lugar, de
 * propósito: um modelo que acredite ter gravado responderia "pronto, já
 * atualizei seu cadastro" ao cliente, prometendo o que não aconteceu.
 *
 * Ela é de CATÁLOGO, e não nativa do Operador, porque o Operador não monta
 * ToolSet nativo nenhum (zero ocorrências de `tool(` em operator-turn.ts) e só
 * chama o modelo quando há MCP. Uma nativa não apareceria na tela que liga
 * capacidades, não entraria no audit `mcp.tool_called` e sumiria da telemetria
 * de uso — nasceria invisível ao invariante 3 do sistema vivo.
 */
export const crmProposeContactField: McpToolDefinition<typeof propostaShape> = {
  name: "crm_propose_contact_field",
  description:
    "Registra uma informação que o cliente forneceu (email, nome, telefone, CPF ou CNPJ) como " +
    "PROPOSTA para uma pessoa confirmar. NADA é gravado no cadastro por conta desta chamada, e a " +
    "proposta vence sozinha se ninguém decidir. Nunca diga ao cliente que o cadastro foi atualizado. " +
    "Recusa se já houver proposta do mesmo campo aguardando decisão, se o valor for igual ao que já " +
    "está gravado, ou se o contato foi anonimizado. Antes de propor CPF/CNPJ novo, consulte " +
    "`crm_find_contact_by_document` — se o documento já tem cadastro, não proponha nada.",
  inputSchema: propostaShape,
  category: "write",
  requiresRole: "agent",
  requiresScope: "mcp:write",
  handler: async (input, ctx) => {
    const r = await proporDadoDoContato(ctx.supabase, {
      organizationId: ctx.organizationId,
      contactId: input.contact_id,
      campo: input.campo,
      valor: input.valor,
      trecho: input.trecho ?? null,
    });

    if (!r.criada) {
      // As mensagens são para o MODELO decidir o que fazer em seguida — e
      // nenhuma delas é para repetir ao cliente. Falam do fluxo interno, não do
      // atendimento.
      const explicacao: Record<string, string> = {
        contato_nao_encontrado: "não encontrei esse contato nesta conta.",
        contato_anonimizado:
          "esse contato exerceu o direito de exclusão de dados; não é possível registrar informações dele.",
        valor_invalido:
          "o valor não tem forma de email/telefone/nome/documento válido — confirme com a pessoa.",
        valor_igual_ao_atual: "essa informação já está no cadastro; não há o que confirmar.",
        ja_existe_proposta:
          "já existe uma proposta desse mesmo campo aguardando decisão de uma pessoa — não crie outra.",
        erro: "não consegui registrar a proposta agora.",
      };
      return { proposta_criada: false, motivo: r.motivo, mensagem: explicacao[r.motivo] };
    }

    // Mesmo payload de ator das outras tools de escrita. Inline porque
    // `retencao.ts` mantém o dele local — extrair para um módulo comum tocaria
    // um arquivo alheio sem que este trabalho peça isso.
    const a =
      ctx.actor.type === "user"
        ? { actorUserId: ctx.actor.id as string | null, metadataActor: { actor_type: "user" } }
        : { actorUserId: null, metadataActor: { actor_type: ctx.actor.type, actor_id: ctx.actor.id } };
    await audit({
      action: "contact.field_proposed",
      actorUserId: a.actorUserId,
      organizationId: ctx.organizationId,
      resourceType: "contact",
      resourceId: input.contact_id,
      requestId: ctx.requestId,
      // O par antes/depois desde a PROPOSTA, mesma grafia de `team.role_changed`.
      // A proposta é uma intenção auditável mesmo que nunca vire escrita.
      metadata: {
        ...a.metadataActor,
        proposal_id: r.id,
        campo: input.campo,
        old_value: r.valorAnterior,
        new_value: input.valor,
      },
    });

    return {
      proposta_criada: true,
      proposta_id: r.id,
      campo: input.campo,
      aguardando: "confirmação de uma pessoa",
    };
  },
};

// ---------------------------------------------------------------------------
// crm_find_contact_by_document — a consulta de duplicidade do cadastro fiscal
// ---------------------------------------------------------------------------

const documentoShape = {
  documento: z
    .string()
    .min(1)
    .max(30)
    .describe("CPF ou CNPJ que a pessoa informou, com ou sem máscara."),
};

/**
 * A pergunta é "já tem cadastro com este documento?", e a resposta é só SIM/NÃO
 * + a ficha mínima — o documento em si NUNCA volta na resposta (e o arg já sai
 * redigido do audit por `ARGS_REDACT_KEYS`). Daí a tool ser read e não propor
 * nada: quem ouve o CPF na conversa consulta aqui e só então decide propor.
 */
export const crmFindContactByDocument: McpToolDefinition<typeof documentoShape> = {
  name: "crm_find_contact_by_document",
  description:
    "Procura um cliente pelo CPF ou CNPJ digitado na conversa. Devolve o cadastro existente " +
    "(id, nome, telefone) quando o documento já está registrado nesta conta, ou nenhum resultado " +
    "quando ainda não existe cadastro com esse documento. Use ANTES de propor o dado novo: se já " +
    "houver cadastro, vincule o pedido a ele em vez de criar proposta. O documento nunca é " +
    "devolvido na resposta — só se existe ou não.",
  inputSchema: documentoShape,
  category: "read",
  requiresRole: "agent",
  requiresScope: "mcp:read",
  handler: async (input, ctx) => {
    const digitos = input.documento.replace(/\D/g, "");
    const ehCpf = digitos.length === 11;
    const ehCnpj = digitos.length === 14;
    if (!ehCpf && !ehCnpj) {
      return {
        encontrado: false,
        motivo: "documento_invalido",
        mensagem:
          "o documento precisa ter 11 dígitos (CPF) ou 14 (CNPJ) — confira os números com a pessoa.",
      };
    }

    // Fonte igual à da ficha: CPF casa por `cpf_hash` (sha256 dos dígitos, o
    // mesmo que o patch grava), CNPJ por `cnpj` em claro (dado público, com
    // índice único por org).
    const coluna = ehCpf ? "cpf_hash" : "cnpj";
    const valorBusca = ehCpf ? hashCpf(digitos) : digitos;

    const { data, error } = await ctx.supabase
      .from("contacts")
      .select("id, name, display_name, phone_number, tipo_pessoa, is_anonymized")
      .eq("organization_id", ctx.organizationId)
      .eq(coluna, valorBusca)
      .maybeSingle();

    if (error) throw new Error(`busca_por_documento_falhou: ${error.message}`);
    if (!data) return { encontrado: false, motivo: "sem_cadastro" };

    const linha = data as {
      id: string;
      name: string | null;
      display_name: string | null;
      phone_number: string | null;
      tipo_pessoa: string | null;
      is_anonymized: boolean;
    };
    // Anonimizado conta como "sem cadastro" para este fluxo: a proposta que
    // viria logo depois é barrada pelo guard de L-04 de qualquer jeito, e dizer
    // "já existe" convidaria o modelo a vincular pedido a uma ficha intocável.
    if (linha.is_anonymized) return { encontrado: false, motivo: "sem_cadastro" };

    return {
      encontrado: true,
      contact: {
        id: linha.id,
        name: linha.display_name ?? linha.name,
        phone: linha.phone_number,
        tipo_pessoa: linha.tipo_pessoa,
      },
      mensagem:
        "este documento já tem cadastro nesta conta — vincule o que for fazer a este contato e " +
        "não proponha o dado de novo.",
    };
  },
};
