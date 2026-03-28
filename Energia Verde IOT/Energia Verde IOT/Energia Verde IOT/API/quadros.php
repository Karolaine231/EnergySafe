<?php
require 'config.php';

$local_id = isset($_GET['local_id']) ? (int)$_GET['local_id'] : 0;

$sql = "SELECT id, nome, local_id, quadro_pai_id, descricao
        FROM quadros
        WHERE local_id = :local_id
        ORDER BY nome";

$stmt = $pdo->prepare($sql);
$stmt->execute(['local_id' => $local_id]);

echo json_encode($stmt->fetchAll());
?>