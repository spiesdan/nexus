import { StatusPage } from "@/components/nexus-ui/feedback/StatusPage";
import { IDIOMA_PADRAO } from "@/lib/i18n/idiomas";

// Manutenção é justamente o cenário em que o Supabase pode estar fora do ar —
// esta página não pode depender dele para saber em que idioma falar. Sem
// sessão para consultar, fica no idioma padrão da instalação. Por isso NÃO
// usa `idiomaDaPagina()` (o único status page que não usa).
export default function ServiceUnavailablePage() {
  return <StatusPage variante="manutencao" idioma={IDIOMA_PADRAO} />;
}
