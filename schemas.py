from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime


# ──────────────────────────────────────────
# LOCAL
# ──────────────────────────────────────────

class LocalBase(BaseModel):
    nome: str
    andar: Optional[int] = None
    descricao: Optional[str] = None

class LocalCreate(LocalBase):
    pass

class LocalOut(LocalBase):
    id: int
    class Config:
        from_attributes = True


# ──────────────────────────────────────────
# QUADRO
# ──────────────────────────────────────────

class QuadroBase(BaseModel):
    nome: str
    local_id: Optional[int] = None
    quadro_pai_id: Optional[int] = None
    descricao: Optional[str] = None

class QuadroCreate(QuadroBase):
    pass

class QuadroOut(QuadroBase):
    id: int
    class Config:
        from_attributes = True


# ──────────────────────────────────────────
# DISPOSITIVO
# ──────────────────────────────────────────

class DispositivoBase(BaseModel):
    nome: str
    quadro_id: Optional[int] = None
    ativo: bool = True
    data_instalacao: Optional[datetime] = None
    observacoes: Optional[str] = None

class DispositivoCreate(DispositivoBase):
    pass

class DispositivoOut(DispositivoBase):
    id: int
    class Config:
        from_attributes = True


# ──────────────────────────────────────────
# CANAL DE MEDIÇÃO
# ──────────────────────────────────────────

class CanalMedicaoBase(BaseModel):
    dispositivo_id: Optional[int] = None
    fase: Optional[str] = Field(None, max_length=1)   # A, B ou C
    tipo: Optional[str] = None                         # corrente, tensao
    descricao: Optional[str] = None

class CanalMedicaoCreate(CanalMedicaoBase):
    pass

class CanalMedicaoOut(CanalMedicaoBase):
    id: int
    class Config:
        from_attributes = True


# ──────────────────────────────────────────
# MEDIÇÃO
# ──────────────────────────────────────────

class MedicaoBase(BaseModel):
    timestamp: datetime
    canal_id: Optional[int] = None
    corrente: Optional[float] = None
    tensao: Optional[float] = None
    potencia: Optional[float] = None   # calculada opcionalmente
    valido: bool = True

class MedicaoCreate(MedicaoBase):
    pass

class MedicaoOut(MedicaoBase):
    id: int
    criado_em: Optional[datetime] = None
    class Config:
        from_attributes = True


# ──────────────────────────────────────────
# ALERTA
# ──────────────────────────────────────────
# Alertas são gerados automaticamente pelos triggers do PostgreSQL.
# O backend apenas lê e atualiza (resolver).

class AlertaOut(BaseModel):
    id: int
    canal_id: Optional[int] = None
    tipo: Optional[str] = None      # sobrecorrente, consumo_fora_horario, queda_brusca
    nivel: Optional[str] = None     # info, aviso, critico
    mensagem: Optional[str] = None
    valor: Optional[float] = None
    limite: Optional[float] = None
    timestamp: datetime
    resolvido: bool
    criado_em: Optional[datetime] = None
    class Config:
        from_attributes = True

class AlertaCreate(BaseModel):
    canal_id: int
    tipo: str
    nivel: str
    mensagem: Optional[str] = None
    valor: Optional[float] = None
    limite: Optional[float] = None
    timestamp: datetime