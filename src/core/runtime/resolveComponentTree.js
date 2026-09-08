/** Resolve components while retaining Hook records by parent path, key and type. */
import { createTextVNode } from "../vnode/index.js";
import { normalizeChildren } from "../vnode/normalizeChildren.js";
import { runWithHooksDisabled, withComponent } from "./currentDispatcher.js";
import { commitEffects } from "./commitEffects.js";

function normalize(value) {
  if (value == null || typeof value === "boolean") return createTextVNode("");
  if (typeof value === "string" || typeof value === "number")
    return createTextVNode(value);
  if (Array.isArray(value))
    throw Error("Child components must return a single VNode.");
  return value;
}
function typeId(root, fn) {
  if (!root.componentTypeIds.has(fn))
    root.componentTypeIds.set(fn, ++root.nextComponentTypeId);
  return root.componentTypeIds.get(fn);
}
function identity(vnode, index) {
  return vnode.key == null
    ? ["index", index]
    : ["key", typeof vnode.key, vnode.key];
}
function resolveChildren(children, root, path) {
  const keys = new Set();
  return normalizeChildren(children).map((child, index) => {
    const key = JSON.stringify(identity(child, index));
    if (child.key != null && keys.has(key))
      throw Error("Duplicate sibling component key.");
    keys.add(key);
    return resolveComponentTree(child, root, `${path}/${key}`);
  });
}
export function resolveComponentTree(input, root = null, path = "root") {
  const vnode = normalize(input);
  if (vnode.type === "text") return vnode;
  if (typeof vnode.tag !== "function")
    return {
      ...vnode,
      children: resolveChildren(vnode.children, root, `${path}/${vnode.tag}`),
    };
  const props = { ...(vnode.props ?? {}), children: vnode.children ?? [] };
  let output;
  if (!root) {
    output = runWithHooksDisabled(() => vnode.tag(props));
  } else {
    const componentPath = `${path}/component:${typeId(root, vnode.tag)}`;
    let record = root.components.get(componentPath);
    if (!record)
      record = {
        hooks: [],
        hookCursor: 0,
        pendingEffects: [],
        expectedHookCount: null,
        isMounted: false,
        rootOwner: root,
        name: vnode.tag.name,
      };
    record.hookCursor = 0;
    record.pendingEffects = [];
    output = withComponent(record, () => vnode.tag(props));
    if (
      record.expectedHookCount !== null &&
      record.expectedHookCount !== record.hookCursor
    )
      throw Error("Hook count changed between renders.");
    record.expectedHookCount = record.hookCursor;
    root.nextComponents.set(componentPath, record);
    path = componentPath;
  }
  const resolved = resolveComponentTree(output, root, `${path}/output`);
  return vnode.key != null ? { ...resolved, key: vnode.key } : resolved;
}
export function disposeComponent(record) {
  record.isMounted = false;
  record.pendingEffects = [];
  for (const slot of record.hooks) {
    if (slot?.kind === "effect" && typeof slot.cleanup === "function") {
      const cleanup = slot.cleanup;
      slot.cleanup = null;
      cleanup();
    }
  }
}
export function commitComponentTree(root) {
  root.isCommitting = true;
  try {
    const next = root.nextComponents;
    for (const [path, record] of root.components)
      if (!next.has(path)) disposeComponent(record);
    root.components = next;
    for (const record of root.components.values()) record.isMounted = true;
    for (const record of root.components.values()) commitEffects(record);
    commitEffects(root);
  } finally {
    root.isCommitting = false;
  }
}
