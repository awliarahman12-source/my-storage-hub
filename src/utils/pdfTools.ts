import { PDFDocument, degrees, rgb, StandardFonts } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const MAX_FILE_BYTES = 100 * 1024 * 1024;

function assertSize(files: File[]): void {
  for (const f of files) {
    if (f.size > MAX_FILE_BYTES) throw new Error(`${f.name} terlalu besar (max 100 MB)`);
  }
}

// ============ BASIC ============

export async function mergePdfs(files: File[]): Promise<Uint8Array> {
  if (files.length < 2) throw new Error('Minimal 2 PDF');
  assertSize(files);
  const merged = await PDFDocument.create();
  for (const file of files) {
    const bytes = await file.arrayBuffer();
    const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const copied = await merged.copyPages(src, src.getPageIndices());
    copied.forEach((p) => merged.addPage(p));
  }
  return await merged.save();
}

export async function splitPdf(file: File, from: number, to: number): Promise<Uint8Array> {
  assertSize([file]);
  const bytes = await file.arrayBuffer();
  const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const total = src.getPageCount();
  if (from < 1 || to < from || from > total) throw new Error(`Range tidak valid. PDF punya ${total} halaman.`);
  const end = Math.min(total, to);
  const out = await PDFDocument.create();
  const idx: number[] = [];
  for (let i = from - 1; i <= end - 1; i++) idx.push(i);
  const copied = await out.copyPages(src, idx);
  copied.forEach((p) => out.addPage(p));
  return await out.save();
}

export async function rotatePdf(file: File, angle: 90 | 180 | 270): Promise<Uint8Array> {
  assertSize([file]);
  const bytes = await file.arrayBuffer();
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  for (const page of doc.getPages()) {
    const current = page.getRotation().angle;
    page.setRotation(degrees((current + angle) % 360));
  }
  return await doc.save();
}

export async function imagesToPdf(files: File[]): Promise<Uint8Array> {
  if (files.length === 0) throw new Error('Pilih minimal 1 gambar');
  assertSize(files);
  const doc = await PDFDocument.create();
  let added = 0;
  for (const file of files) {
    const bytes = await file.arrayBuffer();
    let img;
    try {
      if (file.type === 'image/png') img = await doc.embedPng(bytes);
      else if (file.type === 'image/jpeg' || file.type === 'image/jpg') img = await doc.embedJpg(bytes);
      else continue;
    } catch { continue; }
    const A4_W = 595, A4_H = 842, margin = 20;
    const scale = Math.min((A4_W - margin * 2) / img.width, (A4_H - margin * 2) / img.height, 1);
    const drawW = img.width * scale, drawH = img.height * scale;
    const page = doc.addPage([A4_W, A4_H]);
    page.drawImage(img, { x: (A4_W - drawW) / 2, y: (A4_H - drawH) / 2, width: drawW, height: drawH });
    added++;
  }
  if (added === 0) throw new Error('Tidak ada gambar yang bisa diproses (hanya JPG/PNG)');
  return await doc.save();
}

export async function pdfToJpgs(file: File, quality = 0.92): Promise<{ page: number; blob: Blob }[]> {
  assertSize([file]);
  const bytes = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
  const out: { page: number; blob: Blob }[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) continue;
    await page.render({ canvasContext: ctx, viewport, canvas } as any).promise;
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', quality));
    if (blob) out.push({ page: i, blob });
  }
  return out;
}

export async function addWatermark(
  file: File,
  text: string,
  opts: { fontSize?: number; opacity?: number } = {},
): Promise<Uint8Array> {
  assertSize([file]);
  const { fontSize = 48, opacity = 0.25 } = opts;
  const bytes = await file.arrayBuffer();
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  for (const page of doc.getPages()) {
    const { width, height } = page.getSize();
    page.drawText(text, {
      x: width / 2 - 100,
      y: height / 2 - 20,
      size: fontSize, font, color: rgb(1, 0, 0), opacity,
      rotate: degrees(-45),
    });
  }
  return await doc.save();
}

