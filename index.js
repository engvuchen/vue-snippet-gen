'use strict';

console.log('__dirname', __dirname);

require('module-alias/register')(__dirname);
const vueDocs = require('vue-docgen-api');
const fs = require('fs');
const path = require('path');
const { readPkg, help } = require('./util');

let matchNum = /^(\d+|-?Infinity)$/;
let matchStr = /('.*'|".*")/;
let matchFunc = /(^\(\)\s*=>.+$)|(^function\s*\(.*\)\s*\{.+\}$)/;
let matchBool = /^(true|false)$/;
let matchArr = /^\[.*\]$/;
let matchObj = /^\{.*\}$/;
let matchUndefined = /^undefined$/;
let matchNull = /^null$/;

let matchUpperCase = /([A-Z])/g;
let matchPascal = /([a-z]+)(?=[A-Z])/g; // 匹配大驼峰（eg: IButton）
let matchPropNameReg = /[a-zA-Z_]+/;
let matchQuotes = /['"]+/g;

const WRITE_TARGET_PATH = `${process.cwd().replace(/\\/g, '/')}/.vscode`;
const IS_FILTER = process.argv.find(curStr => curStr === '--filter');
const IS_DEBUG = process.argv.find(curStr => curStr === '--debug');

let parseConf = getParseConf();
if (!parseConf.length) {
  console.log('Conf is empty!');
  return;
}

parseConf.map(curConf => {
  let { path: componentDir, tagNameType, mainComponents } = curConf;

  if (!componentDir) {
    console.log('Miss path!');
    help();
    return;
  }
  componentDir = componentDir.replace(/\\/g, '/');

  let componentInfoList = [];
  let componentLibName = componentDir.split('/')[0].match(/[a-z\-_]+/g)[0];
  let componentDirPath = `${process.cwd().replace(/\\/g, '/')}/node_modules/${componentDir}`;

  fs.access(componentDirPath, fs.constants.F_OK, async err => {
    if (err) {
      console.log(`${componentLibName} doesn't exist!`);
      return;
    }

    if (mainComponents.length) {
      mainComponents = mainComponents.map(curItem => {
        curItem.path = `${componentDirPath}/${curItem.path.replace(/\\/g, '/')}`;
        return curItem;
      });
    }

    await new Promise(async (resolve, reject) => {
      for (let i = 0; i < mainComponents.length; i++) {
        let curConf = mainComponents[i];

        let { path: filePath, alias } = curConf;
        let result = await vueDocs
          .parse(filePath, {
            jsx: true,
            validExtends(fullFilePath) {
              return new RegExp(`[\\/]node_modules[\\/]${componentDirPath}`).test(fullFilePath);
            },
          })
          .catch(err => console.log('err'));

        if (alias) result.displayName = alias;

        // ## 修改标签名的命名方式
        if (tagNameType === 'kebab') {
          // 组件库 导出对象名 一般是 Pascal; 默认-Pascal(AbC) => kebab(ab-c)(中划线)
          let { displayName } = result;
          result.displayName = displayName.replace(matchPascal, '$1-').toLowerCase();
        }
        componentInfoList.push(result);
      }
      // note: for 方式，在不同主机上表现一致；而 forEach 不一致
      setTimeout(resolve, 4);
    }).catch(err => console.log('err', err));

    // 新增或修改 main
    main({ data: componentInfoList, lib_name: componentLibName });

    if (IS_DEBUG) {
      fs.writeFileSync(`${process.cwd()}/${componentLibName}.json`, JSON.stringify(componentInfoList, undefined, 4));
    }
  });
});

function main(conf = { data: {}, lib_name: '' }) {
  let { data: componentInfoList, lib_name: libName } = conf;

  console.log(`----------------- ${libName.toUpperCase()} -----------------`);

  const componentToAttrDescMap = {};
  let snippetData = {};
  let jsonData = {};
  let componentPrefixes = [];

  componentInfoList.forEach(curComponentInfo => {
    let { displayName: componentName, props, events, methods, slots } = curComponentInfo;

    let attrsForSnippet = [];
    let attrsForJSON = [];
    if (!componentToAttrDescMap[componentName]) componentToAttrDescMap[componentName] = {};
    let { [componentName]: attrToDescMap } = componentToAttrDescMap;

    let propsConf = {
      componentName,
      props,
      attrsForSnippet,
      attrToDescMap,
    };
    let eventConf = {
      componentName,
      events,
      attrsForSnippet,
      attrToDescMap,
    };
    if (IS_FILTER) {
      [propsConf, eventConf].forEach(curConf => Object.assign(curConf, { attrsForJSON }));
    }
    handleProps(propsConf);
    handleEvent(eventConf);

    let prefix = `${libName}-${componentName}`;
    let desc = `@${libName} ${componentName}`;
    let assignConfs = [
      {
        snippet: getSnippet({ prefix, desc }),
        attrs: attrsForSnippet,
        slots,
        attrToDescMap,
        snippets: snippetData,
        componentName,
        withTag: true,
        withComment: !IS_FILTER ? true : false,
      },
    ];
    if (IS_FILTER) {
      assignConfs.push({
        snippet: getSnippet({ prefix, desc }),
        attrs: attrsForJSON,
        attrToDescMap,
        snippets: jsonData,
        withTag: false,
        withComment: true,
      });
    }
    assignConfs.forEach(curConf => assignNewToSnippets(curConf));

    // ### 推入打印列表存储
    componentPrefixes.push(prefix);
  });

  let createFileConfs = [
    {
      path: WRITE_TARGET_PATH,
      file: `${libName}.code-snippets`, // 全部 或 过滤
      data: snippetData,
    },
  ];
  if (IS_FILTER) {
    createFileConfs.push({
      path: WRITE_TARGET_PATH,
      file: `${libName}.json`, // 全部的 props 部分
      data: jsonData,
    });
  }

  createFileConfs.forEach(curItem => writeToProjectSnippets(curItem));

  // ## 打印指令列表
  const PLACEHOLDER_MAX = 2;
  console.log(`Prefix List:`);
  console.log(
    componentPrefixes
      .map((curPrefix, index) => {
        let num = index + 1 + '';
        let numLength = num.length;

        let placeholderNum = PLACEHOLDER_MAX - numLength;

        return `${num}${new Array(placeholderNum > 0 ? placeholderNum : 0).fill(' ').join('')}: ${curPrefix}`;
      })
      .join('\n')
  );
  console.log('\n');
}

function handleProps(
  conf = {
    componentName: '',
    props: [],
    attrsForSnippet: [],
    attrToDescMap: {},
    attrsForJSON: [],
  }
) {
  let { componentName, props, attrsForSnippet, attrsForJSON, attrToDescMap } = conf;

  if (props && props.length) {
    let enumSnippetNum = 1;
    props.forEach(propItem => {
      // note: type 是 Vue 原生支持的校验; Boolean => boolean; [Boolean, String] => boolean|string
      let { name: propsName, description, tags, defaultValue, type } = propItem;

      let defaultTag;
      let enumListStr;
      let isShow = !IS_FILTER; // 关，全显示；开，部分显示
      if (tags) {
        ({ default: defaultTag } = tags);
        let { enum: enumTag, ignore: ignoreTag, show: showTag } = tags;

        // ## 处理 @ignore
        if (ignoreTag && ignoreTag.some(curItem => curItem.title === 'ignore')) return;

        // ## 处理 @enum
        if (enumTag && enumTag.length) {
          try {
            let [enumConf] = enumTag;
            if (enumConf.description && matchArr.test(enumConf.description)) {
              let enumList = JSON.parse(enumConf.description.replace(/'/g, '"'));
              if (Array.isArray(enumList)) {
                enumListStr = `\${${enumSnippetNum}|${enumList.join(',')}|}`;
                enumSnippetNum = ++enumSnippetNum;
              }
            }
          } catch (error) {
            console.log('error', error);
          }
        }

        if (showTag) isShow = true;
      }

      // ## 构造属性默认值(@enum > @default > props默认值)
      let curDefaultValue =
        (defaultTag && defaultTag.length && defaultTag[0].description) || (defaultValue && defaultValue.value) || '';
      let { type: defaultValueType, value: curValue } = parseDefaultValue(curDefaultValue, componentName, propsName);
      // ## 转换 props 格式（驼峰 -> 中划线/小写）
      let kebabCasePropsKey = propsName.replace(matchUpperCase, '-$1').toLowerCase();
      // ## 按照 props_default 或者 自定义的默认值类型，决定是否转义默认值
      let propsStr = `  ${getVueCommand(type, defaultValueType)}${kebabCasePropsKey}="${enumListStr || curValue}"`;

      if (isShow) attrsForSnippet.push(propsStr);
      if (attrsForJSON) attrsForJSON.push(propsStr);

      // ## 存储备注
      attrToDescMap[kebabCasePropsKey] = description;
    });
  }
}
function handleEvent(
  conf = {
    events: [],
    attrsForSnippet: [],
    attrToDescMap: {},
    attrsForJSON: [],
  }
) {
  let { events, attrsForSnippet, attrToDescMap, attrsForJSON } = conf;

  if (events && events.length) {
    events.forEach(eventItem => {
      let { name: eventName, tags, description } = eventItem;

      let isShow = !IS_FILTER;
      if (tags) {
        let { ignore: ignoreTag, show: showTag } = tags;
        if (ignoreTag && ignoreTag.some(curItem => curItem.title === 'ignore')) return;
        if (showTag) isShow = true;
      }
      let eventStr = `  @${eventName}=""`;
      if (isShow) attrsForSnippet.push(eventStr);
      if (attrsForJSON) attrsForJSON.push(eventStr);

      attrToDescMap[eventName] = description;
    });
  }
}
function assignNewToSnippets(
  conf = {
    snippet: {},
    attrs: [],
    attrToDescMap: {},
    snippets: {},
    componentName: '',
    slots: [],
    withTag: true,
    withComment: true,
  }
) {
  let { snippet, attrs, attrToDescMap, snippets, slots, componentName, withTag, withComment } = conf;

  let newAttrs = attrs;
  if (withComment) {
    newAttrs = addDescToMatchAttr({
      attrs,
      attrToDescMap,
    });
  }
  let desc = Object.keys(snippet).pop();
  snippet[desc].body = newAttrs;

  if (withTag) {
    if (withComment) {
      snippet[desc].body = [
        '<!--',
        `<${componentName}`,
        ...newAttrs,
        `>`,
        ...getSlotsContent(slots || []),
        `</${componentName}>`,
        '-->',
      ];
    } else {
      snippet[desc].body = [`<${componentName}`, ...newAttrs, `>`, `</${componentName}>`];
    }
  }
  Object.assign(snippets, snippet);
}

/**
 * 解析默认值
 * @param {String} defaultValue
 * @returns {Object} result {type: '', value: ''}
 */
function parseDefaultValue(defaultValue = '', componentName = '', propsKey = '') {
  // NOTE: JSDocs 返回的 defaultValue.value 是字符串，需要解决一些格式问题（单引号）
  defaultValue = defaultValue.replace(/\s+/g, ' ');

  // ## 找到符合指定匹配规则的字符串
  let result = false;
  let matchFuncArr = [
    value => matchStr.test(value) && 'string',
    value => matchNum.test(value) && 'number',
    value => matchBool.test(value) && 'boolean',
    value => matchUndefined.test(value) && 'undefined',
    value => matchNull.test(value) && 'null',
    value => matchFunc.test(value) && 'function',
    value => matchArr.test(value) && 'array',
    value => matchObj.test(value) && 'object',
  ];
  while (matchFuncArr.length !== 0 && !result) {
    let func = matchFuncArr.pop();
    result = func(defaultValue) || false;
  }
  // ### 目标不匹配任意一条规则，返回目标本身
  if (!result) return { type: 'string', value: defaultValue };

  // ## 转换目标
  switch (result) {
    case 'number':
      // defaultValue = Number.parseInt(defaultValue);
      break;
    case 'string':
      defaultValue = defaultValue.replace(matchStr, '$1').replace(matchQuotes, '');
      break;
    case 'function':
      try {
        defaultValue = JSON.stringify(eval(`[${defaultValue}]`)[0]());
      } catch (error) {
        console.log(`Function Parse Error. See ${componentName} ${propsKey}: ${defaultValue}`);
        defaultValue = '';
      }
      // 对象 / 数组默认值，从一个工厂函数获取
      ({ type: result, value: defaultValue } = parseDefaultValue(defaultValue, componentName, propsKey));
      break;
    case 'array':
      defaultValue = defaultValue.replace(/"/g, "'");
      break;
    case 'boolean':
      defaultValue = defaultValue === 'true';
      break;
  }

  return { type: result, value: defaultValue };
}
/**
 * 根据 slots 获取 ‘text’ 或 <span name='key'>text</span>
 * @param {Object}} slots {default, icon, ..slots}
 * @returns {Array} result []
 */
function getSlotsContent(slots) {
  let result = [];

  if (slots && slots.length) {
    slots.forEach(slotItem => {
      let slotKey = slotItem.name;
      switch (slotKey) {
        case 'default':
          result.push('  text');
          break;
        default:
          result.push(`  <span slot="${slotKey}">text</span>`);
          break;
      }
    });
  }

  return result;
}
/**
 * 获取 Vue 指令（:@）
 * @param {Object} type prop 的属性地址
 * @param {String} defaultValueType 根据字符串进行判断
 * @returns {String} result
 */
function getVueCommand(type, defaultValueType) {
  return (type && !type.name.includes('string')) || defaultValueType !== 'string' ? ':' : '';
}

/**
 * 为匹配属性添加备注；返回一个操作后的字符串数组
 * @param {object} conf {body: [], attrToDescMap: [] }
 * @returns {array} body
 */
function addDescToMatchAttr(conf = { tags: [], attrToDescMap: {} }) {
  let { attrs, attrToDescMap } = conf;

  let tagsLength = attrs.length;
  for (let i = 0; i < tagsLength; i++) {
    let propAndValue = attrs[i];

    // {type, offset-bottom ..}
    if (attrToDescMap) {
      let propsNames = Object.keys(attrToDescMap);

      let propName = propsNames.find(curName => {
        let matchResult = propAndValue.match(matchPropNameReg);
        if (matchResult) return matchResult[0] === curName;
      });
      if (propName) {
        let desc = attrToDescMap[propName];
        if (desc) {
          desc = desc.replace(/\n/g, '; ');
          attrs[i] = `${propAndValue} // ${desc}`;
        }
      }
    }
  }

  return attrs;
}
/**
 * 从 prefix/desc 获取 snippet 基础结构
 * @param {object} conf
 * @returns {object} result { [desc]: { ... } }
 */
function getSnippet(conf = { prefix: '', desc: '' }) {
  let { prefix, desc } = conf;
  return {
    [desc]: {
      scope: ['javascript', 'vue', 'html'],
      prefix,
      description: desc,
      body: [],
    },
  };
}
function afterInitDirAndFile(conf) {
  let { path: curPath, file: curFilePath, success: successCallBack, error: errorCallBack } = conf;

  let fileExistPath = path.resolve(__dirname, curPath, curFilePath);
  Object.assign(conf, { file_exist_path: fileExistPath });

  // ## 检测文件是否存在
  fs.access(fileExistPath, fs.constants.F_OK, err => {
    if (!err) {
      successCallBack(conf);
    } else {
      console.log(`${fileExistPath} doesn’t exist. Created directory, file.`);

      // ### 文件不存在，可能是 目录不存在，也可能是 文件不存在
      let folderPath = path.resolve(__dirname, curPath);
      fs.mkdirSync(folderPath, { recursive: true });
      // 默认 flag = 'w'，文件不存在会创建它
      fs.writeFileSync(path.resolve(__dirname, fileExistPath), JSON.stringify({}, undefined, 2), 'utf8', err => {
        if (err) {
          console.log(`${curPath} ${err}`);
        }
      });

      errorCallBack(conf);
    }
  });
}
function writeToProjectSnippets(conf = { path: '', file: '', data: {} }) {
  afterInitDirAndFile({
    ...conf,
    success(conf) {
      fs.writeFile(conf.file_exist_path, JSON.stringify(conf.data, undefined, 2), 'utf8', err => {
        if (err) {
          console.log('writeToProjectSnippets', `${conf.path} ${err}`);
        }
      });
    },
    error(conf) {
      writeToProjectSnippets(conf);
    },
  });
}
/**
 * 返回 命令行（优先） 或 package.json配置
 * returns {Array} parseConf [ {*path: '', tagNameType: '',(默认 kebab), mainComponents: []} ]
 */
function getParseConf() {
  let parseConf = [];
  let pkgConf = readPkg()['vue-snippet-gen'] || [];
  if (Array.isArray(pkgConf) && pkgConf.length) {
    parseConf = pkgConf.map(curItem => {
      [
        { key: 'path', defaultValue: '', target: curItem },
        { key: 'tagNameType', defaultValue: 'origin', target: curItem },
        { key: 'mainComponents', defaultValue: [], target: curItem },
      ].forEach(curItem => {
        let { key, defaultValue, target } = curItem;
        if (target[key] === undefined) target[key] = defaultValue;
      });

      let newMainComponents = [];
      let { mainComponents } = curItem;
      mainComponents.forEach(curItem => {
        if (typeof curItem !== 'object') {
          newMainComponents.push({ path: curItem });
        } else {
          newMainComponents.push(curItem);
        }
      });
      newMainComponents.forEach(curItem => {
        curItem.path = curItem.path.toLowerCase();
      });
      curItem.mainComponents = newMainComponents;

      return curItem;
    });
  }

  return parseConf;
}
function myTypeof(target) {
  return Object.prototype.toString.call(target).slice(8, -1).toLowerCase();
}
