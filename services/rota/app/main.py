"""FastAPI do servico de roteirizacao (F5) — VRPTW via Google OR-Tools."""

from fastapi import FastAPI

from app.contract import SolverRequest, SolverResponse

app = FastAPI(title="Nexus Rota — VRPTW Solver", version="0.1.0")


@app.post("/rota/otimizar", response_model=SolverResponse)
async def otimizar(request: SolverRequest) -> SolverResponse:
    """Recebe pontos + veiculos e devolve distribuicao de entregas por veiculo."""
    from app import solver as _solver

    resposta = await _solver.otimizar_vrptw(request)
    return resposta
