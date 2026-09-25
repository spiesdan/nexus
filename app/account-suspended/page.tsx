import { StatusPage } from "@/components/nexus-ui/feedback/StatusPage";
import { emailDeSuporte } from "@/lib/branding/saida";
import { idiomaDaPagina } from "@/lib/i18n/idioma-da-pagina";

export const metadata = {
  title: "Conta suspensa",
};

/**
 * Esta tela entregava o NOSSO endereço de suporte ao cliente de um revendedor —
 * e aqui isso é ativamente errado: quem suspendeu a conta foi o revendedor, e
 * escrever para nós não desbloqueia nada. O endereço agora sai de
 * `SUPPORT_EMAIL` (o do operador) e, quando ninguém configurou, o parágrafo do
 * contato simplesmente NÃO renderiza. Cair de volta num endereço do produto
 * seria o defeito de volta, com o agravante de parecer resolvido.
 */
export default async function AccountSuspendedPage() {
  return (
    <StatusPage
      variante="conta-suspensa"
      idioma={await idiomaDaPagina()}
      suporte={emailDeSuporte()}
    />
  );
}
