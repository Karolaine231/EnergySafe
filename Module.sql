CREATE TABLE locais (
    id SERIAL PRIMARY KEY,
    nome TEXT NOT NULL,        -- Ex: Prédio ADM
    andar INTEGER,             -- 1, 2, 3
    descricao TEXT
);
---------------------
CREATE TABLE quadros (
    id SERIAL PRIMARY KEY,
    nome TEXT NOT NULL,            -- Ex: QD-ADM-3
    local_id INTEGER REFERENCES locais(id),
    quadro_pai_id INTEGER,         -- relação em cascata
    descricao TEXT
);
----------------------
CREATE TABLE dispositivos (
    id SERIAL PRIMARY KEY,
    nome TEXT NOT NULL,            -- Ex: ESP32_QD3
    quadro_id INTEGER REFERENCES quadros(id),
    ativo BOOLEAN DEFAULT TRUE,
    data_instalacao TIMESTAMP,
    observacoes TEXT
);
----------------------------
CREATE TABLE canais_medicao (
    id SERIAL PRIMARY KEY,
    dispositivo_id INTEGER REFERENCES dispositivos(id),
    fase TEXT CHECK (fase IN ('A','B','C')),
    tipo TEXT,                     -- corrente, tensao
    descricao TEXT
);
----------------------------
CREATE TABLE medicoes (
    id BIGSERIAL PRIMARY KEY,
    
    timestamp TIMESTAMP NOT NULL,
    
    canal_id INTEGER REFERENCES canais_medicao(id),
    
    corrente REAL,
    tensao REAL,
    potencia REAL,                 -- opcional (calculada)
    
    valido BOOLEAN DEFAULT TRUE,
    
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
------------------------------
CREATE TABLE alertas (
    id SERIAL PRIMARY KEY,
    
    canal_id INTEGER REFERENCES canais_medicao(id),
    
    tipo TEXT,                    -- sobrecorrente, anomalia, etc
    nivel TEXT,                   -- info, aviso, critico
    
    mensagem TEXT,
    
    valor REAL,                   -- valor medido
    limite REAL,                  -- limite configurado
    
    timestamp TIMESTAMP NOT NULL,
    
    resolvido BOOLEAN DEFAULT FALSE,
    
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
---------------------- INDICES PARA PERFORMANCE -------------------------
CREATE INDEX idx_medicoes_timestamp ON medicoes(timestamp);
CREATE INDEX idx_medicoes_canal ON medicoes(canal_id);

CREATE INDEX idx_alertas_timestamp ON alertas(timestamp);

