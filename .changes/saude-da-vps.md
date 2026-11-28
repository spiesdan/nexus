---
impacto: nada_mudou
secao: adicionado
titulo: Um comando diz se a instalação está saudável, o backup ganha agenda e retenção, e o update recusa deploy concorrente
---

`hostgator-setup-kit/saude.sh` lê o estado da instalação e responde em uma tela:
contêiner unhealthy ou parado, disco, RAM, swap, idade do último backup do banco,
se existe backup agendado, validade do certificado fiscal A1 (e `.pfx` truncado),
versão em execução contra a última release publicada, HTTP e validade do TLS.

Ele é **somente leitura**: não sobe, não reinicia, não escreve arquivo e não toca
no `.env`. Sai com 0 (tudo ok), 1 (alerta) ou 2 (não deu para inspecionar), o que
permite usá-lo numa rotina que só avisa quando há anomalia. `--json` para
máquina, `--quiet` para silêncio quando está tudo bem.

O runbook `docs/runbooks/operacao-vps.md` traz o baseline medido da instalação de
produção, os limites de cada sinal e as lacunas que ainda não têm monitoramento —
a principal é que o `backup.sh` só roda dentro do `update.sh`, então uma semana
sem deploy é uma semana sem backup.

O `docs/runbooks/deploy.md` ganhou a seção de rollback por tag de imagem, que não
existia: as sete tags no `.env`, os `-f` certos para cada tipo de instalação, a
prova e o limite (rollback de imagem não desfaz migration).

O `backup.sh` passou a aceitar `BACKUP_RETENTION` (padrão 14, o que já existia):
quem emite nota fiscal escolhe guardar 30 dias sem editar o script, e o teste
prova que `BACKUP_RETENTION=3` mantém 3 arquivos, não 14.

O `update.sh` ganhou o lock que a política citava e nenhum script aplicava:
`flock` em `.git/nexus-update.lock` (na raiz em instalação sem git), adquirido
antes de qualquer efeito. Dois deploys ao mesmo tempo agora terminam com o
segundo recusado em vez de recriar o parque em paralelo. O arquivo fica dentro de
`.git/` porque um `.update.lock` não rastreado na raiz faz o próprio
`git checkout` do update abortar.

O `deploy.md` deixou de tratar o Traefik da hospedagem como padrão de toda VPS:
os dois caminhos (Caddy do compose × proxy do host) aparecem com o comando, a
verificação e o significado do 404 de cada um — passar os dois `-f` numa
instalação com Caddy aborta o `up`, e esquecer o override numa com Traefik
derruba o domínio em 404. O `saude.sh` segue a mesma régua: o alerta de borda
nomeia o proxy que a instalação realmente usa.
