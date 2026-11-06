/**
 * EPIC-09 Team & Permissions — Zod schemas for invite, accept, role change, and api token.
 *
 * Roles are stored as `text` with a check constraint (not enum) on
 * `user_organizations.role` per project doctrine — keep this list in sync
 * with the DB constraint when adding/removing roles.
 */
import { z } from "zod";

import { PAPEIS_HUMANOS } from "@/lib/auth/types";

/**
 * Papéis aceitáveis num CONVITE.
 *
 * Deriva de `PAPEIS_HUMANOS` em vez de repetir a lista: as duas viviam em
 * arquivos diferentes e já tinham divergido (`ai_operator` estava no RBAC e
 * não aqui). Repetir um vocabulário que o banco restringe por CHECK é pedir
 * para o formulário aceitar algo que o banco recusa.
 */
export const ROLES = PAPEIS_HUMANOS as unknown as readonly string[] as readonly ["viewer", "agent", "vendedor", "manager", "admin"];
export type Role = (typeof ROLES)[number];

export const inviteMemberSchema = z.object({
  invitations: z
    .array(
      z.object({
        email: z.string().email(),
        role: z.enum(ROLES),
        /**
         * Convite de ENTREGADOR (0292): o membro entra com o role escolhido
         * (normalmente `agent`, que é o que as policies de `shipments` exigem)
         * e a flag só esconde a casca e manda a home para a expedição.
         */
        motorista: z.boolean().optional(),
      }),
    )
    .min(1)
    .max(20),
});
export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;

export const acceptInviteSchema = z.object({
  token: z.string().min(20),
});
export type AcceptInviteInput = z.infer<typeof acceptInviteSchema>;

export const changeRoleSchema = z.object({
  role: z.enum(ROLES),
});
export type ChangeRoleInput = z.infer<typeof changeRoleSchema>;

/**
 * Modo entregador (0292) — liga/desliga a experiência de cabine.
 *
 * Não é role: não concede nem retira permissão. `false` devolve o menu e a
 * home normais; `true` esconde a casca e abre a expedição.
 */
export const changeMotoristaSchema = z.object({
  motorista: z.boolean(),
});
export type ChangeMotoristaInput = z.infer<typeof changeMotoristaSchema>;

/**
 * Ramal do atendente (0266): texto livre até 60, `null` limpa.
 *
 * `min(2)` porque setor de 1 letra ("A", "X") é sigla que ninguém entende no
 * atendimento — e a assinatura com sigla de 1 letra ("… - X Ana") confunde
 * mais do que identifica.
 */
export const changeSetorSchema = z.object({
  setor: z.string().trim().min(2).max(60).nullable(),
});
export type ChangeSetorInput = z.infer<typeof changeSetorSchema>;

/**
 * Nome de exibição do membro (0267).
 *
 * Mora em `auth.users.user_metadata.full_name` — GLOBAL, não por org: é o
 * nome da pessoa, e dois nomes (um por org) fariam a Equipe mostrar X e a
 * assinatura dizer Y. `min(2)`: sem null aqui — sem nome, a tela mostra o
 * e-mail (comportamento atual); nome de 1 letra é o mesmo problema do setor.
 */
export const changeNomeSchema = z.object({
  nome: z.string().trim().min(2).max(80),
});
export type ChangeNomeInput = z.infer<typeof changeNomeSchema>;

/**
 * Números que o membro enxerga no inbox (0296).
 *
 * `canais_permitidos` é a allowlist de `channel_sessions.id`:
 *
 *  - `null`  → todos os números (é o padrão histórico; desligar a restrição)
 *  - `[]`    → nenhum (conta que ainda não recebeu número)
 *  - `[ids]` → exatamente esses
 *
 * `null` e `[]` são coisas diferentes e o schema não pode colapsar as duas:
 * `undefined` no corpo é 422, porque uma escrita que "não veio" não deve
 * desligar a restrição de ninguém por omissão.
 */
export const changeCanaisSchema = z.object({
  canais_permitidos: z
    .array(z.string().uuid())
    .max(100)
    .nullable()
    .transform((ids) => (ids === null ? null : [...new Set(ids)])),
});
export type ChangeCanaisInput = z.infer<typeof changeCanaisSchema>;

export const createApiTokenSchema = z.object({
  name: z.string().min(2).max(100),
  scopes: z.array(z.string()).min(1),
  expires_in_days: z.coerce.number().int().min(1).max(365).optional(),
});
export type CreateApiTokenInput = z.infer<typeof createApiTokenSchema>;
