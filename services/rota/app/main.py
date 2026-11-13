"""FastAPI do servico de roteirizacao (F5) — VRPTW via Google OR-Tools."""

import os

from fastapi import FastAPI

from app.contract import SolverRequest, SolverResponse

VERSAO = os.environ.get("ROTA_VERSAO", "local")

app = FastAPI(title="Nexus Rota — VRPTW Solver", version=VERSAO)


@app.get("/healthz")
async def saude() -> dict:
    """Liveness com versao — e' o que o healthcheck do compose e o deploy leem."""
    return {"status": "ok", "versao": VERSAO}


@app.post("/rota/otimizar", response_model=SolverResponse)
async def otimizar(request: SolverRequest) -> SolverResponse:
    """Recebe pontos + veiculos e devolve distribuicao de entregas por veiculo."""
    from app import solver as _solver

    resposta = await _solver.otimizar_vrptw(request)
    return resposta