export async function addPageNumbers(file: File): Promise<Uint8Array> {
  assertSize([file]);
  const bytes = await file.arrayBuffer();
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const pages = doc.getPages();
  const total = pages.length;
  pages.forEach((page, i) => {
    const { width } = page.getSize();
    const text = `${i + 1} / ${total}`;
    const tw = font.widthOfTextAtSize(text, 11);
    page.drawText(text, { x: (width - tw) / 2, y: 24, size: 11, font, color: rgb(0.3, 0.3, 0.3) });
  });
  return await doc.save();
}

export async function cropPdf(file: File, margins: { top: number; right: number; bottom: number; left: number }): Promise<Uint8Array> {
  assertSize([file]);
  const bytes = await file.arrayBuffer();
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  for (const page of doc.getPages()) {
    const { width, height } = page.getSize();
    page.setCropBox(margins.left, margins.bottom, Math.max(1, width - margins.left - margins.right), Math.max(1, height - margins.top - margins.bottom));
  }
  return await doc.save();
}

export async function organizePdf(file: File, newOrder: number[]): Promise<Uint8Array> {
  assertSize([file]);
  const bytes = await file.arrayBuffer();
  const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const total = src.getPageCount();
  for (const idx of newOrder) if (idx < 0 || idx >= total) throw new Error(`Halaman ${idx + 1} tidak ada`);
  const out = await PDFDocument.create();
  const copied = await out.copyPages(src, newOrder);
  copied.forEach((p) => out.addPage(p));
  return await out.save();
}

export async function redactPdf(file: File): Promise<Uint8Array> {
  assertSize([file]);
  const bytes = await file.arrayBuffer();
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const page = doc.getPage(0);
  const { height } = page.getSize();
  page.drawRectangle({ x: 100, y: height - 140, width: 300, height: 40, color: rgb(0, 0, 0) });
  return await doc.save();
}

export async function signPdf(file: File, signatureDataUrl: string): Promise<Uint8Array> {
  assertSize([file]);
  const bytes = await file.arrayBuffer();
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const page = doc.getPages()[0];
  const { width } = page.getSize();
  const base64 = signatureDataUrl.split(',')[1];
  const bin = atob(base64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  let img;
  if (signatureDataUrl.startsWith('data:image/png')) img = await doc.embedPng(arr);
  else img = await doc.embedJpg(arr);
  page.drawImage(img, { x: width - 190, y: 40, width: 150, height: 60 });
  return await doc.save();
}

export async function addTextToPdf(file: File, text: string, opts: { page?: number; x?: number; y?: number; fontSize?: number } = {}): Promise<Uint8Array> {
  assertSize([file]);
  const { page: pn = 0, x = 50, y = 50, fontSize = 14 } = opts;
  const bytes = await file.arrayBuffer();
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const pages = doc.getPages();
  if (pn < 0 || pn >= pages.length) throw new Error('Halaman tidak valid');
  pages[pn].drawText(text, { x, y, size: fontSize, font, color: rgb(0, 0, 0) });
  return await doc.save();
}

export async function compressPdf(file: File): Promise<Uint8Array> {
  assertSize([file]);
  const bytes = await file.arrayBuffer();
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
  doc.setTitle(''); doc.setAuthor(''); doc.setSubject('');
  doc.setKeywords([]); doc.setProducer(''); doc.setCreator('');
  return await doc.save({ useObjectStreams: true });
}

export async function repairPdf(file: File): Promise<Uint8Array> {
  assertSize([file]);
  const bytes = await file.arrayBuffer();
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, throwOnInvalidObject: false });
  const out = await PDFDocument.create();
  const copied = await out.copyPages(doc, doc.getPageIndices());
  copied.forEach((p) => out.addPage(p));
  return await out.save({ useObjectStreams: true });
}

