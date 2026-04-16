/* global qaproof */
(function () {
  'use strict';
  var Q = window.QAProof;
  var S = Q.state;

  // ============================
  // QAProof seal PNG for PDF reports (pre-rendered, font-independent)
  // This must be set externally on Q.cachedSealPng before generatePdfReport is called.
  // It is a base64-encoded PNG data URI string.
  // ============================

  // ============================
  // PDF Report Generation
  // ============================
  function generatePdfReport(data) {
    if (!window.jspdf || !window.jspdf.jsPDF) {
      alert('PDF library failed to load. Please refresh the page and try again.');
      return;
    }
    var jsPDF = window.jspdf.jsPDF;
    var doc = new jsPDF('p', 'mm', 'a4');
    var W = doc.internal.pageSize.getWidth();
    var H = doc.internal.pageSize.getHeight();
    var M = 18; // margin
    var CW = W - M * 2; // content width
    var y = 0;

    // Brand palette
    var C = {
      teal: [0, 173, 181], tealDark: [0, 140, 147],
      dark: [34, 40, 49], darkAlt: [42, 47, 56],
      gray: [122, 130, 144], grayLight: [160, 168, 180],
      body: [57, 62, 70], bodyLight: [90, 96, 108],
      bg: [248, 249, 250], bgAlt: [241, 243, 245],
      white: [255, 255, 255],
      red: [239, 68, 68], amber: [245, 158, 11], blue: [59, 130, 246],
      green: [16, 185, 129]
    };

    var currentTestType = data.testType || S.testType;
    var labels = {
      fidelity: 'Design Fidelity Analysis',
      responsive: 'Responsive Testing Report',
      accessibility: 'Accessibility Audit Report',
      regression: 'Visual Regression Report',
      'design-audit': 'Design System Audit Report'
    };
    var descs = {
      fidelity: 'Pixel-level comparison of design mockup against live implementation',
      responsive: 'Cross-viewport layout and usability analysis across breakpoints',
      accessibility: 'WCAG 2.1 Level AA compliance evaluation and remediation guidance',
      regression: 'Visual change detection against previously established baseline',
      'design-audit': 'Automated design system discovery, consistency audit, and design debt analysis'
    };
    var reportLabel = labels[currentTestType] || 'QA Analysis Report';
    var reportDesc = descs[currentTestType] || '';
    var urlText = data.pageUrl || (document.getElementById('qaproof-page-url') ? document.getElementById('qaproof-page-url').value : '') || (document.getElementById('qaproof-a11y-url') ? document.getElementById('qaproof-a11y-url').value : '');
    var score = data.score;
    var scoreColor = score >= 90 ? C.teal : score >= 70 ? C.amber : C.red;
    var scoreGrade = score >= 95 ? 'A+' : score >= 90 ? 'A' : score >= 85 ? 'B+' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'F';
    var scoreVerdict = score >= 90 ? 'PASS' : score >= 70 ? 'NEEDS WORK' : 'FAIL';
    var now = new Date();
    var dateStr = now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    var timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    var reportId = 'QP-' + now.getFullYear() + String(now.getMonth() + 1).padStart(2, '0') + String(now.getDate()).padStart(2, '0') + '-' + String(now.getHours()).padStart(2, '0') + String(now.getMinutes()).padStart(2, '0');
    var differences = data.differences || [];
    var recommendations = data.recommendations || [];
    var categories = data.categories || {};
    var catKeys = Object.keys(categories);

    // Count severities
    var sevCounts = { high: 0, medium: 0, low: 0 };
    differences.forEach(function (d) {
      var s = (d.severity || 'low').toLowerCase();
      if (sevCounts[s] !== undefined) sevCounts[s]++;
    });

    // HELPERS
    function setC(c) { doc.setTextColor(c[0], c[1], c[2]); }
    function setF(c) { doc.setFillColor(c[0], c[1], c[2]); }
    function setD(c) { doc.setDrawColor(c[0], c[1], c[2]); }

    // Sanitize text for jsPDF — replace Unicode chars that Helvetica can't render
    function pdfSafe(text) {
      if (!text) return '';
      return String(text)
        .replace(/[\u2192\u2794\u279C\u27A1]/g, '->')  // arrows
        .replace(/[\u2190]/g, '<-')                     // left arrow
        .replace(/[\u2194]/g, '<->')                    // bidirectional
        .replace(/[\u2013]/g, '-')                      // en dash
        .replace(/[\u2014]/g, ' - ')                    // em dash
        .replace(/[\u2018\u2019\u201A]/g, "'")          // smart single quotes
        .replace(/[\u201C\u201D\u201E]/g, '"')          // smart double quotes
        .replace(/[\u2026]/g, '...')                    // ellipsis
        .replace(/[\u2022\u2023\u25CF\u25CB]/g, '*')    // bullet points
        .replace(/[\u2713\u2714]/g, '[ok]')             // checkmarks
        .replace(/[\u2717\u2718]/g, '[x]')              // cross marks
        .replace(/[\u00A0]/g, ' ')                      // non-breaking space
        .replace(/[\u200B\u200C\u200D\uFEFF]/g, '')    // zero-width chars
        .replace(/[\u2264]/g, '<=')                     // less-equal
        .replace(/[\u2265]/g, '>=')                     // greater-equal
        .replace(/[\u2260]/g, '!=')                     // not-equal
        .replace(/[\u00D7]/g, 'x')                      // multiplication
        .replace(/[\u00F7]/g, '/')                      // division
        .replace(/[^\x00-\xFF]/g, '');                  // strip any remaining non-Latin1
    }

    function checkPage(needed) {
      if (y + needed > H - 28) { doc.addPage(); y = 22; return true; }
      return false;
    }

    function drawScoreArc(cx, cy, r, pct, color, lineW) {
      setD([230, 232, 236]);
      doc.setLineWidth(lineW || 2.5);
      doc.circle(cx, cy, r);
      setD(color);
      doc.setLineWidth(lineW || 2.5);
      var startA = -90;
      var endA = startA + (pct / 100) * 360;
      var step = 3;
      for (var a = startA; a < endA - step; a += step) {
        var a1 = (a * Math.PI) / 180;
        var a2 = (Math.min(a + step, endA) * Math.PI) / 180;
        doc.line(
          cx + r * Math.cos(a1), cy + r * Math.sin(a1),
          cx + r * Math.cos(a2), cy + r * Math.sin(a2)
        );
      }
      doc.setLineWidth(0.2);
    }

    function sectionHeading(title, subtitle) {
      checkPage(20);
      setF(C.teal);
      doc.rect(M, y, 3.5, 8, 'F');
      doc.setFontSize(14);
      setC(C.dark);
      doc.text(title, M + 8, y + 6);
      if (subtitle) {
        doc.setFontSize(8);
        setC(C.gray);
        doc.text(subtitle, W - M, y + 6, { align: 'right' });
      }
      y += 14;
    }

    function addFooter() {
      var pn = doc.internal.getCurrentPageInfo().pageNumber;
      var tp = doc.internal.getNumberOfPages();
      setD([224, 226, 230]);
      doc.setLineWidth(0.3);
      doc.line(M, H - 16, W - M, H - 16);
      setF(C.teal);
      doc.rect(M, H - 16, 20, 0.8, 'F');
      doc.setFontSize(7);
      setC(C.gray);
      doc.text('QAProof  |  Automated Web Quality Assurance  |  qaproof.io', M, H - 11);
      doc.setFontSize(6.5);
      setC(C.grayLight);
      doc.text('Report ID: ' + reportId + '  |  Generated: ' + dateStr + ' ' + timeStr, M, H - 7.5);
      doc.setFontSize(8);
      setC(C.dark);
      doc.text(String(pn), W - M, H - 10, { align: 'right' });
      doc.setFontSize(6.5);
      setC(C.grayLight);
      doc.text('of ' + tp, W - M, H - 6.5, { align: 'right' });
    }

    // ══════════════════════════════════════════════
    // COVER HEADER
    // ══════════════════════════════════════════════
    setF(C.dark);
    doc.rect(0, 0, W, 65, 'F');

    setF(C.darkAlt);
    doc.triangle(W - 80, 0, W, 0, W, 65, 'F');

    setF(C.teal);
    doc.rect(0, 65, W, 1.2, 'F');

    // Brand
    doc.setFontSize(24);
    doc.setTextColor(255, 255, 255);
    doc.text('QAProof', M, 20);

    doc.setFontSize(8);
    doc.setTextColor(160, 168, 180);
    doc.text('AUTOMATED WEB QUALITY ASSURANCE', M, 27);

    // Report title
    doc.setFontSize(16);
    setC(C.teal);
    doc.text(reportLabel, M, 42);

    doc.setFontSize(8.5);
    doc.setTextColor(140, 148, 162);
    doc.text(reportDesc, M, 49);

    // Date block (right side)
    doc.setFontSize(10);
    doc.setTextColor(255, 255, 255);
    doc.text(dateStr, W - M, 20, { align: 'right' });
    doc.setFontSize(7.5);
    doc.setTextColor(140, 148, 162);
    doc.text(timeStr + '  |  ' + reportId, W - M, 27, { align: 'right' });

    // Score circle in header (right side)
    var circR = 13;
    var circX = W - M - circR;
    var circY = 46;
    doc.setLineWidth(1.8);
    setD(scoreColor);
    doc.setFillColor(42, 47, 56);
    doc.circle(circX, circY, circR, 'FD');
    doc.setFontSize(22);
    doc.setTextColor(255, 255, 255);
    doc.text(String(score != null ? score : '--'), circX, circY + 2, { align: 'center' });
    doc.setFontSize(6);
    doc.setTextColor(140, 148, 162);
    doc.text('/100', circX, circY + 7.5, { align: 'center' });

    y = 74;

    // Meta info cards
    var metaH = 22;
    setF(C.bg);
    doc.roundedRect(M, y, CW * 0.65 - 3, metaH, 2, 2, 'F');
    doc.setFontSize(6.5);
    setC(C.gray);
    doc.text('TARGET URL', M + 6, y + 6);
    doc.setFontSize(9.5);
    setC(C.dark);
    var urlDisp = (urlText || 'N/A').length > 55 ? urlText.substring(0, 52) + '...' : (urlText || 'N/A');
    doc.text(urlDisp, M + 6, y + 14);
    doc.setFontSize(7);
    setC(C.grayLight);
    doc.text(dateStr, M + 6, y + 19);

    var scX = M + CW * 0.65 + 3;
    var scW = CW * 0.35 - 3;
    setF(C.bg);
    doc.roundedRect(scX, y, scW, metaH, 2, 2, 'F');
    doc.setFontSize(6.5);
    setC(C.gray);
    doc.text('OVERALL SCORE', scX + 6, y + 6);
    doc.setFontSize(9.5);
    setC(C.dark);
    doc.text('Grade: ' + scoreGrade + '  |  ' + scoreVerdict, scX + 6, y + 14);
    doc.setFontSize(7);
    setC(C.grayLight);
    doc.text(catKeys.length + ' categories  |  ' + differences.length + ' issues', scX + 6, y + 19);

    y += metaH + 8;

    // Executive Summary
    if (data.summary) {
      sectionHeading('Executive Summary');
      doc.setFontSize(9);
      setC(C.body);
      var sumLines = doc.splitTextToSize(pdfSafe(data.summary), CW);
      doc.text(sumLines, M, y);
      y += sumLines.length * 4.2 + 8;
    }

    // ══════════════════════════════════════════════
    // SCORE OVERVIEW
    // ══════════════════════════════════════════════
    sectionHeading('Score Overview');

    var cardH = 32;
    setF(C.white);
    setD([230, 232, 236]);
    doc.setLineWidth(0.3);
    doc.roundedRect(M, y, CW, cardH, 3, 3, 'FD');

    var arcCx = M + 22;
    var arcCy = y + cardH / 2;
    drawScoreArc(arcCx, arcCy, 11, score || 0, scoreColor, 3);

    doc.setFontSize(14);
    setC(scoreColor);
    doc.text(String(score != null ? score : '--'), arcCx, arcCy + 1.8, { align: 'center' });

    var textX = M + 42;
    doc.setFontSize(22);
    setC(C.dark);
    doc.text(scoreGrade, textX, y + 14);
    var gradeW = doc.getTextWidth(scoreGrade);

    setF(scoreColor);
    doc.roundedRect(textX + gradeW + 4, y + 6.5, 28, 8, 2, 2, 'F');
    doc.setFontSize(6.5);
    doc.setTextColor(255, 255, 255);
    doc.text(scoreVerdict, textX + gradeW + 18, y + 12, { align: 'center' });

    var statsX = M + CW * 0.45;
    var statsItems = [
      { label: 'Categories', value: String(catKeys.length) },
      { label: 'Issues', value: String(differences.length) },
      { label: 'High', value: String(sevCounts.high), color: C.red },
      { label: 'Medium', value: String(sevCounts.medium), color: C.amber },
      { label: 'Low', value: String(sevCounts.low), color: C.blue }
    ];
    var statGap = CW * 0.55 / statsItems.length;
    for (var si = 0; si < statsItems.length; si++) {
      var stX = statsX + si * statGap;
      doc.setFontSize(14);
      setC(statsItems[si].color || C.dark);
      doc.text(statsItems[si].value, stX + statGap / 2, y + 14, { align: 'center' });
      doc.setFontSize(6.5);
      setC(C.gray);
      doc.text(statsItems[si].label, stX + statGap / 2, y + 20, { align: 'center' });
    }

    y += cardH + 10;

    // ══════════════════════════════════════════════
    // CATEGORIES
    // ══════════════════════════════════════════════
    if (catKeys.length > 0) {
      sectionHeading('Category Breakdown', catKeys.length + ' categories');

      var catRows = [];
      catKeys.forEach(function (key) {
        var cat = categories[key];
        var cs = cat.score;
        var status = cs >= 90 ? 'Pass' : cs >= 70 ? 'Warning' : 'Fail';
        catRows.push([
          key.replace(/_/g, ' ').replace(/\b\w/g, function (l) { return l.toUpperCase(); }),
          String(cs),
          status,
          pdfSafe(cat.notes || '')
        ]);
      });

      doc.autoTable({
        startY: y,
        head: [['Category', 'Score', 'Status', 'Notes']],
        body: catRows,
        margin: { left: M, right: M },
        styles: { cellPadding: { top: 3, right: 3, bottom: 5, left: 3 }, fontSize: 8.5, lineColor: [235, 237, 240], lineWidth: 0.15, overflow: 'linebreak' },
        headStyles: {
          fillColor: C.dark,
          textColor: 255,
          fontStyle: 'bold',
          fontSize: 7.5,
          cellPadding: 4
        },
        bodyStyles: { textColor: C.body },
        alternateRowStyles: { fillColor: C.bg },
        columnStyles: {
          0: { cellWidth: 40, fontStyle: 'bold', valign: 'middle' },
          1: { cellWidth: 18, halign: 'center', valign: 'middle', fontStyle: 'bold' },
          2: { cellWidth: 22, halign: 'center', valign: 'middle' },
          3: { cellWidth: 'auto' }
        },
        didParseCell: function (cellData) {
          if (cellData.section === 'body' && cellData.column.index === 1) {
            var s = parseInt(cellData.cell.raw, 10);
            cellData.cell.styles.textColor = s >= 90 ? C.teal : s >= 70 ? C.amber : C.red;
          }
          if (cellData.section === 'body' && cellData.column.index === 2) {
            var val = cellData.cell.raw;
            cellData.cell.styles.textColor = val === 'Pass' ? C.teal : val === 'Warning' ? C.amber : C.red;
            cellData.cell.styles.fontStyle = 'bold';
          }
        },
        didDrawCell: function (cellData) {
          if (cellData.section === 'body' && cellData.column.index === 1) {
            var cs = parseInt(cellData.cell.raw, 10);
            var barW = cellData.cell.width - 4;
            var barH = 1.5;
            var barX = cellData.cell.x + 2;
            var barY = cellData.cell.y + cellData.cell.height / 2 + 4;
            doc.setFillColor(230, 232, 236);
            doc.rect(barX, barY, barW, barH, 'F');
            var barColor = cs >= 90 ? C.teal : cs >= 70 ? C.amber : C.red;
            doc.setFillColor(barColor[0], barColor[1], barColor[2]);
            doc.rect(barX, barY, barW * (cs / 100), barH, 'F');
          }
        }
      });

      y = doc.lastAutoTable.finalY + 12;
    }

    // ══════════════════════════════════════════════
    // ISSUES
    // ══════════════════════════════════════════════
    if (differences.length > 0) {
      sectionHeading('Issues Found', differences.length + ' total');

      checkPage(14);
      setF(C.bg);
      doc.roundedRect(M, y, CW, 11, 2, 2, 'F');
      var sx = M + 6;
      var sevItems = [
        { count: sevCounts.high, label: 'Critical / High', color: C.red },
        { count: sevCounts.medium, label: 'Medium', color: C.amber },
        { count: sevCounts.low, label: 'Low', color: C.blue }
      ];
      for (var sv = 0; sv < sevItems.length; sv++) {
        if (sevItems[sv].count > 0) {
          setF(sevItems[sv].color);
          doc.roundedRect(sx, y + 2.5, 14, 6, 1.5, 1.5, 'F');
          doc.setFontSize(7);
          doc.setTextColor(255, 255, 255);
          doc.text(String(sevItems[sv].count), sx + 7, y + 6.5, { align: 'center' });
          doc.setFontSize(7.5);
          setC(sevItems[sv].color);
          doc.text(sevItems[sv].label, sx + 17, y + 6.8);
          sx += 17 + doc.getTextWidth(sevItems[sv].label) + 10;
        }
      }
      y += 16;

      var issueRows = [];
      for (var ii = 0; ii < differences.length; ii++) {
        var diff = differences[ii];
        var sev = (diff.severity || 'low');
        var desc = diff.description || '';
        if (diff.wcag_criterion) desc += '  [WCAG ' + diff.wcag_criterion + ']';
        issueRows.push([
          String(ii + 1),
          sev.charAt(0).toUpperCase() + sev.slice(1),
          diff.category ? diff.category.replace(/_/g, ' ').replace(/\b\w/g, function (l) { return l.toUpperCase(); }) : '',
          pdfSafe(desc)
        ]);
      }

      doc.autoTable({
        startY: y,
        head: [['#', 'Severity', 'Category', 'Description']],
        body: issueRows,
        margin: { left: M, right: M },
        styles: { cellPadding: { top: 3, right: 3, bottom: 5, left: 3 }, fontSize: 8, lineColor: [235, 237, 240], lineWidth: 0.15, overflow: 'linebreak' },
        headStyles: { fillColor: C.dark, textColor: 255, fontStyle: 'bold', fontSize: 7.5, cellPadding: 4 },
        bodyStyles: { textColor: C.body },
        alternateRowStyles: { fillColor: C.bg },
        columnStyles: {
          0: { cellWidth: 'wrap', halign: 'center', valign: 'middle', fontStyle: 'bold' },
          1: { cellWidth: 'wrap', halign: 'center', valign: 'middle', fontStyle: 'bold' },
          2: { cellWidth: 'wrap', valign: 'middle' },
          3: { cellWidth: 'auto' }
        },
        didDrawCell: function (cellData) {
          if (cellData.section === 'body' && cellData.column.index === 1) {
            var sevText = (cellData.cell.raw || '').toLowerCase();
            var dotColor = sevText === 'high' ? C.red : sevText === 'medium' ? C.amber : C.blue;
            doc.setFillColor(dotColor[0], dotColor[1], dotColor[2]);
            var dotX = cellData.cell.x + cellData.cell.width / 2;
            var textY2 = cellData.cell.y + cellData.cell.height / 2;
            var dotY = textY2 + 4;
            doc.circle(dotX, dotY, 1.5, 'F');
          }
        },
        didParseCell: function (cellData) {
          if (cellData.section === 'body' && cellData.column.index === 1) {
            var sev2 = (cellData.cell.raw || '').toLowerCase();
            cellData.cell.styles.textColor = sev2 === 'high' ? C.red : sev2 === 'medium' ? C.amber : C.blue;
          }
        }
      });

      y = doc.lastAutoTable.finalY + 12;
    }

    // ══════════════════════════════════════════════
    // RECOMMENDATIONS
    // ══════════════════════════════════════════════
    if (recommendations.length > 0) {
      sectionHeading('Recommendations', recommendations.length + ' items');

      for (var ri = 0; ri < recommendations.length; ri++) {
        checkPage(18);

        setF(ri % 2 === 0 ? C.bg : C.white);
        var recLines = doc.splitTextToSize(pdfSafe(recommendations[ri]), CW - 16);
        var recH = recLines.length * 4 + 7;
        doc.roundedRect(M, y, CW, recH, 1.5, 1.5, 'F');

        setF(C.teal);
        doc.roundedRect(M + 3, y + 3, 8, 6, 1.5, 1.5, 'F');
        doc.setFontSize(7.5);
        doc.setTextColor(255, 255, 255);
        doc.text(String(ri + 1), M + 7, y + 7, { align: 'center' });

        doc.setFontSize(8.5);
        setC(C.body);
        doc.text(recLines, M + 14, y + 7);

        y += recH + 3;
      }
      y += 6;
    }

    // ══════════════════════════════════════════════
    // METHODOLOGY / STANDARDS (accessibility)
    // ══════════════════════════════════════════════
    if (currentTestType === 'accessibility') {
      sectionHeading('Methodology & Standards');
      checkPage(40);

      setF(C.bg);
      doc.roundedRect(M, y, CW, 34, 2, 2, 'F');

      doc.setFontSize(8);
      setC(C.dark);
      doc.text('Testing Methodology', M + 6, y + 7);
      doc.setFontSize(7.5);
      setC(C.body);
      var methodLines = [
        'Automated screenshot capture of the target URL',
        'AI-powered visual analysis using Claude Vision',
        'Pattern matching against WCAG 2.1 Level AA criteria',
        'Severity classification based on user impact'
      ];
      for (var mi = 0; mi < methodLines.length; mi++) {
        setF(C.teal);
        doc.circle(M + 9, y + 13 + mi * 5, 0.8, 'F');
        doc.setFontSize(7.5);
        setC(C.body);
        doc.text(methodLines[mi], M + 13, y + 14 + mi * 5);
      }

      var refX = M + CW * 0.55;
      doc.setFontSize(8);
      setC(C.dark);
      doc.text('Standards Reference', refX, y + 7);
      var refs = [
        'WCAG 2.1 Level AA  —  w3.org/TR/WCAG21/',
        'Understanding WCAG  —  w3.org/WAI/WCAG21/Understanding/',
        'Quick Reference  —  w3.org/WAI/WCAG21/quickref/',
        'WAI-ARIA 1.1  —  w3.org/TR/wai-aria-1.1/'
      ];
      for (var ri2 = 0; ri2 < refs.length; ri2++) {
        setF(C.teal);
        doc.circle(refX + 3, y + 13 + ri2 * 5, 0.8, 'F');
        doc.setFontSize(7);
        setC(C.bodyLight);
        doc.text(refs[ri2], refX + 7, y + 14 + ri2 * 5);
      }

      y += 40;
    }

    // ══════════════════════════════════════════════
    // DISCLAIMER
    // ══════════════════════════════════════════════
    checkPage(22);
    doc.setFontSize(7);
    setC(C.grayLight);
    var discText = 'This report was generated by QAProof automated testing. Results are based on AI-powered visual analysis and may not capture all issues. ' +
      'Manual testing by accessibility experts is recommended for comprehensive compliance verification. This report does not constitute legal advice regarding ' +
      (currentTestType === 'accessibility' ? 'ADA, Section 508, or EN 301 549 compliance.' : 'regulatory compliance.');
    var discLines = doc.splitTextToSize(discText, CW);
    doc.text(discLines, M, y);
    y += discLines.length * 3.5 + 4;

    // ══════════════════════════════════════════════
    // SEAL + FOOTERS
    // ══════════════════════════════════════════════
    var tp = doc.internal.getNumberOfPages();

    doc.setPage(tp);
    var sealSize = 42;
    var sealX = W - M - sealSize / 2 - 2;
    var sealY = H - 28 - sealSize / 2;

    if (Q.cachedSealPng) {
      doc.addImage(Q.cachedSealPng, 'PNG', sealX - sealSize / 2, sealY - sealSize / 2, sealSize, sealSize);
    } else {
      doc.setFontSize(6);
      doc.setFont('helvetica', 'bold');
      setC(C.teal);
      doc.text('QAPROOF VERIFIED', sealX, sealY, { align: 'center' });
    }

    doc.setFontSize(5);
    doc.setFont('helvetica', 'bold');
    setC(C.tealDark);
    doc.text('Score: ' + (score != null ? score + '/100' : 'N/A'), sealX, sealY + sealSize / 2 + 4, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setLineWidth(0.2);

    for (var fp = 1; fp <= tp; fp++) {
      doc.setPage(fp);
      addFooter();
    }

    // Download
    var filename = 'qaproof-' + currentTestType + '-report-' + now.toISOString().slice(0, 10) + '.pdf';
    doc.save(filename);
  }

  // ============================
  // Expose on namespace
  // ============================
  Q.generatePdfReport = generatePdfReport;
})();
