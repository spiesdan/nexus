# Servico Python — Rota (F5: VRPTW multi-veiculo)

Servico independente (FastAPI + Google OR-Tools) que faz o otimizador de rotas
do NEXUS. Fronteira tipada via Pydantic (`app/contract.py`).

## Contrato

- `POST /rota/otimizar` com `SolverRequest` (origem + pontos + veiculos + tempo_parada_min).
- Resposta: `SolverResponse` com `veiculos: [RotaDeVeiculo]`.

## Fluxo

1. OSRM (`/matrix/v1/driving`) como fonte de distancias rodoviarias.
2. VRPTW com OR-Tools (`ortools.constraint_solver`).
3. Distribuicao de paradas por veiculo + sequencia de cada rota.

## Como rodar

```bash
python -m pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000
```
