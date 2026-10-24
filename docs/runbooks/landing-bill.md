# Runbook — landing institucional (billhigiene.tech)

Site estático (HTML/CSS/JS) da Bill Higiene e Limpeza, em [`landing/`](../../landing/).
Não usa o app, o banco nem o Supabase: é servido direto pelo Caddy da VPS, como
site separado do CRM (`crm.billhigiene.tech`).

## Como atualizar em produção

```bash
cd /var/www/crm
git fetch origin
git checkout <commit>          # a instalação roda em HEAD destacado
docker compose -f docker-compose.prod.yml -f docker-compose.landing.yml \
  --env-file .env up -d caddy
```

**O segundo `-f` não é opcional.** É ele que monta `./landing` em
`/srv/landing` e o `site.caddyfile` em `/etc/caddy/sites/`. Sem ele, o Caddy
recria sem o site: o CRM continua no ar, mas `billhigiene.tech` para de
responder (TLS/404).

O bloco do domínio vive em [`landing/site.caddyfile`](../../landing/site.caddyfile),
importado pelo `Caddyfile` base via `import /etc/caddy/sites/*.caddyfile`. Ele
fica fora do Caddyfile base de propósito: uma instalação self-host genérica não
deve tentar emitir certificado para um domínio que não é dela.

## Números da página (conferidos no CRM em 2026-10-23)

| Dado | Valor | Origem |
|---|---|---|
| Itens ativos | 1.141 | catálogo |
| Clientes ativos | 1.844 | radar — contatos com venda válida |
| Cidades atendidas | 255 | base de contatos (valor bruto, sujeito a variantes de grafia) |
| Pedidos realizados | 38.938 | informado pelo usuário |
| Anos de mercado | 20 | informado pelo usuário |

Fotos: `landing/assets/products/` (linha Bill). Logo: `landing/assets/logo.png`.
