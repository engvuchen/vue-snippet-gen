# vue-snippet-gen

[demo 地址](https://github.com/engvuchen/helper-demo)

## 安装

推荐以 NPX 方式调用。

```bash
npm install vue-snippet-gen --save-dev
```

## 配置

1. 需在 `package.json` 中配置。见 [demo](https://github.com/engvuchen/helper-demo)。

## 使用

### --filter

1. 配合 [vue-ui-kit-helper](https://marketplace.visualstudio.com/items?itemName=engvuchen.vue-ui-kit-helper) ，尽可能还原 [helper](https://marketplace.visualstudio.com/search?term=helper&target=VSCode&category=All%20categories&sortBy=Relevance) 插件的自动补全体验。
2. 项目 snippet 仅显示文件中标注 `@show` 的 prop/event，默认隐藏 slot。

```bash
npx vue-snippet-gen --conf --filter
```

**产物**

1. `.code-snippet` 文件，负责控制初始标签的显示；
2. `.json` 文件，负责为 `vue-ui-kit-helper` 提供自动补全的数据源。

**效果**

![演示-vue-ui-kit-helper.gif](https://i.loli.net/2021/09/06/qZB4IKN65jzHpdn.gif)

### --conf

1. 生成带备注的项目 snippet；
2. 支持在 `vue` / `javascript` 文件中使用。

```bash
npx vue-snippet-gen --conf
```

**效果**

![演示-vue-snippet-gen-conf.gif](https://i.loli.net/2021/09/06/xDVM1rLeYqKtPzS.gif)

## JSDocs 标记支持

1. description - 不带标注的备注；
2. `@enum` - 默认值列表；
3. `@default` - 修改默认值；
4. `@show` - 在 `--filter` 模式下，显示指定的属性、方法；
5. `@ignore` - 忽略该 prop / method / slot 的解析。`--conf` / `--filter`，均不可见。

**默认值优先级**

`@enum` > `@default` > 文件明文 `default`

![标记演示.png](https://i.loli.net/2021/09/12/BpmJjvP5bM1UwfR.png)
