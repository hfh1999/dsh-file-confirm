# Testing

本仓库的测试脚本用于在**无浏览器环境**下验证 client bundle 的关键行为，
作为发布前的回归检查（尤其防"渲染崩溃导致输入框消失"这类问题）。

## 前置

测试脚本通过 `createRequire` 加载本机 DSH 的依赖（react / react-dom 等），
需要设置环境变量：

| 变量 | 值 |
|---|---|
| `DSH_NODE_MODULES` | DSH 的依赖目录，如 `%USERPROFILE%\.dsh\profiles\node_modules` |
| `CLIENTJS` | 被测的 client bundle 路径（默认 `lib/client.js` 的绝对路径） |

## 用例

### `test-render.cjs` — 真实 React 渲染（核心回归）

用 `react-dom/server` 渲染 `FileChangeApprovalStrip`（150 行长文本 write 场景），
断言：渲染不抛错、包含行号（`dfc-lno`）、完整显示 150 行（不截断）。

```powershell
$env:CLIENTJS = "C:\path\dsh-file-confirm\lib\client.js"
$env:DSH_NODE_MODULES = "$env:USERPROFILE\.dsh\profiles\node_modules"
node test-render.cjs
```

### `test-edit-align.cjs` — edit 场景行号对齐

渲染 edit（old/new 单行替换），断言红行/绿行的行号列结构正确
（`[dfc-del] lno=[n]`、`[dfc-ins] lno=[n]` 同列对齐）。

### `test-client-env.cjs` — 隔离环境加载

在 vm 沙箱（无全局 `module`/`window`）加载 client bundle，验证
factory 的 `var module` 声明与导出（`apply`/`inject`/`name`）正常。

## 发布前检查清单

```powershell
node --check lib\client.js lib\index.js
node test-render.cjs
node test-edit-align.cjs
npm pack --dry-run
```
