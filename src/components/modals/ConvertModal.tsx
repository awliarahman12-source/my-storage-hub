import { useState, useRef } from 'react';
import { useApp } from '@/context/AppContext';

interface ConvertModalProps {
  open: boolean;
  onClose: () => void;
}

export function ConvertModal({ open, onClose }: ConvertModalProps) {
  const { toast } = useApp();
  const [pdfName, setPdfName] = useState('Choose a PDF file');
  const [format, setFormat] = useState('JPG');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const convert = () => {
    if (!fileInputRef.current?.files?.length) {
      toast('Pilih PDF terlebih dahulu');
      return;
    }
    toast('PDF conversion demo \u2192 ' + format);
    setTimeout(onClose, 700);
  };

  return (
    <div className={'modal-wrap' + (open ? ' open' : '')}>
      <div className="modal converter">
        <h3>PDF Converter</h3>
        <p>Convert PDF ke format yang tersedia pada demo.</p>
        <div className="convert-drop" onClick={() => fileInputRef.current?.click()}>
          <b>{pdfName}</b>
          <span>PDF {'\u2192'} JPG / PNG / TXT</span>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,application/pdf"
            hidden
            onChange={(e) => e.target.files?.[0] && setPdfName(e.target.files[0].name)}
          />
        </div>
        <label>Output format</label>
        <select className="setting-input" value={format} onChange={(e) => setFormat(e.target.value)}>
          <option>JPG</option><option>PNG</option><option>TXT</option>
        </select>
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={convert}>Convert PDF</button>
        </div>
      </div>
    </div>
  );
}
