# ⚡ EnergySafe — Backend API

API REST para monitoramento energético em tempo real, desenvolvida com **FastAPI** e **PostgreSQL**.  
Gerencia a hierarquia completa de ativos elétricos e processa alertas automáticos por medição.

```
LOCAL → QUADRO → DISPOSITIVO → CANAL → MEDIÇÃO → ALERTA
```

---

##  Deploy

| Ambiente | URL |
|---|---|
| Produção | https://backendsafe.onrender.com |
| Documentação interativa | https://backendsafe.onrender.com/docs |

---

##  Stack

| Camada | Tecnologia |
|---|---|
| Framework | FastAPI |
| ORM | SQLAlchemy |
| Validação | Pydantic v2 |
| Banco de dados | PostgreSQL 15 |
| Servidor | Uvicorn |
| Containerização local | Docker |
| Deploy | Render |

---

##  Estrutura do Projeto

```
BackendSafe/
│
├── routes/
│   ├── __init__.py
│   ├── locais.py
│   ├── quadros.py
│   ├── dispositivos.py
│   ├── canais.py
│   ├── medicoes.py       # inclui lógica de alertas automáticos
│   └── alertas.py
│
├── database.py           # conexão com PostgreSQL
├── models.py             # modelos ORM (SQLAlchemy)
├── schemas.py            # validação de entrada/saída (Pydantic)
├── main.py               # inicialização da API e CORS
├── requirements.txt
└── README.md
```

---

##  Modelagem do Banco

```sql
locais         → nome, andar
quadros        → local_id, quadro_pai_id (hierárquico)
dispositivos   → quadro_id, ativo
canais_medicao → dispositivo_id, fase (A/B/C), tipo
medicoes       → canal_id, corrente, tensao, potencia, timestamp
alertas        → canal_id, tipo, nivel, valor, limite, timestamp
```

**Índices de performance:**
- `idx_medicoes_timestamp`
- `idx_medicoes_canal`
- `idx_alertas_timestamp`

---

##  Desenvolvimento local

> A API já está em produção no Render. O ambiente local é usado apenas para desenvolvimento e testes antes do push.

### Pré-requisitos

- Python 3.10+
- Docker Desktop

### 1. Clone o repositório

```bash
git clone https://github.com/Julyxdias/BackendSafe.git
cd BackendSafe
git checkout Julyxdias-Backend-API
```

### 2. Crie o ambiente virtual

```bash
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # Linux/Mac
```

### 3. Instale as dependências

```bash
pip install -r requirements.txt
```

### 4. Suba o banco local com Docker

```bash
docker-compose up -d
```

### 5. Inicie a API

```bash
uvicorn main:app --reload
```

API local disponível em: `http://localhost:8000`  
Swagger local em: `http://localhost:8000/docs`

> Qualquer `git push` na branch `Julyxdias-Backend-API` dispara o redeploy automático no Render.

---

##  Variáveis de Ambiente

| Variável | Descrição | Padrão local |
|---|---|---|
| `DATABASE_URL` | URL de conexão com o PostgreSQL | `postgresql://postgres:****@localhost:5432/energysafe` |

Em produção (Render), configure `DATABASE_URL` nas variáveis de ambiente do serviço.

---

##  Endpoints

### Locais
| Método | Rota | Descrição |
|---|---|---|
| GET | `/locais` | Lista todos os locais |
| GET | `/locais/{id}` | Retorna um local |
| POST | `/locais` | Cria um local |
| DELETE | `/locais/{id}` | Remove um local |

### Quadros
| Método | Rota | Descrição |
|---|---|---|
| GET | `/quadros?local_id=` | Lista quadros (filtrável por local) |
| GET | `/quadros/{id}` | Retorna um quadro |
| POST | `/quadros` | Cria um quadro |
| DELETE | `/quadros/{id}` | Remove um quadro |

### Dispositivos
| Método | Rota | Descrição |
|---|---|---|
| GET | `/dispositivos?quadro_id=` | Lista dispositivos (filtrável por quadro) |
| GET | `/dispositivos/{id}` | Retorna um dispositivo |
| POST | `/dispositivos` | Cria um dispositivo |
| PATCH | `/dispositivos/{id}/status` | Ativa/desativa um dispositivo |
| DELETE | `/dispositivos/{id}` | Remove um dispositivo |

### Canais de Medição
| Método | Rota | Descrição |
|---|---|---|
| GET | `/canais?quadro_id=&dispositivo_id=` | Lista canais (filtrável) |
| GET | `/canais/{id}` | Retorna um canal |
| POST | `/canais` | Cria um canal |
| DELETE | `/canais/{id}` | Remove um canal |

### Medições
| Método | Rota | Descrição |
|---|---|---|
| GET | `/medicoes?canal_id=&inicio=&fim=&valido=` | Lista medições com filtros |
| GET | `/medicoes/{id}` | Retorna uma medição |
| POST | `/medicoes` | Insere medição + dispara verificação de alertas |
| DELETE | `/medicoes/{id}` | Remove uma medição |

### Alertas
| Método | Rota | Descrição |
|---|---|---|
| GET | `/alertas?canal_id=&nivel=&tipo=&resolvido=` | Lista alertas com filtros |
| GET | `/alertas/{id}` | Retorna um alerta |
| POST | `/alertas` | Cria alerta manual |
| PATCH | `/alertas/{id}/resolver` | Marca alerta como resolvido |
| DELETE | `/alertas/{id}` | Remove um alerta |

---

##  Sistema de Alertas

Os alertas são gerados automaticamente pelo backend após cada `POST /medicoes`, sem necessidade de triggers no banco.

| Tipo | Nível | Condição |
|---|---|---|
| `sobrecorrente` | `critico` | Corrente > 40A |
| `consumo_fora_horario` | `aviso` | Corrente > 10A entre 22h e 6h |
| `queda_brusca` | `aviso` | Corrente caiu abaixo de 30% da leitura anterior |

Os limites são configuráveis no topo de `routes/medicoes.py`:

```python
LIMITE_SOBRECORRENTE = 40.0
LIMITE_FORA_HORARIO  = 10.0
HORA_INICIO          = 6
HORA_FIM             = 22
QUEDA_FATOR          = 0.3
```

---

##  Fluxo de dados (produção)

```
ESP32 (hardware)
    ↓  POST /medicoes
Render — API FastAPI
    ↓  verifica alertas
Render — PostgreSQL
    ↑  GET /alertas, GET /medicoes
Vercel — Frontend (Safe Energy)
```

---

##  Licença

Projeto acadêmico — Safe Energy • EnergySafe API
