# 51 — Onboarding: o passe das 9 superfícies do wizard

**Data:** 20/11/2026 · **Base:** `nexus/main` @ `b8e828b7` · **Método:**
`next dev` local contra o Supabase local, medido por
`tests/captura-onboarding.ts` nas duas pontas (antes/depois **na mesma base**):
8 telas × claro/escuro × 1440/390 = **32 medições por lado**. A nona superfície,
`/onboarding`, é o roteador (não tem UI própria — ver abaixo).

**Escopo:** `welcome`, `connect-whatsapp`, `connect-nuvemshop`, `setup-ai`,
`funil`, `testar`, `invite-team`, `done` e o roteador `/onboarding`. **Nenhuma
regra do wizard, estado, ou Server Action foi tocada** — o passe é superfície.

## O fixture (por que este passe precisava de um)

A organização do E2E já está onboardada: todo `/onboarding/*` nela redireciona
para `/app/inbox`, e a captura provaria a tela errada. Resetar a organização
compartilhada estragaria a suíte de quem estivesse rodando ao mesmo tempo.
`scripts/seed-onboarding-captura.ts` cria **organização e usuário próprios**
(`onboarding_state = {}`, `onboarded_at = NULL`), idempotentes, e escreve as
credenciais em `.captura-onboarding.json` (fora do versionamento).

Duas armadilhas de instrumento, medidas:
- **`127.0.0.1` × `localhost`**: o dev bloqueia `/_next/*` como cross-origin
  quando o host não é o mesmo do servidor — a página renderiza (SSR) mas **não
  hidrata**, e o login faz submit nativo. A captura usa `localhost`.
- **Hidratação do login**: a primeira visita compila a server action; o clique
  antes disso cai no `<form method="post">` e a tela fica em `/login` sem erro.
  O instrumento repete o clique até 4× e imprime o texto da tela em cada falha.

## O que mudou

**Contraste no callout âmbar (tema escuro).** Em `setup-ai` e `funil`, textos
secundários dentro do aviso `bg-warning-bg` usavam `text-muted-foreground`:
**4,27:1** sobre o fundo âmbar escuro, abaixo do piso AA de 4,5 — axe
`color-contrast` **serious** em 390 e 1440. O aviso já declara
`text-warning-fg` no contêiner; os textos passaram a **herdá-lo** em vez de
trocar para o cinza de superfície. Também os detalhes de erro dos dois avisos de
"atendente ficou como rascunho" em `setup-ai/_form.tsx`, que teriam o mesmo
defeito quando aparecessem (estado de erro, não alcançado pela fixture).

## Números (medidos, não olhados)

| Medida | Antes | Depois |
|---|---:|---:|
| Medições (8 telas × 2 temas × 2 larguras) | 32 | 32 |
| Textos avaliados para contraste AA | 1.380 | 1.380 |
| Textos **abaixo** do piso | **6** | **0** |
| Violações axe `critical`/`serious` | **4** | **0** |
| Overflow horizontal (1440 e 390) | **0** | **0** |
| Erros de console | 0 | 1 |

Os 6 textos eram 2 em `setup-ai` + 1 em `funil`, nas duas combinações escuras; as
4 violações axe são os mesmos dois callouts em 390 e 1440.

**Sobre o console (declarado, não "consertado"):** apareceu **uma vez**, em
`welcome` escuro/390 — "a tree hydrated but some attributes of the server
rendered HTML didn't match". É atributo de **tema no `<html>`** (o
`localStorage` aplica a classe antes da hidratação), não conteúdo, e não
reproduziu nas outras 31 medições. Fica registrado como observação; corrigir
exige mexer no bootstrap de tema, que é de outra frente.

## O roteador `/onboarding`

Não tem UI: redireciona para o primeiro passo pendente (`/onboarding/welcome`
numa organização nova). A `matriz 41` passa a dizer isso — **medido ·
redireciona**, com a captura do destino. Capturar "antes/depois" de um redirect
seria duas cópias da mesma tela de `welcome`.

## O que NÃO foi tocado

- Passos, ordem, `onboarding_state`, Server Actions, `SkipToEnd` (DEV) e a
  lógica de "pulado × cumprido" — a régua do wizard é de outra frente.
- O indicador de progresso. Observação para o próximo passe: em 1440 o rótulo
  "Quem trabalha com ele" quebra em duas linhas e desalinha a linha dos números.
- O assistente flutuante sobre o `done` em 390 (widget global): ele cobre parte
  do conteúdo, mas é componente compartilhado do shell — fora deste recorte.

## Capturas

`docs/auditoria/capturas/antes-onboarding/` e `depois-onboarding/` — 8 telas ×
claro/escuro × 1440/390, com `medidas.json` por lado. Instrumentos:
`tests/captura-onboarding.ts` e o medidor único `tests/lib/medir-pagina.ts`
(extraído do passe de público/auth para não haver duas réguas).

## Pendente (declarado)

- **Leitor de tela real** (NVDA/VoiceOver) no wizard — a régua automatizada cobre
  contraste, nomes e axe; não substitui a leitura humana.
- **`connect-nuvemshop` é alcançável por URL direta com a integração DESLIGADA.**
  O indicador (corretamente) não mostra o passo — nesta instalação são 6, não 7 —
  e `/onboarding` nunca roteia para ele; mas abrir a URL na mão renderiza a tela
  inteira. Medir a superfície é o que a matriz pede; esconder ou redirecionar é
  decisão de produto (o passo pode estar desligado só no roteador de propósito,
  para quem conectou a loja antes de a flag ser desligada). Não mexi.
