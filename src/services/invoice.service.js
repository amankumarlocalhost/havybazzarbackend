/**
 * invoice.service.js
 * ---------------------------------------------------------------------------
 * PDF invoice banata hai — pdfkit se seedha response stream me likhta hai
 * (poora buffer memory me build karne ke bajaye), jaisa large file streaming
 * ke liye standard practice hai.
 * ---------------------------------------------------------------------------
 */

const PDFDocument = require('pdfkit');

function formatPaise(paise = 0) {
  const rupees = paise / 100;
  return `Rs. ${rupees.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

function formatDate(date) {
  return date ? new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';
}

/**
 * @param {Object} order - populated with listingId, buyerId, sellerId
 * @param {import('http').ServerResponse} res
 */
function streamInvoicePdf(order, res) {
  const doc = new PDFDocument({ size: 'A4', margin: 50 });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${order.invoiceNumber || order.orderNumber}.pdf"`);
  doc.pipe(res);

  const listing = order.listingId || {};
  const buyer = order.buyerId || {};
  const seller = order.sellerId || {};
  const specs = listing.specifications || {};

  // ---- Header ----
  doc.fontSize(20).font('Helvetica-Bold').text('Heavy Bazar', { continued: false });
  doc.fontSize(9).font('Helvetica').fillColor('#666').text('Equipment Marketplace — Tax Invoice');
  doc.moveDown(1.5);
  doc.fillColor('#000');

  doc.fontSize(14).font('Helvetica-Bold').text(`Invoice ${order.invoiceNumber || '(not yet generated)'}`);
  doc.fontSize(9).font('Helvetica').fillColor('#444');
  doc.text(`Order #: ${order.orderNumber}`);
  doc.text(`Order Date: ${formatDate(order.createdAt)}`);
  doc.text(`Invoice Date: ${formatDate(order.invoiceGeneratedAt)}`);
  doc.text(`Status: ${(order.status || '').toUpperCase()}`);
  doc.fillColor('#000');
  doc.moveDown(1);

  // ---- Buyer / Seller ----
  const colY = doc.y;
  doc.fontSize(10).font('Helvetica-Bold').text('Buyer', 50, colY);
  doc.font('Helvetica').fontSize(9);
  doc.text(buyer.fullName || '-', 50);
  doc.text(buyer.email || buyer.phone || '-', 50);
  if (order.shippingAddress) {
    const a = order.shippingAddress;
    doc.text([a.line1, a.line2].filter(Boolean).join(', '), 50);
    doc.text(`${a.city || ''}, ${a.state || ''} ${a.pincode || ''}`, 50);
    doc.text(a.country || 'India', 50);
  }

  doc.fontSize(10).font('Helvetica-Bold').text('Seller', 320, colY);
  doc.font('Helvetica').fontSize(9);
  doc.text(seller.fullName || '-', 320);
  doc.text(seller.email || seller.phone || '-', 320);

  doc.moveDown(2);
  doc.x = 50;

  // ---- Product details ----
  doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#ddd').stroke();
  doc.moveDown(0.5);

  doc.fontSize(11).font('Helvetica-Bold').text('Equipment Details');
  doc.moveDown(0.3);
  doc.fontSize(9).font('Helvetica');

  doc.font('Helvetica-Bold').text(listing.title || '-', { continued: false });
  doc.font('Helvetica');
  if (listing.description) {
    doc.fontSize(8).fillColor('#555').text(listing.description, { width: 495 });
    doc.fillColor('#000').fontSize(9);
  }
  doc.moveDown(0.4);

  const specRows = [];
  if (listing.condition) specRows.push(['Condition', listing.condition]);
  if (specs.general?.brand) specRows.push(['Brand', specs.general.brand]);
  if (specs.general?.typeExtended || specs.general?.type) {
    specRows.push(['Model / Type', specs.general.typeExtended || specs.general.type]);
  }
  if (specs.general?.productionYear) specRows.push(['Production Year', String(specs.general.productionYear)]);
  if (specs.general?.hoursOnMeter != null) specRows.push(['Hours on Meter', String(specs.general.hoursOnMeter)]);
  if (specs.general?.totalWeightKg) specRows.push(['Total Weight', `${specs.general.totalWeightKg} kg`]);
  if (specs.engine?.brand) specRows.push(['Engine Brand', specs.engine.brand]);
  if (specs.engine?.type) specRows.push(['Engine Type', specs.engine.type]);
  if (listing.location?.state) specRows.push(['Location', `${listing.location.city ? listing.location.city + ', ' : ''}${listing.location.state}`]);
  specRows.push(['Order Type', order.orderType === 'auction_win' ? 'Auction Win' : 'Fixed Price Purchase']);

  specRows.forEach(([label, value]) => {
    doc.font('Helvetica-Bold').text(`${label}: `, { continued: true }).font('Helvetica').text(value);
  });

  doc.moveDown(1);
  doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#ddd').stroke();
  doc.moveDown(0.5);

  // ---- Price breakdown ----
  doc.fontSize(11).font('Helvetica-Bold').text('Payment Summary');
  doc.moveDown(0.3);
  doc.fontSize(9).font('Helvetica');

  const sellerReceives = order.totalAmountPaise - order.commissionPaise;

  const rows = [
    ['Total Amount', formatPaise(order.totalAmountPaise)],
    ...(order.emdAdjustedPaise ? [['EMD Adjusted', formatPaise(order.emdAdjustedPaise)]] : []),
    ['Platform Commission', formatPaise(order.commissionPaise)],
    ['Seller Payout', formatPaise(sellerReceives)],
  ];

  rows.forEach(([label, value]) => {
    doc.font('Helvetica').text(label, 50, doc.y, { continued: true, width: 300 });
    doc.text(value, { align: 'right' });
  });

  doc.moveDown(0.3);
  doc.font('Helvetica-Bold').fontSize(11);
  doc.text('Total Paid', 50, doc.y, { continued: true, width: 300 });
  doc.text(formatPaise(order.totalAmountPaise), { align: 'right' });

  doc.moveDown(2);
  doc.fontSize(8).font('Helvetica').fillColor('#888');
  doc.text('This is a system-generated invoice from Heavy Bazar and does not require a signature.', {
    align: 'center',
  });

  doc.end();
}

module.exports = { streamInvoicePdf };
