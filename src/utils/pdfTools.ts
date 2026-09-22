import { useState, useRef, useEffect } from 'react';
import { useApp } from '@/context/AppContext';
import {
  mergePdfs, splitPdf, rotatePdf, imagesToPdf, pdfToJpgs,
  addWatermark, addPageNumbers, cropPdf, organizePdf, redactPdf,
  signPdf, addTextToPdf, compressPdf, repairPdf, unlockPdf, protectPdf, pdfToPdfA,
  ocrPdf, comparePdfs, captureFromCamera,
  pdfToWord, pdfToExcel, pdfToPptx,
  wordToPdf, excelToPdf, powerpointToPdf,
  translateText, markdownToPdf, pdfToMarkdown, summarizeWithGemini,
  downloadBlob, uint8ToBlob, stripExt, readPdfText,
} from '@/utils/pdfTools';

interface ConvertModalProps {
  open: boolean;
  onClose: () => void;
}

type ToolId =
  | 'merge' | 'split' | 'compress' | 'pdf-to-word' | 'pdf-to-powerpoint' | 'pdf-to-excel'
  | 'word-to-pdf' | 'powerpoint-to-pdf' | 'excel-to-pdf' | 'edit-pdf' | 'pdf-to-jpg'
  | 'jpg-to-pdf' | 'sign' | 'watermark' | 'rotate' | 'unlock' | 'protect'
  | 'organize' | 'pdf-a' | 'repair' | 'page-numbers' | 'scan' | 'ocr'
  | 'compare' | 'redact' | 'crop' | 'forms' | 'ai-summarizer' | 'translate' | 'markdown';

interface PdfTool {
  id: ToolId;
  name: string;
  description: string;
  icon: string;
}

const tools: PdfTool[] = [
  { id: 'merge', name: 'Merge', description: 'Gabung beberapa PDF jadi satu', icon: '⧉' },
  { id: 'split', name: 'Split', description: 'Ambil halaman tertentu dari PDF', icon: '⧖' },
  { id: 'compress', name: 'Compress', description: 'Perkecil ukuran PDF', icon: '⊝' },
  { id: 'pdf-to-word', name: 'PDF to Word', description: 'Ubah PDF jadi Word', icon: 'W' },
  { id: 'pdf-to-powerpoint', name: 'PDF to PowerPoint', description: 'Ubah PDF jadi slide', icon: 'P' },
  { id: 'pdf-to-excel', name: 'PDF to Excel', description: 'Ekstrak tabel ke spreadsheet', icon: 'X' },
  { id: 'word-to-pdf', name: 'Word to PDF', description: 'Ubah .docx jadi PDF', icon: 'W' },
  { id: 'powerpoint-to-pdf', name: 'PowerPoint to PDF', description: 'Ubah .pptx jadi PDF', icon: 'P' },
  { id: 'excel-to-pdf', name: 'Excel to PDF', description: 'Ubah .xlsx jadi PDF', icon: 'X' },
  { id: 'edit-pdf', name: 'Edit PDF', description: 'Tambah teks ke halaman', icon: '✎' },
  { id: 'pdf-to-jpg', name: 'PDF to JPG', description: 'Ubah tiap halaman jadi JPG', icon: '◳' },
  { id: 'jpg-to-pdf', name: 'JPG to PDF', description: 'Gabung gambar jadi PDF', icon: '◰' },
  { id: 'sign', name: 'Sign', description: 'Tambah tanda tangan', icon: '✓' },
  { id: 'watermark', name: 'Watermark', description: 'Cap teks di semua halaman', icon: '⊛' },
  { id: 'rotate', name: 'Rotate', description: 'Putar halaman PDF', icon: '↻' },
  { id: 'unlock', name: 'Unlock', description: 'Buka proteksi PDF', icon: '❄' },
  { id: 'protect', name: 'Protect', description: 'Tandai PDF sebagai protected', icon: '✦' },
  { id: 'organize', name: 'Organize', description: 'Susun ulang halaman', icon: '⧈' },
  { id: 'pdf-a', name: 'PDF/A', description: 'Format arsip jangka panjang', icon: 'A' },
  { id: 'repair', name: 'Repair', description: 'Perbaiki PDF rusak', icon: '⚡' },
  { id: 'page-numbers', name: 'Page Numbers', description: 'Tambah nomor halaman', icon: '#' },
  { id: 'scan', name: 'Scan', description: 'Scan pakai kamera', icon: '⦿' },
  { id: 'ocr', name: 'OCR', description: 'Ekstrak teks dari scan', icon: '⊕' },
  { id: 'compare', name: 'Compare', description: 'Bandingkan 2 PDF', icon: '⧁' },
  { id: 'redact', name: 'Redact', description: 'Hitamkan area tertentu', icon: '■' },
  { id: 'crop', name: 'Crop', description: 'Potong margin', icon: '✂' },
  { id: 'forms', name: 'Forms', description: 'Tambah field form teks', icon: '⧒' },
  { id: 'ai-summarizer', name: 'AI Summarizer', description: 'Ringkas dokumen (Gemini)', icon: '❖' },
  { id: 'translate', name: 'Translate', description: 'Terjemah teks PDF', icon: '⧇' },
  { id: 'markdown', name: 'Markdown', description: 'PDF ↔ Markdown', icon: 'M' },
];

