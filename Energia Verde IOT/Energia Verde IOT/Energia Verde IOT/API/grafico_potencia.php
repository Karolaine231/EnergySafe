<?php
require 'config.php';

$dispositivo_id = isset($_GET['dispositivo_id']) ? (int)$_GET['dispositivo_id'] : 0;
$intervalo = isset($_GET['intervalo']) ? (int)$_GET['intervalo'] : 30;

if ($intervalo <= 0) {
    $intervalo = 30;
}

$sql = "
SELECT
    m.timestamp,
    COALESCE(SUM(m.potencia), 0) AS potencia_total
FROM medicoes m
JOIN canais_medicao c ON c.id = m.canal_id
WHERE c.dispositivo_id = :dispositivo_id
  AND m.timestamp >= NOW() - (:intervalo || ' minutes')::interval
GROUP BY m.timestamp
ORDER BY m.timestamp ASC;
";

$stmt = $pdo->prepare($sql);
$stmt->execute([
    'dispositivo_id' => $dispositivo_id,
    'intervalo' => $intervalo
]);

echo json_encode($stmt->fetchAll());
?>