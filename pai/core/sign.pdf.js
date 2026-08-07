// ⬡B:core.sign_pdf:MODULE:executed_agreement_pdf_with_zero_dependencies:20260807⬡
//
// THE EXECUTED COPY. The signing portal (routes/sign.routes.js) collects the
// contractor's details and signature in the browser; this module turns that
// submission into the executed PDF that is recorded and emailed. It is the one
// source for the agreement text, so the page the contractor reads and the PDF
// the company countersigns can never drift apart.
//
// WHY HAND ROLLED: this repo ships with express and nothing else, on purpose.
// The document is Letter pages of Helvetica text plus one JPEG signature image,
// which the PDF format carries natively (standard 14 fonts need no embedding,
// JPEG rides DCTDecode byte for byte). A dependency would buy nothing but a
// supply chain.
//
// IDENTITY IS ENV-ONLY. Nothing in this file names a person. Company blanks
// (state of organization, entity type, governing law) arrive as fill values the
// route reads from env, and an unset blank renders as an honest underscored
// blank exactly like the source document, never an invented fact.
'use strict';

var crypto = require('node:crypto');

var AGREEMENT_KEY = 'gmg_independent_contractor_v1';
var COMPANY_NAME = 'Global Majority Group';
var AGREEMENT_TITLE = 'Independent Contractor Agreement';

var BLANK = '______________';

function fillOr(v, fallback) {
  var s = (v === undefined || v === null) ? '' : String(v).trim();
  return s ? s : (fallback || BLANK);
}

