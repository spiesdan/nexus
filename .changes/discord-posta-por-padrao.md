---
impacto: nada_mudou
secao: corrigido
titulo: Tag publicada volta a postar no Discord (o dry-run virou padrão por engano)
---

A `v2.0.4` subiu sem post. O disparo manual usa `inputs.postar`, que é **vazio** quando o gatilho é a tag — e `${POSTAR:-nao}` caía no modo de diagnóstico. O default passou a ser `sim`, e só o disparo manual escolhe `nao`. É o terceiro modo de falha do mesmo aviso: sem gatilho (1.72.1/2.0.0), delimitador errado (2.0.2), `403` do `urllib` (2.0.3) e default errado (2.0.4) — cada um deixou o canal sem a versão.
