<?php
require 'config.php';

$quadro_id = isset($_GET['quadro_id']) ? (int)$_GET['quadro_id'] : 0;
$tipo = isset($_GET['tipo']) ? trim($_GET['tipo']) : 'all';

$sql = "
SELECT
    a.id,
    a.timestamp,
    a.tipo,
    a.nivel,
    d.nome AS sensor,
    a.mensagem
FROM alertas a
JOIN canais_medicao c ON c.id = a.canal_id
JOIN dispositivos d ON d.id = c.dispositivo_id
WHERE d.quadro_id = :quadro_id
";

$params = ['quadro_id' => $quadro_id];

if ($tipo !== 'all') {
    $sql .= " AND a.tipo = :tipo";
    $params['tipo'] = $tipo;
}

$sql .= " ORDER BY a.timestamp DESC LIMIT 50";

$stmt = $pdo->prepare($sql);
$stmt->execute($params);

echo json_encode($stmt->fetchAll());
?>