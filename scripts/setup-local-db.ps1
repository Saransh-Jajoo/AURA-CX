# ─── AURA-CX Local Database Setup ────────────────────────────────────────────
# Runs as the postgres superuser to create the aura role and aura_cx database.
# Run once after installing PostgreSQL 16 natively.

param(
    [string]$PgPassword = "aura"  # Password for the new 'aura' database user
)

# Locate psql – check default install paths for PG 16/17
$psqlPaths = @(
    "C:\Program Files\PostgreSQL\16\bin\psql.exe",
    "C:\Program Files\PostgreSQL\17\bin\psql.exe",
    "C:\Program Files\PostgreSQL\15\bin\psql.exe"
)

$psql = $null
foreach ($path in $psqlPaths) {
    if (Test-Path $path) { $psql = $path; break }
}

if (-not $psql) {
    Write-Error "psql not found. Make sure PostgreSQL is installed and try again."
    exit 1
}

Write-Host "Using psql at: $psql" -ForegroundColor Cyan
Write-Host ""
Write-Host "You may be prompted for the postgres superuser password." -ForegroundColor Yellow
Write-Host "(Default is what you set during PostgreSQL installation)" -ForegroundColor Yellow
Write-Host ""

# Create user + database
$sql = @"
DO \$\$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'aura') THEN
        CREATE ROLE aura WITH LOGIN PASSWORD '$PgPassword';
    END IF;
END
\$\$;

SELECT 'Role aura exists or was created.' AS status;

SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'aura_cx' AND pid <> pg_backend_pid();

DO \$\$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_database WHERE datname = 'aura_cx') THEN
        PERFORM dblink_exec('dbname=postgres', 'CREATE DATABASE aura_cx OWNER aura');
    END IF;
EXCEPTION WHEN others THEN NULL;
END
\$\$;
"@

# Use a simpler sequential approach
& $psql -U postgres -c "DO `$`$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='aura') THEN CREATE ROLE aura WITH LOGIN PASSWORD '$PgPassword'; END IF; END `$`$;"
& $psql -U postgres -c "SELECT 'aura role ready';"
& $psql -U postgres -c "CREATE DATABASE aura_cx OWNER aura;" 2>$null
Write-Host "Database aura_cx created (or already exists)." -ForegroundColor Green
& $psql -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE aura_cx TO aura;"

Write-Host ""
Write-Host "✅ Local database setup complete!" -ForegroundColor Green
Write-Host ""
Write-Host "Connection string:" -ForegroundColor Cyan
Write-Host "  postgresql+asyncpg://aura:$PgPassword@localhost:5432/aura_cx" -ForegroundColor White
Write-Host ""
Write-Host "Next step – start the backend:" -ForegroundColor Cyan
Write-Host "  cd backend" -ForegroundColor White
Write-Host "  .\venv\Scripts\activate" -ForegroundColor White
Write-Host "  uvicorn main:app --reload" -ForegroundColor White
