import PDFDocument from 'pdfkit';

export interface CertificatePdfData {
  studentName: string;
  courseTitle: string;
  instructorName: string;
  certCode: string;
  issuedAt: Date;
  grade: string;
}

export async function generateCertificatePdf(data: CertificatePdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 0 });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const green = '#2D6A4F';
    const pageWidth = doc.page.width;
    const pageHeight = doc.page.height;

    doc.rect(4, 4, pageWidth - 8, pageHeight - 8).lineWidth(4).stroke(green);

    doc.fillColor(green).font('Helvetica-Bold').fontSize(34).text('Nudra Academy', 0, 70, { align: 'center' });
    doc.fillColor('#6B7280').font('Helvetica').fontSize(16).text('CERTIFICATE OF COMPLETION', 0, 120, { align: 'center', characterSpacing: 2 });
    doc.fillColor('#6B7280').fontSize(12).text('This credential certifies that', 0, 165, { align: 'center' });
    doc.fillColor('#111827').font('Helvetica-Bold').fontSize(30).text(data.studentName, 0, 190, { align: 'center' });
    doc.fillColor('#6B7280').font('Helvetica').fontSize(12).text('has successfully completed', 0, 240, { align: 'center' });
    doc.fillColor(green).font('Helvetica-Bold').fontSize(20).text(data.courseTitle, 0, 265, { align: 'center' });

    const lineY = 330;
    doc.moveTo(120, lineY).lineTo(pageWidth - 120, lineY).lineWidth(1).strokeColor('#D1D5DB').stroke();

    const colY = 360;
    const colWidth = (pageWidth - 240) / 3;
    const left = 120;

    doc.fillColor('#111827').font('Helvetica-Bold').fontSize(12).text(data.instructorName, left, colY, { width: colWidth, align: 'center' });
    doc.fillColor('#6B7280').font('Helvetica').fontSize(9).text('INSTRUCTOR', left, colY + 18, { width: colWidth, align: 'center' });

    doc.fillColor('#111827').font('Helvetica-Bold').fontSize(12).text(data.certCode, left + colWidth, colY, { width: colWidth, align: 'center' });
    doc.fillColor('#6B7280').font('Helvetica').fontSize(9).text('VERIFICATION ID', left + colWidth, colY + 18, { width: colWidth, align: 'center' });

    const issuedDate = data.issuedAt.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    doc.fillColor('#111827').font('Helvetica-Bold').fontSize(12).text(issuedDate, left + colWidth * 2, colY, { width: colWidth, align: 'center' });
    doc.fillColor('#6B7280').font('Helvetica').fontSize(9).text('ISSUE DATE', left + colWidth * 2, colY + 18, { width: colWidth, align: 'center' });

    doc.end();
  });
}
