# Runbook — saúde da VPS de produção

Retrato medido em **27/11/2026**, logo após o deploy da `2.0.17`
(`crm.billhigiene.tech`, 23 contêineres, Postgres 17 self-host, 8 GB de RAM).
Essa instalação atende **um cliente que emite NF-e em produção** (CNPJ
35.233.142/0001-83): indisponibilidade aqui é **nota parada**, não só tela fora.

Para deploy e rollback, [`deploy.md`](deploy.md). Este documento é sobre
**saber que algo quebrou antes do cliente contar**.

---

## 1. O comando único

`hostgator-setup-kit/saude.sh` — leitura apenas, seguro a qualquer hora:

```bash
bash hostgator-setup-kit/saude.sh          # humano
bash hostgator-setup-kit/saude.sh --json   # máquina (rotina diária)
bash hostgator-setup-kit/saude.sh --quiet  # silêncio se está tudo ok
```

Sai com `0` (tudo ok), `1` (alerta) ou `2` (não deu para inspecionar). É esse
código de saída que a rotina usa: **sem alerta, sem mensagem**.

## 2. O que ele mede, e por que cada limite é esse

| sinal | limite | motivo |
|---|---|---|
| contêiner `unhealthy`/parado | qualquer | o healthcheck cobre o processo, não o roteamento |
| disco | > 80% | um `docker pull` no meio do update morre sem espaço |
| RAM | > 85% | build com a stack no ar já levou esta VPS ao OOM (11 processos mortos, 24/10/2026) |
| swap | > 85% | swap cheio com RAM alta é o OOM a caminho |
| backup do banco | > 36h | o `backup.sh` **só roda dentro do `update.sh`** |
| backup agendado | existir | hoje não existe: `crontab -l` tem agent, drain e log-truncate, nenhum backup |
| A1 (validade) | < 30 dias | renovar é processo do cliente (compra + upload) |
| A1 (arquivo) | `.pfx` < 1 KiB | upload interrompido deixa bytes; o erro só aparece ao assinar a nota |
| versão | `.env` ≠ resposta | contêiner não recriado mente no `docker ps` |
| versão | ≠ última release | só informa: atualizar é decisão do dono |
| HTTP | 307 | `404` = labels do proxy perdidas (deploy sem o `-f` certo) |
| TLS | < 10 dias | se o proxy parou de renovar, o aviso vem antes do vencimento |

O que **não** é prova de saúde: `healthy` no `docker ps`. O healthcheck do `app`
é um probe TCP interno e passa mesmo com o domínio em `404`. Só o `curl` do §2 de
[`deploy.md`](deploy.md) prova roteamento.

## 3. Rotina diária (OpenBot)

Uma rotina do agente DevOps roda o `saude.sh` contra a VPS por SSH **somente
leitura** e só escreve no chat quando há alerta. Se o próprio SSH falhar, isso
**é** anomalia: VPS fora, rede fora ou chave revogada.

Ela não reinicia, não atualiza, não toca em certificado. Achou anomalia →
reporta com o comando e a saída; conserta quem tem a mão na VPS.

## 4. Lacunas medidas (o que hoje NÃO tem monitoramento)

1. **Backup agendado desde 27/11/2026**, no cron do host (03:00 de São Paulo,
   `0 6 * * *` em UTC), com retenção de **30 dias** (`BACKUP_RETENTION=30`) e o
   `rc` de cada execução em `backups/backup.log` — o `saude.sh` lê as duas coisas
   e alerta tanto no dump velho quanto na última execução que falhou. Antes disso,
   os dumps existiam só porque houve `update.sh`.

   ```bash
   0 6 * * * cd /var/www/crm && { BACKUP_RETENTION=30 bash hostgator-setup-kit/backup.sh >> backups/backup.log 2>&1; echo "rc=$? $(date -Is)" >> backups/backup.log; }
   ```

   > **Até a release com `BACKUP_RETENTION` chegar, a retenção efetiva é 14.** O
   > script que roda na VPS hoje ignora a variável e mantém o número fixo antigo.
   > Não leia "30" e acredite: confira com `bash -c 'grep -c BACKUP_RETENTION
   > /var/www/crm/hostgator-setup-kit/backup.sh'` — zero significa que ainda é 14.

