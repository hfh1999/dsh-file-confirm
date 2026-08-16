/**
 * @local/dsh-file-confirm — Host 半身
 *
 * 文件改动确认机制：
 * 监听 `tools/pre-execute`（DSH 工具注册表的可重排 allow/deny/ask 门），
 * 对文件改动类工具（write / edit / str_replace_editor）返回 `{ kind: 'ask' }`，
 * 由审批通道（web 模式下即浏览器确认弹窗）决定放行或拒绝。
 *
 * 语义：
 * - 返回 `{ kind: 'ask', reason }` → dsh-tools 自动调用 ctx.approval.request()
 *   → web 网关转发 → 浏览器弹窗 → allowed-once 放行 / rejected 拒绝（工具以错误失败）
 * - 返回 undefined 且调用 `next()` → 委托给瀑布中的后续监听器（与其他门共存）
 *
 * 配置（cordis.patch.yml 中该行的 config）：
 *   tools:       要拦截的工具名列表，默认 ['write', 'edit', 'str_replace_editor']
 *   pathPattern: 可选 RegExp 字符串，仅对匹配的路径确认（如 '^src/'）；缺省对所有路径确认
 *   enabled:     总开关，默认 true
 */
export const name = 'file-confirm';

const DEFAULT_TOOLS = ['write', 'edit', 'str_replace_editor'];

const VERBS = {
  write: '写入/覆盖',
  edit: '编辑',
  str_replace_editor: '字符串编辑',
};

/** str_replace_editor 的写命令（view 是只读命令，不拦截）。 */
const STR_REPLACE_WRITE_COMMANDS = new Set(['str_replace', 'insert', 'write']);

/** 从工具参数里提取目标文件路径（write/edit/str_replace_editor 均为 file_path）。 */
function pathOf(exec) {
  const args = exec.arguments ?? {};
  if (typeof args.file_path === 'string' && args.file_path) return args.file_path;
  if (typeof args.path === 'string' && args.path) return args.path;
  return null;
}

/** 构造发给审批弹窗的 headline 文本（简洁一行，详细 diff 由 Browser 半身从调用参数渲染）。 */
function reasonOf(exec, path) {
  const verb = VERBS[exec.name] ?? exec.name;
  const target = path ? `文件 ${path}` : '文件（路径未知）';
  return `【文件改动确认】将${verb}${target}，请确认后继续`;
}

export function apply(ctx, config = {}) {
  if (config.enabled === false) return;
  const tools = new Set(config.tools ?? DEFAULT_TOOLS);
  const matcher = typeof config.pathPattern === 'string' && config.pathPattern
    ? new RegExp(config.pathPattern)
    : null;

  ctx.on('tools/pre-execute', (exec, next) => {
    if (!tools.has(exec.name)) return next();
    // str_replace_editor 的 view 命令是只读的，仅拦截写命令
    if (exec.name === 'str_replace_editor') {
      const cmd = exec.arguments?.command;
      if (typeof cmd !== 'string' || !STR_REPLACE_WRITE_COMMANDS.has(cmd)) return next();
    }
    const path = pathOf(exec);
    if (matcher && !(path && matcher.test(path))) return next();
    return { kind: 'ask', reason: reasonOf(exec, path) };
  });
}