// The agreement, section by section, byte-faithful to the source document the
// company circulated. `fill` carries the contractor's own details plus the
// company blanks. Returned as structured sections so the portal page and the
// PDF render the SAME text through two different painters.
function agreementSections(fill) {
  fill = fill || {};
  var contractor = fillOr(fill.contractorName, 'the individual identified below');
  var companyState = fillOr(fill.companyState);
  var entityType = fillOr(fill.entityType, 'company');
  var governingState = fillOr(fill.governingState);
  return [
    { heading: null, paragraphs: [
      'This Independent Contractor Agreement is entered into as of the date signed below by and between ' + COMPANY_NAME + ', a ' + companyState + ' ' + entityType + ', referred to in this Agreement as the Company, and ' + contractor + ', referred to in this Agreement as the Contractor.'
    ]},
    { heading: '1. Purpose of this Agreement', paragraphs: [
      'The Company and the Contractor are entering into an ongoing working relationship. This Agreement establishes the terms that will govern that relationship and creates a documented record of the Contractor’s association with the Company. It does not by itself assign any specific work, and it does not by itself obligate the Company to pay the Contractor any amount.'
    ]},
    { heading: '2. Independent contractor relationship', paragraphs: [
      'The Contractor is an independent contractor and is not an employee, partner, agent, or joint venturer of the Company. Nothing in this Agreement creates an employment relationship. The Contractor is not entitled to any benefit provided by the Company to its employees, including health insurance, retirement contributions, paid leave, workers’ compensation coverage, or unemployment insurance. The Contractor is responsible for the manner and means by which any services are performed, subject to the deliverables and deadlines agreed for a given engagement.',
      'The Contractor has no authority to enter into contracts, incur obligations, or make representations on behalf of the Company unless the Company grants that authority in writing for a specific purpose.'
    ]},
    { heading: '3. Services', paragraphs: [
      'From time to time the Company may offer the Contractor specific work. Each engagement will be described in a separate written statement of work, engagement letter, email confirmation, or similar writing that identifies the scope, the deliverables, the timeline, and the compensation for that engagement. No work is assigned or accepted by this Agreement alone.',
      'The Contractor may accept or decline any engagement offered. The Company may offer or decline to offer any engagement.'
    ]},
    { heading: '4. Compensation', paragraphs: [
      'No compensation is owed to the Contractor upon signing this Agreement, and no payment is due unless and until the Contractor performs work under a separately agreed engagement. Compensation for each engagement will be set out in the writing for that engagement. Unless that writing says otherwise, the Company will pay undisputed invoiced amounts within thirty days of receipt. The Contractor is responsible for any expenses incurred in performing services unless the Company approves them in advance in writing.'
    ], note: 'Signing this does not pay you anything today and does not create a tax event today. It puts the relationship on paper so that when there is work to be done and money to be paid, the paperwork already exists and the Company can pay you properly.' },
    { heading: '5. No guarantee of work, income, or placement', paragraphs: [
      'The Contractor acknowledges that this Agreement is not a promise of work, a promise of income, a promise of employment with the Company or with any third party, and not a promise of any specific opportunity, role, or placement. Any statement about potential future work is an expression of intent only and does not create an obligation.'
    ]},
    { heading: '6. Taxes', paragraphs: [
      'The Contractor is solely responsible for all federal, state, and local taxes arising from any compensation received under this Agreement, including self-employment tax, and for making any required estimated tax payments. The Company will not withhold taxes from payments to the Contractor.',
      'The Contractor will provide a completed IRS Form W-9 before receiving any payment. The Company will issue IRS Form 1099-NEC where required by law.'
    ]},
    { heading: '7. Confidentiality', paragraphs: [
      'The Contractor previously executed a Non-Disclosure Agreement with the Company. That agreement remains in full force and is incorporated into this Agreement by reference. Nothing in this Agreement limits or replaces it.',
      'In addition, the Contractor agrees to hold in confidence all non-public information of the Company and of any client or partner of the Company, including business methods, program design and curriculum, pricing, financial information, client identities, prospective opportunities, member information, and the content of any internal session or communication. This obligation continues after this Agreement ends.',
      'The Contractor will not disclose such information to any person outside the Company, including family members, and will not post or publish any of it. If the Contractor is uncertain whether information may be shared, the Contractor will ask the Company before sharing it.'
    ]},
    { heading: '8. Company property and work product', paragraphs: [
      'All materials, documents, curricula, templates, data, and other work product the Contractor creates in the course of performing services for the Company are the exclusive property of the Company. The Contractor assigns to the Company all right, title, and interest in that work product, including all intellectual property rights, and will sign any further documents reasonably necessary to confirm that assignment.',
      'Materials the Contractor developed independently before this Agreement, and outside of any engagement with the Company, remain the Contractor’s property.'
    ]},
    { heading: '9. Conflicts of interest', paragraphs: [
      'The Contractor is free to perform services for other parties. The Contractor will promptly notify the Company of any engagement or relationship that would create a conflict with work the Contractor is performing for the Company or with a Company client, and will not accept an engagement that would require use or disclosure of the Company’s confidential information.'
    ]},
    { heading: '10. Representations', paragraphs: [
      'The Contractor represents that entering into this Agreement does not breach any other agreement the Contractor is party to, including any agreement with a current or former employer, and that the Contractor will perform any services in compliance with applicable law.'
    ]},
    { heading: '11. Term and termination', paragraphs: [
      'This Agreement begins on the date signed and continues until terminated. Either party may terminate it at any time, with or without cause, by written notice to the other. Termination does not affect any engagement already in progress unless the parties agree otherwise, and does not relieve either party of obligations already incurred.',
      'Sections 6 through 9, and this sentence, survive termination.'
    ]},
    { heading: '12. General', paragraphs: [
      '1. Entire agreement. This Agreement, together with the Non-Disclosure Agreement referenced above and any written statement of work, is the entire agreement between the parties on this subject and replaces any prior understanding, written or spoken.',
      '2. Amendment. This Agreement may be changed only by a writing signed by both parties.',
      '3. Assignment. The Contractor may not assign this Agreement without the Company’s written consent.',
      '4. Governing law. This Agreement is governed by the laws of the State of ' + governingState + ', without regard to its conflict of laws rules.',
      '5. Severability. If any provision is held unenforceable, the rest of the Agreement remains in effect.',
      '6. Counterparts and electronic signature. This Agreement may be signed in counterparts and by electronic signature, each of which is an original.'
    ]}
  ];
}

