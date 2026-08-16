// 模拟浏览器 ModuleLoader 的隔离环境（vm 上下文，无全局 module/exports），
// 验证 @local/dsh-file-confirm 的 client bundle 在真实 loader 环境下能否加载。
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const clientJs = process.env.CLIENTJS;
if (!clientJs) throw new Error('CLIENTJS env missing');
const src = fs.readFileSync(clientJs, 'utf8');

const entries = [];
const sandbox = {
  console,
  window: {
    __ModuleLoader__: {
      load: (entry) => entries.push(entry),
    },
  },
  // 隔离上下文里没有 module / exports / require / document
};
vm.createContext(sandbox);

try {
  vm.runInContext(src, sandbox, { filename: 'client.js' });
} catch (e) {
  console.error('FAIL at top-level:', e.message);
  process.exit(1);
}
console.log('top-level OK, load() called:', entries.length, 'entry id:', entries[0] && entries[0].id);

// 现在执行 factory —— 真实 loader 用 (require) => {...} 调用它，环境中没有 module
const entry = entries[0];
const factorySrc = '(' + entry.factory.toString() + ')';
sandbox.require = (name) => {
  const resolved = require.resolve(name, {
    paths: [path.dirname(clientJs), process.env.DSH_NODE_MODULES || ''],
  });
  // runtime/client 也是 loader bundle：在沙箱中运行它，模拟递归物化
  const depSrc = fs.readFileSync(resolved, 'utf8');
  const depEntries = [];
  const depSandbox = {
    console,
    window: { __ModuleLoader__: { load: (e) => depEntries.push(e) } },
  };
  vm.createContext(depSandbox);
  vm.runInContext(depSrc, depSandbox, { filename: name });
  return { __loaderEntry__: depEntries[0] };
};

try {
  const result = vm.runInContext(factorySrc + '(require)', sandbox, { filename: 'factory' });
  console.log('factory ran OK in isolated env, result keys:', Object.keys(result || {}));
  console.log('exports:', Object.keys(result || {}).join(', '));
} catch (e) {
  console.error('FAIL at factory:', e.message);
  process.exit(1);
}
console.log('ALL CHECKS PASSED');
