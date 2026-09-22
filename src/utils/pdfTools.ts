import { PDFDocument, degrees, rgb, StandardFonts } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const MAX_FILE_BYTES = 100 * 1024 * 1024; // 100 MB

function assertSize(files: File[]): void {
  for (const f of files) {
    if (f.size > MAX_FILE_BYTES) {
      throw new Error(`${f.name} terlalu besar (max 100 MB)`);
    }
  }
}

// ============================================================
// BASIC — merge / split / rotate
// ============================================================

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
  if (from < 1 || to < from || from > total) {
    throw new Error(`Range tidak valid. PDF punya ${total} halaman.`);
  }
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

// ============================================================
// IMAGES
// ============================================================

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
    const maxW = A4_W - margin * 2, maxH = A4_H - margin * 2;
    const scale = Math.min(maxW / img.width, maxH / img.height, 1);
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

// ============================================================
// WATERMARK
// ============================================================

export async function addWatermark(
  file: File,
  text: string,
  opts: { fontSize?: number; opacity?: number; color?: { r: number; g: number; b: number }; rotate?: number } = {},
): Promise<Uint8Array> {
  assertSize([file]);
  const { fontSize = 48, opacity = 0.25, color = { r: 1, g: 0, b: 0 }, rotate = -45 } = opts;
  const bytes = await file.arrayBuffer();
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const font = await doc.embedFont(StandardFonts.HelveticaBold);

  for (const page of doc.getPages()) {
    const { width, height } = page.getSize();
    const textWidth = font.widthOfTextAtSize(text, fontSize);
    page.drawText(text, {
      x: (width - textWidth * Math.cos((rotate * Math.PI) / 180)) / 2,
      y: height / 2 - 20,
      size: fontSize,
      font,
      color: rgb(color.r, color.g, color.b),
      opacity,
      rotate: degrees(rotate),
    });
  }
  return await doc.save();
}

// ============================================================
// PAGE NUMBERS
// ============================================================

export async function addPageNumbers(
  file: File,
  opts: { position?: 'bottom-center' | 'bottom-right' | 'bottom-left' | 'top-center'; format?: string; fontSize?: number } = {},
): Promise<Uint8Array> {
  assertSize([file]);
  const { position = 'bottom-center', format = '{n} / {total}', fontSize = 11 } = opts;
  const bytes = await file.arrayBuffer();
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const pages = doc.getPages();
  const total = pages.length;

  pages.forEach((page, i) => {
    const { width, height } = page.getSize();
    const n = i + 1;
    const text = format.replace('{n}', String(n)).replace('{total}', String(total));
    const tw = font.widthOfTextAtSize(text, fontSize);
    const margin = 24;
    let x = margin, y = margin;
    if (position === 'bottom-center') x = (width - tw) / 2;
    else if (position === 'bottom-right') x = width - tw - margin;
    else if (position === 'top-center') { x = (width - tw) / 2; y = height - margin - fontSize; }
    page.drawText(text, { x, y, size: fontSize, font, color: rgb(0.3, 0.3, 0.3) });
  });
  return await doc.save();
}

// ============================================================
// CROP
// ============================================================

export async function cropPdf(
  file: File,
  margins: { top: number; right: number; bottom: number; left: number },
): Promise<Uint8Array> {
  assertSize([file]);
  const bytes = await file.arrayBuffer();
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  for (const page of doc.getPages()) {
    const { width, height } = page.getSize();
    page.setCropBox(
      margins.left,
      margins.bottom,
      Math.max(1, width - margins.left - margins.right),
      Math.max(1, height - margins.top - margins.bottom),
    );
  }
  return await doc.save();
}

// ============================================================
// ORGANIZE (reorder)
// ============================================================

export async function organizePdf(file: File, newOrder: number[]): Promise<Uint8Array> {
  assertSize([file]);
  const bytes = await file.arrayBuffer();
  const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const total = src.getPageCount();
  for (const idx of newOrder) {
    if (idx < 0 || idx >= total) throw new Error(`Halaman ${idx + 1} tidak ada`);
  }
  const out = await PDFDocument.create();
  const copied = await out.copyPages(src, newOrder);
  copied.forEach((p) => out.addPage(p));
  return await out.save();
}

// ============================================================
// REDACT (gambar kotak hitam)
// ============================================================

export interface RedactRect { page: number; x: number; y: number; width: number; height: number }

export async function redactPdf(file: File, rects: RedactRect[]): Promise<Uint8Array> {
  assertSize([file]);
  const bytes = await file.arrayBuffer();
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const pages = doc.getPages();

  for (const r of rects) {
    if (r.page < 0 || r.page >= pages.length) continue;
    const page = pages[r.page];
    const { height } = page.getSize();
    page.drawRectangle({
      x: r.x,
      y: height - r.y - r.height,
      width: r.width,
      height: r.height,
      color: rgb(0, 0, 0),
    });
  }
  return await doc.save();
}

