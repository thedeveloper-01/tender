const fs = require('fs');
const cheerio = require('cheerio');
const html = fs.readFileSync('test_tender.html', 'utf8');
const $ = cheerio.load(html);

$('table').each((i, el) => {
  console.log('Table ID:', $(el).attr('id'), 'Class:', $(el).attr('class'), 'First row:', $(el).find('tr').first().text().trim().substring(0, 50).replace(/\s+/g, ' '));
});