2. **Nada avisa se a VPS inteira morrer** além da rotina diária: não há uptime
   externo batendo em `/api/v1/health` de fora. Isso cobre um ponto por dia, não
   minutos.

3. **Crescimento de disco não tem histórico.** O primeiro ponto é o da §5;
   comparar com a semana seguinte já dá a taxa. As imagens Docker ocupam 25 GB —
   `docker system df` mostra o que é recuperável sem apagar o que está em uso.

4. **Sessões do WhatsApp** não entram no `saude.sh`: quem vigia é o cron
   `channel-health` do app. WAHA caído o healthcheck acusa; "conectado e sem
   entregar" não.

5. **Restart acumulado** (ex.: `supabase_auth_selfhost: 2`) é informativo: o
   contador não zera sozinho e não diz *quando* reiniciou.

## 4b. O backup já foi restaurado uma vez (27/11/2026)

Backup nunca lido não é backup; backup lido mas nunca restaurado também não.
Em 27/11 o dump do dia foi restaurado num banco descartável (`nexus_restore_check`,
criado e dropado no mesmo cluster, sem tocar em produção):

| medida | resultado |
|---|---|
| tempo de restore | 21 s para 24 MB comprimidos |
| tabelas `public` | 279 no restaurado = 279 em produção |
| `mercos_reconciliacoes` | 35.872 = 35.872 |
| `contacts` | 15.397 = 15.397 |
| `event_log` | 13.084 = 13.084 |
| `commercial_orders` | 12.371 = 12.371 |
| `organizations` | 17 = 17 |

Apareceram **65 erros de privilégio** (`permission denied to change default
privileges`, `grant options cannot be granted back to your own grantor`,
`permission denied for table secrets`). São de `GRANT`/privilégio padrão, não de
dado: nenhuma tabela ficou vazia por causa deles. Na restauração de verdade use
`restore.sh`, que conecta como dono do banco — restaurar como `postgres` num
Supabase self-host é o que produz esses avisos.

## 5. Baseline de 27/11/2026 (pós-`2.0.17`)

| item | valor | como foi medido |
|---|---|---|
| versão em execução | 2.0.17 (= última release) | `/api/v1/health` × `releases/latest` |
| contêineres | 23, todos `healthy`, 0 reiniciando | `docker ps -a` |
| disco | 38 GB / 96 GB (40%), 59 GB livres | `df -h` / `df -i` |
| RAM | 2,9 GB / 7,9 GB (36%), ~5 GB disponíveis | `/proc/meminfo` |
| swap | 1,3 GB / 4 GB (32%) | `/proc/meminfo` |
| backup | 14 dumps, último 24 MB do próprio deploy, retenção 14, 308 MB no total | `ls -1t backups/db-*` |
| A1 | válido até 27/10/2027 (333 dias) | `fiscal_certificates.validade` |
| TLS | Let's Encrypt até 18/02/2027 (83 dias) | `openssl s_client` |
| HTTP | 307 | `curl -o /dev/null -w %{http_code}` |

## 6. Quando alertar o dono, e o que NÃO fazer

Alerta = `saude.sh` sai 1 ou o SSH falha. O report leva o comando e a saída.

Nunca, por conta própria: `docker compose up/down/restart`, `update.sh`,
`restore.sh`, trocar tag no `.env`, mexer em `/srv/fiscal/certs`, `crontab -e` na
VPS. Tudo isso muda produção e é do dono — o runbook prepara o comando e a
evidência.

## 7. Rollback

[`deploy.md` §5](deploy.md#5-rollback-por-tag-de-imagem): sete tags no `.env`,
`up -d` com os `-f` do deployment, prova por `/api/v1/health` + `307`. Rollback de
imagem não desfaz migration — a tabela do §5.4 diz quando o caminho é `restore.sh`.
