import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { GOAL_CATEGORY_LABELS } from '../data/goalPresets';
import { BENCHMARK_DATASETS } from '../data/historicalIndices';
import type {
  GoalFolder,
  SavedScenario,
  SavingsLog,
  ScenarioInput,
} from '../types/finance';
import {
  CURRENCY_CONFIG,
  computeGoalSplitPlan,
  computeRemainingGoalEta,
  formatDurationMonths,
  getLocalISODate,
  type CurrencyCode,
} from './financeMath';

const COLOR_OBSIDIAN: [number, number, number] = [15, 36, 25];
const COLOR_EMERALD: [number, number, number] = [5, 120, 87];
const COLOR_GOLD: [number, number, number] = [212, 168, 79];
const COLOR_INK: [number, number, number] = [24, 34, 29];
const COLOR_MUTED: [number, number, number] = [100, 112, 106];
const COLOR_SURFACE: [number, number, number] = [247, 246, 242];
const COLOR_BORDER: [number, number, number] = [222, 219, 212];

function formatCurrencyPdf(
  amountPhp: number,
  currency: CurrencyCode = 'PHP',
  decimals = false
): string {
  const safePhp = Number.isFinite(amountPhp) ? amountPhp : 0;
  const cfg = CURRENCY_CONFIG[currency];
  const converted = safePhp / Math.max(0.01, cfg.phpPerUnit);
  const formattedNum = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals ? 2 : 0,
    maximumFractionDigits: decimals ? 2 : currency === 'PHP' ? 0 : converted < 100 ? 2 : 0,
  }).format(converted);

  if (currency === 'PHP') return `PHP ${formattedNum}`;
  if (currency === 'USD') return `$${formattedNum}`;
  return `S$${formattedNum}`;
}

function sanitizePdfText(text: string): string {
  // Replace common symbols unsupported in PDF standard WinAnsi fonts
  return text.replace(/₱/g, 'PHP ').replace(/[^\x20-\x7E\xA0-\xFF]/g, ' ').trim();
}

function slugifyPdfFilename(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return slug || 'report';
}

function drawMasthead(
  doc: jsPDF,
  title: string,
  subtitle: string,
  metaRight: string[]
): number {
  const pageWidth = doc.internal.pageSize.getWidth();

  // Obsidian Forest header band
  doc.setFillColor(...COLOR_OBSIDIAN);
  doc.rect(0, 0, pageWidth, 34, 'F');

  // Champagne Gold bottom trim
  doc.setFillColor(...COLOR_GOLD);
  doc.rect(0, 34, pageWidth, 1.2, 'F');

  // Brand mark & report title
  doc.setTextColor(212, 168, 79);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('FINSIGHT  ·  PERSONAL SAVINGS LEDGER', 14, 11);

  doc.setTextColor(250, 249, 245);
  doc.setFont('times', 'bold');
  doc.setFontSize(18);
  doc.text(sanitizePdfText(title), 14, 21);

  doc.setTextColor(200, 216, 206);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(sanitizePdfText(subtitle), 14, 28.5);

  // Right-aligned metadata
  doc.setTextColor(225, 232, 228);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  metaRight.forEach((line, idx) => {
    doc.text(sanitizePdfText(line), pageWidth - 14, 13 + idx * 5.2, { align: 'right' });
  });

  return 43;
}

function drawKpiRow(
  doc: jsPDF,
  startY: number,
  cards: Array<{ label: string; value: string; hint: string }>
): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;
  const gap = 4;
  const usableWidth = pageWidth - margin * 2;
  const cardWidth = (usableWidth - gap * (cards.length - 1)) / cards.length;
  const cardHeight = 21;

  cards.forEach((card, idx) => {
    const x = margin + idx * (cardWidth + gap);
    doc.setFillColor(...COLOR_SURFACE);
    doc.setDrawColor(...COLOR_BORDER);
    doc.roundedRect(x, startY, cardWidth, cardHeight, 2, 2, 'FD');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...COLOR_MUTED);
    doc.text(sanitizePdfText(card.label).toUpperCase(), x + 3.5, startY + 5.8);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...COLOR_INK);
    doc.text(sanitizePdfText(card.value), x + 3.5, startY + 12.6, {
      maxWidth: cardWidth - 7,
    });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...COLOR_EMERALD);
    doc.text(sanitizePdfText(card.hint), x + 3.5, startY + 17.8, {
      maxWidth: cardWidth - 7,
    });
  });

  return startY + cardHeight + 8;
}