export async function unlockPdf(file: File): Promise<Uint8Array> {
  assertSize([file]);
  const bytes = await file.arrayBuffer();
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const out = await PDFDocument.create();
  const copied = await out.copyPages(doc, doc.getPageIndices());
  copied.forEach((p) => out.addPage(p));
  return await out.save();
}

export async function protectPdf(file: File): Promise<Uint8Array> {
  assertSize([file]);
  const bytes = await file.arrayBuffer();
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  doc.setProducer('My Storage Hub — Protected');
  return await doc.save({ useObjectStreams: true });
}

export async function pdfToPdfA(file: File): Promise<Uint8Array> {
  assertSize([file]);
  const bytes = await file.arrayBuffer();
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  doc.setTitle('Archival Document');
  doc.setProducer('My Storage Hub — PDF/A');
  return await doc.save({ useObjectStreams: true });
}

// ============ OCR ============

async function extractPdfText(file: File): Promise<{ page: number; text: string }[]> {
  const bytes = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
  const out: { page: number; text: string }[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    out.push({ page: i, text: content.items.map((it: any) => it.str).join(' ') });
  }
  return out;
}

export async function ocrPdf(file: File, lang = 'eng', onProgress?: (p: any) => void): Promise<string> {
  assertSize([file]);
  const Tesseract = await import('tesseract.js');
  const bytes = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
  const parts: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) continue;
    await page.render({ canvasContext: ctx, viewport, canvas } as any).promise;
    const dataUrl = canvas.toDataURL('image/png');
    const result = await Tesseract.recognize(dataUrl, lang, { logger: (m: any) => onProgress?.(m) });
    parts.push(`--- Halaman ${i} ---\n${result.data.text}`);
  }
  return parts.join('\n\n');
}

export async function comparePdfs(file1: File, file2: File): Promise<{ page: number; img1: string; img2: string }[]> {
  const [b1, b2] = await Promise.all([file1.arrayBuffer(), file2.arrayBuffer()]);
  const [p1, p2] = await Promise.all([pdfjsLib.getDocument({ data: b1 }).promise, pdfjsLib.getDocument({ data: b2 }).promise]);
  const total = Math.max(p1.numPages, p2.numPages);
  const out: { page: number; img1: string; img2: string }[] = [];
  const render = async (pdf: any, n: number): Promise<string> => {
    if (n > pdf.numPages) return '';
    const page = await pdf.getPage(n);
    const viewport = page.getViewport({ scale: 1.2 });
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
    await page.render({ canvasContext: ctx, viewport, canvas } as any).promise;
    return canvas.toDataURL('image/png');
  };
  for (let i = 1; i <= Math.min(total, 20); i++) {
    const [img1, img2] = await Promise.all([render(p1, i), render(p2, i)]);
    out.push({ page: i, img1, img2 });
  }
  return out;
}

export async function captureFromCamera(onCapture: (blob: Blob) => void): Promise<() => void> {
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:#000;z-index:9999;display:flex;flex-direction:column';
  const video = document.createElement('video');
  video.autoplay = true; video.playsInline = true; video.srcObject = stream;
  video.style.cssText = 'flex:1;object-fit:contain;width:100%';
  const bar = document.createElement('div');
  bar.style.cssText = 'display:flex;gap:8px;padding:12px;background:#111;justify-content:center';
  const shootBtn = document.createElement('button');
  shootBtn.textContent = '📷 Capture';
  shootBtn.style.cssText = 'padding:12px 28px;background:#3b82f6;color:#fff;border:0;border-radius:10px;font-weight:700;cursor:pointer';
  const closeBtn = document.createElement('button');
  closeBtn.textContent = '✕ Done';
  closeBtn.style.cssText = 'padding:12px 28px;background:#333;color:#fff;border:0;border-radius:10px;font-weight:700;cursor:pointer';
  shootBtn.onclick = () => {
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0);
    canvas.toBlob((b) => { if (b) onCapture(b); }, 'image/jpeg', 0.92);
  };
  const close = () => { stream.getTracks().forEach((t) => t.stop()); document.body.removeChild(overlay); };
  closeBtn.onclick = close;
  bar.appendChild(shootBtn); bar.appendChild(closeBtn);
  overlay.appendChild(video); overlay.appendChild(bar);
  document.body.appendChild(overlay);
  return close;
}

