import { requireAuth } from "@/lib/auth/server";import { PaginaDeConfiguracao } from "@/components/nexus-ui/layout/PaginaDeConfiguracao";

import { traduzir } from "@/lib/i18n/dicionario";
import { normalizarIdioma } from "@/lib/i18n/idiomas";
import { SEM_PREFERENCIA_DE_IDIOMA } from "@/lib/schemas/settings";
import { ProfileForm } from "./_form";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const user = await requireAuth();
  // `locale` já vem tipado em AuthUser (loadAuthUser lê user_metadata.locale) —
  // o comentário antigo dizia que não vinha; estava desatualizado. `timezone`
  // não está em AuthUser e segue pelo cast do meta, como full_name/avatar_url.
  const meta = user as unknown as {
    full_name: string | null;
    avatar_url: string | null;
    timezone?: string | null;
  };
  // DOIS idiomas nesta tela, e confundi-los seria o defeito:
  //   `user.idioma`  → o que a interface está usando AGORA (já resolvido com a
  //                    organização). É com ele que esta página se traduz.
  //   `user.locale`  → a PREFERÊNCIA da pessoa, que pode estar vazia. É ela que
  //                    o formulário mostra, porque vazio significa "sigo minha
  //                    empresa" e o seletor tem uma opção para isso. Mostrar o
  //                    efetivo aqui faria quem salvasse sem mexer em nada gravar
  //                    uma preferência que ela nunca escolheu — e daí em diante
  //                    a troca de idioma da empresa passaria por cima dela.
  const idioma = user.idioma;
  return (
    <PaginaDeConfiguracao
      titulo={traduzir("Perfil", idioma)}
      // "Email só pode ser trocado em breve" era promessa sem dono nem data.
      // A tela não tem troca de email; dizer isso é fato, e o botão desabilitado
      // do campo logo abaixo já é a mesma resposta.
      descricao={traduzir(
        "Informações pessoais. O email desta conta não pode ser trocado por aqui.",
        idioma,
      )}
    >
      <ProfileForm
        email={user.email}
        initialFullName={meta.full_name}
        initialAvatarUrl={meta.avatar_url}
        initialLocale={user.locale ? normalizarIdioma(user.locale) : SEM_PREFERENCIA_DE_IDIOMA}
        initialTimezone={meta.timezone ?? "America/Sao_Paulo"}
      />
    </PaginaDeConfiguracao>
  );
}
