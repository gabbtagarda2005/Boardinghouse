const PDFDocument = require('pdfkit');
const { periodLabel } = require('../utils/dates');
const { METHOD_LABELS } = require('../constants');

const STATUS_LABEL = { UNPAID: 'Unpaid', PARTIALLY_PAID: 'Partially paid', PAID: 'Paid', OVERDUE: 'Overdue' };

// PDFKit's built-in fonts can't render "₱", so documents use "PHP".
const peso = (n) => `PHP ${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', year: 'numeric', month: 'short', day: 'numeric' }) : '-');
const NAVY = '#1e3a8a';

function toBuffer(build) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 48 });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    build(doc);
    doc.end();
  });
}

function header(doc, settings, title) {
  doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(18).text(settings.houseName || 'Boarding House');
  doc.fillColor('#475569').font('Helvetica').fontSize(9);
  if (settings.address) doc.text(settings.address);
  const contact = [settings.contactPhone, settings.contactEmail].filter(Boolean).join('  |  ');
  if (contact) doc.text(contact);
  doc.moveDown(0.6);
  doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(14).text(title);
  doc.moveTo(48, doc.y + 4).lineTo(547, doc.y + 4).strokeColor(NAVY).lineWidth(1.5).stroke();
  doc.moveDown(1);
}

function kv(doc, pairs, x = 48, width = 499) {
  doc.font('Helvetica').fontSize(10).fillColor('#0f172a');
  for (const [k, v] of pairs) {
    const y = doc.y;
    doc.font('Helvetica-Bold').text(k, x, y, { width: 150 });
    doc.font('Helvetica').text(String(v ?? '-'), x + 150, y, { width: width - 150 });
    doc.moveDown(0.2);
  }
}

function lineItems(doc, rows, totalLabel, totalValue) {
  const left = 48;
  const right = 547;
  doc.moveDown(0.5);
  let y = doc.y;
  doc.rect(left, y, right - left, 20).fill('#e0e7ff');
  doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(10).text('Description', left + 8, y + 6).text('Amount', right - 158, y + 6, { width: 150, align: 'right' });
  y += 24;
  doc.font('Helvetica').fillColor('#0f172a');
  for (const [label, amount] of rows) {
    doc.text(label, left + 8, y, { width: 330 });
    doc.text(amount, right - 158, y, { width: 150, align: 'right' });
    y += 18;
  }
  doc.moveTo(left, y).lineTo(right, y).strokeColor('#cbd5e1').lineWidth(1).stroke();
  y += 6;
  doc.font('Helvetica-Bold').fontSize(11).text(totalLabel, left + 8, y).text(totalValue, right - 158, y, { width: 150, align: 'right' });
  doc.y = y + 24;
  doc.x = left;
}

function billStatementPdf(bill, settings, payments = []) {
  return toBuffer((doc) => {
    header(doc, settings, `Billing Statement - ${periodLabel(bill.billingYear, bill.billingMonth)}`);
    kv(doc, [
      ['Bill No.', bill.billNumber],
      ['Tenant', bill.tenantName],
      ['Room / Bed', `${bill.roomNumber || '-'}${bill.bedNumber ? ` / Bed ${bill.bedNumber}` : ''}`],
      ['Billing month', periodLabel(bill.billingYear, bill.billingMonth)],
      ['Due date', fmtDate(bill.dueDate)],
      ['Status', STATUS_LABEL[bill.status] || bill.status],
    ]);
    const rows = [['Monthly rent', peso(bill.rent)]];
    const ed = bill.electricityDetail || {};
    const elecNote = ed.consumption != null && ed.rate ? ` (room: ${ed.consumption} kWh x ${peso(ed.rate)}, ${String(ed.sharingMethod || 'equal').toLowerCase().replace('_', ' ')} share)` : '';
    rows.push([`Electricity${elecNote}`, peso(bill.electricity)]);
    if (bill.water) rows.push(['Water', peso(bill.water)]);
    (bill.otherCharges || []).forEach((c) => rows.push([c.label, peso(c.amount)]));
    (bill.adjustments || []).forEach((c) => rows.push([`${c.amount < 0 ? 'Discount' : 'Adjustment'}: ${c.label}`, peso(c.amount)]));
    lineItems(doc, rows, 'Total amount due', peso(bill.totalAmount));

    kv(doc, [
      ['Amount paid', peso(bill.amountPaid)],
      ['Remaining balance', peso(bill.remainingBalance)],
      ['Previous unpaid balance', peso(bill.previousBalance)],
      ['Total outstanding', peso((bill.remainingBalance || 0) + (bill.previousBalance || 0))],
    ]);

    if (payments.length) {
      doc.moveDown(0.8).font('Helvetica-Bold').fontSize(11).fillColor(NAVY).text('Payments applied');
      doc.font('Helvetica').fontSize(9).fillColor('#0f172a');
      payments.forEach((p) => {
        const alloc = p.allocations.find((a) => a.billId === bill._id);
        doc.text(`${fmtDate(p.paymentDate)}  ${p.receiptNumber || ''}  ${METHOD_LABELS[p.paymentMethod] || ''}  ${peso(alloc?.amount || 0)}`);
      });
    }
    if (settings.paymentInstructions) {
      doc.moveDown(1).font('Helvetica-Bold').fontSize(10).fillColor(NAVY).text('How to pay');
      doc.font('Helvetica').fontSize(9).fillColor('#334155').text(settings.paymentInstructions);
      (settings.paymentChannels || []).forEach((c) => {
        doc.text(`- ${c.provider || c.method}: ${[c.accountName, c.accountNumber].filter(Boolean).join(' - ')}`);
      });
    }
    doc.moveDown(1).fontSize(8).fillColor('#64748b').text(`Generated ${fmtDate(new Date())}. This is a system-generated statement.`);
  });
}

function receiptPdf(payment, settings) {
  return toBuffer((doc) => {
    header(doc, settings, 'Official Payment Receipt');
    kv(doc, [
      ['Receipt No.', payment.receiptNumber],
      ['Received from', payment.tenantName],
      ['Payment date', fmtDate(payment.paymentDate)],
      ['Confirmed on', fmtDate(payment.verifiedAt)],
      ['Method', `${METHOD_LABELS[payment.paymentMethod] || 'Other'}${payment.provider ? ` (${payment.provider})` : ''}`],
      ['Reference No.', payment.referenceNumber || '-'],
    ]);
    const rows = payment.allocations.map((a) => [`${a.billNumber || 'Bill'} - ${periodLabel(a.billingYear, a.billingMonth)}`, peso(a.amount)]);
    lineItems(doc, rows, 'Total received', peso(payment.amount));
    doc.moveDown(1).fontSize(8).fillColor('#64748b').text('This receipt was issued after the payment was verified by the boarding house administrator.');
  });
}

/** Generic tabular report. columns: [{header, key, width, format}] */
function tablePdf({ title, subtitle, columns, rows, summary = [] }, settings) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', layout: columns.length > 6 ? 'landscape' : 'portrait', margin: 36 });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const pageWidth = doc.page.width - 72;
    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(14).text(settings.houseName || 'Boarding House');
    doc.fillColor('#0f172a').fontSize(12).text(title);
    if (subtitle) doc.font('Helvetica').fontSize(9).fillColor('#475569').text(subtitle);
    doc.moveDown(0.5);

    const totalW = columns.reduce((a, c) => a + (c.width || 1), 0);
    const widths = columns.map((c) => ((c.width || 1) / totalW) * pageWidth);
    const drawHeader = () => {
      let x = 36;
      const y = doc.y;
      doc.rect(36, y, pageWidth, 18).fill('#e0e7ff');
      doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(8);
      columns.forEach((c, i) => {
        doc.text(c.header, x + 3, y + 5, { width: widths[i] - 6, align: c.align || 'left', lineBreak: false, ellipsis: true });
        x += widths[i];
      });
      doc.y = y + 20;
    };
    drawHeader();
    doc.font('Helvetica').fontSize(8).fillColor('#0f172a');
    rows.forEach((row, idx) => {
      if (doc.y > doc.page.height - 60) {
        doc.addPage();
        drawHeader();
        doc.font('Helvetica').fontSize(8).fillColor('#0f172a');
      }
      const y = doc.y;
      if (idx % 2 === 1) doc.rect(36, y - 2, pageWidth, 14).fill('#f8fafc').fillColor('#0f172a');
      let x = 36;
      columns.forEach((c, i) => {
        const raw = row[c.key];
        const v = c.format === 'money' ? peso(raw) : c.format === 'date' ? fmtDate(raw) : raw ?? '';
        doc.text(String(v), x + 3, y, { width: widths[i] - 6, align: c.align || (c.format === 'money' ? 'right' : 'left'), lineBreak: false, ellipsis: true });
        x += widths[i];
      });
      doc.y = y + 14;
    });
    if (!rows.length) doc.text('No records for the selected filters.', 36, doc.y + 4);
    if (summary.length) {
      doc.moveDown(1);
      summary.forEach(([k, v]) => doc.font('Helvetica-Bold').text(`${k}: `, 36, doc.y, { continued: true }).font('Helvetica').text(String(v)));
    }
    doc.end();
  });
}

module.exports = { billStatementPdf, receiptPdf, tablePdf, peso, fmtDate };
