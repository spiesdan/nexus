---
impacto: nada_mudou
secao: corrigido
titulo: A tela parou de negar o certificado que estava no servidor
---

Depois de o certificado passar a ser enviado de verdade, a tela continuava
avisando que não havia certificado — mesmo com o arquivo gravado no servidor e
o envio confirmado.

O motivo era a tela e a consulta usarem cada uma a sua conferência, e só a
consulta ter sido atualizada. A tela de Notas lê a configuração direto do banco,
sem passar pela rota, e por isso recebia a resposta incompleta.

A conferência agora é feita em um único lugar, usado pelas duas. Um teste
verifica que ela está nesse lugar único, porque duas cópias de uma regra é como
elas divergem sem ninguém perceber — foi o que aconteceu aqui, e o que já tinha
acontecido antes com o caminho do certificado, escrito à mão em três arquivos.

Cada empresa tem a sua pasta: em uma instalação com mais de uma empresa
cadastrada, uma não sobrescreve o certificado da outra.
