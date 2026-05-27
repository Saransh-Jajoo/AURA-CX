# Setup local Postgres and initialize database for development using docker-compose
Write-Host "Bringing up docker compose services..."
docker compose up -d postgres redis

Write-Host "Waiting for Postgres to be ready..."
$ready = $false
for ($i = 0; $i -lt 30; $i++) {
  try {
    docker exec -i $(docker ps -q -f "ancestor=postgres:16") pg_isready -U postgres | Out-Null
    $ready = $true
    break
  } catch {
    Start-Sleep -Seconds 2
  }
}

if (-not $ready) {
  Write-Host "Postgres did not start in time. Ensure docker-compose is running." -ForegroundColor Red
  exit 1
}

Write-Host "Create database and run migrations (if any)."
Write-Host "Please run the project's migration or initialization commands manually, e.g."
Write-Host "  .venv\Scripts\Activate.ps1"
Write-Host "  python backend/main.py (or run your migration tool)"
