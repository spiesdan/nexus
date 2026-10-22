# Prospecção — nova estrutura e mensagens por categoria

Capturado por `tests/capture-prospeccao-nova.ts` contra o app rodando com Supabase
local semeado (login real como `manager`, sem atalho de sessão).

| Arquivo | O que prova |
|---|---|
| `01-duas-superficies.png` | A tela abre em **duas** superfícies — Campanhas e Empresas — e as ferramentas (Encontrar empresas, Pesquisas, Mercado, Configuração) ficam ao lado, menores. O card da campanha mostra público, enviadas, faltam e responderam, com o botão Controlar. |
| `02-config-mensagens-vazio.png` | Em Configuração, a seção **Mensagens por categoria** existe e diz, com todas as letras, que nenhuma categoria foi configurada — em vez de esconder a seção. |
| `03-config-mensagens-salvas.png` | Três mensagens salvas para **Oficina mecânica**; a categoria passa a aparecer como configurada (`3`). O texto fica na categoria, não na campanha. |
| `04-assistente-com-padrao.png` | O assistente nasce **preenchido** com o padrão de Oficina mecânica (seletor "Mensagens salvas"), e avisa que editar ali não altera o padrão. É a prova de que não se reescreve o texto a cada campanha. |
| `05-empresas.png` | A segunda superfície: a lista de empresas continua sendo o lugar de consultar quem existe, sem competir com Campanhas. |

O capturador falha se qualquer tela registrar erro de console e se o passo 2 do
assistente não herdar a primeira mensagem do padrão — as duas coisas já foram
defeito durante a construção.