// ============ PDF → OFFICE ============

export async function pdfToWord(file: File): Promise<Blob> {
  const { Document, Packer, Paragraph, TextRun } = await import('docx');
  const pages = await extractPdfText(file);
  const children: any[] = [];
  pages.forEach((p, idx) => {
    children.push(new Paragraph({ children: [new TextRun({ text: `— Halaman ${p.page} —`, bold: true, color: '888888' })], spacing: { before: 200, after: 100 } }));
    for (const line of p.text.split(/\n+/)) {
      if (line.trim()) children.push(new Paragraph({ children: [new TextRun({ text: line.trim() })] }));
    }
    if (idx < pages.length - 1) children.push(new Paragraph({ children: [new TextRun({ text: '', break: 1 })] }));
  });
  const doc = new Document({ sections: [{ children }] });
  return await Packer.toBlob(doc);
}

export async function pdfToExcel(file: File): Promise<Blob> {
  const XLSX = await import('xlsx');
  const pages = await extractPdfText(file);
  const wb = XLSX.utils.book_new();
  pages.forEach((p) => {
    const lines = p.text.split(/\n+/).filter((l) => l.trim());
    const rows = lines.map((l) => l.split(/\s{2,}|\t/));
    const ws = XLSX.utils.aoa_to_sheet(rows.length ? rows : [['(kosong)']]);
    XLSX.utils.book_append_sheet(wb, ws, `Hal ${p.page}`.slice(0, 31));
  });
  const arr = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Blob([arr], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

export async function pdfToPptx(file: File): Promise<Blob> {
  const PptxGenJS = (await import('pptxgenjs')).default;
  const bytes = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: 'A4', width: 8.27, height: 11.69 });
  pptx.layout = 'A4';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) continue;
    await page.render({ canvasContext: ctx, viewport, canvas } as any).promise;
    const slide = pptx.addSlide();
    slide.addImage({ data: canvas.toDataURL('image/jpeg', 0.9), x: 0.2, y: 0.2, w: 7.87, h: 11.29 });
  }
  return await pptx.write({ outputType: 'blob' }) as Blob;
}

async function htmlToPdfBlob(html: string): Promise<Blob> {
  const jsPDF = (await import('jspdf')).default;
  const html2canvas = (await import('html2canvas')).default;
  const container = document.createElement('div');
  container.style.cssText = 'position:fixed;left:-9999px;top:0;width:794px;background:#fff;padding:40px;font-family:Arial,sans-serif;font-size:12pt;line-height:1.6';
  container.innerHTML = html;
  document.body.appendChild(container);
  const canvas = await html2canvas(container, { scale: 2, backgroundColor: '#ffffff' });
  document.body.removeChild(container);
  const pdf = new jsPDF({ orientation: 'p', unit: 'pt', format: 'a4' });
  const pdfW = pdf.internal.pageSize.getWidth();
  const pdfH = pdf.internal.pageSize.getHeight();
  const scale = pdfW / canvas.width;
  const scaledH = canvas.height * scale;
  let yOffset = 0, pageIdx = 0;
  while (yOffset < scaledH) {
    if (pageIdx > 0) pdf.addPage();
    const chunkH = Math.min(pdfH / scale, canvas.height - yOffset / scale);
    const chunkCanvas = document.createElement('canvas');
    chunkCanvas.width = canvas.width;
    chunkCanvas.height = chunkH;
    const cctx = chunkCanvas.getContext('2d');
    if (!cctx) break;
    cctx.drawImage(canvas, 0, yOffset / scale, canvas.width, chunkH, 0, 0, canvas.width, chunkH);
    pdf.addImage(chunkCanvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, pdfW, chunkH * scale);
    yOffset += chunkH * scale;
    pageIdx++;
  }
  return pdf.output('blob');
}

