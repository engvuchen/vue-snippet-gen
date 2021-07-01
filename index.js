const vueDocs = require('vue-docgen-api');
const rd = require('rd');
const fs = require('fs');
const path = require('path');
const { readPkg, help } = require('./util');

let matchNum = /^\d+$/;
let matchLetter = /^"|'([a-zA-Z\/]+|[\u4e00-\u9fa5\/]+)'|"$/;
let matchFunc = /(^\(\) => .+$)|(^function\(\) \{.+\};?$)/;
let matchEmptyStr = /^(''|\"\")$/;
let matchEmptyArr = /^\[\]$/;
let matchBool = /^(true|false)$/;
let matchUpperCase = /([A-Z])/g;
let matchPascal = /([a-z]+)(?=[A-Z])/g;

let defaultFileNames = ['index', 'main'];

let componentInfoList = [];
let parseConf = getParseConf(process.argv);
parseConf.forEach(curConf => {
  let { path: componentDir, tagNameType, mainComponents } = curConf;
  if (!componentDir) {
    console.log('miss path!');
    help();
    return;
  }

  let componentLibName = componentDir.split('/')[0].match(/[a-z]+/g)[0];
  let componentDirPath = `${process.cwd().replace(/\\/g, '/')}/node_modules/${componentDir}`;
  fs.access(componentDirPath, fs.constants.F_OK, err => {
    if (err) {
      console.log(`${componentLibName}组件库不存在`);
      return;
    }

    rd.eachFileFilterSync(`${componentDirPath}`, /\.vue$/, function (filePath, stats) {
      /**
       * ## 组件解析过滤
       * 1. 文件名被包含在 mainComponents / 默认文件名;
       * 2. 文件路径中的某个元素与 mainComponents 中的某个 组件名 全等
       */
      let fileName = path.basename(filePath, '.vue');
      let matchFileName = defaultFileNames.includes(fileName) || mainComponents.includes(fileName.toLowerCase());
      let matchPathItem = filePath
        .split('/')
        .find(pathItem => mainComponents.find(curName => curName === pathItem.toLowerCase()));
      if (matchFileName && matchPathItem) {
        let result = vueDocs.parse(filePath);
        if (tagNameType === 'kebab') {
          // 组件库 导出对象名 一般是 Pascal；
          // Pascal(AbC) => kebab(ab-c)
          result.displayName = result.displayName.replace(matchPascal, '$1-').toLowerCase();
        }
        componentInfoList.push(result);
      }
    });

    fs.writeFileSync(`${process.cwd()}/${componentLibName}.json`, JSON.stringify(componentInfoList, undefined, 2));
  });
});
if (componentInfoList.length) {
  main(curConf);
}

function main() {
  const componentProsDesMap = {};
  let snippetData = {};
  let createSnippetFileConf = {
    path: `${process.cwd().replace(/\\/g, '/')}/.vscode`,
    file: 'snippets.code-snippets',
    data: snippetData,
  };
  let componentPrefixes = [];
  componentInfoList.forEach(currentComponentInfo => {
    let { displayName, props, events, methods, slots } = currentComponentInfo;

    let componentName = displayName.toLowerCase();
    let prefix = `${componentLibName}-${componentName}`;
    let desc = `@${componentLibName} ${prefix}`;
    let snippetConstructor = getSnippetConstructor({ prefix, desc });

    let propsTags = [];
    if (props) {
      Object.keys(props).forEach(propsKey => {
        // ## 将驼峰props转为中划线props
        let { description, tags, defaultValue, type } = props[propsKey];

        // ## 检测到 tags 中包含 'ignore'，退出
        let { default: tagsDefault, ignore: tagsIgnore } = tags;
        if (tagsIgnore && tagsIgnore.some(curItem => curItem.title === 'ignore')) return;

        // ## 构造属性默认值(备注 > props默认值)
        let curDefaultValue = (tagsDefault && tagsDefault.description) || (defaultValue && defaultValue.value) || '';
        let { type: defaultValueType, value: curValue } = parseDefaultValue(curDefaultValue);
        let kebabCasePropsKey = propsKey.replace(matchUpperCase, '-$1').toLowerCase();
        // ## 按照 props_default 或者 自定义的默认值类型，决定是否转义默认值
        propsTags.push(
          `  ${
            (type && type.name !== 'string') || defaultValueType !== 'string' ? ':' : ''
          }${kebabCasePropsKey}="${curValue}"`
        );

        // ## 存储备注
        if (!componentProsDesMap[componentName]) componentProsDesMap[componentName] = {};
        componentProsDesMap[componentName][kebabCasePropsKey] = description;
      });
    }

    // ## 为匹配属性添加备注 - Full 版本
    snippetConstructor[desc].body = [
      '<!--',
      `<${displayName}`,
      ...addDescToMatchProp({
        tags: propsTags,
        propsToDescMap: componentProsDesMap[componentName],
      }),
      `>`,
      ...getSlotsContent(slots),
      `<${displayName}/>`,
      '-->',
    ];

    Object.assign(snippetData, snippetConstructor);

    // ### 打印列表的存储
    componentPrefixes.push(prefix);
  });

  writeToProjectSnippets(createSnippetFileConf);
  console.log('成功写入到项目snippets');

  // ## 打印指令列表
  const PLACEHOLDER_MAX = 2;
  console.log('以下是调用指令列表：');
  console.log(
    componentPrefixes
      .map((curPrefix, index) => {
        let num = index + 1 + '';
        let numLength = num.length;

        return `${num}${new Array(PLACEHOLDER_MAX - numLength).fill(' ').join('')}: ${curPrefix}`;
      })
      .join('\n')
  );
}

/**
 *
 * @param {String} defaultValue
 * @returns {Object} result {type: '', value: ''}
 */
function parseDefaultValue(defaultValue = '') {
  // NOTE: JSDocs 返回的 defaultValue.value 是字符串，需要解决一些格式问题（单引号）
  defaultValue = defaultValue.replace(/\n+/g, ' ').replace(/\s+/g, ' ');

  // ## 找到符合指定匹配规则的字符串
  let result = false;
  let matchFuncArr = [
    value => matchNum.test(value) && 'number',
    value => matchLetter.test(value) && 'string',
    value => matchFunc.test(value) && 'function',
    value => matchEmptyStr.test(value) && 'emptyString',
    value => matchEmptyArr.test(value) && 'emptyArray',
    value => matchBool.test(value) && 'boolean',
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
      defaultValue = Number.parseInt(defaultValue);
      break;
    case 'string':
      defaultValue = defaultValue.replace(matchLetter, '$1');
      break;
    case 'function':
      defaultValue = JSON.stringify(eval(`[${defaultValue}]`)[0]()).replace(/"/g, '\\"') || '';
      break;
    case 'emptyString':
      defaultValue = '';
      break;
    case 'emptyArray':
      defaultValue = [];
      break;
    case 'boolean':
      defaultValue = defaultValue === 'true';
      break;
  }

  return { type: result, value: defaultValue };
}
/**
 * 根据 slots 获取 ‘text’ / <span name='key'>text</span> 的内同
 * @param {Object}} slots {default, icon, ..slots}
 * @returns {Array} result []
 */
function getSlotsContent(slots) {
  let result = [];

  let slotsKeys = Object.keys(slots);
  if (slotsKeys.length) {
    slotsKeys.forEach(slotKey => {
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
 * 为匹配属性添加备注；返回一个操作后的字符串数组
 * @param {object} conf {body: [], propsToDescMap: [] }
 * @returns {array} body
 */
function addDescToMatchProp(conf = { tags: [], propsToDescMap: {} }) {
  let { tags, propsToDescMap } = conf;

  let tagsLength = tags.length;
  for (let i = 0; i < tagsLength; i++) {
    let propAndValue = tags[i];

    // {type, offset-bottom ..}
    if (propsToDescMap) {
      let propsNames = Object.keys(propsToDescMap);

      let propNameReg = /[a-zA-Z_]+/;
      let matchPropName = propsNames.find(curName => propAndValue.match(propNameReg) === curName);
      if (matchPropName) {
        let desc = propsToDescMap[matchPropName];
        desc = desc.replace(/\n/g, '; ');
        tags[i] = `${propAndValue} // ${desc}`;
      }
    }
  }

  return tags;
}
/**
 * 从 prefix/desc 获取 snippet 基础结构
 * @param {object} conf
 * @returns {object} result
 */
function getSnippetConstructor(conf = { prefix: '', desc: '' }) {
  let { prefix, desc } = conf;
  return {
    [desc]: {
      scope: ['javascript', 'vue'],
      prefix,
      description: desc,
      body: [],
    },
  };
}
function afterInitDirAndFile(conf) {
  let { path: curPath, file: curFilePath, success: successCallBack, error: errorCallBack, data } = conf;

  let fileExistPath = path.resolve(__dirname, curPath, curFilePath);
  Object.assign(conf, { file_exist_path: fileExistPath });

  // ## 检测文件是否存在
  fs.access(fileExistPath, fs.constants.F_OK, err => {
    if (!err) {
      successCallBack(conf);
    } else {
      console.log(`${fileExistPath}不存在。已创建目录、文件。`);

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
function getParseConf(processArgs = []) {
  // 命令仅支持 path / --tag-pascal-case, 会解析所有 vue 文件；配置以命令行优先
  let parseConf = [];
  if (processArgs.length) {
    let curConf = {
      path: '',
      tagNameType: 'kebab',
      mainComponents: [],
    };
    let tagNameTypeIndex = processArgs.indexOf('--tag-pascal-case');
    if (tagNameTypeIndex > -1) {
      curConf.tagNameType = 'pascal';
      processArgs.splice(tagNameTypeIndex, 1);
    }

    let [, , , componentDir] = processArgs;
    curConf.path = componentDir;

    parseConf.push(curConf);
  } else {
    let pkgConf = readPkg()['vue-snippet-gen'] || [];
    if (Array.isArray(pkgConf) && pkgConf.length) {
      parseConf = pkgConf.map(curItem => {
        curItem.mainComponents = curItem.mainComponents.map(name => (name = name.toLowerCase()));
        if (!curConf.tagNameType) curConf.tagNameType = 'kebab';

        return curItem;
      });
    }
  }

  return parseConf;
}
