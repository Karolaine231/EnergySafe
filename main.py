from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from database import engine
import models
from routes import medicoes, alertas, locais, quadros, dispositivos, canais

@asynccontextmanager
async def lifespan(app: FastAPI):
    models.Base.metadata.create_all(bind=engine)
    yield

app = FastAPI(
    title="EnergySafe API",
    description="API para monitoramento energético: Local → Quadro → Dispositivo → Canal → Medição → Alerta",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://energy-safe.vercel.app",        # ← seu site principal
        "https://energy-safe-9m2q.vercel.app",   # ← domínio alternativo Vercel
        "http://localhost:5500",                  # ← teste local VS Code
        "http://127.0.0.1:5500",
        "http://localhost:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(locais.router)
app.include_router(quadros.router)
app.include_router(dispositivos.router)
app.include_router(canais.router)
app.include_router(medicoes.router)
app.include_router(alertas.router)

@app.get("/", tags=["Health"])
def health_check():
    return {"status": "ok", "service": "EnergySafe API"}
