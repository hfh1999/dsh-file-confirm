// 用真实 React 渲染 FileChangeApprovalStrip，定位渲染崩溃点
'use strict';
const { createRequire } = require('module');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const clientJs = process.env.CLIENTJS;
const dshModules = process.env.DSH_NODE_MODULES;
const reqFromDsh = createRequire(path.join(dshModules, 'x.js'));
const React = reqFromDsh('react');
const { renderToStaticMarkup } = reqFromDsh('react-dom/server');

// 1. 顶层加载：拿到 loader entry
const src = fs.readFileSync(clientJs, 'utf8');
const entries = [];
const sandbox = {
  console,
  process: { env: { NODE_ENV: 'production' } },
  window: { __ModuleLoader__: { load: (e) => entries.push(e) } },
};
vm.createContext(sandbox);
vm.runInContext(src, sandbox, { filename: 'client.js' });
const entry = entries[0];
if (!entry) throw new Error('no loader entry');

// 2. 执行 factory（真实 node 环境 + mock require）
const factoryFn = eval('(' + entry.factory.toString() + ')');
const req = (name) => {
  if (name === 'react') return React;
  if (name === 'react/jsx-runtime') return reqFromDsh('react/jsx-runtime');
  if (name === '@deepseek-ai/dsh-client-runtime/client') {
    return { conversationContextKey: (kind, id) => kind + ':' + id };
  }
  return reqFromDsh(name);
};
const result = factoryFn(req);
console.log('factory exports:', Object.keys(result).join(', '));

// 3. 构造 props 渲染组件
const { FileChangeApprovalStrip } = result;
const content = Array.from({ length: 150 }, (_, i) => '第 ' + (i + 1) + ' 行').join('\n');
const mockWait = {
  key: 'a:mock',
  sessionId: 's1',
  payload: { approvalId: 'ap1', toolName: 'write', reason: '写入文件 a.md', callId: 'call1' },
  respond: async () => ({ accepted: true }),
};
const mockSnapshot = {
  sessionId: 's1',
  chat: { nodes: new Map() },
};
mockSnapshot.chat.nodes.set('tool-call:call1', {
  kind: 'tool-call',
  data: { root: { callId: 'call1', argsRaw: JSON.stringify({ file_path: 'a.md', content }) } },
});
const props = {
  matched: mockWait,
  t: (k) => k,
  sessionId: 's1',
  useSession: (sel) => sel(mockSnapshot),
};
try {
  const html = renderToStaticMarkup(React.createElement(FileChangeApprovalStrip, props));
  console.log('RENDER OK, html length:', html.length);
  console.log('has line numbers:', /dfc-lno/.test(html));
  console.log('shows all 150 lines:', (html.match(/第 \d+ 行/g) || []).length === 150);
} catch (err) {
  console.error('RENDER FAILED:', err && err.stack || err);
  process.exit(1);
}
