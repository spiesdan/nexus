/**
 * Validade do convite — constante sem `node:crypto`.
 *
 * O servidor assina o token com esta janela (`lib/auth/invite-token.ts`); a tela
 * de Equipe usa a MESMA janela para distinguir "Pendente" de "Expirado". Antes,
 * o TTL vivia só no módulo que importa `crypto`, e a tela não conseguia lê-lo
 * sem arrastar criptografia para o bundle do cliente.
 */
export const INVITE_TTL_SECONDS = 60 * 60 * 24; // 24h
export const INVITE_TTL_MS = INVITE_TTL_SECONDS * 1_000;
