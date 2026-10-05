/**
 * Lê ou troca o nome da marca da INSTALAÇÃO (`platform_branding.app_name`).
 *
 * A marca do produto não é escrita no código: ela mora no banco, e é de lá
 * que o sidebar, a tela de login, os e-mails e o favicon tiram o nome. Por
 * isso o comando existe — trocar o nome do produto é uma escrita de banco,
 * não um commit.
 *
 * O ambiente vem do PROCESSO ( rode com as variáveis já carregadas, ex.:
 * `.env.e2e` para o Supabase local). O script não carrega arquivo de `.env`
 * sozinho de propósito: pointed para o arquivo errado, ele escreveria a marca
 * no banco de outro ambiente.
 *
 * Uso: pnpm exec tsx scripts/marca-instalacao.ts            (mostra a atual)
 *      pnpm exec tsx scripts/marca-instalacao.ts "Nome Novo" (troca)
 */
const [, , novoNome = ""] = process.argv;

async function main(): Promise<void> {
  const { createAdminClient } = await import("../lib/supabase/admin");
  const cliente = createAdminClient();

  const atual = await cliente
    .from("platform_branding")
    .select("app_name, accent_hex, logo_url, logo_path, show_powered_by, seeded_from_env")
    .eq("id", 1)
    .maybeSingle();

  if (atual.error) throw new Error(`leitura falhou: ${atual.error.code ?? ""} ${atual.error.message}`);
  process.stdout.write(`atual: ${JSON.stringify(atual.data)}\n`);

  if (!novoNome.trim()) {
    process.stdout.write("informe o novo nome como argumento para trocar\n");
    return;
  }

  const linha = atual.data;
  const consulta = linha
    ? cliente
        .from("platform_branding")
        .update({ app_name: novoNome.trim(), seeded_from_env: true })
        .eq("id", 1)
    : cliente.from("platform_branding").insert({ id: 1, app_name: novoNome.trim(), seeded_from_env: true });

  const gravado = await consulta.select("app_name").maybeSingle();
  if (gravado.error) throw new Error(`gravação falhou: ${gravado.error.code ?? ""} ${gravado.error.message}`);
  process.stdout.write(`gravado: ${JSON.stringify(gravado.data)}\n`);
  process.stdout.write("MARCA_OK — reinicie o app: a marca é memoizada por processo\n");
}

main().catch((err: unknown) => {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});