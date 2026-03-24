--- FUNÇÃO SOBRECORRENTE

CREATE OR REPLACE FUNCTION fn_alerta_sobrecorrente()
RETURNS TRIGGER AS $$
DECLARE
    limite_corrente REAL := 40; -- ajuste conforme seu cenário
BEGIN
    IF NEW.corrente IS NOT NULL AND NEW.corrente > limite_corrente THEN
        INSERT INTO alertas (
            canal_id,
            tipo,
            nivel,
            mensagem,
            valor,
            limite,
            timestamp
        )
        VALUES (
            NEW.canal_id,
            'sobrecorrente',
            'critico',
            'Corrente acima do limite',
            NEW.corrente,
            limite_corrente,
            NEW.timestamp
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

--------------------------------------------------

TRIGGER

CREATE TRIGGER trg_sobrecorrente
AFTER INSERT ON medicoes
FOR EACH ROW
EXECUTE FUNCTION fn_alerta_sobrecorrente();

--------------------------------------------------
--- FUNÇÃO CONSUMO FORA DO HORÁRIO

CREATE OR REPLACE FUNCTION fn_alerta_fora_horario()
RETURNS TRIGGER AS $$
DECLARE
    hora INTEGER;
BEGIN
    hora := EXTRACT(HOUR FROM NEW.timestamp);

    IF NEW.corrente > 10 AND (hora < 6 OR hora >= 22) THEN
        INSERT INTO alertas (
            canal_id,
            tipo,
            nivel,
            mensagem,
            valor,
            limite,
            timestamp
        )
        VALUES (
            NEW.canal_id,
            'consumo_fora_horario',
            'aviso',
            'Consumo detectado fora do horário',
            NEW.corrente,
            10,
            NEW.timestamp
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-----------------------------------

CREATE TRIGGER trg_fora_horario
AFTER INSERT ON medicoes
FOR EACH ROW
EXECUTE FUNCTION fn_alerta_fora_horario();

----------------------------------

--- FUNÇÃO QUEDA BRUSCA (POSSÍVEL FALHA)

CREATE OR REPLACE FUNCTION fn_alerta_queda_corrente()
RETURNS TRIGGER AS $$
DECLARE
    corrente_anterior REAL;
BEGIN
    SELECT corrente INTO corrente_anterior
    FROM medicoes
    WHERE canal_id = NEW.canal_id
    ORDER BY timestamp DESC
    LIMIT 1;

    IF corrente_anterior IS NOT NULL AND NEW.corrente < corrente_anterior * 0.3 THEN
        INSERT INTO alertas (
            canal_id,
            tipo,
            nivel,
            mensagem,
            valor,
            limite,
            timestamp
        )
        VALUES (
            NEW.canal_id,
            'queda_brusca',
            'aviso',
            'Queda brusca de corrente detectada',
            NEW.corrente,
            corrente_anterior,
            NEW.timestamp
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

---------------------------------------------

CREATE TRIGGER trg_queda_corrente
AFTER INSERT ON medicoes
FOR EACH ROW
EXECUTE FUNCTION fn_alerta_queda_corrente();

