import { useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

export function PdfPreview({ url }: { url: string }) {
  const [numPages, setNumPages] = useState(0);
  const [page, setPage] = useState(1);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, width: '100%', height: '100%', overflow: 'auto', padding: 16 }}>
      <Document
        file={url}
        onLoadSuccess={({ numPages }) => setNumPages(numPages)}
        loading={<div style={{ padding: 40, color: 'rgba(255,255,255,.5)' }}>Loading PDF…</div>}
        error={<div style={{ padding: 40, color: '#ff8a8a' }}>Gagal memuat PDF.</div>}
      >
        <Page pageNumber={page} width={Math.min(900, window.innerWidth - 120)} />
      </Document>
      {numPages > 1 && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="share-btn" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>‹ Prev</button>
          <span style={{ fontSize: 13, color: 'rgba(255,255,255,.7)' }}>Page {page} / {numPages}</span>
          <button className="share-btn" disabled={page >= numPages} onClick={() => setPage((p) => p + 1)}>Next ›</button>
        </div>
      )}
    </div>
  );
}