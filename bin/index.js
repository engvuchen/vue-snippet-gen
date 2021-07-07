#!/usr/bin/env node

const { readPkg, help } = require('../util');
const path = require('path');

const cmds = {
  '--path': () => {
    require('../index');
  },
  '--conf': () => {
    require('../index');
  },
  '--version': version,
  '-v': version,
};
const [, , cmd] = process.argv;
cmds[cmd] ? cmds[cmd]() : help();

function version() {
  let pkg = readPkg(`${path.join(__dirname, '../package.json')}`);
  console.log(pkg.version);
}