// ============================================================
// SIGN (embed image)
// ============================================================

export async function signPdf(
  file: File,
  signatureDataUrl: string,
  opts: { page?: number; x?: number; y?: number; width?: number; height?: number } = {},
): Promise<Uint8Array> {
  assertSize([file]);
  const { page: pageNum = 0, width = 150, height = 60 } = opts;
  const bytes = await file.arrayBuffer();
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const pages = doc.getPages();
  if (pageNum < 0 || pageNum >= pages.length) throw new Error('Halaman tidak valid');
  const page = pages[pageNum];
  const { width: pw, height: ph } = page.getSize();

  const base64 = signatureDataUrl.split(',')[1];
  const bin = atob(base64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);

  let img;
  if (signatureDataUrl.startsWith('data:image/png')) img = await doc.embedPng(arr);
  else if (signatureDataUrl.startsWith('data:image/jpeg')) img = await doc.embedJpg(arr);
  else throw new Error('Format tanda tangan harus PNG atau JPG');

  const x = opts.x ?? pw - width - 40;
  const y = opts.y ?? 40;
  page.drawImage(img, { x, y, width, height });
  return await doc.save();
}

// ============================================================
// EDIT — tambah teks
// ============================================================

export async function addTextToPdf(
  file: File,
  text: string,
  opts: { page?: number; x?: number; y?: number; fontSize?: number; color?: { r: number; g: number; b: number } } = {},
): Promise<Uint8Array> {
  assertSize([file]);
  const { page: pageNum = 0, x = 50, y = 50, fontSize = 14, color = { r: 0, g: 0, b: 0 } } = opts;
  const bytes = await file.arrayBuffer();
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const pages = doc.getPages();
  if (pageNum < 0 || pageNum >= pages.length) throw new Error('Halaman tidak valid');

  pages[pageNum].drawText(text, {
    x, y, size: fontSize, font, color: rgb(color.r, color.g, color.b),
  });
  return await doc.save();
}

// ============================================================
// COMPRESS (best-effort — re-save + strip metadata)
// ============================================================

export async function compressPdf(file: File): Promise<Uint8Array> {
  assertSize([file]);
  const bytes = await file.arrayBuffer();
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
  doc.setTitle('');
  doc.setAuthor('');
  doc.setSubject('');
  doc.setKeywords([]);
  doc.setProducer('');
  doc.setCreator('');
  return await doc.save({ useObjectStreams: true });
}

// ============================================================
// REPAIR (best-effort — re-parse + resave)
// ============================================================

export async function repairPdf(file: File): Promise<Uint8Array> {
  assertSize([file]);
  const bytes = await file.arrayBuffer();
  try {
    const doc = await PDFDocument.load(bytes, {
      ignoreEncryption: true,
      throwOnInvalidObject: false,
    });
    const out = await PDFDocument.create();
    const copied = await out.copyPages(doc, doc.getPageIndices());
    copied.forEach((p) => out.addPage(p));
    return await out.save({ useObjectStreams: true });
  } catch (e) {
    throw new Error('Tidak bisa memperbaiki PDF ini: ' + (e instanceof Error ? e.message : 'unknown'));
  }
}

// ============================================================
// UNLOCK (best-effort — kalau password kosong atau owner-only)
// ============================================================

export async function unlockPdf(file: File, password?: string): Promise<Uint8Array> {
  assertSize([file]);
  const bytes = await file.arrayBuffer();
  try {
    const doc = await PDFDocument.load(bytes, {
      ignoreEncryption: true,
      // @ts-expect-error password supported by pdf-lib fork; ignore jika tidak ada
      password: password || undefined,
    });
    const out = await PDFDocument.create();
    const copied = await out.copyPages(doc, doc.getPageIndices());
    copied.forEach((p) => out.addPage(p));
    return await out.save();
  } catch (e) {
    throw new Error('Tidak bisa membuka PDF. Kemungkinan butuh password yang benar, atau enkripsi tidak didukung.');
  }
}

// ============================================================
// OCR — pakai tesseract.js
// ============================================================

export async function ocrPdf(
  file: File,
  lang = 'eng+ind',
  onProgress?: (p: { page: number; total: number; status: string; progress: number }) => void,
): Promise<{ page: number; text: string }[]> {
  assertSize([file]);
  const Tesseract = await import('tesseract.js');
  const bytes = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
  const out: { page: number; text: string }[] = [];

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
    const result = await Tesseract.recognize(dataUrl, lang, {
      logger: (m: any) => {
        onProgress?.({
          page: i,
          total: pdf.numPages,
          status: m.status,
          progress: m.progress || 0,
        });
      },
    });
    out.push({ page: i, text: result.data.text });
  }
  return out;
}

