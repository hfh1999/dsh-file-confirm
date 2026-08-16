/**
 * dsh-file-confirm — Browser 半身
 *
 * 确认条注册在 `conversation.composer`（chain slot，priority 0）：
 * 当待审批项是文件改动类工具（write/edit/str_replace_editor）时接管渲染，
 * **确认条内直接展示 diff 红绿文本**（新建全绿、编辑红删绿增），
 * 不再依赖右侧详情栏。
 *
 * 其余审批（bash 升级等）返回 null，落入内置 ApprovalPanel。
 *
 * 数据来源：
 * - approval carrier payload：{ approvalId, toolName, reason?, callId? }
 * - 会话快照（props.useSession）：通过 callId 找到配对工具调用的 argsRaw
 *   （write 的 content / edit 的 old_string,new_string / str_replace_editor 的
 *   command,old_string,new_string,insert_string）
 *
 * 响应走与内置面板相同的 wire 编码：wait.respond({ ok:true, value:{
 *   sessionId, approvalId, outcome }})。
 */
window.__ModuleLoader__.load({
  id: 'dsh-file-confirm',
  factory: (require) => {
    'use strict';
    // 与官方 client bundle 一致：factory 环境是隔离的，module/exports 必须自带
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
    const react = require('react');
    const { conversationContextKey } = require('@deepseek-ai/dsh-client-runtime/client');

    const NAME = 'file-confirm-ui';
    const NS = 'file-confirm';
    const FILE_TOOLS = new Set(['write', 'edit', 'str_replace_editor']);

    // ── CSS（随插件注入，HMR invalidate 时按 data-plugin-css 去重）──────────
    const cssId = 'dsh-file-confirm/FileChangeStrip.css';
    if (typeof document !== 'undefined' && document.querySelector('style[data-plugin-css="' + cssId + '"]') === null) {
      const tag = document.createElement('style');
      tag.dataset.plugin = 'dsh-file-confirm';
      tag.dataset.pluginCss = cssId;
      tag.textContent = [
        '.dfc-root{display:flex;flex-direction:column;align-items:center;padding:0 16px 8px}',
        '.dfc-card{box-sizing:border-box;width:100%;max-width:var(--dsh-chat-content-width,720px);border:1px solid var(--dsw-alias-state-warn-secondary,#8a6a1f);background:var(--dsw-specific-input-major,#1f2227);box-shadow:var(--dsw-shadow-lv2,none);border-radius:14px;overflow:hidden}',
        '.dfc-strip{background:var(--dsw-alias-state-warn-tertiary,#3a2f14);color:var(--dsw-alias-state-warn-primary,#e0b04a);display:flex;align-items:center;gap:8px;padding:8px 14px;font-size:13px;line-height:18px}',
        '.dfc-dot{background:var(--dsw-alias-state-warn-primary,#e0b04a);border-radius:50%;width:8px;height:8px;flex:none}',
        '.dfc-body{display:flex;flex-direction:column;gap:4px;padding:10px 14px 0}',
        '.dfc-headline{color:var(--dsw-alias-label-primary,#e6e6e6);font-size:14px;font-weight:500;line-height:22px;word-break:break-all}',
        '.dfc-meta{color:var(--dsw-alias-label-secondary,#a8adb5);font-family:var(--ds-font-family-code,monospace);font-size:12px;line-height:18px;word-break:break-all}',
        '.dfc-diff{border:1px solid var(--dsw-alias-border-l1,#2a2d33);border-radius:10px;overflow:hidden;background:#14161a;margin-top:2px}',
        '.dfc-diff-pre{margin:0;padding:6px 0;font-family:var(--ds-font-family-code,monospace);font-size:12.5px;line-height:20px;overflow-x:auto;max-height:300px;overflow-y:auto}',
        '.dfc-line{display:flex;align-items:stretch}',
        '.dfc-lno{flex:none;box-sizing:border-box;width:3.6ch;min-width:3.6ch;text-align:right;padding:0 8px 0 4px;color:#6b7280;background:rgba(255,255,255,.045);border-right:1px solid rgba(255,255,255,.06);user-select:none;overflow:hidden}',
        '.dfc-text{flex:1;white-space:pre;padding-right:12px}',
        '.dfc-del{background:rgba(255,80,80,.14);color:#e8c4c4}',
        '.dfc-ins{background:rgba(80,220,130,.13);color:#c8ecd8}',
        '.dfc-ctx{color:#c8ccd4}',
        '.dfc-trunc{color:var(--dsw-alias-label-tertiary,#8a8f98);font-size:12px;padding:4px 12px 8px}',
        '.dfc-actionRow{display:flex;justify-content:flex-end;gap:8px;padding:12px 14px}',
        '.dfc-btn{border-radius:8px;padding:5px 16px;font-size:13px;line-height:20px;border:1px solid transparent;cursor:pointer;font-weight:500}',
        '.dfc-btn:disabled{opacity:.5;cursor:default}',
        '.dfc-reject{background:var(--dsw-specific-selector,#26292f);color:var(--dsw-alias-state-error-primary,#ff7a7a);border-color:var(--dsw-alias-border-l1,#2a2d33)}',
        '.dfc-allow{background:var(--dsw-alias-button-info-fill,#2f6fce);color:#fff}',
        '.dfc-allow:hover:not(:disabled){background:var(--dsw-alias-button-info-hover,#3a7fdf)}'
      ].join('');
      document.head.appendChild(tag);
    }

    // ── 字典（locale NS: file-confirm）───────────────────────────────────────
    const zh = {
      waiting: '等待审批 — 文件改动确认',
      allowOnce: '允许本次',
      reject: '拒绝',
      'detail.aria': '文件改动确认条',
      'meta.create': '新建文件',
      'meta.update': '覆盖文件',
      'meta.edit': '替换文本',
      'meta.replace': 'str_replace 命令',
      'meta.insert': 'insert 命令',
      'meta.write': 'write 命令',
      truncated: '（内容过长，已截断显示）',
      noArgs: '（无法读取调用参数）',
      fallbackTitle: '批准此文件改动？'
    };
    const en = {
      waiting: 'Waiting for approval — file change',
      allowOnce: 'Allow once',
      reject: 'Reject',
      'detail.aria': 'File change approval strip',
      'meta.create': 'Create file',
      'meta.update': 'Overwrite file',
      'meta.edit': 'Replace text',
      'meta.replace': 'str_replace command',
      'meta.insert': 'insert command',
      'meta.write': 'write command',
      truncated: '(content truncated)',
      noArgs: '(cannot read call arguments)',
      fallbackTitle: 'Approve this file change?'
    };

    // ── PendingApproval face（复刻 ui-conversation 内部类，wire 编码一致）────
    class PendingApproval {
      constructor(wait) { this.wait = wait; }
      get key() { return this.wait.key; }
      get toolName() { return this.wait.payload.toolName; }
      get reason() { return this.wait.payload.reason; }
      get callId() { return this.wait.payload.callId; }
      async answer(outcome) {
        const receipt = await this.wait.respond({
          ok: true,
          value: {
            sessionId: this.wait.sessionId,
            approvalId: this.wait.payload.approvalId,
            outcome
          }
        });
        if (!receipt.accepted) throw new Error('approval response rejected: ' + receipt.reason);
      }
    }

    // ── chain selector：只接管文件改动类审批，其余委托给内置面板 ───────────
    function selectFileApproval({ interactions }) {
      if (!interactions) return null;
      for (const item of interactions) {
        if (item.kind === 'approval' && FILE_TOOLS.has(item.payload && item.payload.toolName)) return item;
      }
      return null;
    }

    // ── 从会话快照读取配对工具调用的参数 ─────────────────────────────────────
    function callArgsOf(snapshot, callId) {
      if (callId === undefined) return undefined;
      const node = snapshot && snapshot.chat && snapshot.chat.nodes
        ? snapshot.chat.nodes.get(conversationContextKey('tool-call', callId))
        : undefined;
      const root = node && node.kind === 'tool-call' ? node.data && node.data.root : undefined;
      if (!root) return undefined;
      try { return JSON.parse(root.argsRaw); } catch { return undefined; }
    }

    function pathOf(args) {
      if (!args) return null;
      if (typeof args.file_path === 'string' && args.file_path) return args.file_path;
      if (typeof args.path === 'string' && args.path) return args.path;
      return null;
    }

    function verbOf(toolName, args) {
      if (toolName === 'write') return '写入/覆盖';
      if (toolName === 'edit') return '编辑';
      if (toolName === 'str_replace_editor') {
        const c = args && args.command;
        if (c === 'write') return 'write 命令';
        if (c === 'insert') return 'insert 命令';
        return 'str_replace 命令';
      }
      return toolName;
    }

    // ── 简易行级 diff：公共前后缀 + 中间整体替换 ─────────────────────────────
    function lineDiff(oldText, newText) {
      const a = String(oldText == null ? '' : oldText).split('\n');
      const b = String(newText == null ? '' : newText).split('\n');
      let head = 0;
      while (head < a.length && head < b.length && a[head] === b[head]) head += 1;
      let tail = 0;
      while (
        tail < a.length - head &&
        tail < b.length - head &&
        a[a.length - 1 - tail] === b[b.length - 1 - tail]
      ) tail += 1;
      const lines = [];
      let k;
      for (k = 0; k < head; k += 1) lines.push({ t: ' ', text: a[k] });
      for (k = head; k < a.length - tail; k += 1) lines.push({ t: '-', text: a[k] });
      for (k = head; k < b.length - tail; k += 1) lines.push({ t: '+', text: b[k] });
      for (k = a.length - tail; k < a.length; k += 1) lines.push({ t: ' ', text: a[k] });
      return lines;
    }

    // 不截断：完整显示所有 diff 行，靠 diff 块的滚动条查看。
    // 极高上限仅作防呆（如意外超大内容），正常不会触发。
    const MAX_DIFF_LINES = 100000;

    /**
     * 为 diff 行计算单列行号：
     * - 上下文行：显示当前（新）行号
     * - 删除行（-）：显示旧文件行号
     * - 新增行（+）：显示新文件行号
     */
    function withLineNumbers(lines) {
      let oldNo = 0;
      let newNo = 0;
      return lines.map((line) => {
        if (line.t === '-') {
          oldNo += 1;
          return { t: line.t, text: line.text, no: oldNo };
        }
        if (line.t === '+') {
          newNo += 1;
          return { t: line.t, text: line.text, no: newNo };
        }
        oldNo += 1;
        newNo += 1;
        return { t: line.t, text: line.text, no: newNo };
      });
    }

    function DiffBlock({ oldText, newText }) {
      const lines = withLineNumbers(lineDiff(oldText, newText));
      const clipped = lines.length > MAX_DIFF_LINES;
      const shown = clipped ? lines.slice(0, MAX_DIFF_LINES) : lines;
      return react.createElement(
        'div', { className: 'dfc-diff' },
        react.createElement(
          'div', { className: 'dfc-diff-pre' },
          shown.map((line, i) => react.createElement('div', {
            key: i,
            className: 'dfc-line ' + (line.t === '-' ? 'dfc-del' : line.t === '+' ? 'dfc-ins' : 'dfc-ctx')
          },
            react.createElement('span', { className: 'dfc-lno' }, line.no),
            react.createElement('span', { className: 'dfc-text' }, line.text)
          ))
        ),
        clipped ? react.createElement('div', { className: 'dfc-trunc' }, '（内容过长，已截断显示）') : null
      );
    }

    function DiffView({ toolName, args, t }) {
      const a = args || {};
      if (toolName === 'write') {
        const content = typeof a.content === 'string' ? a.content : '';
        return react.createElement(DiffBlock, {
          oldText: '',
          newText: content
        });
      }
      if (toolName === 'edit') {
        const oldText = typeof a.old_string === 'string' ? a.old_string : '';
        const newText = typeof a.new_string === 'string' ? a.new_string : '';
        return react.createElement(DiffBlock, { oldText, newText });
      }
      if (toolName === 'str_replace_editor') {
        const command = typeof a.command === 'string' ? a.command : '?';
        const oldText = typeof a.old_string === 'string' ? a.old_string : '';
        const newText = typeof a.new_string === 'string' ? a.new_string
          : (typeof a.insert_string === 'string' ? a.insert_string : '');
        if (command === 'write') {
          return react.createElement(DiffBlock, {
            oldText: '',
            newText: typeof a.content === 'string' ? a.content : ''
          });
        }
        return react.createElement(DiffBlock, { oldText, newText });
      }
      return null;
    }

    // ── 确认条组件（conversation.composer chain 条目，priority 0）────────────
    function FileChangeApprovalStrip(props) {
      // props.matched = chain select 命中的 PendingWait（引用稳定）
      const approval = react.useMemo(() => new PendingApproval(props.matched), [props.matched]);
      const [answered, setAnswered] = react.useState(false);
      const answer = (outcome) => {
        setAnswered(true);
        approval.answer(outcome).catch(() => setAnswered(false));
      };
      const t = props.t;
      const args = props.useSession((snapshot) => callArgsOf(snapshot, approval.callId));
      const path = pathOf(args);
      const verb = verbOf(approval.toolName, args);
      return react.createElement(
        'div', { className: 'dfc-root', 'data-approval-key': approval.key },
        react.createElement(
          'div', { className: 'dfc-card' },
          react.createElement('div', { className: 'dfc-strip' },
            react.createElement('span', { className: 'dfc-dot' }),
            t('waiting')),
          react.createElement(
            'div', {
              className: 'dfc-body',
              'data-approval-scroll': '',
              tabIndex: 0,
              role: 'group',
              'aria-label': t('detail.aria')
            },
            react.createElement('div', { className: 'dfc-headline' },
              approval.reason || t('fallbackTitle')),
            react.createElement('div', { className: 'dfc-meta' },
              path ? (verb + ' → ' + path) : t('noArgs')),
            args === undefined
              ? react.createElement('div', { className: 'dfc-meta' }, t('noArgs'))
              : react.createElement(DiffView, { toolName: approval.toolName, args, t })
          ),
          react.createElement('div', { className: 'dfc-actionRow' },
            react.createElement('button', {
              className: 'dfc-btn dfc-reject',
              disabled: answered,
              onClick: () => answer('rejected')
            }, t('reject')),
            react.createElement('button', {
              className: 'dfc-btn dfc-allow',
              disabled: answered,
              onClick: () => answer('allowed-once')
            }, t('allowOnce'))
          )
        )
      );
    }

    // ── 插件入口 ───────────────────────────────────────────────────────────────
    // client 半身访问 ctx.locale / ctx.slots，必须在导出里声明 inject
    //（与官方 client bundle 一致：{ apply, inject, name }）
    const inject = ['slots', 'locale'];

    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'file-confirm: dictionaries');
      ctx.slots.inject('conversation.composer', () =>
        ctx.slots.register({
          name: 'conversation.composer',
          select: selectFileApproval,
          priority: 0, // lowest renders：先于内置 ApprovalPanel（priority 1）
          locale: NS
        }, FileChangeApprovalStrip)
      );
    }

    module.exports = { apply, inject, name: NAME, FileChangeApprovalStrip, PendingApproval };
    return module.exports;
  }
});
