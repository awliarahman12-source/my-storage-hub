import { useState } from 'react';
import { useApp } from '@/context/AppContext';

interface ConvertModalProps {
  open: boolean;
  onClose: () => void;
}

interface PdfTool {
  id: string;
  name: string;
  description: string;
  icon: string;
}

const tools: PdfTool[] = [
  { id: 'merge', name: 'Merge', description: 'Combine multiple PDFs into one file', icon: '\u29C9' },
  { id: 'split', name: 'Split', description: 'Extract pages or divide a PDF into parts', icon: '\u29D6' },
  { id: 'compress', name: 'Compress', description: 'Reduce PDF file size while keeping quality', icon: '\u229D' },
  { id: 'pdf-to-word', name: 'PDF to Word', description: 'Convert PDF into editable Word document', icon: 'W' },
  { id: 'pdf-to-powerpoint', name: 'PDF to PowerPoint', description: 'Convert PDF to editable slides', icon: 'P' },
  { id: 'pdf-to-excel', name: 'PDF to Excel', description: 'Extract tables into a spreadsheet', icon: 'X' },
  { id: 'word-to-pdf', name: 'Word to PDF', description: 'Convert .docx files to PDF', icon: 'W' },
  { id: 'powerpoint-to-pdf', name: 'PowerPoint to PDF', description: 'Convert .pptx slides to PDF', icon: 'P' },
  { id: 'excel-to-pdf', name: 'Excel to PDF', description: 'Convert .xlsx spreadsheets to PDF', icon: 'X' },
  { id: 'edit-pdf', name: 'Edit PDF', description: 'Add text, shapes, and annotations', icon: '\u270E' },
  { id: 'pdf-to-jpg', name: 'PDF to JPG', description: 'Convert each page into a JPG image', icon: '\u25F3' },
  { id: 'jpg-to-pdf', name: 'JPG to PDF', description: 'Combine images into a single PDF', icon: '\u25F4' },
  { id: 'sign', name: 'Sign', description: 'Add your signature to a PDF', icon: '\u2713' },
  { id: 'watermark', name: 'Watermark', description: 'Stamp text or image across pages', icon: '\u229B' },
  { id: 'rotate', name: 'Rotate', description: 'Rotate pages or the entire document', icon: '\u21BB' },
  { id: 'unlock', name: 'Unlock', description: 'Remove password protection from a PDF', icon: '\u2744' },
  { id: 'protect', name: 'Protect', description: 'Add a password to secure your PDF', icon: '\u2726' },
  { id: 'organize', name: 'Organize', description: 'Reorder, delete, or insert pages', icon: '\u29C8' },
  { id: 'pdf-a', name: 'PDF/A', description: 'Convert to long-term archival format', icon: 'A' },
  { id: 'repair', name: 'Repair', description: 'Fix corrupted or damaged PDF files', icon: '\u26A1' },
  { id: 'page-numbers', name: 'Page Numbers', description: 'Insert page numbers in any position', icon: '#' },
  { id: 'scan', name: 'Scan', description: 'Scan documents using your camera', icon: '\u29BF' },
  { id: 'ocr', name: 'OCR', description: 'Extract text from scanned PDFs', icon: '\u2295' },
  { id: 'compare', name: 'Compare', description: 'Highlight differences between two PDFs', icon: '\u29C1' },
  { id: 'redact', name: 'Redact', description: 'Permanently black out sensitive content', icon: '\u25A0' },
  { id: 'crop', name: 'Crop', description: 'Trim margins and adjust page size', icon: '\u2702' },
  { id: 'forms', name: 'Forms', description: 'Create and fill interactive PDF forms', icon: '\u29D2' },
  { id: 'ai-summarizer', name: 'AI Summarizer', description: 'Generate a summary of your document', icon: '\u2756' },
  { id: 'translate', name: 'Translate', description: 'Translate text within a PDF', icon: '\u29C7' },
  { id: 'markdown', name: 'Markdown', description: 'Convert PDF to Markdown format', icon: 'M' },
];

export function ConvertModal({ open, onClose }: ConvertModalProps) {
  const { toast } = useApp();
  const [search, setSearch] = useState('');

  const filtered = search.trim()
    ? tools.filter((t) =>
        t.name.toLowerCase().includes(search.toLowerCase()) ||
        t.description.toLowerCase().includes(search.toLowerCase()))
    : tools;

  const handleToolClick = (tool: PdfTool) => {
    toast(tool.name + ' — Coming Soon');
  };

  return (
    <div className={'modal-wrap' + (open ? ' open' : '')}>
      <div className="modal converter" style={{ width: 'min(680px, 100%)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h3>Tools PDF</h3>
            <p style={{ marginBottom: 0 }}>Pilih alat PDF yang Anda butuhkan.</p>
          </div>
          <button className="btn" style={{ flexShrink: 0 }} onClick={onClose}>{'\u00D7'}</button>
        </div>

        <input
          className="setting-input"
          style={{ margin: '14px 0' }}
          placeholder="Search tools..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <div className="modal-body">
          <div className="tools-grid">
            {filtered.map((tool) => (
              <button
                key={tool.id}
                className="tool-card"
                onClick={() => handleToolClick(tool)}
              >
                <div className="tool-icon">{tool.icon}</div>
                <div className="tool-info">
                  <strong>{tool.name}</strong>
                  <span>{tool.description}</span>
                </div>
                <span className="tool-badge">Soon</span>
              </button>
            ))}
          </div>
          {filtered.length === 0 && (
            <div style={{ textAlign: 'center', color: '#8a94a5', padding: 30, fontSize: 12 }}>
              No tools found for "{search}"
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
