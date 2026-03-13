const fs = require('fs');
const content = fs.readFileSync('app/page.tsx', 'utf8');

function checkBalance(text) {
    let parens = 0;
    let braces = 0;
    let insideString = null;
    let i = 0;
    while (i < text.length) {
        const char = text[i];
        const nextChar = text[i+1];

        if (insideString) {
            if (char === '\\') { i += 2; continue; }
            if (char === insideString) { insideString = null; }
        } else {
            if (char === '"' || char === "'" || char === '`') { insideString = char; }
            else if (char === '/' && nextChar === '/') { i = text.indexOf('\n', i); if (i === -1) break; }
            else if (char === '/' && nextChar === '*') { i = text.indexOf('*/', i); if (i === -1) break; i += 1; }
            else if (char === '(') parens++;
            else if (char === ')') parens--;
            else if (char === '{') braces++;
            else if (char === '}') braces--;
        }
        i++;
    }
    console.log(`Balance - Parens: ${parens}, Braces: ${braces}`);
}

checkBalance(content);
