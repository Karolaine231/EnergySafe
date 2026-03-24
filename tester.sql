INSERT INTO locais (nome, andar) VALUES
('Prédio ADM', 1),
('Prédio ADM', 2),
('Prédio ADM', 3);

INSERT INTO quadros (nome, local_id, quadro_pai_id) VALUES
('QD-ADM-3', 3, NULL),
('QD-ADM-2', 2, 1),
('QD-ADM-1', 1, 2);

INSERT INTO dispositivos (nome, quadro_id) VALUES
('ESP32_QD3', 1),
('ESP32_QD2', 2),
('ESP32_QD1', 3);

INSERT INTO canais_medicao (dispositivo_id, fase, tipo) VALUES
(1, 'A', 'corrente'), (1, 'B', 'corrente'), (1, 'C', 'corrente'),
(2, 'A', 'corrente'), (2, 'B', 'corrente'), (2, 'C', 'corrente'),
(3, 'A', 'corrente'), (3, 'B', 'corrente'), (3, 'C', 'corrente');



INSERT INTO medicoes (timestamp, canal_id, corrente, tensao)
VALUES
('2026-04-01 08:00:00', 1, 20, 127),
('2026-04-01 08:00:00', 4, 15, 127),
('2026-04-01 08:00:00', 7, 10, 127);

INSERT INTO medicoes (timestamp, canal_id, corrente, tensao)
VALUES
('2026-04-01 12:00:00', 1, 35, 127),
('2026-04-01 12:00:00', 4, 28, 127),
('2026-04-01 12:00:00', 7, 22, 127);

INSERT INTO medicoes (timestamp, canal_id, corrente, tensao)
VALUES
('2026-04-01 17:00:00', 1, 30, 127),
('2026-04-01 17:00:00', 4, 25, 127),
('2026-04-01 17:00:00', 7, 18, 127);

INSERT INTO medicoes (timestamp, canal_id, corrente, tensao)
VALUES
('2026-04-01 22:30:00', 1, 18, 127),
('2026-04-01 22:30:00', 4, 12, 127),
('2026-04-01 22:30:00', 7, 8, 127);


INSERT INTO medicoes (timestamp, canal_id, corrente, tensao)
VALUES
('2026-04-02 13:00:00', 1, 60, 127);

INSERT INTO medicoes (timestamp, canal_id, corrente, tensao)
VALUES
('2026-04-02 02:30:00', 1, 22, 127);

INSERT INTO medicoes (timestamp, canal_id, corrente, tensao)
VALUES
('2026-04-02 14:00:00', 3, 45, 127);

INSERT INTO alertas (canal_id, tipo, nivel, mensagem, valor, limite, timestamp)
VALUES
(1, 'sobrecorrente', 'critico', 'Corrente acima do limite', 60, 40, '2026-04-02 13:00:00'),

(1, 'consumo_fora_horario', 'aviso', 'Consumo detectado de madrugada', 22, 10, '2026-04-02 02:30:00');

------------

SELECT MAX(corrente) AS pico FROM medicoes;

SELECT timestamp, corrente
FROM medicoes
ORDER BY corrente DESC
LIMIT 5;

SELECT q.nome, AVG(m.corrente)
FROM medicoes m
JOIN canais_medicao c ON m.canal_id = c.id
JOIN dispositivos d ON c.dispositivo_id = d.id
JOIN quadros q ON d.quadro_id = q.id
GROUP BY q.nome;
