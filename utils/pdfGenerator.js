const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const fs = require('fs');

async function generateVoucherPDF(serial, pin) {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([400, 200]);

  const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  page.drawText(`Your Voucher`, { x: 50, y: 150, size: 20, font, color: rgb(0,0,0) });
  page.drawText(`Serial Number: ${serial}`, { x: 50, y: 120, size: 14, font });
  page.drawText(`PIN: ${pin}`, { x: 50, y: 90, size: 14, font });

  const pdfBytes = await pdfDoc.save();
  const filePath = `./pdfs/${serial}.pdf`;
  fs.writeFileSync(filePath, pdfBytes);
  return filePath;
}

module.exports = generateVoucherPDF;