function addPageFooters(doc: jsPDF): void {
  const totalPages = doc.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setDrawColor(...COLOR_BORDER);
    doc.line(14, pageHeight - 13, pageWidth - 14, pageHeight - 13);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...COLOR_MUTED);
    doc.text(
      'FinSight Personal Record · Projections & historical benchmarks are for educational planning only.',
      14,
      pageHeight - 8
    );
    doc.text(`Page ${p} of ${totalPages}`, pageWidth - 14, pageHeight - 8, {
      align: 'right',
    });
  }
}

function getLastTableFinalY(doc: jsPDF, fallbackY: number): number {
  const maybe = (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY;
  return typeof maybe === 'number' && Number.isFinite(maybe) ? maybe : fallbackY;
}

export interface ExportFolderLedgerPdfInput {
  folderName: string;
  folderFilter: string;
  folders: GoalFolder[];
  files: SavedScenario[];
  allScenarios: SavedScenario[];
  savingsLogs: SavingsLog[];
  currency: CurrencyCode;
  ownerLabel: string;
}

export function exportFolderLedgerPdf({
  folderName,
  folderFilter,
  folders,
  files,
  allScenarios,
  savingsLogs,
  currency,
  ownerLabel,
}: ExportFolderLedgerPdfInput): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const today = getLocalISODate();
  const folderById = new Map(folders.map((f) => [f.id, f]));
  const scenarioTitleById = new Map(allScenarios.map((s) => [s.id, s.title]));

  // Scope deposit logs to the files in this folder when viewing a specific folder/unfiled
  const fileIdsInScope = new Set(files.map((f) => f.id));
  const scopedLogs =
    folderFilter === 'all'
      ? savingsLogs
      : savingsLogs.filter((log) => fileIdsInScope.has(log.scenarioId));

  const totalTargets = files.reduce((sum, f) => sum + f.goalTargetAmount, 0);
  const totalWeeklyPace = files.reduce((sum, f) => sum + f.weeklySavings, 0);
  const totalInitialSaved = files.reduce((sum, f) => sum + f.initialDeposit, 0);
  const totalScopedDeposits = scopedLogs.reduce((sum, l) => sum + l.amount, 0);

  let y = drawMasthead(
    doc,
    `Folder Ledger: ${folderName}`,
    'Organized savings goal files and deposit check-in history',
    [`Exported: ${today}`, `Vault: ${ownerLabel}`, `Currency: ${currency}`]
  );

  y = drawKpiRow(doc, y, [
    {
      label: 'Goal Files',
      value: `${files.length} ${files.length === 1 ? 'File' : 'Files'}`,
      hint: `Scope: ${folderName}`,
    },
    {
      label: 'Combined Targets',
      value: formatCurrencyPdf(totalTargets, currency),
      hint: `Initial saved: ${formatCurrencyPdf(totalInitialSaved, currency)}`,
    },
    {
      label: 'Weekly Save Pace',
      value: `${formatCurrencyPdf(totalWeeklyPace, currency)}/wk`,
      hint: `${formatCurrencyPdf((totalWeeklyPace * 52) / 12, currency)}/mo est.`,
    },
    {
      label: 'Logged Deposits',
      value: formatCurrencyPdf(totalScopedDeposits, currency),
      hint: `${scopedLogs.length} check-${scopedLogs.length === 1 ? 'in' : 'ins'}`,
    },
  ]);

  // Section 1: Saved Goal Files Table
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(...COLOR_INK);
  doc.text('Saved Goal Files', 14, y);

  if (files.length === 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...COLOR_MUTED);
    doc.text('No goal files saved inside this folder yet.', 14, y + 6);
    y += 14;
  } else {
    const fileRows = files.map((file) => {
      const assignedFolder = file.folderId ? folderById.get(file.folderId)?.name ?? 'Unfiled' : 'Unfiled';
      const splitStr = `${file.savingsPercent}% / ${file.needsPercent}% / ${file.wantsPercent}%`;
      return [
        sanitizePdfText(file.title),
        sanitizePdfText(assignedFolder),
        sanitizePdfText(GOAL_CATEGORY_LABELS[file.goalCategory]),
        formatCurrencyPdf(file.goalTargetAmount, currency),
        splitStr,
        `${formatCurrencyPdf(file.weeklySavings, currency)}/wk`,
        formatCurrencyPdf(file.initialDeposit, currency),
      ];
    });

    autoTable(doc, {
      startY: y + 3,
      margin: { left: 14, right: 14, bottom: 18 },
      head: [['Goal File', 'Folder', 'Category', 'Target', 'Save/Need/Want', 'Weekly', 'Starting']],
      body: fileRows,
      theme: 'striped',
      headStyles: {
        fillColor: COLOR_EMERALD,
        textColor: [255, 255, 255],
        fontSize: 8,
        fontStyle: 'bold',
      },
      bodyStyles: {
        fontSize: 8,
        textColor: COLOR_INK,
        cellPadding: 2.5,
      },
      alternateRowStyles: {
        fillColor: [248, 248, 245],
      },
      columnStyles: {
        3: { halign: 'right' },
        4: { halign: 'center' },
        5: { halign: 'right' },
        6: { halign: 'right' },
      },
    });

    y = getLastTableFinalY(doc, y + 20) + 10;
  }

  // Section 2: Deposit Check-Ins Ledger
  const pageHeight = doc.internal.pageSize.getHeight();
  if (y > pageHeight - 40) {
    doc.addPage();
    y = 18;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(...COLOR_INK);
  doc.text('Deposit Check-In History', 14, y);

  if (scopedLogs.length === 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...COLOR_MUTED);
    doc.text(
      'No cloud deposit check-ins recorded for this folder scope yet.',
      14,
      y + 6
    );
  } else {
    // Chronological ascending for running total, then display newest-first
    const asc = [...scopedLogs].sort((a, b) => a.weekDate.localeCompare(b.weekDate));
    let running = 0;
    const runningById = new Map<string, number>();
    for (const item of asc) {
      running += item.amount;
      runningById.set(item.id, running);
    }

    const logRows = scopedLogs.map((log) => [
      sanitizePdfText(log.weekDate),
      sanitizePdfText(scenarioTitleById.get(log.scenarioId) ?? 'Saved Goal'),
      sanitizePdfText(log.note || 'Weekly savings deposit'),
      `+${formatCurrencyPdf(log.amount, currency)}`,
      formatCurrencyPdf(runningById.get(log.id) ?? log.amount, currency),
    ]);

    autoTable(doc, {
      startY: y + 3,
      margin: { left: 14, right: 14, bottom: 18 },
      head: [['Date', 'Goal File', 'Note', 'Deposit', 'Running Deposits']],
      body: logRows,
      theme: 'striped',
      headStyles: {
        fillColor: COLOR_OBSIDIAN,
        textColor: [250, 249, 245],
        fontSize: 8,
        fontStyle: 'bold',
      },
      bodyStyles: {
        fontSize: 8,
        textColor: COLOR_INK,
        cellPadding: 2.5,
      },
      alternateRowStyles: {
        fillColor: [248, 248, 245],
      },
      columnStyles: {
        0: { cellWidth: 24 },
        3: { halign: 'right', fontStyle: 'bold', textColor: COLOR_EMERALD },
        4: { halign: 'right' },
      },
    });
  }

  addPageFooters(doc);
  doc.save(`finsight-folder-ledger-${slugifyPdfFilename(folderName)}-${today}.pdf`);
}

