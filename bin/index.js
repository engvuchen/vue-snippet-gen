#!/usr/bin/env node

const { readPkg, help } = require('../util');

let pkg = readPkg('../package.json');
const cmds = {
  '--path': () => {
    require('../index');
  },
  '--version': version,
  '-v': version,
};
const [, , cmd] = process.argv;
cmds[cmd] ? cmds[cmd]() : help();

function version() {
  console.log(pkg.version);
}
