# ⚡ EnergySafe — Banco de Dados

Documentação completa do banco PostgreSQL do sistema EnergySafe.  
O banco é executado via Docker localmente e hospedado no **Render** em produção.

---

##  Conexão

| Ambiente | Detalhes |
|---|---|
| Local (Docker) | `postgresql://postgres:******@localhost:5432/energysafe` |
| Produção (Render) | Variável de ambiente `DATABASE_URL` no serviço BackendSafe |

---

##  Executando localmente

```bash
docker-compose up -d
```

```yaml
# docker-compose.yml
services:
  postgres:
    image: postgres:15
    container_name: energysafe_postgres
    environment:
      POSTGRES_USER: *******
      POSTGRES_PASSWORD: *******
      POSTGRES_DB: ********
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    restart: always
```

Para verificar se o container está rodando:

```bash
docker ps
```

Para acessar o banco via CLI:

```bash
docker exec -it energysafe_postgres psql -U postgres -d energysafe
```

---

##  Hierarquia do Modelo

```
locais
  └── quadros  (local_id → locais.id)
        └── dispositivos  (quadro_id → quadros.id)
              └── canais_medicao  (dispositivo_id → dispositivos.id)
                    ├── medicoes  (canal_id → canais_medicao.id)
                    └── alertas   (canal_id → canais_medicao.id)
```

---

##  Tabelas

### `locais`
Representa ambientes físicos monitorados.

| Coluna | Tipo | Descrição |
|---|---|---|
| id | SERIAL PK | Identificador |
| nome | TEXT | Ex: Prédio ADM |
| andar | INTEGER | Número do andar |
| descricao | TEXT | Descrição livre |

---

### `quadros`
Painéis elétricos, com suporte a hierarquia (quadro pai/filho).

| Coluna | Tipo | Descrição |
|---|---|---|
| id | SERIAL PK | Identificador |
| nome | TEXT | Ex: QD-ADM-3 |
| local_id | FK → locais | Local onde está instalado |
| quadro_pai_id | FK → quadros | Quadro de nível superior (nullable) |
| descricao | TEXT | Descrição livre |

---

### `dispositivos`
Hardware de medição instalado nos quadros (ex: ESP32).

| Coluna | Tipo | Descrição |
|---|---|---|
| id | SERIAL PK | Identificador |
| nome | TEXT | Ex: ESP32_QD3 |
| quadro_id | FK → quadros | Quadro onde está instalado |
| ativo | BOOLEAN | Se está em operação |
| data_instalacao | TIMESTAMP | Data de instalação |
| observacoes | TEXT | Notas técnicas |

---

### `canais_medicao`
Sensores por fase elétrica dentro de cada dispositivo.

| Coluna | Tipo | Descrição |
|---|---|---|
| id | SERIAL PK | Identificador |
| dispositivo_id | FK → dispositivos | Dispositivo pai |
| fase | TEXT | A, B ou C (CHECK constraint) |
| tipo | TEXT | corrente, tensao |
| descricao | TEXT | Ex: ADM1 Fase A |

---

### `medicoes`
Leituras enviadas pelos dispositivos ESP32 via `POST /medicoes`.

| Coluna | Tipo | Descrição |
|---|---|---|
| id | BIGSERIAL PK | Identificador (alto volume) |
| timestamp | TIMESTAMP | Momento da leitura |
| canal_id | FK → canais_medicao | Canal que gerou a leitura |
| corrente | REAL | Corrente elétrica (A) |
| tensao | REAL | Tensão elétrica (V) |
| potencia | REAL | Potência calculada (W) — P = I × V |
| valido | BOOLEAN | Se a leitura é válida |
| criado_em | TIMESTAMP | Momento de inserção no banco |

**Índices:**
```sql
CREATE INDEX idx_medicoes_timestamp ON medicoes(timestamp);
CREATE INDEX idx_medicoes_canal     ON medicoes(canal_id);
```

---

### `alertas`
Eventos gerados automaticamente pelo backend após cada medição.

| Coluna | Tipo | Descrição |
|---|---|---|
| id | SERIAL PK | Identificador |
| canal_id | FK → canais_medicao | Canal que gerou o alerta |
| tipo | TEXT | `sobrecorrente` \| `consumo_fora_horario` \| `queda_brusca` |
| nivel | TEXT | `info` \| `aviso` \| `critico` |
| mensagem | TEXT | Descrição do alerta |
| valor | REAL | Valor medido que violou a regra |
| limite | REAL | Limite configurado |
| timestamp | TIMESTAMP | Momento do evento |
| resolvido | BOOLEAN | Se foi tratado |
| criado_em | TIMESTAMP | Momento de inserção |

**Índice:**
```sql
CREATE INDEX idx_alertas_timestamp ON alertas(timestamp);
```

---

##  Regras de Alerta

Os alertas são gerados pelo backend Python (sem triggers no banco) após cada `POST /medicoes`.

| Tipo | Nível | Condição |
|---|---|---|
| `sobrecorrente` | `critico` | `corrente > 40A` |
| `consumo_fora_horario` | `aviso` | `corrente > 10A` e hora entre 22h–6h |
| `queda_brusca` | `aviso` | Corrente caiu abaixo de 30% da leitura anterior |

---

##  Queries úteis

**Pico de corrente por canal:**
```sql
SELECT canal_id, MAX(corrente) AS pico
FROM medicoes
GROUP BY canal_id
ORDER BY pico DESC;
```

**Alertas ativos (não resolvidos), por prioridade:**
```sql
SELECT timestamp, tipo, nivel, canal_id, mensagem
FROM alertas
WHERE resolvido = FALSE
ORDER BY
    CASE nivel WHEN 'critico' THEN 1 WHEN 'aviso' THEN 2 ELSE 3 END,
    timestamp DESC;
```

**Corrente média por quadro:**
```sql
SELECT q.nome, ROUND(AVG(m.corrente)::NUMERIC, 2) AS corrente_media
FROM medicoes m
JOIN canais_medicao c ON m.canal_id = c.id
JOIN dispositivos d   ON c.dispositivo_id = d.id
JOIN quadros q        ON d.quadro_id = q.id
GROUP BY q.nome
ORDER BY corrente_media DESC;
```

**Dispositivos sem leitura há mais de 60 minutos:**
```sql
SELECT d.nome, MAX(m.timestamp) AS ultima_leitura
FROM medicoes m
JOIN canais_medicao c ON m.canal_id = c.id
JOIN dispositivos d   ON c.dispositivo_id = d.id
GROUP BY d.nome
HAVING MAX(m.timestamp) < NOW() - INTERVAL '60 minutes'
ORDER BY ultima_leitura;
```

---

## 📄 Licença

Projeto acadêmico — Safe Energy • EnergySafe Database
