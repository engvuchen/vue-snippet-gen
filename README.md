# vue-snippet-gen

[demo 地址](https://github.com/engvuchen/helper-demo)

## 安装

```bash
npm install vue-docgen-api --save-dev
```

## 配置

1. 需在 `package.json` 中配置。见 [demo](https://github.com/engvuchen/helper-demo)。

## 使用

### --filter

1. 配合 [vue-ui-kit-helper](https://marketplace.visualstudio.com/items?itemName=engvuchen.vue-ui-kit-helper) ，模拟 [helper](https://marketplace.visualstudio.com/search?term=helper&target=VSCode&category=All%20categories&sortBy=Relevance) 类插件的使用体验。
2. 项目 snippet 仅显示文件中标注 `@show` 的属性/方法，默认隐藏 slot。

```bash
npx vue-snippet-gen --conf --filter
```

产物：

1. `.code-snippet` 文件，负责控制初始标签的显示；
2. `.json` 文件，负责为 `vue-ui-kit-helper` 提供自动补全的数据源。

效果：
![演示-vue-ui-kit-helper.gif](https://i.loli.net/2021/09/06/qZB4IKN65jzHpdn.gif)

### --conf

1. 生成带备注的项目 snippet；
2. 支持在 `vue` / `javascript` 文件中使用。

```bash
npx vue-snippet-gen --conf
```

效果：
![演示-vue-snippet-gen-conf.gif](https://i.loli.net/2021/09/06/xDVM1rLeYqKtPzS.gif)

## JSDocs 标记支持

1. description - 不带标注的备注。
2. @enum - snippet 选项列表。
3. @ignore - 忽略该属性/方法的解析。`--conf` / `--filter`，均不可见。
4. @default - 修改默认值。
5. @show - 仅 --filter 支持

标记优先级: `@enum` > `@default` > 文件 `props` `default`
