const fs = require('fs');
const content = fs.readFileSync('public/index.html', 'utf8');
const regex = /(class|id)="[^"]*admin[^"]*"/g;
let match;
while ((match = regex.exec(content)) !== null) {
  const lineNum = content.substring(0, match.index).split('\n').length;
  console.log(`${lineNum}: ${match[0]}`);
}
