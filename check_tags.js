const fs = require('fs');
const content = fs.readFileSync('app/page.tsx', 'utf8');

function countTags(text) {
    const openings = (text.match(/<div/g) || []).length;
    const closings = (text.match(/<\/div>/g) || []).length;
    console.log(`Divs - Openings: ${openings}, Closings: ${closings}`);
}

countTags(content);
