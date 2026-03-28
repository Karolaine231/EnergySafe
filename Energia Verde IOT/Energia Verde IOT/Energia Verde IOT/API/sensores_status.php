<?php
require 'config.php';

$quadro_id = isset($_GET['quadro_id']) ? (int)$_GET['quadro_id'] : 0;

$sql = "
WITH ultima_medicao AS (
    SELECT
        d.id AS dispositivo_id,
        d.nome AS sensor,
        MAX(m.timestamp) AS ultima_leitura
    FROM dispositivos d
    LEFT JOIN canais_medicao c ON c.dispositivo_id = d.id
    LEFT JOIN medicoes m ON m.canal_id = c.id
    WHERE d.quadro_id = :quadro_id
    GROUP BY d.id, d.nome
),
potencia_atual AS (
    SELECT
        d.id AS dispositivo_id,
        COALESCE(SUM(sub.potencia), 0) AS potencia_atual
    FROM dispositivos d
    LEFT JOIN canais_medicao c ON c.dispositivo_id = d.id
    LEFT JOIN LATERAL (
        SELECT m.potencia
        FROM medicoes m
        WHERE m.canal_id = c.id
        ORDER BY m.timestamp DESC
        LIMIT 1
    ) sub ON true
    WHERE d.quadro_id = :quadro_id
    GROUP BY d.id
)
SELECT
    u.dispositivo_id,
    u.sensor,
    u.ultima_leitura,
    p.potencia_atual,
    CASE
        WHEN u.ultima_leitura IS NULL THEN 'OFFLINE'
        WHEN u.ultima_leitura >= NOW() - INTERVAL '2 minutes' THEN 'ONLINE'
        WHEN u.ultima_leitura >= NOW() - INTERVAL '10 minutes' THEN 'ATRASO'
        ELSE 'OFFLINE'
    END AS status
FROM ultima_medicao u
LEFT JOIN potencia_atual p ON p.dispositivo_id = u.dispositivo_id
ORDER BY u.sensor;
";

$stmt = $pdo->prepare($sql);
$stmt->execute(['quadro_id' => $quadro_id]);

echo json_encode($stmt->fetchAll());
?>