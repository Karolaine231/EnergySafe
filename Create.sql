-- =================================================================
--  EnergySafe — Criação completa do banco
-- =================================================================


-- ═════════════════════════════════════════════════════════════════
--  BLOCO 1 — ESTRUTURA FÍSICA
--  locais → areas → quadros → dispositivos → canais_medicao
-- ═════════════════════════════════════════════════════════════════

CREATE TABLE locais (
    id        SERIAL PRIMARY KEY,
    nome      TEXT    NOT NULL,   -- Ex: Prédio ADM
    andar     INTEGER,            -- 1, 2, 3
    descricao TEXT
);

CREATE TABLE areas (
    id        SERIAL PRIMARY KEY,
    nome      TEXT    NOT NULL,   -- Ex: Ala Cirúrgica, Administrativo
    local_id  INTEGER REFERENCES locais(id),
    descricao TEXT
);

CREATE TABLE quadros (
    id            SERIAL PRIMARY KEY,
    nome          TEXT    NOT NULL,   -- Ex: QD-ADM-3
    local_id      INTEGER REFERENCES locais(id),
    area_id       INTEGER REFERENCES areas(id),
    quadro_pai_id INTEGER REFERENCES quadros(id) ON DELETE SET NULL,
    descricao     TEXT
);

CREATE TABLE dispositivos (
    id              SERIAL PRIMARY KEY,
    nome            TEXT      NOT NULL,   -- Ex: ESP32_QD3
    quadro_id       INTEGER   REFERENCES quadros(id),
    ativo           BOOLEAN   DEFAULT TRUE,
    data_instalacao TIMESTAMP,
    observacoes     TEXT
);

CREATE TABLE canais_medicao (
    id             SERIAL PRIMARY KEY,
    dispositivo_id INTEGER REFERENCES dispositivos(id),
    fase           TEXT CHECK (fase IN ('A','B','C')),
    tipo           TEXT,         -- corrente, tensao
    descricao      TEXT
);


-- ═════════════════════════════════════════════════════════════════
--  BLOCO 2 — MEDIÇÕES E ALERTAS
--  Dados enviados pelo ESP32 via POST /medicoes
--  Alertas gerados pelo backend Python após cada inserção
-- ═════════════════════════════════════════════════════════════════

CREATE TABLE medicoes (
    id        BIGSERIAL PRIMARY KEY,
    timestamp TIMESTAMP NOT NULL,
    canal_id  INTEGER   REFERENCES canais_medicao(id),
    corrente  REAL,
    tensao    REAL,
    potencia  REAL,               -- calculada pelo backend se omitida (P = I × V)
    valido    BOOLEAN   DEFAULT TRUE,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_medicoes_timestamp ON medicoes(timestamp);
CREATE INDEX idx_medicoes_canal     ON medicoes(canal_id);

CREATE TABLE alertas (
    id        SERIAL PRIMARY KEY,
    canal_id  INTEGER   REFERENCES canais_medicao(id),
    tipo      TEXT,               -- sobrecorrente | consumo_fora_horario | queda_brusca
    nivel     TEXT,               -- info | aviso | critico
    mensagem  TEXT,
    valor     REAL,               -- valor medido que violou a regra
    limite    REAL,               -- limite configurado
    timestamp TIMESTAMP NOT NULL,
    resolvido BOOLEAN   DEFAULT FALSE,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_alertas_timestamp ON alertas(timestamp);


-- ═════════════════════════════════════════════════════════════════
--  BLOCO 3 — CONSUMO E RATEIO FINANCEIRO
--  consumo_diario → faturas → rateio
-- ═════════════════════════════════════════════════════════════════

-- kWh acumulado por canal por dia
-- Calculado pelo backend com job noturno:
--   kWh = SOMA(potencia_i × Δt_i) / 1000
--   onde Δt_i = intervalo em horas entre leituras consecutivas
CREATE TABLE consumo_diario (
    id        BIGSERIAL PRIMARY KEY,
    canal_id  INTEGER REFERENCES canais_medicao(id),
    data      DATE    NOT NULL,
    kwh       REAL    NOT NULL,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (canal_id, data)
);

CREATE INDEX idx_consumo_diario_data ON consumo_diario(canal_id, data);

-- Fatura mensal real da concessionária por local
-- R$ área = (kWh área / kWh total medido) × valor_total
CREATE TABLE faturas (
    id          SERIAL PRIMARY KEY,
    local_id    INTEGER REFERENCES locais(id),
    mes         DATE    NOT NULL,   -- primeiro dia do mês: ex: 2026-04-01
    valor_total REAL    NOT NULL,   -- R$ total da fatura
    kwh_total   REAL,              -- kWh da fatura (para conferência com o medido)
    descricao   TEXT,
    criado_em   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (local_id, mes)
);

-- Resultado do rateio por área (gerado pelo backend ao cadastrar fatura)
CREATE TABLE rateio (
    id         BIGSERIAL PRIMARY KEY,
    fatura_id  INTEGER REFERENCES faturas(id),
    area_id    INTEGER REFERENCES areas(id),
    kwh        REAL NOT NULL,
    percentual REAL NOT NULL,
    valor_rs   REAL NOT NULL,
    gerado_em  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (fatura_id, area_id)
);


-- ═════════════════════════════════════════════════════════════════
--  BLOCO 4 — APOIO OPERACIONAL
--  tarifas | metas | dispositivos_status
-- ═════════════════════════════════════════════════════════════════

-- Tarifa R$/kWh por local — usada para estimativas antes da fatura chegar
CREATE TABLE tarifas (
    id        SERIAL PRIMARY KEY,
    local_id  INTEGER REFERENCES locais(id),
    valor_kwh REAL    NOT NULL,
    vigencia  DATE    NOT NULL,   -- data de início da vigência
    descricao TEXT,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (local_id, vigencia)
);

CREATE INDEX idx_tarifas_local ON tarifas(local_id, vigencia);

-- Metas de redução de consumo por local ou quadro
CREATE TABLE metas (
    id           SERIAL PRIMARY KEY,
    local_id     INTEGER REFERENCES locais(id),
    quadro_id    INTEGER REFERENCES quadros(id),
    descricao    TEXT,
    kwh_baseline REAL NOT NULL,   -- consumo de referência (antes da ação)
    kwh_meta     REAL NOT NULL,   -- consumo alvo
    data_inicio  DATE NOT NULL,
    data_fim     DATE,
    criado_em    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Status operacional dos dispositivos (atualizado pelo backend a cada medição)
-- UNIQUE por dispositivo_id: é um upsert, não append
CREATE TABLE dispositivos_status (
    id             SERIAL PRIMARY KEY,
    dispositivo_id INTEGER REFERENCES dispositivos(id),
    status         TEXT CHECK (status IN ('ONLINE', 'ATRASO', 'OFFLINE')),
    ultima_leitura TIMESTAMP,
    potencia_atual REAL,
    atualizado_em  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (dispositivo_id)
);
