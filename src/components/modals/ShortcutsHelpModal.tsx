import { useApp } from '@/context/AppContext';
import { SHORTCUT_HELP } from '@/hooks/useKeyboardShortcuts';

export function ShortcutsHelpModal() {
  const { shortcutsHelpOpen, setShortcutsHelpOpen } = useApp();

  if (!shortcutsHelpOpen) return null;

  return (
    <div className="modal-wrap open" onClick={() => setShortcutsHelpOpen(false)}>
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        style={{ width: 'min(480px, 100%)' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0 }}>Keyboard Shortcuts</h3>
          <button className="btn" onClick={() => setShortcutsHelpOpen(false)}>{'\u00D7'}</button>
        </div>

        <div style={{ display: 'grid', gap: 4 }}>
          {SHORTCUT_HELP.map((item, idx) => (
            <div
              key={idx}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '10px 12px',
                borderRadius: 8,
                background: idx % 2 === 0 ? 'var(--soft, #f6f7fb)' : 'transparent',
              }}
            >
              <span style={{ fontSize: 13, color: 'var(--text)' }}>{item.description}</span>
              <kbd style={{
                fontSize: 11,
                padding: '4px 10px',
                borderRadius: 6,
                background: 'var(--panel, #fff)',
                border: '1px solid var(--line)',
                fontFamily: 'ui-monospace,monospace',
                color: '#5a6a7e',
                fontWeight: 600,
              }}>{item.keys}</kbd>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 16, textAlign: 'center' }}>
          <button className="btn primary" onClick={() => setShortcutsHelpOpen(false)}>Got it</button>
        </div>
      </div>
    </div>
  );
}