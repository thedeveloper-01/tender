/**
 * extractor/pdfExtract.js
 *
 * Layout-aware PDF text extraction for GeM NIT PDFs.
 *
 * WHY THIS MODULE EXISTS:
 *   GeM bid PDFs are machine-generated two-column forms:
 *     [Hindi label]  [English label]  [value]
 *   pdf-parse uses PDF stream order which may scramble left/right columns,
 *   breaking label→value adjacency that our anchor search depends on.
 *
 *   pdftotext -layout (poppler-utils) preserves the visual spatial order,
 *   keeping English label and value on the same line or adjacent lines.
 *   This is the primary extractor when poppler is available (always on Linux
 *   servers; available via chocolatey/scoop on Windows).
 *
 * FALLBACK:
 *   If pdftotext is not installed, falls back to pdf-parse (stream order).
 *   Accuracy may be lower for multi-column layouts but still usable for
 *   single-column sections like ATC and Eligibility.
 *
 * SCANNED PDFs:
 *   If extracted text is < 100 chars, the PDF is likely a scanned image.
 *   Returns { text: '', isScanned: true, method: '...' } — callers log
 *   a warning and skip extraction.
 */

import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';

const MIN_TEXT_LENGTH = 100;  // below this = likely scanned image PDF

/**
 * extractPdfText(pdfPath) → { text, method, isScanned }
 *
 * text:      normalized string (Devanagari NOT yet stripped here — normalize.js does that)
 * method:    'pdftotext' | 'pdf-parse'
 * isScanned: true if text is too short to be useful
 */
export async function extractPdfText(pdfPath) {
  if (!fs.existsSync(pdfPath)) {
    return { text: '', method: 'none', isScanned: false };
  }

  // ── 1. Try pdftotext -layout (poppler-utils) ─────────────────────────────
  const pdftotextResult = tryPdftotext(pdfPath);
  if (pdftotextResult !== null) {
    const isScanned = pdftotextResult.trim().length < MIN_TEXT_LENGTH;
    if (isScanned) {
      console.warn(`[pdfExtract] pdftotext returned <${MIN_TEXT_LENGTH} chars for ${pdfPath} — likely scanned PDF`);
    }
    return { text: pdftotextResult, method: 'pdftotext', isScanned };
  }

  // ── 2. Fallback: pdf-parse ────────────────────────────────────────────────
  console.log(`[pdfExtract] pdftotext unavailable — falling back to pdf-parse for ${pdfPath}`);
  try {
    const buf = fs.readFileSync(pdfPath);
    const data = await pdfParse(buf);
    const text = data.text || '';
    const isScanned = text.trim().length < MIN_TEXT_LENGTH;
    if (isScanned) {
      console.warn(`[pdfExtract] pdf-parse returned <${MIN_TEXT_LENGTH} chars for ${pdfPath} — likely scanned PDF`);
    }
    return { text, method: 'pdf-parse', isScanned };
  } catch (e) {
    console.error(`[pdfExtract] pdf-parse failed for ${pdfPath}:`, e.message);
    return { text: '', method: 'pdf-parse-failed', isScanned: false };
  }
}

/**
 * resolvePdftotextPath() → string
 *
 * Checks system PATH first. On Windows, if missing, tries to locate
 * the local winget packages folder where oschwartz10612.Poppler was extracted.
 */
function resolvePdftotextPath() {
  // 1. Try system PATH
  try {
    execFileSync('pdftotext', ['-v'], { timeout: 1000, stdio: 'pipe' });
    return 'pdftotext';
  } catch (_) {
    // pdftotext not in path
  }

  // 2. Windows fallback: Check Local AppData winget packages directory
  if (process.platform === 'win32' && process.env.LOCALAPPDATA) {
    try {
      const wingetDir = path.join(process.env.LOCALAPPDATA, 'Microsoft', 'WinGet', 'Packages');
      if (fs.existsSync(wingetDir)) {
        const dirs = fs.readdirSync(wingetDir);
        // Find folder like "oschwartz10612.Poppler_Microsoft.Winget.Source_..."
        const popplerDirName = dirs.find((d) => d.startsWith('oschwartz10612.Poppler'));
        if (popplerDirName) {
          const binPath = path.join(
            wingetDir,
            popplerDirName,
            'poppler-25.07.0',
            'Library',
            'bin',
            'pdftotext.exe'
          );
          if (fs.existsSync(binPath)) {
            return binPath;
          }
        }
      }
    } catch (_) {
      // ignore
    }
  }

  return null;
}

/**
 * tryPdftotext(pdfPath) → string | null
 */
function tryPdftotext(pdfPath) {
  const binaryPath = resolvePdftotextPath();
  if (!binaryPath) return null;

  try {
    const stdout = execFileSync(
      binaryPath,
      ['-layout', '-enc', 'UTF-8', pdfPath, '-'],
      {
        timeout: 30_000,
        maxBuffer: 20 * 1024 * 1024,
        encoding: 'utf8',
      }
    );
    return stdout;
  } catch (e) {
    if (e.code !== 'ENOENT') {
      console.warn(`[pdfExtract] pdftotext error (non-fatal):`, e.message.slice(0, 120));
    }
    return null;
  }
}

/**
 * isPdftotextAvailable() → boolean
 */
export function isPdftotextAvailable() {
  return !!resolvePdftotextPath();
}

