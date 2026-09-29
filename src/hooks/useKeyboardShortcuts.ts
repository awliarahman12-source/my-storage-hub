import { useEffect } from 'react';

export interface KeyboardShortcut {
  key: string;
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
  alt?: boolean;
  handler: () => void;
  description?: string;
}

export function useKeyboardShortcuts(shortcuts: KeyboardShortcut[]): void {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Guard: e.key bisa undefined pada IME/mobile/composition events
      const eventKey = typeof e?.key === 'string' ? e.key.toLowerCase() : '';
      if (!eventKey) return;

      // Ignore when typing in input/textarea
      const target = e?.target as HTMLElement | null;
      const tagName = target?.tagName?.toLowerCase() ?? '';
      const isTyping =
        tagName === 'input' ||
        tagName === 'textarea' ||
        !!target?.isContentEditable;

      for (const sc of shortcuts) {
        if (!sc || typeof sc.key !== 'string') continue;
        const scKey = sc.key.toLowerCase();
        if (!scKey) continue;

        const ctrlMatch = sc.ctrl ? (e.ctrlKey || e.metaKey) : true;
        const metaMatch = sc.meta ? e.metaKey : true;
        const shiftMatch = sc.shift ? e.shiftKey : !e.shiftKey;
        const altMatch = sc.alt ? e.altKey : !e.altKey;

        const keyMatch = eventKey === scKey;

        if (keyMatch && ctrlMatch && metaMatch && shiftMatch && altMatch) {
          // Allow ⌘K / Ctrl+K even in inputs
          const isCmdK = (e.ctrlKey || e.metaKey) && scKey === 'k';
          // Allow Esc everywhere
          const isEscape = scKey === 'escape';

          if (isTyping && !isCmdK && !isEscape) continue;

          e.preventDefault();
          e.stopPropagation();
          try {
            sc.handler();
          } catch (err) {
            console.error('Shortcut handler failed:', err);
          }
          return;
        }
      }
    };

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [shortcuts]);
}

/**
 * Common shortcuts map — for display in help modal
 */
export const SHORTCUT_HELP: { keys: string; description: string }[] = [
  { keys: '⌘/Ctrl + K', description: 'Search files' },
  { keys: '⌘/Ctrl + U', description: 'Upload files' },
  { keys: '⌘/Ctrl + /', description: 'Show all shortcuts' },
  { keys: 'G then D', description: 'Go to Dashboard' },
  { keys: 'G then F', description: 'Go to All Files' },
  { keys: 'G then S', description: 'Go to Starred' },
  { keys: 'G then R', description: 'Go to Recent' },
  { keys: 'G then T', description: 'Go to Trash' },
  { keys: 'Esc', description: 'Close modal / clear selection' },
  { keys: '/', description: 'Focus search bar' },
];