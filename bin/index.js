#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

let pkg = readPkg();
const cmds = {
  '--add': () => {
    require('../index');
  },
  '--version': version,
  '-v': version,
};
const [, , cmd] = process.argv;
cmds[cmd] ? cmds[cmd]() : help();

function readPkg() {
  return JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf-8'));
}
function version() {
  console.log(pkg.version);
}
function help() {
  console.log(`Usage
  cls-snippet --version, -v
  cls-snippet --add < --prod > 添加snippet到项目`);
}
