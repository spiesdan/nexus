# NEXUS 2.0 — Deploy performance (medido, §84)

> Meta: deploy normal ≤ 5min; cache quente ≈ 1–3min. Não afirmar sem medir.

| Etapa | Meta | Medido | Data |
|---|---|---|---|
| CI rápido (install+typecheck+lint+unit) | 30s–2min | — | — |
| Docker cacheado (buildx GHA) | 30s–3min | — | — |
| GHCR push/pull | 10s–1min | — | — |
| VPS pull + up | 10s–1min | — | — |
| startup + health | 10s–30s | — | — |

Baseline a medir no primeiro deploy `nexus-v2` via `scripts/deploy.sh`.
