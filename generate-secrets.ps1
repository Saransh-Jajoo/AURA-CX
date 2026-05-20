# Generate Production Secrets for AURA-CX
# Using .NET's built-in cryptography (no external tools needed)

function Generate-SecureHex {
    param([int]$Bytes = 32)
    $randomBytes = [System.Security.Cryptography.RandomNumberGenerator]::GetBytes($Bytes)
    return [System.BitConverter]::ToString($randomBytes).Replace("-", "").ToLower()
}

# Generate all required secrets
$secrets = @{
    "SECRET_KEY" = Generate-SecureHex
    "WEBHOOK_SIGNING_SECRET" = Generate-SecureHex
    "ENCRYPTION_KEY" = Generate-SecureHex
    "REDIS_PASSWORD" = Generate-SecureHex
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "AURA-CX Production Secrets Generated" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

foreach ($key in $secrets.Keys | Sort-Object) {
    Write-Host "$($key)=" -ForegroundColor Yellow -NoNewline
    Write-Host "$($secrets[$key])" -ForegroundColor White
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Create .env file with this content:" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Create .env content
$envContent = @"
# Auto-generated production secrets
SECRET_KEY=$($secrets['SECRET_KEY'])
WEBHOOK_SIGNING_SECRET=$($secrets['WEBHOOK_SIGNING_SECRET'])
ENCRYPTION_KEY=$($secrets['ENCRYPTION_KEY'])
REDIS_PASSWORD=$($secrets['REDIS_PASSWORD'])

# Bootstrap configuration (CHANGE THESE)
BOOTSTRAP_TENANT_ID=$(([System.Guid]::NewGuid()).ToString())
BOOTSTRAP_TENANT_NAME=AURA-CX Production
BOOTSTRAP_ADMIN_EMAIL=admin@company.com
BOOTSTRAP_ADMIN_PASSWORD=ChangeMeNow123!

# External API Keys (ADD YOUR KEYS)
GEMINI_API_KEY=your-gemini-key-here
STRIPE_SECRET_KEY=your-stripe-key-here
STRIPE_PRICE_STARTER=price_xxxxx
STRIPE_PRICE_PRO=price_xxxxx
STRIPE_PRICE_ENTERPRISE=price_xxxxx
TWILIO_ACCOUNT_SID=your-account-sid-here
TWILIO_AUTH_TOKEN=your-auth-token-here
TWILIO_PHONE_NUMBER=+1XXXXXXXXXX

# Optional (leave empty if not using)
PINECONE_API_KEY=
PINECONE_HOST=
"@

Write-Host $envContent

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "Next steps:" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host "1. Copy the .env content above into .env file"
Write-Host "2. Add your actual GEMINI_API_KEY, STRIPE keys, TWILIO credentials"
Write-Host "3. Change BOOTSTRAP_ADMIN_PASSWORD to a strong password"
Write-Host "4. Run: docker-compose up -d"
Write-Host ""
