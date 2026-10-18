export interface EditorBridge {
  kind: 'rich' | 'markdown' | 'text' | 'code';
  exec?: (command: string, value?: string) => void;
  wrap?: (before: string, after: string) => void;
  prefixLine?: (prefix: string) => void;
  insertText?: (text: string) => void;
  insertImage?: () => void;
  focus?: () => void;
}

let current: EditorBridge | null = null;

export function setEditorBridge(bridge: EditorBridge | null) {
  if (bridge) current = bridge;
}

export function editorBridge(): EditorBridge | null {
  return current;
}