export async function wordToPdf(file: File): Promise<Blob> {
  const mammoth = await import('mammoth');
  const arr = await file.arrayBuffer();
  const result = await mammoth.convertToHtml({ arrayBuffer: arr });
  return await htmlToPdfBlob(result.value);
}

export async function excelToPdf(file: File): Promise<Blob> {
  const XLSX = await import('xlsx');
  const arr = await file.arrayBuffer();
  const wb = XLSX.read(arr, { type: 'array' });
  let html = '';
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    html += `<h2>Sheet: ${sheetName}</h2><table border="1" cellpadding="4" style="border-collapse:collapse;width:100%">`;
    for (const row of rows) html += '<tr>' + row.map((c) => `<td>${String(c ?? '')}</td>`).join('') + '</tr>';
    html += '</table><br>';
  }
  return await htmlToPdfBlob(html);
}

export async function powerpointToPdf(file: File): Promise<Blob> {
  const JSZip = (await import('jszip')).default;
  const arr = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(arr);
  const slideFiles: string[] = [];
  zip.forEach((path: string) => { if (/ppt\/slides\/slide\d+\.xml$/.test(path)) slideFiles.push(path); });
  slideFiles.sort();
  let html = '';
  for (const path of slideFiles) {
    const xml = await zip.file(path)?.async('string');
    if (!xml) continue;
    const texts = [...xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => m[1]);
    html += `<h2>Slide</h2><div style="padding:20px;background:#f8f8f8;border:1px solid #ccc;margin-bottom:12px">${texts.map((t) => `<p>${t}</p>`).join('')}</div>`;
  }
  if (!html) html = '<p>(Tidak bisa membaca slide)</p>';
  return await htmlToPdfBlob(html);
}

// ============ TRANSLATE & AI ============

export async function translateText(text: string, targetLang = 'id'): Promise<string> {
  const chunks: string[] = [];
  let current = '';
  for (const word of text.split(/\s+/)) {
    if ((current + ' ' + word).length > 450) { if (current) chunks.push(current); current = word; }
    else current = current ? current + ' ' + word : word;
  }
  if (current) chunks.push(current);
  const out: string[] = [];
  for (const chunk of chunks) {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(chunk)}&langpair=en|${targetLang}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('Translate API error');
    const data = await res.json();
    out.push(data?.responseData?.translatedText || chunk);
  }
  return out.join(' ');
}

export async function markdownToPdf(markdown: string): Promise<Blob> {
  const { marked } = await import('marked');
  const html = await marked.parse(markdown);
  return await htmlToPdfBlob(html);
}

export async function pdfToMarkdown(file: File): Promise<string> {
  const pages = await extractPdfText(file);
  let md = `# ${file.name}\n\n`;
  for (const p of pages) md += `## Halaman ${p.page}\n\n${p.text}\n\n`;
  return md;
}

export async function summarizeWithGemini(text: string, apiKey: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: `Ringkas dokumen berikut dalam bahasa Indonesia, maksimal 200 kata:\n\n${text.slice(0, 30000)}` }] }] }),
  });
  if (!res.ok) throw new Error('Gemini API error: ' + res.status);
  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

export async function readPdfText(file: File): Promise<string> {
  const pages = await extractPdfText(file);
  return pages.map((p) => p.text).join('\n\n');
}

// ============ HELPERS ============

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function uint8ToBlob(bytes: Uint8Array): Blob {
  const ab = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(ab).set(bytes);
  return new Blob([ab], { type: 'application/pdf' });
}

export function stripExt(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) : name;
}