export function ConvertModal({ open, onClose }: ConvertModalProps) {
  const { toast } = useApp();
  const [search, setSearch] = useState('');
  const [activeTool, setActiveTool] = useState<ToolId | null>(null);

  // File & processing
  const [files, setFiles] = useState<File[]>([]);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState('');
  const [result, setResult] = useState<{ blob: Blob; filename: string }[] | null>(null);

  // Tool-specific options
  const [fromPage, setFromPage] = useState(1);
  const [toPage, setToPage] = useState(1);
  const [angle, setAngle] = useState<90 | 180 | 270>(90);
  const [wmText, setWmText] = useState('CONFIDENTIAL');
  const [wmSize, setWmSize] = useState(48);
  const [wmOpacity, setWmOpacity] = useState(0.25);
  const [pageNumPos, setPageNumPos] = useState<'bottom-center' | 'bottom-right' | 'bottom-left' | 'top-center'>('bottom-center');
  const [pageNumFmt, setPageNumFmt] = useState('{n} / {total}');
  const [cropT, setCropT] = useState(20);
  const [cropR, setCropR] = useState(20);
  const [cropB, setCropB] = useState(20);
  const [cropL, setCropL] = useState(20);
  const [order, setOrder] = useState('1,2,3');
  const [editText, setEditText] = useState('Hello world');
  const [editPage, setEditPage] = useState(0);
  const [editX, setEditX] = useState(50);
  const [editY, setEditY] = useState(50);
  const [signatureDataUrl, setSignatureDataUrl] = useState('');
  const [ocrLang, setOcrLang] = useState('eng');
  const [ocrResult, setOcrResult] = useState('');
  const [translateLang, setTranslateLang] = useState('id');
  const [markdownInput, setMarkdownInput] = useState('');
  const [geminiKey, setGeminiKey] = useState('');
  const [aiSummary, setAiSummary] = useState('');
  const [compareResult, setCompareResult] = useState<{ page: number; img1: string; img2: string }[]>([]);
  const [formFields, setFormFields] = useState('Nama,Alamat,Tanggal');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const filtered = search.trim()
    ? tools.filter((t) => t.name.toLowerCase().includes(search.toLowerCase()) || t.description.toLowerCase().includes(search.toLowerCase()))
    : tools;

  const resetTool = () => {
    setActiveTool(null);
    setFiles([]);
    setProcessing(false);
    setProgress('');
    setResult(null);
    setOcrResult('');
    setAiSummary('');
    setCompareResult([]);
    setSignatureDataUrl('');
    setMarkdownInput('');
  };

  useEffect(() => {
    if (!open) resetTool();
  }, [open]);

  const handleToolClick = (tool: PdfTool) => {
    setActiveTool(tool.id);
    setFiles([]);
    setResult(null);
    setProgress('');
    setOcrResult('');
    setAiSummary('');
    setCompareResult([]);
    setSignatureDataUrl('');
    setMarkdownInput('');
  };

  const handleFileSelect = (fl: FileList | null) => {
    if (!fl?.length) return;
    setFiles(Array.from(fl));
    setResult(null);
    setProgress('');
  };

  const acceptFor = (): string => {
    if (activeTool === 'jpg-to-pdf') return 'image/jpeg,image/png,.jpg,.jpeg,.png';
    if (activeTool === 'word-to-pdf') return '.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    if (activeTool === 'excel-to-pdf') return '.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel';
    if (activeTool === 'powerpoint-to-pdf') return '.pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation';
    if (activeTool === 'markdown') return 'application/pdf,.pdf,.md,.markdown,.txt';
    return 'application/pdf,.pdf';
  };

  const multipleFor = (): boolean => ['merge', 'jpg-to-pdf', 'compare'].includes(activeTool || '');

  const canProcess = (): boolean => {
    if (processing) return false;
    if (activeTool === 'markdown' && markdownInput.trim()) return true;
    if (activeTool === 'ai-summarizer' && markdownInput.trim()) return true;
    if (activeTool === 'scan') return true;
    if (activeTool === 'compare') return files.length === 2;
    if (files.length === 0) return false;
    if (activeTool === 'merge') return files.length >= 2;
    if (activeTool === 'split') return toPage >= fromPage && fromPage >= 1;
    if (activeTool === 'sign') return !!signatureDataUrl;
    return true;
  };

  const run = async () => {
    if (!activeTool) return;
    setProcessing(true);
    setResult(null);
    setProgress('Memproses...');
    try {
      await runToolInternal();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal';
      toast(msg);
      setProgress('');
    } finally {
      setProcessing(false);
    }
  };

  const runToolInternal = async () => {
    if (!activeTool) return;
    const f0 = files[0];

    switch (activeTool) {
      case 'merge': {
        setProgress(`Menggabungkan ${files.length} PDF...`);
        const bytes = await mergePdfs(files);
        setResult([{ blob: uint8ToBlob(bytes), filename: 'merged.pdf' }]);
        break;
      }
      case 'split': {
        const bytes = await splitPdf(f0, fromPage, toPage);
        setResult([{ blob: uint8ToBlob(bytes), filename: `${stripExt(f0.name)}_p${fromPage}-${toPage}.pdf` }]);
        break;
      }
      case 'rotate': {
        const bytes = await rotatePdf(f0, angle);
        setResult([{ blob: uint8ToBlob(bytes), filename: `${stripExt(f0.name)}_rot${angle}.pdf` }]);
        break;
      }
      case 'jpg-to-pdf': {
        const bytes = await imagesToPdf(files);
        setResult([{ blob: uint8ToBlob(bytes), filename: 'images.pdf' }]);
        break;
      }
      case 'pdf-to-jpg': {
        const pages = await pdfToJpgs(f0);
        setResult(pages.map((p) => ({ blob: p.blob, filename: `${stripExt(f0.name)}_page-${String(p.page).padStart(3, '0')}.jpg` })));
        break;
      }
      case 'watermark': {
        const bytes = await addWatermark(f0, wmText, { fontSize: wmSize, opacity: wmOpacity });
        setResult([{ blob: uint8ToBlob(bytes), filename: `${stripExt(f0.name)}_watermark.pdf` }]);
        break;
      }
      case 'page-numbers': {
        const bytes = await addPageNumbers(f0, { position: pageNumPos, format: pageNumFmt });
        setResult([{ blob: uint8ToBlob(bytes), filename: `${stripExt(f0.name)}_numbered.pdf` }]);
        break;
      }
      case 'crop': {
        const bytes = await cropPdf(f0, { top: cropT, right: cropR, bottom: cropB, left: cropL });
        setResult([{ blob: uint8ToBlob(bytes), filename: `${stripExt(f0.name)}_cropped.pdf` }]);
        break;
      }
      case 'organize': {
        const nums = order.split(',').map((s) => parseInt(s.trim()) - 1).filter((n) => !isNaN(n));
        const bytes = await organizePdf(f0, nums);
        setResult([{ blob: uint8ToBlob(bytes), filename: `${stripExt(f0.name)}_reordered.pdf` }]);
        break;
      }
      case 'redact': {
        // Simple: hitamkan kotak di tengah tiap halaman
        const bytes = await redactPdf(f0, [{ page: 0, x: 100, y: 100, width: 300, height: 40 }]);
        setResult([{ blob: uint8ToBlob(bytes), filename: `${stripExt(f0.name)}_redacted.pdf` }]);
        break;
      }
      case 'edit-pdf': {
        const bytes = await addTextToPdf(f0, editText, { page: editPage, x: editX, y: editY });
        setResult([{ blob: uint8ToBlob(bytes), filename: `${stripExt(f0.name)}_edited.pdf` }]);
        break;
      }
      case 'sign': {
        const bytes = await signPdf(f0, signatureDataUrl);
        setResult([{ blob: uint8ToBlob(bytes), filename: `${stripExt(f0.name)}_signed.pdf` }]);
        break;
      }
      case 'compress': {
        const bytes = await compressPdf(f0);
        setResult([{ blob: uint8ToBlob(bytes), filename: `${stripExt(f0.name)}_compressed.pdf` }]);
        break;
      }
      case 'repair': {
        const bytes = await repairPdf(f0);
        setResult([{ blob: uint8ToBlob(bytes), filename: `${stripExt(f0.name)}_repaired.pdf` }]);
        break;
      }
      case 'unlock': {
        const bytes = await unlockPdf(f0);
        setResult([{ blob: uint8ToBlob(bytes), filename: `${stripExt(f0.name)}_unlocked.pdf` }]);
        break;
      }
      case 'protect': {
        const bytes = await protectPdf(f0);
        setResult([{ blob: uint8ToBlob(bytes), filename: `${stripExt(f0.name)}_protected.pdf` }]);
        break;
      }
      case 'pdf-a': {
        const bytes = await pdfToPdfA(f0);
        setResult([{ blob: uint8ToBlob(bytes), filename: `${stripExt(f0.name)}_pdfa.pdf` }]);
        break;
      }
      case 'ocr': {
        setProgress('Menjalankan OCR (pertama kali butuh download bahasa)...');
        const texts = await ocrPdf(f0, ocrLang, (p) => setProgress(`OCR hal ${p.page}/${p.total}: ${p.status} ${Math.round(p.progress * 100)}%`));
        const combined = texts.map((t) => `--- Halaman ${t.page} ---\n${t.text}`).join('\n\n');
        setOcrResult(combined);
        setResult([{ blob: new Blob([combined], { type: 'text/plain' }), filename: `${stripExt(f0.name)}_ocr.txt` }]);
        break;
      }
      case 'compare': {
        if (files.length !== 2) throw new Error('Pilih 2 PDF');
        setProgress('Merender perbandingan...');
        const cmp = await comparePdfs(files[0], files[1]);
        setCompareResult(cmp);
        break;
      }
      case 'pdf-to-word': {
        const blob = await pdfToWord(f0);
        setResult([{ blob, filename: `${stripExt(f0.name)}.docx` }]);
        break;
      }
      case 'pdf-to-excel': {
        const blob = await pdfToExcel(f0);
        setResult([{ blob, filename: `${stripExt(f0.name)}.xlsx` }]);
        break;
      }
      case 'pdf-to-powerpoint': {
        setProgress('Render slide...');
        const blob = await pdfToPptx(f0);
        setResult([{ blob, filename: `${stripExt(f0.name)}.pptx` }]);
        break;
      }
      case 'word-to-pdf': {
        setProgress('Render Word → PDF...');
        const blob = await wordToPdf(f0);
        setResult([{ blob, filename: `${stripExt(f0.name)}.pdf` }]);
        break;
      }
      case 'excel-to-pdf': {
        setProgress('Render Excel → PDF...');
        const blob = await excelToPdf(f0);
        setResult([{ blob, filename: `${stripExt(f0.name)}.pdf` }]);
        break;
      }
      case 'powerpoint-to-pdf': {
        setProgress('Render PowerPoint → PDF...');
        const blob = await powerpointToPdf(f0);
        setResult([{ blob, filename: `${stripExt(f0.name)}.pdf` }]);
        break;
      }
      case 'translate': {
        setProgress('Menerjemahkan...');
        const text = await readPdfText(f0);
        const translated = await translateText(text, translateLang);
        setResult([{ blob: new Blob([translated], { type: 'text/plain' }), filename: `${stripExt(f0.name)}_translated.txt` }]);
        break;
      }
      case 'markdown': {
        if (markdownInput.trim()) {
          setProgress('Markdown → PDF...');
          const blob = await markdownToPdf(markdownInput);
          setResult([{ blob, filename: 'markdown.pdf' }]);
        } else if (f0) {
          const md = await pdfToMarkdown(f0);
          setMarkdownInput(md);
          setResult([{ blob: new Blob([md], { type: 'text/markdown' }), filename: `${stripExt(f0.name)}.md` }]);
        }
        break;
      }
      case 'ai-summarizer': {
        if (!geminiKey.trim()) throw new Error('Masukkan Gemini API key dulu');
        setProgress('Mengirim ke AI...');
        const text = markdownInput.trim() || (f0 ? await readPdfText(f0) : '');
        const summary = await summarizeWithGemini(text, geminiKey);
        setAiSummary(summary);
        setResult([{ blob: new Blob([summary], { type: 'text/plain' }), filename: 'summary.txt' }]);
        break;
      }
      case 'forms': {
        // Sederhana: tambahkan label teks di halaman 1
        const labels = formFields.split(',').map((s) => s.trim()).filter(Boolean);
        let bytes = await f0.arrayBuffer();
        let doc = await (await import('pdf-lib')).PDFDocument.load(bytes, { ignoreEncryption: true });
        const { rgb, StandardFonts } = await import('pdf-lib');
        const font = await doc.embedFont(StandardFonts.Helvetica);
        const page = doc.getPage(0);
        const { height } = page.getSize();
        labels.forEach((label, i) => {
          const y = height - 80 - i * 40;
          page.drawText(`${label}:`, { x: 50, y, size: 12, font, color: rgb(0, 0, 0) });
          page.drawRectangle({ x: 150, y: y - 4, width: 300, height: 20, borderColor: rgb(0.5, 0.5, 0.5), borderWidth: 1 });
        });
        const out = await doc.save();
        setResult([{ blob: uint8ToBlob(out), filename: `${stripExt(f0.name)}_form.pdf` }]);
        break;
      }
      case 'scan': {
        setProgress('Membuka kamera...');
        await new Promise<void>((resolve) => {
          captureFromCamera((blob) => {
            setFiles((prev) => [...prev, new File([blob], `scan_${Date.now()}.jpg`, { type: 'image/jpeg' })]);
          }).then((close) => {
            // Auto close setelah 60 detik atau saat user klik Done
            setTimeout(close, 60000);
            resolve();
          }).catch((e) => { throw e; });
        });
        setProgress('Scan selesai. Klik Process untuk gabung jadi PDF.');
        break;
      }
      default:
        throw new Error('Tool belum diimplementasi');
    }

    setProgress('');
    if (result === null) {
      toast('Selesai');
    }
  };

  const handleDownload = () => {
    if (!result) return;
    if (result.length === 1) {
      downloadBlob(result[0].blob, result[0].filename);
    } else {
      result.forEach((r, i) => setTimeout(() => downloadBlob(r.blob, r.filename), i * 200));
    }
  };

  if (!open) return null;

  // ===== TOOL PANEL =====
  if (activeTool) {
    const tool = tools.find((t) => t.id === activeTool)!;
    return (
      <div className="modal-wrap open">
        <div className="modal converter" style={{ width: 'min(620px, 100%)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
                <span style={{ fontSize: 20 }}>{tool.icon}</span> {tool.name}
              </h3>
              <p style={{ marginBottom: 0 }}>{tool.description}</p>
            </div>
            <button className="btn" onClick={resetTool}>← Back</button>
          </div>

          <div style={{ marginTop: 16 }}>
            {/* File picker */}
            {activeTool !== 'markdown' && activeTool !== 'ai-summarizer' && activeTool !== 'scan' && (
              <div
                className="convert-drop"
                onClick={() => !processing && fileInputRef.current?.click()}
                style={{ cursor: processing ? 'wait' : 'pointer', opacity: processing ? 0.6 : 1 }}
              >
                {files.length === 0 ? (
                  <>
                    <b>Pilih file {multipleFor() ? '(bisa banyak)' : ''}</b>
                    <span>{acceptFor().replace(/\./g, '').replace(/,/g, ' · ')}</span>
                  </>
                ) : (
                  <>
                    <b>{files.length} file dipilih</b>
                    <span style={{ display: 'block', marginTop: 4 }}>
                      {files.slice(0, 3).map((f) => f.name).join(', ')}
                      {files.length > 3 ? ` +${files.length - 3} lagi` : ''}
                    </span>
                  </>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={acceptFor()}
                  multiple={multipleFor()}
                  hidden
                  onChange={(e) => handleFileSelect(e.target.files)}
                />
              </div>
            )}

            {/* Tool-specific options */}
            {activeTool === 'split' && files.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 14 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, display: 'block', marginBottom: 4 }}>Dari halaman</label>
                  <input type="number" min={1} className="setting-input" value={fromPage} onChange={(e) => setFromPage(Math.max(1, Number(e.target.value) || 1))} />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, display: 'block', marginBottom: 4 }}>Sampai halaman</label>
                  <input type="number" min={fromPage} className="setting-input" value={toPage} onChange={(e) => setToPage(Math.max(1, Number(e.target.value) || 1))} />
                </div>
              </div>
            )}

            {activeTool === 'rotate' && (
              <div style={{ marginTop: 14 }}>
                <label style={{ fontSize: 11, fontWeight: 700, display: 'block', marginBottom: 6 }}>Sudut putaran</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {([90, 180, 270] as const).map((a) => (
                    <button key={a} className={'xbtn' + (angle === a ? ' primary' : '')} style={{ flex: 1 }} onClick={() => setAngle(a)}>{a}°</button>
                  ))}
                </div>
              </div>
            )}

            {activeTool === 'watermark' && (
              <div style={{ marginTop: 14, display: 'grid', gap: 10 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, display: 'block', marginBottom: 4 }}>Teks watermark</label>
                  <input className="setting-input" value={wmText} onChange={(e) => setWmText(e.target.value)} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, display: 'block', marginBottom: 4 }}>Font size: {wmSize}</label>
                    <input type="range" min={12} max={120} value={wmSize} onChange={(e) => setWmSize(Number(e.target.value))} style={{ width: '100%' }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, display: 'block', marginBottom: 4 }}>Opacity: {wmOpacity.toFixed(2)}</label>
                    <input type="range" min={0.05} max={1} step={0.05} value={wmOpacity} onChange={(e) => setWmOpacity(Number(e.target.value))} style={{ width: '100%' }} />
                  </div>
                </div>
              </div>
            )}

            {activeTool === 'page-numbers' && (
              <div style={{ marginTop: 14, display: 'grid', gap: 10 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, display: 'block', marginBottom: 4 }}>Format</label>
                  <input className="setting-input" value={pageNumFmt} onChange={(e) => setPageNumFmt(e.target.value)} placeholder="{n} / {total}" />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, display: 'block', marginBottom: 4 }}>Posisi</label>
                  <select className="setting-input" value={pageNumPos} onChange={(e) => setPageNumPos(e.target.value as any)}>
                    <option value="bottom-center">Bawah tengah</option>
                    <option value="bottom-right">Bawah kanan</option>
                    <option value="bottom-left">Bawah kiri</option>
                    <option value="top-center">Atas tengah</option>
                  </select>
                </div>
              </div>
            )}

            {activeTool === 'crop' && (
              <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8 }}>
                {[['Top', cropT, setCropT], ['Right', cropR, setCropR], ['Bottom', cropB, setCropB], ['Left', cropL, setCropL]].map(([l, v, s]: any) => (
                  <div key={l}>
                    <label style={{ fontSize: 11, fontWeight: 700, display: 'block', marginBottom: 4 }}>{l}</label>
                    <input type="number" min={0} className="setting-input" value={v} onChange={(e) => s(Number(e.target.value) || 0)} />
                  </div>
                ))}
              </div>
            )}

            {activeTool === 'organize' && (
              <div style={{ marginTop: 14 }}>
                <label style={{ fontSize: 11, fontWeight: 700, display: 'block', marginBottom: 4 }}>Urutan halaman (contoh: 3,1,2,4)</label>
                <input className="setting-input" value={order} onChange={(e) => setOrder(e.target.value)} placeholder="1,2,3" />
              </div>
            )}

            {activeTool === 'edit-pdf' && (
              <div style={{ marginTop: 14, display: 'grid', gap: 10 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, display: 'block', marginBottom: 4 }}>Teks</label>
                  <input className="setting-input" value={editText} onChange={(e) => setEditText(e.target.value)} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, display: 'block', marginBottom: 4 }}>Halaman (0-index)</label>
                    <input type="number" min={0} className="setting-input" value={editPage} onChange={(e) => setEditPage(Number(e.target.value))} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, display: 'block', marginBottom: 4 }}>X</label>
                    <input type="number" className="setting-input" value={editX} onChange={(e) => setEditX(Number(e.target.value))} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, display: 'block', marginBottom: 4 }}>Y</label>
                    <input type="number" className="setting-input" value={editY} onChange={(e) => setEditY(Number(e.target.value))} />
                  </div>
                </div>
              </div>
            )}

            {activeTool === 'sign' && (
              <div style={{ marginTop: 14 }}>
                <label style={{ fontSize: 11, fontWeight: 700, display: 'block', marginBottom: 6 }}>Upload gambar tanda tangan (PNG/JPG)</label>
                <input
                  type="file"
                  accept="image/png,image/jpeg"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    const reader = new FileReader();
                    reader.onload = () => setSignatureDataUrl(reader.result as string);
                    reader.readAsDataURL(f);
                  }}
                />
                {signatureDataUrl && <img src={signatureDataUrl} alt="" style={{ marginTop: 8, maxHeight: 100, border: '1px solid #ccc', padding: 4 }} />}
              </div>
            )}

            {activeTool === 'ocr' && (
              <div style={{ marginTop: 14 }}>
                <label style={{ fontSize: 11, fontWeight: 700, display: 'block', marginBottom: 4 }}>Bahasa OCR</label>
                <select className="setting-input" value={ocrLang} onChange={(e) => setOcrLang(e.target.value)}>
                  <option value="eng">English</option>
                  <option value="ind">Indonesian</option>
                  <option value="eng+ind">English + Indonesian</option>
                  <option value="jpn">Japanese</option>
                  <option value="chi_sim">Chinese (Simplified)</option>
                  <option value="ara">Arabic</option>
                  <option value="kor">Korean</option>
                </select>
              </div>
            )}

            {activeTool === 'translate' && (
              <div style={{ marginTop: 14 }}>
                <label style={{ fontSize: 11, fontWeight: 700, display: 'block', marginBottom: 4 }}>Target bahasa</label>
                <select className="setting-input" value={translateLang} onChange={(e) => setTranslateLang(e.target.value)}>
                  <option value="id">Indonesia</option>
                  <option value="en">English</option>
                  <option value="ja">Japanese</option>
                  <option value="ko">Korean</option>
                  <option value="zh">Chinese</option>
                  <option value="ar">Arabic</option>
                  <option value="es">Spanish</option>
                </select>
              </div>
            )}

            {activeTool === 'ai-summarizer' && (
              <div style={{ marginTop: 14 }}>
                <label style={{ fontSize: 11, fontWeight: 700, display: 'block', marginBottom: 4 }}>Gemini API Key</label>
                <input className="setting-input" value={geminiKey} onChange={(e) => setGeminiKey(e.target.value)} placeholder="AIza..." type="password" />
                <p style={{ fontSize: 10, color: '#9da7b8', marginTop: 6 }}>Dapatkan gratis di aistudio.google.com</p>
              </div>
            )}

            {activeTool === 'forms' && (
              <div style={{ marginTop: 14 }}>
                <label style={{ fontSize: 11, fontWeight: 700, display: 'block', marginBottom: 4 }}>Nama field (pisah dengan koma)</label>
                <input className="setting-input" value={formFields} onChange={(e) => setFormFields(e.target.value)} />
              </div>
            )}

            {activeTool === 'markdown' && (
              <div style={{ marginTop: 14 }}>
                <label style={{ fontSize: 11, fontWeight: 700, display: 'block', marginBottom: 4 }}>Markdown (atau pilih PDF untuk convert ke Markdown)</label>
                <textarea className="setting-input" rows={8} value={markdownInput} onChange={(e) => setMarkdownInput(e.target.value)} placeholder="# Judul&#10;&#10;Isi..." />
              </div>
            )}

            {activeTool === 'scan' && (
              <div style={{ marginTop: 14, padding: 12, background: '#eef2ff', borderRadius: 10, fontSize: 12, color: '#3b3dbf' }}>
                Klik Process untuk membuka kamera. Ambil beberapa foto, lalu Done.
              </div>
            )}

            {activeTool === 'compare' && (
              <div style={{ marginTop: 14 }}>
                <p style={{ fontSize: 12, color: '#7b8495', margin: 0 }}>
                  Pilih 2 file PDF untuk dibandingkan. Hasil akan tampil berdampingan.
                </p>
              </div>
            )}

            {/* Progress */}
            {processing && progress && (
              <div style={{ marginTop: 14, padding: 12, borderRadius: 10, background: '#eef2ff', color: '#3b3dbf', fontSize: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
                <div className="preview-spinner" style={{ width: 18, height: 18 }} />
                {progress}
              </div>
            )}

            {/* OCR result preview */}
            {ocrResult && (
              <div style={{ marginTop: 14, padding: 12, borderRadius: 10, background: '#f6f7fb', maxHeight: 200, overflowY: 'auto', fontSize: 11, whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>
                {ocrResult.slice(0, 3000)}
              </div>
            )}

            {/* AI summary preview */}
            {aiSummary && (
              <div style={{ marginTop: 14, padding: 12, borderRadius: 10, background: '#f6f7fb', maxHeight: 200, overflowY: 'auto', fontSize: 12 }}>
                {aiSummary}
              </div>
            )}

            {/* Compare result */}
            {compareResult.length > 0 && (
              <div style={{ marginTop: 14, maxHeight: 400, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
                {compareResult.map((c) => (
                  <div key={c.page} style={{ padding: 8, borderBottom: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 4 }}>Halaman {c.page}</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      {c.img1 ? <img src={c.img1} alt="" style={{ width: '100%', border: '1px solid #ccc' }} /> : <div style={{ color: '#999', fontSize: 11 }}>—</div>}
                      {c.img2 ? <img src={c.img2} alt="" style={{ width: '100%', border: '1px solid #ccc' }} /> : <div style={{ color: '#999', fontSize: 11 }}>—</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Result */}
            {result && result.length > 0 && (
              <div style={{ marginTop: 14, padding: 12, borderRadius: 10, background: '#ecfdf5', border: '1px solid #a7f3d0' }}>
                <strong style={{ fontSize: 13, color: '#065f46', display: 'block', marginBottom: 6 }}>
                  ✓ Selesai — {result.length} file
                </strong>
                <ul style={{ margin: '6px 0 10px', paddingLeft: 18, fontSize: 11, color: '#166534', maxHeight: 120, overflowY: 'auto' }}>
                  {result.slice(0, 10).map((r, i) => (
                    <li key={i}>{r.filename} ({(r.blob.size / 1024).toFixed(1)} KB)</li>
                  ))}
                  {result.length > 10 && <li>... dan {result.length - 10} lagi</li>}
                </ul>
                <button className="btn primary" style={{ fontSize: 12, padding: '8px 16px' }} onClick={handleDownload}>
                  ⬇ Download
                </button>
              </div>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button className="btn" onClick={resetTool} disabled={processing}>Cancel</button>
              <button className="btn primary" onClick={() => void run()} disabled={!canProcess()}>
                {processing ? 'Processing...' : 'Process'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ===== TOOL LIST =====
  return (
    <div className={'modal-wrap' + (open ? ' open' : '')}>
      <div className="modal converter" style={{ width: 'min(680px, 100%)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h3>Tools PDF</h3>
            <p style={{ marginBottom: 0 }}>Pilih alat PDF yang Anda butuhkan.</p>
          </div>
          <button className="btn" style={{ flexShrink: 0 }} onClick={onClose}>×</button>
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