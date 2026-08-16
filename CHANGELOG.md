# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-08-16

### Added

- 文件改动确认机制（双面插件）：
  - Host 半身监听 `tools/pre-execute`，拦截 write / edit / str_replace_editor 写命令并返回 `ask` 审批
  - Browser 半身接管 `conversation.composer` chain，渲染确认条并内嵌 GitHub 风格 diff
  - diff 带单列行号、红删绿增整行背景色、长文本不截断（块内滚动）
  - 允许本次 / 拒绝，复用官方 approval 通道与审计
- `dsh.bundle` manifest，支持 `dsh plugin add dsh-file-confirm` 安装
- 测试脚本：`test-render.cjs`（真实 React 渲染验证）、`test-edit-align.cjs`（edit 行号对齐）、`test-client-env.cjs`（隔离环境加载）
