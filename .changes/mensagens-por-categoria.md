---
impacto: capacidade_nova
secao: adicionado
titulo: As três mensagens da campanha passaram a morar na categoria
---

Toda campanha nova começava com três caixas em branco. Quem dispara para
oficina mecânica toda semana reescrevia o mesmo texto — e o texto bom de uma
campanha antiga ficava preso nela, sem lugar para ver, corrigir ou reaproveitar.

Agora a Prospecção tem **Mensagens por categoria**, dentro de Configuração:
escolhe-se a categoria (oficina mecânica, restaurante, o que for) e escreve-se
até três variações. O assistente de campanha nasce preenchido com o padrão da
primeira categoria escolhida, e permite trocar para o padrão de outra categoria
selecionada — ou voltar a escrever do zero.

São dois textos diferentes de propósito: o **padrão** pertence à categoria e
muda o que toda campanha nova daquela categoria vai dizer; a **campanha** guarda
a própria cópia. Editar uma campanha não altera o padrão, e mudar o padrão não
reescreve o que já saiu. A tela diz isso em vez de deixar o operador descobrir.

Quem pode o quê: qualquer membro lê o texto; gerente ou superior salva — o
padrão decide o que a próxima campanha vai dizer. Salvar e remover ficam no log
de auditoria.

Quem já instalou precisa atualizar: a tabela nova
(`prospecting_message_presets`) entra pelo `update.sh`, e categorias sem padrão
continuam pedindo o texto à mão, como antes.
