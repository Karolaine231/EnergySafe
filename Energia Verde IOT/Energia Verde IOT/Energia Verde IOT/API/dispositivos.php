<?php
require 'config.php';

$quadro_id = isset($_GET['quadro_id']) ? (int)$_GET['quadro_id'] : 0;

$sql = "SELECT id, nome, quadro_id, ativo, data_instalacao, observacoes
        FROM dispositivos
        WHERE quadro_id = :quadro_id
        ORDER BY nome";

$stmt = $pdo->prepare($sql);
$stmt->execute(['quadro_id' => $quadro_id]);

echo json_encode($stmt->fetchAll());
?>