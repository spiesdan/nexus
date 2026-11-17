# Discord da empresa — configuração medida

> Regido por `docs/auditoria/PROMPT-MESTRE-AAA.md`.
> Aplicado e verificado em **15/11/2026** no servidor `NEXUS` (`1571693710016643193`).
> Nenhum token, URL ou id de webhook aparece neste arquivo — credencial não vira documentação.

## 1. O limite que define tudo: webhook x bot

| Peça | Lê o servidor | Cria/edita canal | Cria/edita cargo | Permissão por canal |
|---|---|---|---|---|
| Webhook | **não** | não | não | não |
| Bot | sim | sim | sim | sim |

Webhook é **mão única**: escreve num canal e não enxerga o resto. Por isso o feed
automático usa webhook (é só postar) e a **estrutura** usa bot. O plano original era
fazer tudo com webhook; medir mostrou que não existe esse caminho.

## 2. Estrutura aplicada (6 categorias · 16 canais · 5 cargos)

```
📌 Início      #boas-vindas  #avisos  #regras
🚀 Produto     #atualizacoes  #releases  #roadmap  #duvidas-de-produto
🛠️ Engenharia  #engenharia  #incidentes  #qualidade
🤝 Comercial   #comercial  #clientes
🆘 Suporte     #suporte  #bugs
🔊 Voz         #Sala Geral  #Reunião
```

| Cargo | Cor | Uso |
|---|---|---|
| Gerenciar (bot `nexus ops`) | — | administrador; aplica o blueprint |
| `@Liderança` | `#4f46e5` | publica nos canais somente leitura |
| `@Engenharia` | `#0f766e` | engenharia, qualidade, incidentes |
| `@Comercial` | `#b45309` | pipeline e contas |
| `@Suporte` | `#0369a1` | atendimento e bugs |
| `@Convidado` | `#5e6b82` | leitura, sem escrita |

`#geral` foi **renomeado** para `#atualizacoes` — não recriado. O webhook aponta para o
**id do canal**, então o histórico e a integração sobreviveram ao renome. Isso foi
verificado postando depois da mudança.

## 3. Permissões — e as duas falhas que só apareceram com a estrutura pronta

| Regra | Antes | Depois |
|---|---|---|
| `@everyone` podia **mencionar todos** (`MENTION_EVERYONE`) | sim | **não** |
| `@everyone` podia **aplicar timeout** (`MODERATE_MEMBERS`) | sim | **não** |
| `@everyone` podia criar convite / gerenciar | herdado do padrão | **não** |
| Canais somente leitura | negavam envio para `@everyone` | idem **+ allow explícito para `@Liderança`** |

A segunda linha da tabela é o achado que importa: o tópico de `#avisos` dizia "só a
liderança publica", mas o overwrite negava envio para `@everyone` **e não havia allow
por cargo**. Resultado real: *ninguém* publicaria. Um allow de cargo sobrescreve o deny
de `@everyone` no mesmo canal — é essa a engrenagem que faz a frase ser verdadeira.

## 4. Conteúdo publicado (com fixado)

| Canal | Conteúdo |
|---|---|
| `#boas-vindas` | mapa do servidor + como pedir algo (sintoma e efeito, um caso por thread) |
| `#regras` | 6 regras: thread por caso, dado pessoal não entra, aviso é da liderança, incidente tem forma, mudança se anuncia, segredo não circula |
| `#avisos` | registro da configuração — **fixado** |
| `#roadmap` | como escrever um item (o que o cliente passa a poder fazer · o que substitui · quando entra) |

## 5. O que o Discord **não** permite aqui

- **Canal de anúncio nativo (tipo 5)**: exige servidor **Comunidade**. O servidor tem
  `features: []`. Tentar criar devolve `400 BASE_TYPE_CHOICES` — e devolve **no meio**
  do blueprint, deixando metade aplicada. Por isso `#avisos` e `#releases` são **texto
  somente leitura** até a decisão de virar Comunidade. O script detecta a feature antes.
- **Listar membros**: `GET /guilds/{id}/members` devolve `403 Missing Access` — o bot não
  tem o intent privilegiado `GUILD_MEMBERS`. Atribuir cargo a pessoa é ato manual.
- **Editar mensagem antiga**: só as do próprio bot. O webhook também pode editar as suas.

## 6. Idempotência — a propriedade que faz isso ser operável

```
$ pnpm exec tsx scripts/discord/configurar-servidor.ts
```

Duas execuções seguidas: a segunda devolve **0 criados** e o mesmo nº de conferidos.
O script **não apaga** canal, cargo nem mensagem: `#Sala Geral` é o antigo `Geral`
movido para `🔊 Voz`, e as categorias vazias herdadas (`Canais de Texto`, `Canais de Voz`)
foram removidas **à mão, com o plano na tela** — remoção é decisão humana, não efeito
colateral de rodar um script.

## 7. Credenciais

`DISCORD_WEBHOOK_URL`, `DISCORD_GUILD_ID`, `DISCORD_CANAL_ATUALIZACOES_ID` e
`DISCORD_BOT_TOKEN` vivem em `.env.local`, ignorado pelo git (`.gitignore`, `.env*`).
O token do bot é **administrador do servidor** — mais poderoso que o webhook. Se vazar:
Developer Portal → Bot → *Reset Token* invalida na hora; webhook vazado: Canal →
Integrações → Webhooks → *Delete*. Nenhum script imprime esses valores, nem em erro.

## 8. Pendências (decisão humana, não técnica)

| # | Pendência | Efeito de não fazer |
|---|---|---|
| D-1 | Virar servidor **Comunidade** para ter canal de anúncio nativo + welcome screen | `#avisos`/`#releases` ficam texto somente leitura |
| D-2 | Atribuir `@Liderança`/`@Engenharia`/… às pessoas | todos ficam em `@everyone`: leem tudo, escrevem só nos canais de conversa, e **ninguém** publica em `#avisos` |
| D-3 | Rotacionar o token do bot (ele passou por um canal de chat) | token exposto fora do `.env.local` é servidor exposto |
