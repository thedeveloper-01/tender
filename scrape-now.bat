@echo off
title CGTenders Scraper
color 0A
cls

echo ==========================================
echo   CGTenders - Daily Scraper
echo ==========================================
echo.

:: ── CONFIG — edit these ──────────────────────────────────────────
set MONGODB_URI=mongodb+srv://YOUR_USER:YOUR_PASS@YOUR_CLUSTER.mongodb.net/cgtenders
set USE_MOCK_GEM=false
set SKIP_CSPGCL=false
set ADMIN_TOKEN=changeme
set ARCHIVE_MODE=true
set AUTO_DELETE_CLOSED_AFTER_DAYS=2
:: ─────────────────────────────────────────────────────────────────

:: Find the backend folder relative to this .bat file
set SCRIPT_DIR=%~dp0
set BACKEND_DIR=%SCRIPT_DIR%backend

if not exist "%BACKEND_DIR%\package.json" (
  echo [ERROR] Could not find backend folder at:
  echo         %BACKEND_DIR%
  echo.
  echo Make sure this .bat file is placed inside your project root
  echo ^(same folder that contains the "backend" directory^).
  echo.
  pause
  exit /b 1
)

:: Check node is installed
node --version >nul 2>&1
if %errorlevel% neq 0 (
  echo [ERROR] Node.js is not installed or not in PATH.
  echo.
  echo Download from: https://nodejs.org/
  echo.
  pause
  exit /b 1
)

echo [1/3] Checking dependencies...
cd /d "%BACKEND_DIR%"
call npm install --silent 2>nul
if %errorlevel% neq 0 (
  echo [ERROR] npm install failed. Check your internet connection.
  pause
  exit /b 1
)
echo       Done.
echo.

echo [2/3] Starting scrape + DB update...
echo       This usually takes 1-3 minutes.
echo       ^(GeM portal + CSPGCL portal^)
echo.

node -e "
import('./src/pipeline/run.js').then(async ({ runPipeline }) => {
  try {
    const log = await runPipeline();
    console.log('');
    console.log('==========================================');
    console.log('  SCRAPE COMPLETE');
    console.log('==========================================');
    console.log('  New tenders   : ' + log.newCount);
    console.log('  Updated       : ' + log.updatedCount);
    console.log('  Total found   : ' + log.found);
    console.log('  Errors        : ' + log.errors.length);
    if (log.errors.length > 0) {
      console.log('');
      console.log('  Error details:');
      log.errors.forEach(e => console.log('    - ' + e));
    }
    console.log('==========================================');
    process.exit(0);
  } catch (err) {
    console.error('[FATAL]', err.message);
    process.exit(1);
  }
});
"

if %errorlevel% neq 0 (
  echo.
  echo [ERROR] Scraper exited with an error. See output above.
  echo.
  echo Common fixes:
  echo   1. Check your MONGODB_URI at the top of this .bat file
  echo   2. Check your internet / proxy connection
  echo   3. Run: cd backend ^&^& npm install
  echo.
) else (
  echo.
  echo [3/3] MongoDB updated successfully!
  echo.
)

echo Press any key to close...
pause >nul
