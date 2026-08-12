export type TextSelectionOffsets = { start: number; end: number };

function textNodes(root: Node): Text[] {
  const nodes: Text[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    nodes.push(node as Text);
    node = walker.nextNode();
  }
  return nodes;
}

function offsetFromBoundary(root: Node, container: Node, offset: number): number | null {
  if (container !== root && !root.contains(container)) return null;
  if (container.nodeType === Node.TEXT_NODE) {
    let total = 0;
    for (const node of textNodes(root)) {
      if (node === container) return total + Math.min(offset, node.data.length);
      total += node.data.length;
    }
    return null;
  }

  const targetChildren = Array.from(container.childNodes).slice(0, offset);
  let total = 0;
  for (const child of targetChildren) total += child.textContent?.length ?? 0;
  let ancestor: Node | null = container;
  while (ancestor && ancestor !== root) {
    const parent: Node | null = ancestor.parentNode;
    if (!parent) break;
    for (const sibling of Array.from(parent.childNodes) as Node[]) {
      if (sibling === ancestor) break;
      total += sibling.textContent?.length ?? 0;
    }
    ancestor = parent;
  }
  return ancestor === root ? total : null;
}

export function selectionOffsets(
  root: HTMLElement,
  selection: Selection | null,
  includeCollapsed = false,
): TextSelectionOffsets | null {
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  const start = offsetFromBoundary(root, range.startContainer, range.startOffset);
  const end = offsetFromBoundary(root, range.endContainer, range.endOffset);
  if (start === null || end === null || (!includeCollapsed && start === end)) return null;
  return { start: Math.min(start, end), end: Math.max(start, end) };
}

export function restoreSelectionOffsets(
  root: HTMLElement,
  offsets: TextSelectionOffsets | null,
): void {
  if (!offsets) return;
  const nodes = textNodes(root);
  const total = nodes.reduce((sum, node) => sum + node.data.length, 0);
  const start = Math.max(0, Math.min(total, offsets.start));
  const end = Math.max(0, Math.min(total, offsets.end));
  const boundary = (target: number): { node: Node; offset: number } => {
    let cursor = 0;
    for (const node of nodes) {
      if (target <= cursor + node.data.length) return { node, offset: target - cursor };
      cursor += node.data.length;
    }
    return nodes.length
      ? { node: nodes[nodes.length - 1]!, offset: nodes[nodes.length - 1]!.data.length }
      : { node: root, offset: 0 };
  };
  const startBoundary = boundary(start);
  const endBoundary = boundary(end);
  const range = document.createRange();
  range.setStart(startBoundary.node, startBoundary.offset);
  range.setEnd(endBoundary.node, endBoundary.offset);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}
