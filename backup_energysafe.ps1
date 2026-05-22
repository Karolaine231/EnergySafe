# =============================================================
# backup_energysafe.ps1 - Backup completo do banco EnergySafe
#
# Uso no PowerShell:
#   .\backup_energysafe.ps1
# =============================================================

# -- 1. Connection string -------------------------------------
$DATABASE_URL = $env:DATABASE_URL

if (-not $DATABASE_URL) {
    Write-Host ""
    Write-Host "Variavel DATABASE_URL nao definida."
    Write-Host "Exemplo: postgresql://julya:SENHA@dpg-xxx.oregon-postgres.render.com/safe_db_lcwn"
    $DATABASE_URL = Read-Host "Cole a connection string"
}

# -- 2. Nome do arquivo com timestamp -------------------------
$TIMESTAMP = Get-Date -Format "yyyyMMdd_HHmmss"
$BACKUP_FILE = "backup_energysafe_$TIMESTAMP.sql"

$URL_LOG = $DATABASE_URL -replace ":([^:@]*)@", ":***@"
Write-Host ""
Write-Host "Banco  : $URL_LOG"
Write-Host "Arquivo: $BACKUP_FILE"
Write-Host ""
$CONFIRMA = Read-Host "Confirmar backup? (s/N)"
if ($CONFIRMA -ne "s" -and $CONFIRMA -ne "S") {
    Write-Host "Cancelado."
    exit 0
}

# -- 3. pg_dump -----------------------------------------------
Write-Host ""
Write-Host "Executando pg_dump..."

pg_dump --no-owner --no-acl --clean --if-exists -f $BACKUP_FILE $DATABASE_URL

if ($LASTEXITCODE -eq 0) {
    $SIZE = (Get-Item $BACKUP_FILE).Length / 1KB
    Write-Host "Backup concluido: $BACKUP_FILE"
    Write-Host "Tamanho: $([math]::Round($SIZE, 1)) KB"
} else {
    Write-Host "Erro no pg_dump."
    exit 1
}

# -- 4. Tabelas no backup -------------------------------------
Write-Host ""
Write-Host "Tabelas encontradas no backup:"
Select-String -Path $BACKUP_FILE -Pattern "^CREATE TABLE" | ForEach-Object {
    $tabela = ($_.Line -split "\s+")[2]
    Write-Host "  $tabela"
}

Write-Host ""
Write-Host "Para restaurar:"
Write-Host "  psql 'postgresql://...' -f $BACKUP_FILE"
