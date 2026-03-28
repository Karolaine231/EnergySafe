<?php
require 'config.php';

$sql = "SELECT id, nome, andar, descricao
        FROM locais
        ORDER BY nome";

$stmt = $pdo->query($sql);
echo json_encode($stmt->fetchAll());
?>