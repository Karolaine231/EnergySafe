<?php
require 'config.php';

$quadro_id = isset($_GET['quadro_id']) ? (int)$_GET['quadro_id'] : 0;

$sql = "
SELECT
    a.id,
    a.tipo,
    a.nivel,
    a.mensagem,
    a.valor,
    a.limite,
    a.timestamp,
    a.resolvido,
    d.nome AS sensor
FROM alertas a
JOIN canais_medicao c ON c.id = a.canal_id
JOIN dispositivos d ON d.id = c.dispositivo_id
WHERE d.quadro_id = :quadro_id
ORDER BY a.timestamp DESC
LIMIT 10;
";

$stmt = $pdo->prepare($sql);
$stmt->execute(['quadro_id' => $quadro_id]);

echo json_encode($stmt->fetchAll());
?>