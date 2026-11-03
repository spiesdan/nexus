/**
 * Metadados do certificado A1, preenchidos DEPOIS do upload.
 *
 * `sha256`, autor e data o app consegue gravar sozinho — são bytes. `titular`,
 * `cnpj` e `validade` estão **dentro** do PKCS#12, e abrir o formato é trabalho
 * do sidecar (PHP/openssl), que já tem o arquivo no volume e a senha em mãos na
 * hora de assinar nota.
 *
 * A chamada é best-effort de propósito: um sidecar fora do ar no momento do
 * upload não pode impedir que o certificado seja gravado. A tela mostra o que
 * existe; o alerta de vencimento aparece quando o metadado chegar.
 */
import { caminhoDoCertificadoNoSidecar } from "@/lib/fiscal/certificado";
import { lerMetadadosDoCertificado } from "@/lib/fiscal/entrada";
import { createAdminClient } from "@/lib/supabase/admin";

export async function registrarMetadadosDoCertificado(
  organizationId: string,
  senha: string | null,
): Promise<boolean> {
  if (!senha) return false;
  const caminho = caminhoDoCertificadoNoSidecar(organizationId);
  if (!caminho) return false;

  const meta = await lerMetadadosDoCertificado({
    caminhoDoCertificado: caminho,
    certificadoPath: caminho,
    senhaCertificado: senha,
  });
  if (!meta.ok) return false;

  const admin = createAdminClient();
  // Uma linha ativa por organização (as anteriores foram revogadas no upload).
  const { error } = await admin
    .from("fiscal_certificates")
    .update({
      titular: meta.titular,
      cnpj: meta.cnpj,
      validade: meta.validade,
    })
    .eq("organization_id", organizationId)
    .is("revogado_em", null);

  // O erro não vira exceção: quem chamou só usa o booleano para decidir se
  // recarrega a tela. Certificado sem metadado continua válido para assinar.
  return !error;
}
