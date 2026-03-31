from sqlalchemy import (
    Column, Integer, BigInteger, String, Float, Boolean,
    DateTime, ForeignKey, Text, Index, CheckConstraint
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base


class Local(Base):
    __tablename__ = "locais"

    id        = Column(Integer, primary_key=True, index=True)
    nome      = Column(Text, nullable=False)
    andar     = Column(Integer, nullable=True)
    descricao = Column(Text, nullable=True)

    quadros = relationship("Quadro", back_populates="local")


class Quadro(Base):
    __tablename__ = "quadros"

    id            = Column(Integer, primary_key=True, index=True)
    nome          = Column(Text, nullable=False)
    local_id      = Column(Integer, ForeignKey("locais.id"), nullable=True)
    quadro_pai_id = Column(Integer, ForeignKey("quadros.id"), nullable=True)
    descricao     = Column(Text, nullable=True)

    local        = relationship("Local", back_populates="quadros")
    quadro_pai   = relationship("Quadro", remote_side=[id], backref="sub_quadros")
    dispositivos = relationship("Dispositivo", back_populates="quadro")


class Dispositivo(Base):
    __tablename__ = "dispositivos"

    id              = Column(Integer, primary_key=True, index=True)
    nome            = Column(Text, nullable=False)
    quadro_id       = Column(Integer, ForeignKey("quadros.id"), nullable=True)
    ativo           = Column(Boolean, default=True)
    data_instalacao = Column(DateTime, nullable=True)
    observacoes     = Column(Text, nullable=True)

    quadro = relationship("Quadro", back_populates="dispositivos")
    canais = relationship("CanalMedicao", back_populates="dispositivo")


class CanalMedicao(Base):
    __tablename__ = "canais_medicao"

    id             = Column(Integer, primary_key=True, index=True)
    dispositivo_id = Column(Integer, ForeignKey("dispositivos.id"), nullable=True)
    fase           = Column(String(1), nullable=True)
    tipo           = Column(Text, nullable=True)
    descricao      = Column(Text, nullable=True)

    __table_args__ = (
        CheckConstraint("fase IN ('A','B','C')", name="ck_canal_fase"),
    )

    dispositivo = relationship("Dispositivo", back_populates="canais")
    medicoes    = relationship("Medicao", back_populates="canal")
    alertas     = relationship("Alerta", back_populates="canal")


class Medicao(Base):
    __tablename__ = "medicoes"

    id        = Column(BigInteger, primary_key=True, index=True)
    timestamp = Column(DateTime, nullable=False)
    canal_id  = Column(Integer, ForeignKey("canais_medicao.id"), nullable=True)
    corrente  = Column(Float, nullable=True)
    tensao    = Column(Float, nullable=True)
    potencia  = Column(Float, nullable=True)
    valido    = Column(Boolean, default=True)
    criado_em = Column(DateTime, server_default=func.now())

    canal = relationship("CanalMedicao", back_populates="medicoes")

    __table_args__ = (
        Index("idx_medicoes_timestamp", "timestamp"),
        Index("idx_medicoes_canal",     "canal_id"),
    )


class Alerta(Base):
    __tablename__ = "alertas"

    id        = Column(Integer, primary_key=True, index=True)
    canal_id  = Column(Integer, ForeignKey("canais_medicao.id"), nullable=True)
    tipo      = Column(Text, nullable=True)
    nivel     = Column(Text, nullable=True)
    mensagem  = Column(Text, nullable=True)
    valor     = Column(Float, nullable=True)
    limite    = Column(Float, nullable=True)
    timestamp = Column(DateTime, nullable=False)
    resolvido = Column(Boolean, default=False)
    criado_em = Column(DateTime, server_default=func.now())

    canal = relationship("CanalMedicao", back_populates="alertas")

    __table_args__ = (
        Index("idx_alertas_timestamp", "timestamp"),
    )