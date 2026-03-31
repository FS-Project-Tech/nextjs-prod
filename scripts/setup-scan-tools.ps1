# PowerShell script for Windows
# Setup script for unused code scanning tools

Write-Host "🔧 Setting up unused code scanning tools..." -ForegroundColor Cyan
Write-Host ""

# Check if npm is available
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Host "✗ npm is not installed. Please install Node.js first." -ForegroundColor Red
    exit 1
}

Write-Host "Installing tools..." -ForegroundColor Blue
Write-Host ""

# Install PurgeCSS
Write-Host "→ Installing PurgeCSS..." -ForegroundColor Yellow
npm install --save-dev purgecss @fullhuman/postcss-purgecss
if ($LASTEXITCODE -ne 0) {
    Write-Host "✗ Failed to install PurgeCSS" -ForegroundColor Red
    exit 1
}
Write-Host "✓ PurgeCSS installed" -ForegroundColor Green

# Install unimported
Write-Host "→ Installing unimported..." -ForegroundColor Yellow
npm install --save-dev unimported
if ($LASTEXITCODE -ne 0) {
    Write-Host "✗ Failed to install unimported" -ForegroundColor Red
    exit 1
}
Write-Host "✓ unimported installed" -ForegroundColor Green

# Install depcheck
Write-Host "→ Installing depcheck..." -ForegroundColor Yellow
npm install --save-dev depcheck
if ($LASTEXITCODE -ne 0) {
    Write-Host "✗ Failed to install depcheck" -ForegroundColor Red
    exit 1
}
Write-Host "✓ depcheck installed" -ForegroundColor Green

Write-Host ""
Write-Host "✨ All tools installed successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:"
Write-Host "  1. Run: npm run scan:unused"
Write-Host "  2. Review the output and remove unused code"
Write-Host "  3. Run: npm run scan:unused:fix (to auto-fix ESLint issues)"
Write-Host ""

