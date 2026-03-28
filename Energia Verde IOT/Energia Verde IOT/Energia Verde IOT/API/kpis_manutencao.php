<?php
require 'config.php';

$sql = "
WITH ultima_medicao AS (
    SELECT 
        d.id AS dispositivo_id,
        d.nome,
        MAX(m.timestamp) AS ultima_leitura
    FROM dispositivos d
    LEFT JOIN canais_medicao c ON c.dispositivo_id = d.id
    LEFT JOIN medicoes m ON m.canal_id = c.id
    GROUP BY d.id, d.nome
),
status_dispositivos AS (
    SELECT
        dispositivo_id,
        nome,
        ultima_leitura,
        CASE
            WHEN ultima_leitura IS NULL THEN 'OFFLINE'
            WHEN ultima_leitura >= NOW() - INTERVAL '2 minutes' THEN 'ONLINE'
            WHEN ultima_leitura >= NOW() - INTERVAL '10 minutes' THEN 'ATRASO'
            ELSE 'OFFLINE'
        END AS status
    FROM ultima_medicao
),
alertas_ativos AS (
    SELECT COUNT(*) AS total
    FROM alertas
    WHERE resolvido = FALSE
)
SELECT
    COUNT(*) FILTER (WHERE status = 'ONLINE') AS online,
    COUNT(*) FILTER (WHERE status = 'OFFLINE') AS offline,
    COUNT(*) FILTER (WHERE status = 'ATRASO') AS atraso,
    (SELECT total FROM alertas_ativos) AS alertas_ativos
FROM status_dispositivos;
";

$stmt = $pdo->query($sql);
echo json_encode($stmt->fetch());
?>