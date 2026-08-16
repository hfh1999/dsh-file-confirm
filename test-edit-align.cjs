// 验证 edit diff 行的行号列对齐结构
'use strict';
const { createRequire } = require('module');
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const dsh = process.env.DSH_NODE_MODULES;
const rq = createRequire(path.join(dsh, 'x.js'));
const React = rq('react');
const { renderToStaticMarkup } = rq('react-dom/server');

const src = fs.readFileSync(process.env.CLIENTJS, 'utf8');
const entries = [];
const sb = {
  console,
  process: { env: { NODE_ENV: 'production' } },
  window: { __ModuleLoader__: { load: (e) => entries.push(e) } },
};
vm.createContext(sb);
vm.runInContext(src, sb);
const factoryFn = eval('(' + entries[0].factory.toString() + ')');
const req = (n) => n === 'react' ? React
  : n.includes('jsx-runtime') ? rq('react/jsx-runtime')
  : n === '@deepseek-ai/dsh-client-runtime/client' ? { conversationContextKey: (k, i) => k + ':' + i }
  : rq(n);
const { FileChangeApprovalStrip } = factoryFn(req);

const mockWait = {
  key: 'a:1', sessionId: 's1',
  payload: { approvalId: 'a', toolName: 'edit', reason: '编辑文件', callId: 'c1' },
  respond: async () => ({ accepted: true }),
};
const snap = { sessionId: 's1', chat: { nodes: new Map() } };
snap.chat.nodes.set('tool-call:c1', {
  kind: 'tool-call',
  data: { root: { callId: 'c1', argsRaw: JSON.stringify({
    file_path: 'long-test.md', old_string: '第 75 行', new_string: '第 75 行（中间位置修改测试）' }) } },
});
const props = { matched: mockWait, t: (k) => k, sessionId: 's1', useSession: (sel) => sel(snap) };
const html = renderToStaticMarkup(React.createElement(FileChangeApprovalStrip, props));

// 提取每个 diff 行
const lines = html.split('<div class="dfc-line ').slice(1);
console.log('diff rows:', lines.length);
for (const raw of lines) {
  const seg = raw.split('</div>')[0];
  const cls = seg.slice(0, seg.indexOf('"'));
  const lnos = [];
  const re = /class="dfc-lno"[^>]*>([^<]*)</g;
  let m;
  while ((m = re.exec(seg)) !== null) lnos.push(m[1]);
  const tm = seg.match(/class="dfc-text"[^>]*>([^<]*)</);
  console.log('[' + cls + '] lno=[' + lnos.join('|') + '] text=' + (tm ? tm[1] : '?'));
}
