/**
 * EPIC-09 Team & Permissions — Zod schemas for invite, accept, role change, and api token.
 *
 * Roles are stored as `text` with a check constraint (not enum) on
 * `user_organizations.role` per project doctrine — keep this list in sync
 * with the DB constraint when adding/removing roles.
 */
import { z } from "zod";

export const ROLES = ["viewer", "agent", "manager", "admin"] as const;
export type Role = (typeof ROLES)[number];

export const inviteMemberSchema = z.object({
  invitations: z
    .array(
      z.object({
        email: z.string().email(),
        role: z.enum(ROLES),
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

export const createApiTokenSchema = z.object({
  name: z.string().min(2).max(100),
  scopes: z.array(z.string()).min(1),
  expires_in_days: z.coerce.number().int().min(1).max(365).optional(),
});
export type CreateApiTokenInput = z.infer<typeof createApiTokenSchema>;
