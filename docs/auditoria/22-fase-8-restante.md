# 8.1 e 8.2 — a segurança que faltava medir: CORS, CSRF, SSRF, upload e escopo administrativo

> Medido em 17/11/2026 no checkout `nexus/main` @ `b63a8a60`, por leitura e por
> execução dos gates indicados. O que já tinha sido medido e corrigido está em
> [`19-fase-8-seguranca-performance-a11y.md`](19-fase-8-seguranca-performance-a11y.md)
> (dependências, rate limit, webhook HMAC, Sentry). Este documento cobre o **resto**
> que o item 8.1/8.2 lista e que não tinha medição: CORS, CSRF, SSRF, upload e
> escopo de impersonação/tenant suspenso.

## 1. CORS — não há cabeçalho, e isso é a decisão

| Medida | Resultado |
|---|---|
| `Access-Control-Allow-Origin` em `app/`, `lib/`, `proxy.ts` | **0 ocorrências** |
| Handlers `OPTIONS` para preflight | **0** |

Nenhuma rota publica CORS. Não é omissão: o browser só entrega a resposta de uma
chamada cross-origin se o servidor autorizar; sem `ACAO`, um site terceiro não lê a
resposta autenticada do usuário. A API é consumida pelo próprio domínio (cookie) e
por token de API (`Authorization: Bearer`), que não depende de CORS. **Abrir CORS
para um cliente externo exige decisão explícita** — não existe hoje.

## 2. CSRF — o cookie é `sameSite: strict` e httpOnly nas três camadas

| Camada | Configuração | Arquivo |
|---|---|---|
| client do servidor | `sameSite: "strict"`, `httpOnly: true` | `lib/supabase/server.ts:39-40` |
| client do browser | `sameSite: "strict"` | `lib/supabase/browser.ts:128` |
| proxy (middleware) | `sameSite: "strict"`, `httpOnly: true` | `proxy.ts:60-61` |

`sameSite: strict` faz o browser **não enviar** o cookie em requisição iniciada por
outro site — inclusive POST de formulário. As mutações por Server Action têm, além
disso, a checagem de origem do Next; as rotas `/api/v1/*` exigem corpo JSON (não
`application/x-www-form-urlencoded`), o que impede o formulário HTML clássico de
produzir o payload. Não há isenção de CORS que reabra o caminho.

**Limite declarado:** isto é análise de configuração, não teste de navegador. O
teste de CSRF ao vivo (site terceiro tentando POST) não existe e fica como lacuna.

## 3. SSRF — a defesa é dupla e já cobre redirect

`lib/automation/actions/call-webhook.ts` é o caminho em que o **tenant escolhe a
URL** que o servidor vai chamar. A defesa, medida no arquivo:

1. `assertSafeOutboundUrl(url)` — guard textual (esquema, host, porta);
2. `assertDestinoResolvidoSeguro(hostname)` — **resolve o DNS** e julga o IP; um
   hostname público apontando para `169.254.169.254` (metadata) ou para os
   serviços internos do compose não passa pelo texto;
3. `redirect: "manual"` — 3xx nunca é seguido; uma URL aprovada não vira salto
   para endpoint interno;
4. timeout de 10 s e retry com limite.

As demais chamadas outbound usam URL de configuração do operador (WAHA, Meta,
Nuvemshop, Google, provedores de IA), não URL do usuário final.

## 4. Upload — tamanho e tipo decididos no servidor

| Rota | Limite | Tipo |
|---|---|---|
| `POST /ai/knowledge/sources/upload` | `file.size > TAMANHO_MAXIMO` → recusa | por rota |
| `POST /ai/skills/import` | `contentLength > 6 MB` | envelope |
| `POST /channels/partner/templates/media` | `file.size > TAMANHO_MAX` | por rota |
| `POST /commercial-orders/importar-ia` | 20 MB, checado também no `Content-Length` declarado | arquivo |
| `POST /contacts/import` | `CSV_MAX_BYTES` | CSV |
| `POST /conversations/[id]/media` | `MAX_MEDIA_BYTES` + folga de envelope | `extFromMime` |
| `POST /marca/logo` | `TAMANHO_MAXIMO_DO_LOGO` | **415 decidido pelos bytes**, não por `file.type` |
| `POST /fiscal-settings/certificado` | limite de bytes | PKCS#12 avaliado no servidor |

O caso do logo é o modelo: o `accept=".pfx"`/`accept="image/*"` do `<input>` é dica
de interface, e a interface é do cliente — um `.exe` renomeado passa por ela. A
decisão de tipo é feita **farejando os bytes** (`farejarTipo`, 415) e o certificado
é aberto no servidor antes de qualquer conclusão.

## 5. Escopo administrativo (8.2)

| Operação | Guarda medida | Teste |
|---|---|---|
| Impersonar tenant | platform admin + MFA AAL2; **tenant suspenso responde 409** e não emite cookie | `app/api/v1/admin/tenants/[id]/impersonate/route.test.ts` (inclui "tenant suspenso responde 409 e não emite cookie") |
| Suspender tenant | platform admin + MFA; 404/409 e motivo obrigatório | `.../suspend/route.test.ts` |
| Reativar tenant | platform admin + MFA; 409 se não está suspenso; limpa `suspended_*` | `.../reactivate/route.ts` |
| Encerrar impersonação | rota própria `admin/impersonate/end` | rota + audit |
| Auditoria das três | `audit()` com ator e `actingAsPlatformAdmin` | `lib/audit/actions.ts` |

Os dois itens que a auditoria de 17/11 listava como abertos — **escopo de
impersonação** e **tenant suspenso** — estão fechados no código e com teste. O que
permanece é o limite de sempre: não há teste ao vivo de sessão de impersonação
expirada em navegador.

## 6. O que NÃO foi medido (e não pode ser marcado `[x]` por este documento)

- CSRF ao vivo, em navegador, com origem terceira;
- cabeçalhos de segurança por resposta (CSP, `X-Frame-Options`, `Referrer-Policy`) —
  não foram inventariados nesta fatia;
- dedupe de webhook por provedor (ver 6.A3);
- teste de upload com arquivo malicioso real (o código fareja bytes; o teste com
  payload hostil é frente própria).

## 7. Critério de conclusão

8.1/8.2 passam a `[~]` com as cinco superfícies medidas acima. `[x]` exige os quatro
itens da §6 — em especial o CSRF ao vivo e o inventário de cabeçalhos, que são
medição de navegador, não leitura de configuração.
