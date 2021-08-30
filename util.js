const fs = require('fs');
const path = require('path');

function readPkg(pkgPath = '') {
  if (!pkgPath) pkgPath = `${process.cwd()}/package.json`;
  return JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
}
function help() {
  console.log(`Usage
  vue-snippet-gen --version, -v
  vue-snippet-gen --conf (--filter)`);
}

module.exports = {
  readPkg,
  help,
};
