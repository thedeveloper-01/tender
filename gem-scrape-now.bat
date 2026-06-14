@echo off
title GEM Portal Scraper
color 0B
cls

echo ╔══════════════════════════════════════════════╗
echo ║   CGTenders — GEM Portal Scraper (Browser)  ║
echo ╚══════════════════════════════════════════════╝
echo.

:: ── CONFIG — edit MONGODB_URI below ──────────────────────────────────────────
::
:: Copy your connection string from backend\.env (MONGODB_URI=...)
:: and paste it here, replacing the placeholder.
::
set MONGODB_URI=mongodb+srv://admin:password@cluster.mongodb.net/cgtenders?retryWrites=true&w=majority
::
:: Optional overrides (leave as-is unless you know what you are changing)
set PDF_RETENTION_DAYS=2
set AUTO_DELETE_CLOSED_AFTER_DAYS=2
set ARCHIVE_MODE=true
set DOCUMENTS_DIR=documents
::
:: ─────────────────────────────────────────────────────────────────────────────

:: Locate backend relative to this .bat file
set SCRIPT_DIR=%~dp0
set BACKEND_DIR=%SCRIPT_DIR%backend

if not exist "%BACKEND_DIR%\package.json" (
  echo [ERROR] Cannot find the backend folder at:
  echo         %BACKEND_DIR%
  echo.
  echo Make sure this .bat is in the same directory as the "backend" folder.
  echo.
  pause
  exit /b 1
)

:: Check Node.js
node --version >nul 2>&1
if %errorlevel% neq 0 (
  echo [ERROR] Node.js is not installed or not on PATH.
  echo         Download it from https://nodejs.org/
  echo.
  pause
  exit /b 1
)

echo [1/3] Installing / verifying npm dependencies...
cd /d "%BACKEND_DIR%"
call npm install --silent 2>nul
if %errorlevel% neq 0 (
  echo [ERROR] npm install failed. Check your internet connection.
  pause
  exit /b 1
)
echo       npm deps OK.
echo.

echo [2/3] Installing Playwright browser (Chromium)...
echo       (First run only — skip on subsequent runs)
call npx playwright install chromium --with-deps 2>nul
echo       Playwright OK.
echo.

echo [3/3] Starting GEM scrape ^& DB upload...
echo       This may take 3-10 minutes depending on the number of tenders.
echo.

node src\gem_scraper_run.js

if %errorlevel% neq 0 (
  echo.
  echo [ERROR] Scraper exited with errors. See the output above for details.
  echo.
  echo Common fixes:
  echo   1. Confirm MONGODB_URI at the top of this .bat file is correct.
  echo   2. Check your internet connection ^(GEM portal must be reachable^).
  echo   3. Run:  cd backend ^&^& npm install  then try again.
  echo.
) else (
  echo.
  echo MongoDB updated successfully!
  echo.
)

echo Press any key to close...
pause >nul
