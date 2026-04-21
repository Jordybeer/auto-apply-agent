import { NextResponse } from 'next/server';
import PDFDocument from 'pdfkit';
import { slog } from '@/lib/logger';

interface ExportData {
  recentApps: Array<{
    title: string;
    company: string;
    applied_at: string | null;
    status: string;
    match_score: number | null;
  }>;
  allApps: Array<{
    title: string;
    company: string;
    applied_at: string | null;
    status: string;
    match_score: number | null;
  }>;
}

export async function POST(request: Request) {
  try {
    const body: ExportData = await request.json();
    const { recentApps, allApps } = body;

    if (!Array.isArray(allApps)) {
      void slog.warn('export-pdf', 'Invalid data format');
      return NextResponse.json({ error: 'Ongeldig formaat' }, { status: 400 });
    }

    // Create PDF
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => {});

    // Title
    doc.fontSize(24).font('Helvetica-Bold').text('Sollicitaties Export', { align: 'left' });
    doc.fontSize(10).font('Helvetica').fillColor('#666').text(
      `Export: ${new Date().toLocaleDateString('nl-BE')} om ${new Date().toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' })}`,
      { align: 'left' }
    );
    doc.moveTo(40, doc.y + 5).lineTo(555, doc.y + 5).stroke('#ddd');
    doc.moveDown(1);

    // Recent section
    if (recentApps.length > 0) {
      doc.fontSize(14).fillColor('#000').font('Helvetica-Bold').text('Recente Sollicitaties');
      doc.fontSize(9).fillColor('#666').text(`(sinds vorige export)`, { continued: false });
      doc.moveDown(0.5);

      doc.fontSize(9).font('Helvetica-Bold').fillColor('#333');
      const headerY = doc.y;
      doc.text('Functie', 40, headerY);
      doc.text('Bedrijf', 200, headerY);
      doc.text('Datum', 350, headerY);
      doc.text('Status', 430, headerY);
      doc.text('Score', 500, headerY);

      doc.moveTo(40, doc.y).lineTo(555, doc.y).stroke('#ddd');
      doc.moveDown(0.5);

      recentApps.forEach((app) => {
        doc.fontSize(8).font('Helvetica').fillColor('#000');
        const rowY = doc.y;
        doc.text(app.title || '-', 40, rowY, { width: 150 });
        doc.text(app.company || '-', 200, rowY, { width: 140 });
        doc.text(app.applied_at ? new Date(app.applied_at).toLocaleDateString('nl-BE') : '-', 350, rowY);
        doc.text(app.status, 430, rowY);
        doc.text(app.match_score != null ? `${app.match_score}%` : '-', 500, rowY);
        doc.moveDown(1.2);
      });

      doc.moveDown(0.5);
    }

    // All apps section
    doc.fontSize(14).fillColor('#000').font('Helvetica-Bold').text('Alle Sollicitaties');
    doc.moveDown(0.5);

    doc.fontSize(9).font('Helvetica-Bold').fillColor('#333');
    const headerY = doc.y;
    doc.text('Functie', 40, headerY);
    doc.text('Bedrijf', 200, headerY);
    doc.text('Datum', 350, headerY);
    doc.text('Status', 430, headerY);
    doc.text('Score', 500, headerY);

    doc.moveTo(40, doc.y).lineTo(555, doc.y).stroke('#ddd');
    doc.moveDown(0.5);

    allApps.forEach((app) => {
      doc.fontSize(8).font('Helvetica').fillColor('#000');
      const rowY = doc.y;
      doc.text(app.title || '-', 40, rowY, { width: 150 });
      doc.text(app.company || '-', 200, rowY, { width: 140 });
      doc.text(app.applied_at ? new Date(app.applied_at).toLocaleDateString('nl-BE') : '-', 350, rowY);
      doc.text(app.status, 430, rowY);
      doc.text(app.match_score != null ? `${app.match_score}%` : '-', 500, rowY);
      doc.moveDown(1.2);
    });

    doc.end();

    return new Promise((resolve) => {
      doc.on('end', () => {
        const buffer = Buffer.concat(chunks);
        void slog.info('export-pdf', 'PDF generated successfully', {
          recent_count: recentApps.length,
          total_count: allApps.length,
          size_bytes: buffer.length,
        });
        resolve(
          new NextResponse(buffer, {
            headers: {
              'Content-Type': 'application/pdf',
              'Content-Disposition': `attachment; filename="sollicitaties-${new Date().toISOString().slice(0, 10)}.pdf"`,
            },
          })
        );
      });
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Onbekende fout';
    void slog.error('export-pdf', 'PDF generation failed', { error: msg });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
