const fs = require('fs');
const path = require('path');

function readPkg(pkgPath = './package.json') {
  return JSON.parse(fs.readFileSync(path.join(__dirname, pkgPath), 'utf-8'));
}
function help() {
  console.log(`Usage
  vue-snippet --version, -v    
  vue-snippet --path <path> (--tag-kebab-case)`);
}

module.exports = {
  readPkg,
  help,
};
