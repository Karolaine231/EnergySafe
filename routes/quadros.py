from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional

import models
import schemas
from database import get_db

router = APIRouter(prefix="/quadros", tags=["Quadros"])


@router.get("/", response_model=List[schemas.QuadroOut])
def listar_quadros(
    local_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
):
    query = db.query(models.Quadro)
    if local_id:
        query = query.filter(models.Quadro.local_id == local_id)
    return query.order_by(models.Quadro.nome).all()


@router.get("/{quadro_id}", response_model=schemas.QuadroOut)
def obter_quadro(quadro_id: int, db: Session = Depends(get_db)):
    quadro = db.query(models.Quadro).filter(models.Quadro.id == quadro_id).first()
    if not quadro:
        raise HTTPException(status_code=404, detail="Quadro não encontrado.")
    return quadro


@router.post("/", response_model=schemas.QuadroOut, status_code=201)
def criar_quadro(quadro: schemas.QuadroCreate, db: Session = Depends(get_db)):
    local = db.query(models.Local).filter(models.Local.id == quadro.local_id).first()
    if not local:
        raise HTTPException(status_code=404, detail="Local não encontrado.")

    if quadro.quadro_pai_id:
        pai = db.query(models.Quadro).filter(models.Quadro.id == quadro.quadro_pai_id).first()
        if not pai:
            raise HTTPException(status_code=404, detail="Quadro pai não encontrado.")

    db_quadro = models.Quadro(**quadro.model_dump())
    db.add(db_quadro)
    db.commit()
    db.refresh(db_quadro)
    return db_quadro


@router.delete("/{quadro_id}", status_code=204)
def deletar_quadro(quadro_id: int, db: Session = Depends(get_db)):
    quadro = db.query(models.Quadro).filter(models.Quadro.id == quadro_id).first()
    if not quadro:
        raise HTTPException(status_code=404, detail="Quadro não encontrado.")
    db.delete(quadro)
    db.commit()