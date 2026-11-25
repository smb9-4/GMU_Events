const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const QRCode = require('qrcode');
const PDFDocument = require('pdfkit');

const QR_PREFIX = 'GMUTEDX:';
const LOGO_PATH = path.join(__dirname, '..', '..', 'public', 'img', 'logo.png');

function newTicketCode() {
  return crypto.randomBytes(12).toString('hex'); // 24 hex chars, impossible to guess
}

/** Accepts the full QR text ("GMUTEDX:abc...") or a bare code typed by a volunteer. */
function parseTicketCode(text) {
  const raw = String(text || '').trim();
  const code = (raw.toUpperCase().startsWith(QR_PREFIX) ? raw.slice(QR_PREFIX.length) : raw).trim().toLowerCase();
  return /^[a-f0-9]{24}$/.test(code) ? code : null;
}

function qrText(code) {
  return QR_PREFIX + code;
}

function qrDataUrl(code) {
  return QRCode.toDataURL(qrText(code), { errorCorrectionLevel: 'M', margin: 1, width: 360 });
}

function formatIST(date) {
  return new Date(date).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

/** Streams a one-page PDF ticket to the response. */
async function streamTicketPdf(res, { booking, event, user }) {
  const qrPng = await QRCode.toBuffer(qrText(booking.ticketCode), { errorCorrectionLevel: 'M', margin: 1, width: 600 });

  const W = 360;
  const H = 620;
  const doc = new PDFDocument({ size: [W, H], margin: 0, info: { Title: `${event.title} - Seat ${booking.seatId}` } });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="TEDx-ticket-${booking.seatId}.pdf"`);
  doc.pipe(res);

  const maroon = '#3d0a0e';
  const gold = '#e9c46a';
  const ink = '#1d1d1f';
  const muted = '#6b6b70';

  // Header band
  doc.rect(0, 0, W, 150).fill(maroon);
  if (fs.existsSync(LOGO_PATH)) {
    doc.image(LOGO_PATH, (W - 90) / 2, 14, { fit: [90, 72], align: 'center' });
  }
  doc.fillColor(gold).font('Helvetica-Bold').fontSize(20).text(event.title.toUpperCase(), 20, 94, { width: W - 40, align: 'center' });
  doc.fillColor('#f3e6c4').font('Helvetica').fontSize(9.5).text(`${event.venue}  •  ${formatIST(event.startsAt)}`, 20, 122, { width: W - 40, align: 'center' });

  // Seat block
  doc.roundedRect(20, 168, W - 40, 78, 10).fill('#fbf3df');
  doc.fillColor(muted).font('Helvetica').fontSize(9).text('YOUR SEAT', 36, 180);
  doc.fillColor(maroon).font('Helvetica-Bold').fontSize(38).text(booking.seatId, 36, 194);
  doc.fillColor(muted).font('Helvetica').fontSize(9).text('ROW', 200, 180);
  doc.fillColor(ink).font('Helvetica-Bold').fontSize(22).text(booking.row, 200, 196);
  doc.fillColor(muted).font('Helvetica').fontSize(9).text('ENTRY', 260, 180);
  doc.fillColor(ink).font('Helvetica-Bold').fontSize(12).text('1 person', 260, 202);

  // Attendee
  let y = 262;
  const field = (label, value, x, width) => {
    doc.fillColor(muted).font('Helvetica').fontSize(8).text(label, x, y, { width });
    doc.fillColor(ink).font('Helvetica-Bold').fontSize(10.5).text(value || '-', x, y + 11, { width, ellipsis: true, lineBreak: false });
  };
  field('NAME', user.name, 24, W - 48);
  y += 34;
  field('DEPARTMENT', user.dept, 24, 150);
  field('SEMESTER', user.sem ? String(user.sem) : '-', 190, 70);
  field('PHONE', user.phone, 255, 90);
  y += 34;
  field('COLLEGE', user.college, 24, W - 48);

  // Tear line
  y += 40;
  doc.save().moveTo(16, y).lineTo(W - 16, y).dash(4, { space: 4 }).strokeColor('#cfc6b0').stroke().restore();
  doc.circle(0, y, 10).fill(maroon);
  doc.circle(W, y, 10).fill(maroon);

  // QR
  const qrSize = 170;
  doc.image(qrPng, (W - qrSize) / 2, y + 18, { width: qrSize });
  doc.fillColor(muted).font('Courier').fontSize(8.5).text(booking.ticketCode.toUpperCase().match(/.{1,6}/g).join(' '), 20, y + qrSize + 24, { width: W - 40, align: 'center' });
  doc.fillColor(ink).font('Helvetica').fontSize(8.5).text('Show this QR code at the entrance. Valid for one entry only. Do not share it.', 30, y + qrSize + 40, { width: W - 60, align: 'center' });

  // Footer
  doc.rect(0, H - 22, W, 22).fill(maroon);
  doc.fillColor(gold).font('Helvetica').fontSize(8).text('GM University  •  Innovating Minds', 0, H - 15, { width: W, align: 'center' });

  doc.end();
}

module.exports = { newTicketCode, parseTicketCode, qrDataUrl, streamTicketPdf, QR_PREFIX };
