/**
 * extractor/uploadedDocsParser.js
 *
 * Parses "Buyer Uploaded ATC Documents" section.
 *
 * GeM PDFs typically list uploaded documents as:
 *   Document Name: <name>
 *   Document Type: ATC / Specification / ...
 *   (sometimes with a URL)
 *
 * Returns:
 *   Array<{ name, type, url }>
 */

import { cleanText } from './utils.js';

const DOC_TYPES = ['ATC', 'Specification', 'Drawing', 'BOQ', 'Annexure', 'Compliance'];

/**
 * classifyDocType(text) → string
 */
function classifyDocType(text) {
  const lower = text.toLowerCase();
  if (lower.includes('atc') || lower.includes('terms')) return 'ATC';
  if (lower.includes('spec') || lower.includes('technical')) return 'Specification';
  if (lower.includes('draw') || lower.includes('dwg')) return 'Drawing';
  if (lower.includes('boq') || lower.includes('bill of quantity')) return 'BOQ';
  if (lower.includes('annex')) return 'Annexure';
  if (lower.includes('compliance')) return 'Compliance';
  return 'Other';
}

/**
 * parseUploadedDocs(sections) → doc[]
 */
export function parseUploadedDocs(sections) {
  const text = sections['UPLOADED_DOCS'] || '';
  if (!text) return [];

  const lines = text.split('\n').filter((l) => l.trim().length > 0);
  const docs = [];

  let currentDoc = null;

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip heading
    if (/^Buyer\s+Uploaded/i.test(trimmed)) continue;

    // New document entry — lines containing a file-like name or document label
    const nameMatch = trimmed.match(/(?:Document\s+Name|File\s+Name)[:\-]?\s*(.+)/i);
    const typeMatch = trimmed.match(/(?:Document\s+Type|Type)[:\-]?\s*(.+)/i);
    const urlMatch  = trimmed.match(/(https?:\/\/\S+)/i);

    // Detect a line that looks like a filename (.pdf, .doc, .xlsx, etc.)
    const fileLineMatch = trimmed.match(/^(.+\.(?:pdf|doc[x]?|xlsx?|zip|rar))\s*$/i);

    if (nameMatch) {
      if (currentDoc) docs.push(currentDoc);
      currentDoc = { name: cleanText(nameMatch[1]), type: 'Other', url: null };
    } else if (fileLineMatch && !currentDoc) {
      currentDoc = { name: cleanText(fileLineMatch[1]), type: classifyDocType(fileLineMatch[1]), url: null };
    } else if (typeMatch && currentDoc) {
      currentDoc.type = classifyDocType(typeMatch[1]);
    } else if (urlMatch && currentDoc) {
      currentDoc.url = urlMatch[1];
    } else if (trimmed.length > 5 && trimmed.length < 200 && !currentDoc) {
      // Bare line with no label — treat as document name if it looks document-ish
      if (/\.(pdf|doc|xlsx|zip)/i.test(trimmed) || DOC_TYPES.some((t) => trimmed.toUpperCase().includes(t))) {
        docs.push({ name: cleanText(trimmed), type: classifyDocType(trimmed), url: null });
      }
    }
  }

  if (currentDoc) docs.push(currentDoc);

  // Ensure all docs have a classified type
  return docs.map((d) => ({
    ...d,
    type: d.type || classifyDocType(d.name || ''),
  }));
}
