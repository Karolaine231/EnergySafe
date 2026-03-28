<?php
header('Content-Type: application/json; charset=utf-8');

$host = 'localhost';
$dbname = 'safe_energy';
$user = 'postgres';
$pass = 'SUA_SENHA';
$port = '5432';

try {
    $pdo = new PDO(
        "pgsql:host=$host;port=$port;dbname=$dbname",
        $user,
        $pass,
        [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC
        ]
    );
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode([
        'erro' => 'Falha na conexão com o banco.',
        'detalhe' => $e->getMessage()
    ]);
    exit;
}
?>