// ============================================================
// COMPARE — render 2 PDF side-by-side per halaman
// ============================================================

export async function comparePdfs(file1: File, file2: File): Promise<{
  page: number;
  img1: string;
  img2: string;
}[]> {
  assertSize([file1, file2]);
  const [b1, b2] = await Promise.all([file1.arrayBuffer(), file2.arrayBuffer()]);
  const [p1, p2] = await Promise.all([
    pdfjsLib.getDocument({ data: b1 }).promise,
    pdfjsLib.getDocument({ data: b2 }).promise,
  ]);
  const total = Math.max(p1.numPages, p2.numPages);
  const out: { page: number; img1: string; img2: string }[] = [];

  const render = async (pdf: any, n: number): Promise<string> => {
    if (n > pdf.numPages) return '';
    const page = await pdf.getPage(n);
    const viewport = page.getViewport({ scale: 1.5 });
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
    await page.render({ canvasContext: ctx, viewport, canvas } as any).promise;
    return canvas.toDataURL('image/png');
  };

  for (let i = 1; i <= total; i++) {
    const [img1, img2] = await Promise.all([render(p1, i), render(p2, i)]);
    out.push({ page: i, img1, img2 });
  }
  return out;
}

// ============================================================
// SCAN — pakai kamera (return Blob[])
// ============================================================

export async function captureFromCamera(
  onCapture: (blob: Blob) => void,
): Promise<() => void> {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
  });

  // Create modal overlay
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:#000;z-index:9999;display:flex;flex-direction:column';

  const video = document.createElement('video');
  video.autoplay = true;
  video.playsInline = true;
  video.srcObject = stream;
  video.style.cssText = 'flex:1;object-fit:contain;width:100%';

  const bar = document.createElement('div');
  bar.style.cssText = 'display:flex;gap:8px;padding:12px;background:#111;justify-content:center';

  const shootBtn = document.createElement('button');
  shootBtn.textContent = '📷 Capture';
  shootBtn.style.cssText = 'padding:12px 28px;background:#3b82f6;color:#fff;border:0;border-radius:10px;font-weight:700;cursor:pointer';

  const closeBtn = document.createElement('button');
  closeBtn.textContent = '✕ Done';
  closeBtn.style.cssText = 'padding:12px 28px;background:#333;color:#fff;border:0;border-radius:10px;font-weight:700;cursor:pointer';

  const capture = () => {
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    canvas.toBlob((blob) => { if (blob) onCapture(blob); }, 'image/jpeg', 0.92);
  };

  const close = () => {
    stream.getTracks().forEach((t) => t.stop());
    document.body.removeChild(overlay);
  };

  shootBtn.onclick = capture;
  closeBtn.onclick = close;
  bar.appendChild(shootBtn);
  bar.appendChild(closeBtn);
  overlay.appendChild(video);
  overlay.appendChild(bar);
  document.body.appendChild(overlay);

  return close;
}

// ============================================================
// OFFICE — PDF → DOCX / XLSX / PPTX
// ============================================================

async function extractPdfText(file: File): Promise<{ page: number; text: string }[]> {
  const bytes = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
  const out: { page: number; text: string }[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const text = content.items.map((it: any) => it.str).join(' ');
    out.push({ page: i, text });
  }
  return out;
}

export async function pdfToWord(file: File): Promise<Blob> {
  assertSize([file]);
  const { Document, Packer, Paragraph, TextRun } = await import('docx');
  const pages = await extractPdfText(file);

  const children: any[] = [];
  pages.forEach((p, idx) => {
    children.push(new Paragraph({
      children: [new TextRun({ text: `— Halaman ${p.page} —`, bold: true, color: '888888', size: 18 })],
      spacing: { before: 200, after: 100 },
    }));
    const lines = p.text.split(/\n+/);
    for (const line of lines) {
      if (line.trim()) {
        children.push(new Paragraph({ children: [new TextRun({ text: line.trim() })] }));
      }
    }
    if (idx < pages.length - 1) children.push(new Paragraph({ children: [new TextRun({ text: '', break: 1 })] }));
  });

  const doc = new Document({ sections: [{ children }] });
  const blob = await Packer.toBlob(doc);
  return blob;
}

export async function pdfToExcel(file: File): Promise<Blob> {
  assertSize([file]);
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
  assertSize([file]);
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
    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
    const slide = pptx.addSlide();
    slide.addImage({ data: dataUrl, x: 0.2, y: 0.2, w: 7.87, h: 11.29 });
  }

  const blob = await pptx.write({ outputType: 'blob' }) as Blob;
  return blob;
}

// ============================================================
// OFFICE — DOCX / XLSX → PDF
// ============================================================