export interface ExportGoalProgressPdfInput {
  scenario: ScenarioInput;
  activeScenarioId: string | null;
  folders: GoalFolder[];
  savingsLogs: SavingsLog[];
  currency: CurrencyCode;
  ownerLabel: string;
}

export function exportGoalProgressPdf({
  scenario,
  activeScenarioId,
  folders,
  savingsLogs,
  currency,
  ownerLabel,
}: ExportGoalProgressPdfInput): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const today = getLocalISODate();
  const cleanTitle = scenario.title.trim() || 'My Savings Goal';
  const assignedFolder = scenario.folderId
    ? folders.find((f) => f.id === scenario.folderId)?.name
    : undefined;
  const benchmark = BENCHMARK_DATASETS[scenario.benchmarkId];

  const totalLoggedAll = savingsLogs.reduce((sum, l) => sum + l.amount, 0);
  const currentSaved = scenario.initialDeposit + totalLoggedAll;
  const targetAmount = Math.max(500, scenario.goalTargetAmount);
  const pctFunded = Math.min(100, (currentSaved / targetAmount) * 100);
  const eta = computeRemainingGoalEta(
    currentSaved,
    targetAmount,
    scenario.weeklySavings,
    scenario.benchmarkId
  );
  const splitPlan = computeGoalSplitPlan(scenario);

  let y = drawMasthead(
    doc,
    `Progress Report: ${cleanTitle}`,
    `${GOAL_CATEGORY_LABELS[scenario.goalCategory]}${assignedFolder ? `  ·  Folder: ${assignedFolder}` : ''}  ·  Benchmark: ${benchmark.shortName}`,
    [`Generated: ${today}`, `Vault: ${ownerLabel}`, `Currency: ${currency}`]
  );

  // Progress Bar Card
  const pageWidth = doc.internal.pageSize.getWidth();
  const cardWidth = pageWidth - 28;
  doc.setFillColor(...COLOR_SURFACE);
  doc.setDrawColor(...COLOR_BORDER);
  doc.roundedRect(14, y, cardWidth, 28, 2.5, 2.5, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(...COLOR_INK);
  doc.text(
    sanitizePdfText(
      `Funded ${formatCurrencyPdf(currentSaved, currency)} of ${formatCurrencyPdf(targetAmount, currency)} (${pctFunded.toFixed(1)}%)`
    ),
    18,
    y + 7.5
  );

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...COLOR_MUTED);
  doc.text(
    sanitizePdfText(
      eta.remaining <= 0
        ? 'Goal Target Reached'
        : `Remaining: ${formatCurrencyPdf(eta.remaining, currency)}  ·  Est. Target Date: ${eta.targetDateLabel}`
    ),
    pageWidth - 18,
    y + 7.5,
    { align: 'right' }
  );

  // Vector progress bar
  const barX = 18;
  const barY = y + 12;
  const barW = cardWidth - 8;
  const barH = 5;
  doc.setFillColor(226, 229, 226);
  doc.roundedRect(barX, barY, barW, barH, 1.5, 1.5, 'F');
  if (pctFunded > 0) {
    doc.setFillColor(...COLOR_EMERALD);
    doc.roundedRect(barX, barY, Math.max(3, (barW * pctFunded) / 100), barH, 1.5, 1.5, 'F');
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...COLOR_MUTED);
  doc.text(
    sanitizePdfText(
      `Weekly Rate: ${formatCurrencyPdf(scenario.weeklySavings, currency)}/wk (${scenario.savingsPercent}% of ${scenario.incomeCadence} income)  ·  Cash ETA: ${eta.weeksCash} wks  ·  Invested ETA: ${formatDurationMonths(eta.monthsInvested)}`
    ),
    18,
    y + 23.5
  );

  y += 35;

  y = drawKpiRow(doc, y, [
    {
      label: 'Starting Saved',
      value: formatCurrencyPdf(scenario.initialDeposit, currency),
      hint: 'Initial goal balance',
    },
    {
      label: 'Logged Deposits',
      value: formatCurrencyPdf(totalLoggedAll, currency),
      hint: `${savingsLogs.length} check-ins`,
    },
    {
      label: '1-Yr Index Proj.',
      value: formatCurrencyPdf(splitPlan.oneYearInvestedBalance, currency),
      hint: benchmark.shortName,
    },
    {
      label: '1-Yr Cash Proj.',
      value: formatCurrencyPdf(splitPlan.oneYearCashBalance, currency),
      hint: '0% baseline',
    },
  ]);

  // Income & Percentage Split Table
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(...COLOR_INK);
  doc.text('Income & Percentage Split Plan', 14, y);

  const unallocated = Math.max(
    0,
    100 - (scenario.savingsPercent + scenario.needsPercent + scenario.wantsPercent)
  );
  const splitRows: string[][] = [
    [
      'Goal Savings',
      `${scenario.savingsPercent}%`,
      `${formatCurrencyPdf(scenario.weeklySavings, currency)}/wk`,
      `${formatCurrencyPdf(splitPlan.monthlyFromSplit, currency)}/mo`,
    ],
    [
      'Needs & Essentials',
      `${scenario.needsPercent}%`,
      `${formatCurrencyPdf((splitPlan.monthlyNeedsAmount * 12) / 52, currency)}/wk`,
      `${formatCurrencyPdf(splitPlan.monthlyNeedsAmount, currency)}/mo`,
    ],
    [
      'Wants & Flexible',
      `${scenario.wantsPercent}%`,
      `${formatCurrencyPdf((splitPlan.monthlyWantsAmount * 12) / 52, currency)}/wk`,
      `${formatCurrencyPdf(splitPlan.monthlyWantsAmount, currency)}/mo`,
    ],
  ];
  if (unallocated > 0) {
    splitRows.push([
      'Unallocated Buffer',
      `${unallocated}%`,
      `${formatCurrencyPdf((splitPlan.monthlyUnallocatedAmount * 12) / 52, currency)}/wk`,
      `${formatCurrencyPdf(splitPlan.monthlyUnallocatedAmount, currency)}/mo`,
    ]);
  }

  autoTable(doc, {
    startY: y + 3,
    margin: { left: 14, right: 14, bottom: 18 },
    head: [['Allocation Bucket', 'Share %', 'Weekly Amount', 'Monthly Equivalent']],
    body: splitRows,
    theme: 'striped',
    headStyles: {
      fillColor: COLOR_EMERALD,
      textColor: [255, 255, 255],
      fontSize: 8,
      fontStyle: 'bold',
    },
    bodyStyles: {
      fontSize: 8.5,
      textColor: COLOR_INK,
      cellPadding: 2.8,
    },
    alternateRowStyles: {
      fillColor: [248, 248, 245],
    },
    columnStyles: {
      1: { halign: 'center', fontStyle: 'bold' },
      2: { halign: 'right' },
      3: { halign: 'right' },
    },
  });

  y = getLastTableFinalY(doc, y + 32) + 10;

  // Logged Deposits Table
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(...COLOR_INK);
  doc.text(
    activeScenarioId ? 'Logged Deposit Check-Ins' : 'Logged Deposit History',
    14,
    y
  );

  if (savingsLogs.length === 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...COLOR_MUTED);
    doc.text(
      'No deposit check-ins logged yet. Log weekly deposits in FinSight to include them here.',
      14,
      y + 6
    );
  } else {
    const logRows = savingsLogs.map((log) => [
      sanitizePdfText(log.weekDate),
      sanitizePdfText(log.note || 'Weekly savings deposit'),
      `+${formatCurrencyPdf(log.amount, currency)}`,
    ]);

    autoTable(doc, {
      startY: y + 3,
      margin: { left: 14, right: 14, bottom: 18 },
      head: [['Date', 'Note', 'Deposit Amount']],
      body: logRows,
      theme: 'striped',
      headStyles: {
        fillColor: COLOR_OBSIDIAN,
        textColor: [250, 249, 245],
        fontSize: 8,
        fontStyle: 'bold',
      },
      bodyStyles: {
        fontSize: 8,
        textColor: COLOR_INK,
        cellPadding: 2.5,
      },
      alternateRowStyles: {
        fillColor: [248, 248, 245],
      },
      columnStyles: {
        0: { cellWidth: 28 },
        2: { halign: 'right', fontStyle: 'bold', textColor: COLOR_EMERALD },
      },
    });
  }

  addPageFooters(doc);
  doc.save(`finsight-progress-${slugifyPdfFilename(cleanTitle)}-${today}.pdf`);
}
