# Admin — Dashboard (casca de 44 px)

> **Escopo:** `/admin/dashboard` + a casca compartilhada do admin. O conteúdo
> já estava sem alvo pequeno; o que reprovava eram os 16 alvos da casca
> (sidebar, topbar, banner e busca).
> **Medido em:** 20/11/2026, AVD não; navegador 1440×900 e 390×844, sessão
> `dono` com TOTP, Supabase local.
> **Nada aponta para produção.** Sem deploy.

## Antes/depois

| Medida | Antes | Depois |
|---|---:|---:|
| Alvos < 40 px — dashboard 1440 | **16** | **1** (só o skip-link `sr-only` 1×1) |
| Alvos < 40 px — dashboard 390 | **2** | **1** (mesmo skip-link) |
| Alvos < 40 px — conteúdo (`main`) | **0** | **0** |
| Overflow horizontal (1440/390) | 0 | 0 |
| Erros de console | 0 | 0 |
| Contraste WCAG AA (dark/light) | 0/33 abaixo | 0/33 abaixo |

O único “alvo” restante no número bruto é o **“Pular para o conteúdo”**
(`sr-only` 1×1, que vira alvo visível no foco). Não é alvo de toque em repouso e
não foi alterado. **Alvos visíveis abaixo de 40 px: 0** em 1440 e 390.

## O que mudou

A casca do admin é compartilhada por todas as 22 rotas. Em vez de repetir
`min-h-11` em cada tela, o piso de **44 px** foi aplicado onde os alvos nascem:

- `components/admin/AdminSidebar.tsx`: links de navegação e “Voltar pra app” com
  `min-h-11`;
- `components/shell/NotificationCenter.tsx`, `ThemeToggle.tsx`,
  `AssistenteAvatar.tsx`: removido `lg:h-9` (36 px) do desktop; ficam 44;
- `components/shell/SearchTrigger.tsx`: `md:h-11`/`lg:h-11` para o botão de
  busca não cair no `h-9` do variant `sm`;
- `components/shell/UserMenu.tsx`: trigger 44 px no desktop;
- `components/admin/PlatformModeBanner.tsx`: “Sair pra app pessoal” com
  `min-h-11`.

Nenhum token, cor ou tipografia mudou. O texto não cresce; o alvo sim.

## Evidência

- `capturas/admin-dashboard-antes/{desktop_1440,celular_390}.png`
- `capturas/admin-dashboard-depois/{desktop_1440,celular_390}.png`
- `capturas/contraste.json` (rodada do dashboard)

A captura de **390 px ficou byte-idêntica** entre antes e depois — o ganho no
celular é área de toque invisível (padding transparente), não pixel. A prova do
390 é a medição do instrumento (2 → 1), não a imagem.

## Limites

O conteúdo das **outras 21 telas** de admin ainda não foi auditado um a um; a
casca já entrega 44 px para todas, mas cada tela pode ter alvo próprio (ex.:
`/admin/audit` tinha 72 no total). A fila segue tela a tela.
