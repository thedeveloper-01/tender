import fs from 'fs';
import path from 'path';

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      const b = path.basename(fullPath);
      if (b !== 'node_modules' && b !== '.git' && b !== '.astro' && b !== 'dist') {
        results = results.concat(walk(fullPath));
      }
    } else {
      results.push(fullPath);
    }
  });
  return results;
}

const files = walk('.');
files.forEach(f => {
  if (f.startsWith('src' + path.sep) || f.startsWith('backend' + path.sep + 'src' + path.sep)) {
    const content = fs.readFileSync(f, 'utf8');
    content.split('\n').forEach((line, idx) => {
      const lower = line.toLowerCase();
      if (lower.includes('exempt')) {
        console.log(`${f}:${idx + 1}: ${line.trim()}`);
      }
    });
  }
});