export async function wordToPdf(file: File): Promise<Blob> {
  assertSize([file]);
  const mammoth = await import('mammoth');
  const jsPDF = (await import('jspdf')).default;
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.convertToHtml({ arrayBuffer });

  // Render HTML ke container offscreen, lalu ke canvas → PDF
  const container = document.createElement('div');
  container.style.cssText = 'position:fixed;left:-9999px;top:0;width:794px;background:#fff;padding:40px;font-family:Arial,sans-serif;font-size:12pt;line-height:1.5';
  container.innerHTML = result.value;
  document.body.appendChild(container);

  const html2canvas = (await import('html2canvas')).default;
  const canvas = await html2canvas(container, { scale: 2, backgroundColor: '#ffffff' });
  document.body.removeChild(container);

  const pdf = new jsPDF({ orientation: 'p', unit: 'pt', format: 'a4' });
  const pdfW = pdf.internal.pageSize.getWidth();
  const pdfH = pdf.internal.pageSize.getHeight();
  const imgW = canvas.width;
  const imgH = canvas.height;
  const scale = pdfW / imgW;
  const scaledH = imgH * scale;

  let yOffset = 0;
  let pageIdx = 0;
  while (yOffset < scaledH) {
    if (pageIdx > 0) pdf.addPage();
    const chunkCanvas = document.createElement('canvas');
    const chunkH = Math.min(pdfH / scale, imgH - yOffset / scale);
    chunkCanvas.width = imgW;
    chunkCanvas.height = chunkH;
    const cctx = chunkCanvas.getContext('2d');
    if (!cctx) break;
    cctx.drawImage(canvas, 0, yOffset / scale, imgW, chunkH, 0, 0, imgW, chunkH);
    const chunkUrl = chunkCanvas.toDataURL('image/jpeg', 0.92);
    pdf.addImage(chunkUrl, 'JPEG', 0, 0, pdfW, chunkH * scale);
    yOffset += chunkH * scale;
    pageIdx++;
  }

  return pdf.output('blob');
}

export async function excelToPdf(file: File): Promise<Blob> {
  assertSize([file]);
  const XLSX = await import('xlsx');
  const jsPDF = (await import('jspdf')).default;
  const arr = await file.arrayBuffer();
  const wb = XLSX.read(arr, { type: 'array' });
  const pdf = new jsPDF({ orientation: 'l', unit: 'pt', format: 'a4' });

  let first = true;
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    if (!first) pdf.addPage();
    first = false;

    pdf.setFontSize(14);
    pdf.text(`Sheet: ${sheetName}`, 40, 40);
    pdf.setFontSize(10);

    let y = 70;
    const lineH = 14;
    for (const row of rows) {
      const line = row.map((c) => String(c ?? '')).join(' | ');
      const lines = pdf.splitTextToSize(line, pdf.internal.pageSize.getWidth() - 80);
      for (const l of lines) {
        if (y > pdf.internal.pageSize.getHeight() - 40) {
          pdf.addPage();
          y = 40;
        }
        pdf.text(l, 40, y);
        y += lineH;
      }
    }
  }
  return pdf.output('blob');
}

// ============================================================
// TRANSLATE — pakai MyMemory API (gratis, tanpa key)
// ============================================================

export async function translateText(text: string, targetLang = 'id'): Promise<string> {
  const chunks = splitText(text, 450);
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

function splitText(text: string, maxLen: number): string[] {
  const chunks: string[] = [];
  let current = '';
  for (const word of text.split(/\s+/)) {
    if ((current + ' ' + word).length > maxLen) {
      if (current) chunks.push(current);
      current = word;
    } else {
      current = current ? current + ' ' + word : word;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

// ============================================================
// MARKDOWN → PDF
// ============================================================

export async function markdownToPdf(markdown: string): Promise<Blob> {
  const { marked } = await import('marked');
  const jsPDF = (await import('jspdf')).default;
  const html = await marked.parse(markdown);

  const container = document.createElement('div');
  container.style.cssText = 'position:fixed;left:-9999px;top:0;width:794px;background:#fff;padding:40px;font-family:Arial,sans-serif;font-size:12pt;line-height:1.6';
  container.innerHTML = html;
  document.body.appendChild(container);

  const html2canvas = (await import('html2canvas')).default;
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

// ============================================================
// AI SUMMARIZER — pakai Gemini API (user input key)
// ============================================================

export async function summarizeWithGemini(text: string, apiKey: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [{ text: `Ringkas dokumen berikut dalam bahasa Indonesia, maksimal 200 kata:\n\n${text.slice(0, 30000)}` }],
      }],
    }),
  });
  if (!res.ok) throw new Error('Gemini API error: ' + res.status);
  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

// ============================================================
// HELPERS
// ============================================================

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function uint8ToBlob(bytes: Uint8Array, mime = 'application/pdf'): Blob {
  const ab = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(ab).set(bytes);
  return new Blob([ab], { type: mime });
}

export function stripExt(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) : name;
}