// The canonical flattened text, hashed into the record and printed on the
// signing certificate, so anyone can later prove which exact words were signed.
function agreementPlainText(fill) {
  var out = [COMPANY_NAME, AGREEMENT_TITLE];
  agreementSections(fill).forEach(function (s) {
    if (s.heading) out.push(s.heading);
    s.paragraphs.forEach(function (p) { out.push(p); });
    if (s.note) out.push('PLAIN LANGUAGE: ' + s.note);
  });
  return out.join('\n');
}

function agreementSha256(fill) {
  return crypto.createHash('sha256').update(agreementPlainText(fill), 'utf8').digest('hex');
}

// ---------------------------------------------------------------------------
// THE PDF PAINTER.
//
// Standard AFM advance widths, thousandths of an em, ASCII 32 through 126, so
// line wrapping measures real Helvetica instead of guessing. These are the
// published metrics of the base 14 fonts every PDF viewer carries.
var W_HELV = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
var W_HELB = [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584];

// PDF string literals are Latin-1. Anything outside printable ASCII is mapped
// to its closest plain form so a curly quote never becomes mojibake in a
// courtroom copy.
function toAscii(s) {
  return String(s === undefined || s === null ? '' : s)
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, ', ')
    .replace(/…/g, '...')
    .replace(/ /g, ' ')
    .replace(/[^\x20-\x7e]/g, '');
}

