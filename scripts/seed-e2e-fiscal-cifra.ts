/**
 * Chave de cifra para a senha do certificado fiscal no rig E2E.
 *
 * No self-hoster a chave nasce no setup (`hostgator-setup-kit/_common.sh`,
 * insert idempotente em `private.app_secrets` com a chave do operador). Sem
 * ela, `fn_encrypt_oauth` levanta "NUVEMSHOP_OAUTH_ENCRYPTION_KEY ausente" e o
 * PUT de `/api/v1/fiscal-settings` responde 422 para qualquer
 * `certificado_senha` — e a pré-validação fiscal EXIGE a senha
 * (`montarPayloadSped`: "Senha do certificado"), então a jornada de emissão
 * nem começa. Medido na primeira execução da `jornada-fiscal.spec.ts`:
 * toast de erro no lugar de "Configuração salva" + warn do servidor.
 *
 * Idempotente (`on conflict do nothing`): a chave não muda. O valor é de
 * AMBIENTE EFÊMERO de teste, não segredo — a função exige ≥32 caracteres.
 *
 * Uso (local, junto dos demais seeds):
 *   pnpm exec tsx scripts/seed-e2e-fiscal-cifra.ts
 */
import pg from "pg";

import { credenciaisSupabaseDeTeste, anunciarDestino } from "./lib/env-de-teste";

const CHAVE_DE_TESTE = "e2e-fiscal-cifra-chave-de-teste-0123456789";

async function main(): Promise<void> {
  const credenciais = credenciaisSupabaseDeTeste();
  anunciarDestino("seed-e2e-fiscal-cifra", credenciais);
  const pool = new pg.Pool({ connectionString: credenciais.dbUrl });
  try {
    await pool.query(
      "insert into private.app_secrets (name, value) values ($1, $2) on conflict (name) do nothing",
      ["nuvemshop_oauth_key", CHAVE_DE_TESTE],
    );
    console.info("[seed-fiscal-cifra] chave de cifra pronta em private.app_secrets");
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("[seed-fiscal-cifra] falhou:", err);
  process.exit(1);
});
