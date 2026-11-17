---
impacto: nada_mudou
secao: corrigido
titulo: Administrador de plataforma não pula a verificação em duas etapas, e o botão Sair funciona
---
Dois problemas de acesso:

- Um administrador de plataforma com verificação em duas etapas cadastrada
  conseguia usar as rotas administrativas numa sessão que só tinha a senha. O
  atalho de permissão retornava antes da checagem do segundo fator. Agora ele
  pula apenas a hierarquia da organização — que é o que o atalho existe para
  fazer — e cobra o código como qualquer outro administrador.
- O botão **Sair** (na cabine do entregador e no aceite de convite) apontava para
  um endereço que não existia, e respondia "não encontrado". Agora encerra a
  sessão, limpa a organização ativa e volta para o login.

Também: administradores de plataforma com acesso **somente leitura** passam a ser
somente leitura de verdade (antes podiam suspender, criar e impersonar), e um
tenant suspenso não pode ser impersonado sem ser reativado com motivo.