function escPdf(s) {
  return toAscii(s).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function textWidth(s, bold, size) {
  var t = toAscii(s), table = bold ? W_HELB : W_HELV, sum = 0;
  for (var i = 0; i < t.length; i++) {
    var c = t.charCodeAt(i);
    sum += (c >= 32 && c <= 126) ? table[c - 32] : 556;
  }
  return sum * size / 1000;
}

function wrap(text, bold, size, maxWidth) {
  var words = toAscii(text).split(/\s+/).filter(Boolean);
  var lines = [], line = '';
  for (var i = 0; i < words.length; i++) {
    var candidate = line ? line + ' ' + words[i] : words[i];
    if (textWidth(candidate, bold, size) <= maxWidth || !line) line = candidate;
    else { lines.push(line); line = words[i]; }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

// JPEG dimensions from the SOF marker, needed for the image XObject.
function jpegSize(buf) {
  if (!buf || buf.length < 4 || buf[0] !== 0xFF || buf[1] !== 0xD8) return null;
  var i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xFF) { i++; continue; }
    var marker = buf[i + 1];
    if (marker >= 0xC0 && marker <= 0xCF && marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC) {
      return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    }
    var len = buf.readUInt16BE(i + 2);
    if (len < 2) return null;
    i += 2 + len;
  }
  return null;
}

var PAGE_W = 612, PAGE_H = 792, MARGIN = 66;
var CONTENT_W = PAGE_W - MARGIN * 2;

// A tiny page painter: collects content-stream fragments and hands back the
// stream when the page is full. Fonts: /F1 Helvetica, /F2 Helvetica-Bold,
// /F3 Helvetica-Oblique. Image name /Sig when a drawn signature exists.
function Painter() {
  this.pages = [];
  this._ops = null;
  this.y = 0;
}
Painter.prototype.newPage = function () {
  if (this._ops) this.pages.push(this._ops.join('\n'));
  this._ops = [];
  this.y = PAGE_H - MARGIN;
};
Painter.prototype.need = function (height) {
  if (!this._ops || this.y - height < MARGIN + 26) this.newPage();
};
Painter.prototype.text = function (str, opts) {
  opts = opts || {};
  var size = opts.size || 10.5;
  var font = opts.italic ? '/F3' : (opts.bold ? '/F2' : '/F1');
  var x = MARGIN + (opts.indent || 0);
  if (opts.center) x = (PAGE_W - textWidth(str, !!opts.bold, size)) / 2;
  var gray = opts.gray === undefined ? 0.13 : opts.gray;
  this._ops.push('BT ' + font + ' ' + size + ' Tf ' + gray + ' ' + gray + ' ' + gray
    + ' rg 1 0 0 1 ' + x.toFixed(2) + ' ' + this.y.toFixed(2) + ' Tm (' + escPdf(str) + ') Tj ET');
};
Painter.prototype.line = function (x1, x2, gray) {
  var g = gray === undefined ? 0.55 : gray;
  this._ops.push(g + ' ' + g + ' ' + g + ' RG 0.7 w '
    + x1.toFixed(2) + ' ' + this.y.toFixed(2) + ' m ' + x2.toFixed(2) + ' ' + this.y.toFixed(2) + ' l S');
};
Painter.prototype.paragraph = function (text, opts) {
  opts = opts || {};
  var size = opts.size || 10.5, leading = opts.leading || 15;
  var width = CONTENT_W - (opts.indent || 0);
  var lines = wrap(text, !!opts.bold, size, width);
  for (var i = 0; i < lines.length; i++) {
    this.need(leading);
    this.y -= leading;
    this.text(lines[i], opts);
  }
};
Painter.prototype.gap = function (h) { this.y -= h; };
Painter.prototype.image = function (w, h) {
  this.need(h + 6);
  this.y -= h;
  this._ops.push('q ' + w.toFixed(2) + ' 0 0 ' + h.toFixed(2) + ' ' + MARGIN + ' ' + this.y.toFixed(2) + ' cm /Sig Do Q');
};

function buildPdf(pagesOps, jpegBuf) {
  var objects = [];
  function add(body) { objects.push(body); return objects.length; }
  var fontRegular = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  var fontBold = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  var fontItalic = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique /Encoding /WinAnsiEncoding >>');
  var imageRef = null;
  if (jpegBuf) {
    var dim = jpegSize(jpegBuf);
    if (dim) {
      imageRef = add({ raw: true,
        head: '<< /Type /XObject /Subtype /Image /Width ' + dim.width + ' /Height ' + dim.height
          + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + jpegBuf.length + ' >>',
        stream: jpegBuf });
    }
  }
  var contentRefs = pagesOps.map(function (ops) {
    var body = Buffer.from(ops, 'latin1');
    return add({ raw: true, head: '<< /Length ' + body.length + ' >>', stream: body });
  });
  // The Pages object is written after the per-page objects, so its number is
  // the current count, plus one page object per content stream, plus one.
  var pagesRef = objects.length + contentRefs.length + 1;
  var resources = '<< /Font << /F1 ' + fontRegular + ' 0 R /F2 ' + fontBold + ' 0 R /F3 ' + fontItalic + ' 0 R >>'
    + (imageRef ? ' /XObject << /Sig ' + imageRef + ' 0 R >>' : '') + ' >>';
  var pageRefs = contentRefs.map(function (cRef) {
    return add('<< /Type /Page /Parent ' + pagesRef + ' 0 R /MediaBox [0 0 ' + PAGE_W + ' ' + PAGE_H + ']'
      + ' /Resources ' + resources + ' /Contents ' + cRef + ' 0 R >>');
  });
  var pages = add('<< /Type /Pages /Kids [' + pageRefs.map(function (r) { return r + ' 0 R'; }).join(' ')
    + '] /Count ' + pageRefs.length + ' >>');
  var catalog = add('<< /Type /Catalog /Pages ' + pages + ' 0 R >>');

  var chunks = [Buffer.from('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n', 'latin1')];
  var offsets = [0];
  var position = chunks[0].length;
  for (var i = 0; i < objects.length; i++) {
    offsets.push(position);
    var head = Buffer.from((i + 1) + ' 0 obj\n', 'latin1');
    var body;
    if (objects[i] && objects[i].raw) {
      body = Buffer.concat([
        Buffer.from(objects[i].head + '\nstream\n', 'latin1'),
        objects[i].stream,
        Buffer.from('\nendstream', 'latin1')
      ]);
    } else {
      body = Buffer.from(String(objects[i]), 'latin1');
    }
    var tail = Buffer.from('\nendobj\n', 'latin1');
    chunks.push(head, body, tail);
    position += head.length + body.length + tail.length;
  }
  var xrefStart = position;
  var xref = 'xref\n0 ' + (objects.length + 1) + '\n0000000000 65535 f \n';
  for (var j = 1; j <= objects.length; j++) {
    xref += ('0000000000' + offsets[j]).slice(-10) + ' 00000 n \n';
  }
  xref += 'trailer\n<< /Size ' + (objects.length + 1) + ' /Root ' + catalog + ' 0 R >>\nstartxref\n' + xrefStart + '\n%%EOF\n';
  chunks.push(Buffer.from(xref, 'latin1'));
  return Buffer.concat(chunks);
}

function footerOps(pageIndex, pageCount) {
  var label = AGREEMENT_TITLE + ' | ' + COMPANY_NAME;
  var pageLabel = 'Page ' + (pageIndex + 1) + ' of ' + pageCount;
  return 'BT /F1 8.5 Tf 0.45 0.45 0.45 rg 1 0 0 1 ' + MARGIN + ' 40 Tm (' + escPdf(label) + ') Tj ET\n'
    + 'BT /F1 8.5 Tf 0.45 0.45 0.45 rg 1 0 0 1 '
    + (PAGE_W - MARGIN - textWidth(pageLabel, false, 8.5)).toFixed(2) + ' 40 Tm (' + escPdf(pageLabel) + ') Tj ET';
}

// The executed document: title block, contractor information as submitted, the
// full agreement, the signature page with the real signature, and a signing
// certificate that makes the electronic execution auditable.
function buildExecutedPdf(input) {
  input = input || {};
  var fill = input.fill || {};
  var signatureJpeg = null;
  if (input.signatureJpegBase64) {
    try { signatureJpeg = Buffer.from(input.signatureJpegBase64, 'base64'); } catch (e) { signatureJpeg = null; }
    if (signatureJpeg && !jpegSize(signatureJpeg)) signatureJpeg = null;
  }

  var p = new Painter();
  p.newPage();
  p.gap(6); p.y -= 24;
  p.text(COMPANY_NAME.toUpperCase(), { bold: true, size: 19, center: true });
  p.gap(8); p.y -= 16;
  p.text(AGREEMENT_TITLE, { size: 13, center: true, gray: 0.3 });
  p.gap(20);

  agreementSections(fill).forEach(function (section, idx) {
    if (section.heading) {
      p.need(34);
      p.gap(10);
      p.paragraph(section.heading, { bold: true, size: 11.5, leading: 16 });
      p.gap(2);
    }
    section.paragraphs.forEach(function (para) {
      p.paragraph(para, {});
      p.gap(5);
    });
    if (section.note) {
      p.gap(2);
      p.paragraph('Plain language: ' + section.note, { italic: true, indent: 14, gray: 0.32 });
      p.gap(5);
    }
    if (idx === 0) {
      p.gap(8);
      p.paragraph('Contractor information', { bold: true, size: 11.5, leading: 16 });
      p.gap(2);
      var rows = [
        ['Full legal name', fill.contractorName],
        ['Business or entity name, if paid through one', fill.entityName || 'None'],
        ['Street address', fill.street],
        ['City, State, ZIP', fill.cityStateZip],
        ['Email address', fill.email],
        ['Phone', fill.phone]
      ];
      rows.forEach(function (row) {
        p.paragraph(row[0].toUpperCase(), { size: 7.8, gray: 0.42, leading: 12 });
        p.paragraph(fillOr(row[1]), { size: 10.5, leading: 14 });
        p.gap(4);
      });
      p.gap(6);
    }
  });

  // Signature page.
  p.newPage();
  p.gap(6); p.y -= 20;
  p.text('Signatures', { bold: true, size: 15 });
  p.gap(14);
  p.paragraph('By signing below, the Contractor confirms that the Contractor has read this Agreement, understands it, has had the opportunity to seek independent advice about it, and agrees to be bound by it.', {});
  p.gap(24);
  p.paragraph('CONTRACTOR', { size: 8.2, gray: 0.42, leading: 12 });
  p.gap(6);
  if (signatureJpeg) {
    var dims = jpegSize(signatureJpeg);
    var drawW = Math.min(220, CONTENT_W);
    var drawH = drawW * dims.height / dims.width;
    if (drawH > 80) { drawH = 80; drawW = drawH * dims.width / dims.height; }
    p.image(drawW, drawH);
  } else {
    p.gap(30); p.y -= 24;
    p.text(fillOr(input.typedSignature, fillOr(fill.contractorName)), { italic: true, size: 22, gray: 0.2 });
  }
  p.gap(6); p.y -= 4;
  p.line(MARGIN, MARGIN + 250);
  p.gap(2);
  p.paragraph('SIGNATURE', { size: 7.8, gray: 0.42, leading: 12 });
  p.gap(12);
  p.paragraph('PRINT NAME', { size: 7.8, gray: 0.42, leading: 12 });
  p.paragraph(fillOr(fill.contractorName), { size: 11, leading: 15 });
  p.gap(10);
  p.paragraph('DATE', { size: 7.8, gray: 0.42, leading: 12 });
  p.paragraph(fillOr(input.signedAtDate), { size: 11, leading: 15 });
  p.gap(30);
  p.paragraph('FOR ' + COMPANY_NAME.toUpperCase(), { size: 8.2, gray: 0.42, leading: 12 });
  p.gap(34); p.y -= 4;
  p.line(MARGIN, MARGIN + 250);
  p.gap(2);
  p.paragraph('SIGNATURE', { size: 7.8, gray: 0.42, leading: 12 });
  p.gap(12);
  p.paragraph('PRINT NAME AND TITLE', { size: 7.8, gray: 0.42, leading: 12 });
  p.gap(16); p.y -= 4;
  p.line(MARGIN, MARGIN + 250);
  p.gap(10);
  p.paragraph('DATE', { size: 7.8, gray: 0.42, leading: 12 });
  p.gap(16); p.y -= 4;
  p.line(MARGIN, MARGIN + 120);

  // Signing certificate.
  p.newPage();
  p.gap(6); p.y -= 20;
  p.text('Electronic Signing Certificate', { bold: true, size: 15 });
  p.gap(14);
  p.paragraph('This certificate is part of the executed document. It records how the electronic signature on the preceding page was captured, so the execution can be verified later.', { gray: 0.3 });
  p.gap(14);
  var cert = [
    ['Record ID', input.recordId],
    ['Signed at (UTC)', input.signedAtIso],
    ['Signer name', fill.contractorName],
    ['Signer email', fill.email],
    ['Signer IP address', input.ip],
    ['Signer browser', input.userAgent],
    ['Signature method', signatureJpeg ? 'Drawn by hand on the signing page' : 'Typed signature adopted on the signing page'],
    ['Agreement text SHA-256', input.agreementSha256],
    ['Signature image SHA-256', signatureJpeg ? crypto.createHash('sha256').update(signatureJpeg).digest('hex') : 'Not applicable']
  ];
  cert.forEach(function (row) {
    p.paragraph(row[0].toUpperCase(), { size: 7.8, gray: 0.42, leading: 12 });
    p.paragraph(fillOr(row[1], 'Not recorded'), { size: 9.5, leading: 13 });
    p.gap(7);
  });
  p.gap(10);
  p.paragraph('The signer affirmed on the signing page that their electronic signature is the legal equivalent of a handwritten signature and that they intend to be bound by this Agreement, consistent with Section 12.6.', { gray: 0.3 });

  p.pages.push(p._ops.join('\n'));
  var count = p.pages.length;
  var withFooters = p.pages.map(function (ops, i) { return ops + '\n' + footerOps(i, count); });
  return buildPdf(withFooters, signatureJpeg);
}

module.exports = {
  AGREEMENT_KEY: AGREEMENT_KEY,
  COMPANY_NAME: COMPANY_NAME,
  AGREEMENT_TITLE: AGREEMENT_TITLE,
  agreementSections: agreementSections,
  agreementPlainText: agreementPlainText,
  agreementSha256: agreementSha256,
  buildExecutedPdf: buildExecutedPdf,
  _test: { wrap: wrap, textWidth: textWidth, jpegSize: jpegSize, toAscii: toAscii }
};
