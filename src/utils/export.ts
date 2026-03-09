import type { ProjectDocument } from '../types/document';
import { FmedaNode, FmedaNodeType, ProjectContext } from '../types/fmeda';
import { generateId } from './id';
import { isLegacyFormat, migrateLegacyToFlat } from './migration';
import { normalizeProjectContext, normalizeProjectDocuments } from './projectDocuments';

const JSON_MIME = 'application/json';
const CSV_MIME = 'text/csv;charset=utf-8';
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const EXPORT_APP_NAME = 'FMEDA Pro';
const EXCEL_WORKBOOK_VERSION = '2';
const HIERARCHY_SHEET_NAME = 'Hierarchy';
const FAILURE_MODES_SHEET_NAME = 'Failure Modes';
const DOCUMENTS_SHEET_NAME = 'Project Documents';
const OVERVIEW_SHEET_NAME = 'Overview';
const METADATA_SHEET_NAME = '_FMEDA';

const TYPE_LABELS: Record<FmedaNodeType, string> = {
  System: 'System',
  Subsystem: 'Subsystem',
  Component: 'Component',
  Function: 'Function',
  FailureMode: 'Failure Mode',
};

const TYPE_COLORS: Record<FmedaNodeType, { fill: string; font: string }> = {
  System: { fill: 'DBEAFE', font: '1D4ED8' },
  Subsystem: { fill: 'E0E7FF', font: '4338CA' },
  Component: { fill: 'F3E8FF', font: '7E22CE' },
  Function: { fill: 'D1FAE5', font: '047857' },
  FailureMode: { fill: 'FEF3C7', font: 'B45309' },
};

const CLASSIFICATION_COLORS = {
  Safe: { fill: 'DCFCE7', font: '166534' },
  Dangerous: { fill: 'FEE2E2', font: 'B91C1C' },
};

export interface ExportResult {
  success: boolean;
  fileName?: string;
}

interface HierarchyContext {
  system: string;
  subsystem: string;
  component: string;
  functionName: string;
  asil: string;
  safetyGoal: string;
}

interface HierarchyExportRow {
  nodeId: string;
  parentNodeId: string;
  level: number;
  nodeType: FmedaNodeType;
  nodeName: string;
  path: string;
  system: string;
  subsystem: string;
  component: string;
  functionName: string;
  failureMode: string;
  localEffect: string;
  safetyMechanism: string;
  classification: string;
  asil: string;
  safetyGoal: string;
  diagnosticCoverage: number | null;
  fitValue: number | null;
  safeFit: number;
  dangerousFit: number;
  childCount: number;
}

interface FailureModeExportRow {
  nodeId: string;
  parentNodeId: string;
  systemId: string;
  subsystemId: string;
  componentId: string;
  functionId: string;
  system: string;
  subsystem: string;
  component: string;
  functionName: string;
  failureMode: string;
  localEffect: string;
  safetyMechanism: string;
  classification: 'Safe' | 'Dangerous';
  diagnosticCoverage: number;
  fitRate: number;
  safeFit: number;
  dangerousFit: number;
  asil: string;
  safetyGoal: string;
  path: string;
}

interface ProjectDocumentExportRow {
  documentId: string;
  kind: 'uploaded' | 'notes';
  name: string;
  uploadedAt: string;
  extractedText: string;
}

interface ExportSummary {
  projectName: string;
  safetyStandard: string;
  targetAsil: string;
  safetyGoal: string;
  exportedAt: string;
  counts: Record<FmedaNodeType, number>;
  totalFit: number;
  safeFit: number;
  dangerousFit: number;
  avgDc: number;
  dangerousFailureModes: number;
  topRiskItems: FailureModeExportRow[];
}

/**
 * Returns the exported base file name with the project name if available.
 */
const getExportBaseName = (projectName?: string) => {
  const dateStr = new Date().toISOString().split('T')[0];
  if (projectName) {
    const safeName = projectName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    return `fmeda-${safeName}-${dateStr}`;
  }
  return `fmeda-export-${dateStr}`;
};

const getExportFileName = (projectName: string | undefined, extension: string) => {
  return `${getExportBaseName(projectName)}.${extension}`;
};

const saveBlob = async (
  blob: Blob,
  suggestedName: string,
  typeDescription: string,
  accept: Record<string, string[]>
): Promise<ExportResult> => {
  try {
    if ('showSaveFilePicker' in window) {
      const handle = await (window as unknown as {
        showSaveFilePicker: (options: unknown) => Promise<{
          createWritable: () => Promise<{ write: (blob: Blob) => Promise<void>; close: () => Promise<void> }>;
          name: string;
        }>
      }).showSaveFilePicker({
        suggestedName,
        types: [
          {
            description: typeDescription,
            accept,
          },
        ],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return { success: true, fileName: handle.name };
    }
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') {
      return { success: false };
    }

    console.error('File-system access API error:', err);
  }

  const objectUrl = URL.createObjectURL(blob);
  const linkElement = document.createElement('a');
  linkElement.setAttribute('href', objectUrl);
  linkElement.setAttribute('download', suggestedName);
  linkElement.click();
  URL.revokeObjectURL(objectUrl);

  return { success: true, fileName: suggestedName };
};

const solidFill = (argb: string) => ({
  type: 'pattern' as const,
  pattern: 'solid' as const,
  fgColor: { argb },
});

const thinBorder = {
  top: { style: 'thin' as const, color: { argb: 'E5E7EB' } },
  left: { style: 'thin' as const, color: { argb: 'E5E7EB' } },
  bottom: { style: 'thin' as const, color: { argb: 'E5E7EB' } },
  right: { style: 'thin' as const, color: { argb: 'E5E7EB' } },
};

const formatPercentLabel = (value: number | null | undefined) => {
  if (value == null || Number.isNaN(value)) return '';
  return `${(value * 100).toFixed(1)}%`;
};

const formatNumberLabel = (value: number | null | undefined, digits = 2) => {
  if (value == null || Number.isNaN(value)) return '';
  return value.toFixed(digits);
};

const escapeCsv = (value: string | number | null | undefined) => {
  if (value == null) return '';
  const text = String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
};

const buildFailureModeMetrics = (node: FmedaNode) => {
  const fitRate = node.fitRate ?? 0;
  const diagnosticCoverage = node.diagnosticCoverage ?? 0;
  const isDangerous = node.classification === 'Dangerous';

  return {
    diagnosticCoverage,
    fitRate,
    safeFit: node.safeFit ?? (isDangerous ? fitRate * diagnosticCoverage : fitRate),
    dangerousFit: node.dangerousFit ?? (isDangerous ? fitRate : 0),
  };
};

const buildExportDataset = (nodes: FmedaNode[], projectContext: ProjectContext | null) => {
  const nodeMap = Object.fromEntries(nodes.map((node) => [node.id, node]));
  const rootNodes = nodes.filter((node) => !node.parentId);

  const hierarchyRows: HierarchyExportRow[] = [];
  const failureModeRows: FailureModeExportRow[] = [];
  const documentRows: ProjectDocumentExportRow[] = normalizeProjectDocuments(projectContext?.documents).map((document) => ({
    documentId: document.id,
    kind: document.kind ?? 'uploaded',
    name: document.name,
    uploadedAt: document.uploadedAt,
    extractedText: document.extractedText,
  }));
  const counts: Record<FmedaNodeType, number> = {
    System: 0,
    Subsystem: 0,
    Component: 0,
    Function: 0,
    FailureMode: 0,
  };

  const walk = (node: FmedaNode, level: number, lineage: HierarchyContext, path: string[]) => {
    counts[node.type] += 1;

    const nextLineage: HierarchyContext = {
      ...lineage,
      asil: node.asil || lineage.asil,
      safetyGoal: node.safetyGoal || lineage.safetyGoal,
    };

    if (node.type === 'System') nextLineage.system = node.name;
    if (node.type === 'Subsystem') nextLineage.subsystem = node.name;
    if (node.type === 'Component') nextLineage.component = node.name;
    if (node.type === 'Function') nextLineage.functionName = node.name;

    const currentPath = [...path, node.name];
    hierarchyRows.push({
      nodeId: node.id,
      parentNodeId: node.parentId ?? '',
      level,
      nodeType: node.type,
      nodeName: node.name,
      path: currentPath.join(' > '),
      system: nextLineage.system,
      subsystem: nextLineage.subsystem,
      component: nextLineage.component,
      functionName: nextLineage.functionName,
      failureMode: node.type === 'FailureMode' ? node.name : '',
      localEffect: node.localEffect || '',
      safetyMechanism: node.safetyMechanism || '',
      classification: node.type === 'FailureMode' ? node.classification || '' : '',
      asil: nextLineage.asil,
      safetyGoal: nextLineage.safetyGoal,
      diagnosticCoverage:
        node.type === 'FailureMode'
          ? node.diagnosticCoverage ?? 0
          : node.childIds.length > 0
            ? node.avgDc ?? 1
            : null,
      fitValue:
        node.type === 'FailureMode'
          ? node.fitRate ?? 0
          : node.childIds.length > 0
            ? node.totalFit ?? 0
            : null,
      safeFit: node.safeFit ?? 0,
      dangerousFit: node.dangerousFit ?? 0,
      childCount: node.childIds.length,
    });

    if (node.type === 'FailureMode') {
      const metrics = buildFailureModeMetrics(node);
      const functionNode = node.parentId ? nodeMap[node.parentId] : null;
      const componentNode = functionNode?.parentId ? nodeMap[functionNode.parentId] : null;
      const subsystemNode = componentNode?.parentId ? nodeMap[componentNode.parentId] : null;
      const systemNode = subsystemNode?.parentId ? nodeMap[subsystemNode.parentId] : null;
      failureModeRows.push({
        nodeId: node.id,
        parentNodeId: node.parentId ?? '',
        systemId: systemNode?.id ?? '',
        subsystemId: subsystemNode?.id ?? '',
        componentId: componentNode?.id ?? '',
        functionId: functionNode?.id ?? '',
        system: nextLineage.system,
        subsystem: nextLineage.subsystem,
        component: nextLineage.component,
        functionName: nextLineage.functionName,
        failureMode: node.name,
        localEffect: node.localEffect || '',
        safetyMechanism: node.safetyMechanism || '',
        classification: node.classification || 'Safe',
        diagnosticCoverage: metrics.diagnosticCoverage,
        fitRate: metrics.fitRate,
        safeFit: metrics.safeFit,
        dangerousFit: metrics.dangerousFit,
        asil: nextLineage.asil,
        safetyGoal: nextLineage.safetyGoal,
        path: currentPath.join(' > '),
      });
    }

    node.childIds
      .map((childId) => nodeMap[childId])
      .filter(Boolean)
      .forEach((child) => walk(child, level + 1, nextLineage, currentPath));
  };

  const baseLineage: HierarchyContext = {
    system: '',
    subsystem: '',
    component: '',
    functionName: '',
    asil: projectContext?.targetAsil || '',
    safetyGoal: projectContext?.safetyGoal || '',
  };

  rootNodes.forEach((rootNode) => walk(rootNode, 0, baseLineage, []));

  const dangerousFit = failureModeRows.reduce((sum, row) => sum + row.dangerousFit, 0);
  const detectedDangerousFit = failureModeRows.reduce(
    (sum, row) => sum + (row.classification === 'Dangerous' ? row.safeFit : 0),
    0
  );

  const summary: ExportSummary = {
    projectName: projectContext?.projectName || 'Untitled FMEDA Project',
    safetyStandard: projectContext?.safetyStandard || 'Not specified',
    targetAsil: projectContext?.targetAsil || 'Not specified',
    safetyGoal: projectContext?.safetyGoal || 'Not specified',
    exportedAt: new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date()),
    counts,
    totalFit: failureModeRows.reduce((sum, row) => sum + row.fitRate, 0),
    safeFit: failureModeRows.reduce((sum, row) => sum + row.safeFit, 0),
    dangerousFit,
    avgDc: dangerousFit > 0 ? detectedDangerousFit / dangerousFit : 1,
    dangerousFailureModes: failureModeRows.filter((row) => row.classification === 'Dangerous').length,
    topRiskItems: [...failureModeRows]
      .sort((left, right) => {
        if (right.dangerousFit !== left.dangerousFit) {
          return right.dangerousFit - left.dangerousFit;
        }
        return right.fitRate - left.fitRate;
      })
      .slice(0, 5),
  };

  return { hierarchyRows, failureModeRows, documentRows, summary };
};

const styleWorksheetHeader = (worksheet: import('exceljs').Worksheet, rowNumber: number, fillColor = '1D4ED8') => {
  const row = worksheet.getRow(rowNumber);
  row.height = 22;
  row.eachCell((cell: import('exceljs').Cell) => {
    cell.fill = solidFill(fillColor);
    cell.font = { bold: true, color: { argb: 'FFFFFF' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = thinBorder;
  });
};

const hideWorksheetColumns = (worksheet: import('exceljs').Worksheet, keys: string[]) => {
  keys.forEach((key) => {
    worksheet.getColumn(key).hidden = true;
  });
};

const getOverviewRiskSignal = (summary: ExportSummary) => {
  if (summary.dangerousFailureModes === 0) {
    return {
      label: 'Low residual risk',
      detail: 'No dangerous failure modes are currently flagged in this export.',
      fill: 'DCFCE7',
      font: '166534',
      accent: '22C55E',
    };
  }

  if (summary.avgDc >= 0.9 && summary.dangerousFit < 10) {
    return {
      label: 'Controlled risk',
      detail: 'Dangerous modes exist, but diagnostic coverage remains strong overall.',
      fill: 'FEF3C7',
      font: '92400E',
      accent: 'F59E0B',
    };
  }

  return {
    label: 'Needs review',
    detail: 'Dangerous exposure or weak diagnostic coverage should be reviewed first.',
    fill: 'FEE2E2',
    font: '991B1B',
    accent: 'EF4444',
  };
};

const addOverviewSheet = (workbook: import('exceljs').Workbook, summary: ExportSummary) => {
  const riskSignal = getOverviewRiskSignal(summary);
  const sheet = workbook.addWorksheet(OVERVIEW_SHEET_NAME, {
    views: [{ state: 'frozen', ySplit: 3 }],
  });

  sheet.columns = [
    { width: 16 },
    { width: 16 },
    { width: 16 },
    { width: 16 },
    { width: 16 },
    { width: 16 },
    { width: 16 },
    { width: 16 },
  ];

  sheet.mergeCells('A1:H2');
  sheet.getCell('A1').value = `${summary.projectName} FMEDA Dashboard`;
  sheet.getCell('A1').font = { size: 22, bold: true, color: { argb: 'FFFFFF' } };
  sheet.getCell('A1').fill = solidFill('1E3A8A');
  sheet.getCell('A1').alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
  sheet.getCell('A1').border = thinBorder;
  sheet.getRow(1).height = 26;
  sheet.getRow(2).height = 26;

  sheet.mergeCells('A3:E3');
  sheet.getCell('A3').value = `Generated by ${EXPORT_APP_NAME} on ${summary.exportedAt}`;
  sheet.getCell('A3').font = { italic: true, color: { argb: '475569' } };
  sheet.getCell('A3').alignment = { horizontal: 'left' };

  sheet.mergeCells('F3:H3');
  sheet.getCell('F3').value = riskSignal.label;
  sheet.getCell('F3').font = { bold: true, color: { argb: riskSignal.font } };
  sheet.getCell('F3').fill = solidFill(riskSignal.fill);
  sheet.getCell('F3').alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.getCell('F3').border = thinBorder;

  const heroMetrics = [
    { title: 'Failure Modes', value: String(summary.counts.FailureMode), note: `${summary.dangerousFailureModes} dangerous`, fill: 'EFF6FF', font: '1D4ED8' },
    { title: 'Total FIT', value: formatNumberLabel(summary.totalFit), note: `${formatNumberLabel(summary.dangerousFit)} dangerous FIT`, fill: 'ECFDF5', font: '047857' },
    { title: 'Average DC', value: formatPercentLabel(summary.avgDc), note: summary.avgDc >= 0.9 ? 'Strong diagnostic posture' : 'Coverage can improve', fill: 'FFFBEB', font: 'B45309' },
    { title: 'Components', value: String(summary.counts.Component), note: `${summary.counts.Function} functions analyzed`, fill: 'F5F3FF', font: '7C3AED' },
  ];

  heroMetrics.forEach((metric, index) => {
    const startColumn = 1 + index * 2;
    const endColumn = startColumn + 1;
    const startCell = `${String.fromCharCode(64 + startColumn)}5`;
    const endCell = `${String.fromCharCode(64 + endColumn)}7`;
    const titleCell = `${String.fromCharCode(64 + startColumn)}5`;
    const valueCell = `${String.fromCharCode(64 + startColumn)}6`;
    const noteCell = `${String.fromCharCode(64 + startColumn)}7`;

    sheet.mergeCells(`${startCell}:${endCell}`);
    sheet.getCell(titleCell).value = metric.title;
    sheet.getCell(titleCell).font = { size: 10, bold: true, color: { argb: '64748B' } };
    sheet.getCell(titleCell).fill = solidFill(metric.fill);
    sheet.getCell(titleCell).alignment = { vertical: 'top', horizontal: 'left' };
    sheet.getCell(titleCell).border = thinBorder;

    sheet.getCell(valueCell).value = metric.value;
    sheet.getCell(valueCell).font = { size: 18, bold: true, color: { argb: metric.font } };
    sheet.getCell(valueCell).fill = solidFill(metric.fill);
    sheet.getCell(valueCell).alignment = { vertical: 'middle', horizontal: 'left' };
    sheet.getCell(valueCell).border = thinBorder;

    sheet.getCell(noteCell).value = metric.note;
    sheet.getCell(noteCell).font = { size: 10, color: { argb: '475569' } };
    sheet.getCell(noteCell).fill = solidFill(metric.fill);
    sheet.getCell(noteCell).alignment = { vertical: 'bottom', horizontal: 'left', wrapText: true };
    sheet.getCell(noteCell).border = thinBorder;
  });

  const contextStartRow = 9;

  sheet.mergeCells(`A${contextStartRow}:D${contextStartRow}`);
  sheet.getCell(`A${contextStartRow}`).value = 'Project Context';
  sheet.getCell(`A${contextStartRow}`).font = { bold: true, color: { argb: 'FFFFFF' } };
  sheet.getCell(`A${contextStartRow}`).fill = solidFill('2563EB');
  sheet.getCell(`A${contextStartRow}`).alignment = { horizontal: 'center' };
  sheet.getCell(`A${contextStartRow}`).border = thinBorder;

  const projectRows = [
    ['Project Name', summary.projectName],
    ['Safety Standard', summary.safetyStandard],
    ['Target ASIL', summary.targetAsil],
    ['Safety Goal', summary.safetyGoal],
  ];

  projectRows.forEach((values, index) => {
    const rowNumber = contextStartRow + 1 + index;
    sheet.getCell(`A${rowNumber}`).value = values[0];
    sheet.mergeCells(`B${rowNumber}:D${rowNumber}`);
    sheet.getCell(`B${rowNumber}`).value = values[1];
    sheet.getCell(`A${rowNumber}`).font = { bold: true, color: { argb: '334155' } };
    sheet.getCell(`A${rowNumber}`).fill = solidFill('EFF6FF');
    sheet.getCell(`A${rowNumber}`).border = thinBorder;
    sheet.getCell(`B${rowNumber}`).fill = solidFill('F8FAFC');
    sheet.getCell(`B${rowNumber}`).border = thinBorder;
    sheet.getCell(`B${rowNumber}`).alignment = { wrapText: true, vertical: 'top' };
  });

  sheet.mergeCells(`F${contextStartRow}:H${contextStartRow}`);
  sheet.getCell(`F${contextStartRow}`).value = 'Risk Posture';
  sheet.getCell(`F${contextStartRow}`).font = { bold: true, color: { argb: 'FFFFFF' } };
  sheet.getCell(`F${contextStartRow}`).fill = solidFill('0F766E');
  sheet.getCell(`F${contextStartRow}`).alignment = { horizontal: 'center' };
  sheet.getCell(`F${contextStartRow}`).border = thinBorder;

  const metricRows: Array<[string, string]> = [
    ['Systems', String(summary.counts.System)],
    ['Subsystems', String(summary.counts.Subsystem)],
    ['Components', String(summary.counts.Component)],
    ['Functions', String(summary.counts.Function)],
  ];

  metricRows.forEach((values, index) => {
    const rowNumber = contextStartRow + 1 + index;
    sheet.getCell(`F${rowNumber}`).value = values[0];
    sheet.getCell(`G${rowNumber}`).value = values[1];
    sheet.getCell(`F${rowNumber}`).font = { bold: true, color: { argb: '134E4A' } };
    sheet.getCell(`F${rowNumber}`).fill = solidFill('CCFBF1');
    sheet.getCell(`F${rowNumber}`).border = thinBorder;
    sheet.getCell(`G${rowNumber}`).fill = solidFill('F0FDFA');
    sheet.getCell(`G${rowNumber}`).font = { bold: true };
    sheet.getCell(`G${rowNumber}`).border = thinBorder;
    sheet.getCell(`G${rowNumber}`).alignment = { horizontal: 'center' };
  });

  const miniMetrics = [
    { cell: `H${contextStartRow + 1}`, value: formatNumberLabel(summary.dangerousFit), title: 'Dangerous FIT', fill: 'FEF2F2', font: 'B91C1C' },
    { cell: `H${contextStartRow + 2}`, value: String(summary.dangerousFailureModes), title: 'Dangerous Modes', fill: 'FEF2F2', font: 'B91C1C' },
    { cell: `H${contextStartRow + 3}`, value: formatPercentLabel(summary.avgDc), title: 'Average DC', fill: 'FFFBEB', font: '92400E' },
    { cell: `H${contextStartRow + 4}`, value: formatNumberLabel(summary.totalFit), title: 'Total FIT', fill: 'EFF6FF', font: '1D4ED8' },
  ];

  miniMetrics.forEach((metric) => {
    sheet.getCell(metric.cell).value = `${metric.title}\n${metric.value}`;
    sheet.getCell(metric.cell).font = { bold: true, color: { argb: metric.font } };
    sheet.getCell(metric.cell).fill = solidFill(metric.fill);
    sheet.getCell(metric.cell).alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    sheet.getCell(metric.cell).border = thinBorder;
  });

  sheet.mergeCells(`F${contextStartRow + 5}:H${contextStartRow + 6}`);
  sheet.getCell(`F${contextStartRow + 5}`).value = `${riskSignal.label}\n${riskSignal.detail}`;
  sheet.getCell(`F${contextStartRow + 5}`).font = { bold: true, color: { argb: riskSignal.font } };
  sheet.getCell(`F${contextStartRow + 5}`).fill = solidFill(riskSignal.fill);
  sheet.getCell(`F${contextStartRow + 5}`).alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
  sheet.getCell(`F${contextStartRow + 5}`).border = thinBorder;

  const reviewStartRow = contextStartRow + 9;

  sheet.mergeCells(`A${reviewStartRow}:H${reviewStartRow}`);
  sheet.getCell(`A${reviewStartRow}`).value = 'Priority Review Items';
  sheet.getCell(`A${reviewStartRow}`).font = { bold: true, color: { argb: 'FFFFFF' } };
  sheet.getCell(`A${reviewStartRow}`).fill = solidFill('7C3AED');
  sheet.getCell(`A${reviewStartRow}`).alignment = { horizontal: 'center' };
  sheet.getCell(`A${reviewStartRow}`).border = thinBorder;

  const headerRow = sheet.addRow([
    'System',
    'Component / Function',
    'Failure Mode',
    'Classification',
    'DC %',
    'FIT',
    'Safety Goal',
    'Path',
  ]);
  styleWorksheetHeader(sheet, headerRow.number, '7C3AED');

  if (summary.topRiskItems.length === 0) {
    const emptyRow = sheet.addRow(['No failure modes to prioritize yet.', '', '', '', '', '', '', '']);
    emptyRow.getCell(1).font = { italic: true, color: { argb: '64748B' } };
  } else {
    summary.topRiskItems.forEach((item) => {
      const row = sheet.addRow([
        item.system || 'Unassigned',
        [item.component, item.functionName].filter(Boolean).join(' / '),
        item.failureMode,
        item.classification,
        item.diagnosticCoverage,
        item.fitRate,
        item.safetyGoal,
        item.path,
      ]);

      row.eachCell((cell: import('exceljs').Cell) => {
        cell.border = thinBorder;
        cell.alignment = { vertical: 'top', wrapText: true };
      });

      row.getCell(4).fill = solidFill(CLASSIFICATION_COLORS[item.classification].fill);
      row.getCell(4).font = { bold: true, color: { argb: CLASSIFICATION_COLORS[item.classification].font } };
      row.getCell(5).numFmt = '0.0%';
      row.getCell(6).numFmt = '0.00';
    });
  }

  sheet.getRow(10).height = 24;

  const guidanceStartRow = headerRow.number + Math.max(summary.topRiskItems.length, 1) + 3;
  sheet.mergeCells(`A${guidanceStartRow}:H${guidanceStartRow}`);
  sheet.getCell(`A${guidanceStartRow}`).value = 'Workbook Editing Guide';
  sheet.getCell(`A${guidanceStartRow}`).font = { bold: true, color: { argb: 'FFFFFF' } };
  sheet.getCell(`A${guidanceStartRow}`).fill = solidFill('0F766E');
  sheet.getCell(`A${guidanceStartRow}`).alignment = { horizontal: 'center' };
  sheet.getCell(`A${guidanceStartRow}`).border = thinBorder;

  const guidanceRows = [
    ['Use "Failure Modes" for fast leaf editing, sorting, and filtering of FIT/DC/classification values.'],
    ['Use "Hierarchy" to rename nodes, add/remove structure, or preserve empty branches with no failure modes yet.'],
    ['Use "Project Documents" to keep notes and extracted source text that should survive Excel re-import.'],
  ];
  guidanceRows.forEach((values, index) => {
    const rowNumber = guidanceStartRow + 1 + index;
    sheet.mergeCells(`A${rowNumber}:H${rowNumber}`);
    sheet.getCell(`A${rowNumber}`).value = values[0];
    sheet.getCell(`A${rowNumber}`).alignment = { wrapText: true, vertical: 'top' };
    sheet.getCell(`A${rowNumber}`).border = thinBorder;
    sheet.getCell(`A${rowNumber}`).fill = solidFill(index % 2 === 0 ? 'F8FAFC' : 'FFFFFF');
  });
};

const addProjectDocumentsSheet = (
  workbook: import('exceljs').Workbook,
  documents: ProjectDocumentExportRow[]
) => {
  const sheet = workbook.addWorksheet(DOCUMENTS_SHEET_NAME, {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  sheet.columns = [
    { header: 'Document ID', key: 'documentId', width: 18 },
    { header: 'Kind', key: 'kind', width: 12 },
    { header: 'Name', key: 'name', width: 28 },
    { header: 'Uploaded At', key: 'uploadedAt', width: 22 },
    { header: 'Extracted Text', key: 'extractedText', width: 90 },
  ];

  styleWorksheetHeader(sheet, 1, '7C3AED');
  sheet.autoFilter = 'A1:E1';

  documents.forEach((document, index) => {
    const row = sheet.addRow(document);
    row.eachCell((cell: import('exceljs').Cell) => {
      cell.border = thinBorder;
      cell.alignment = { vertical: 'top', wrapText: true };
      cell.fill = solidFill(index % 2 === 0 ? 'FAF5FF' : 'FFFFFF');
    });
  });

  hideWorksheetColumns(sheet, ['documentId']);
};

const addMetadataSheet = (workbook: import('exceljs').Workbook) => {
  const sheet = workbook.addWorksheet(METADATA_SHEET_NAME);
  sheet.state = 'veryHidden';
  sheet.columns = [
    { header: 'Key', key: 'key', width: 24 },
    { header: 'Value', key: 'value', width: 40 },
  ];
  sheet.addRows([
    { key: 'app', value: EXPORT_APP_NAME },
    { key: 'workbookVersion', value: EXCEL_WORKBOOK_VERSION },
    { key: 'hierarchySheet', value: HIERARCHY_SHEET_NAME },
    { key: 'failureModesSheet', value: FAILURE_MODES_SHEET_NAME },
    { key: 'documentsSheet', value: DOCUMENTS_SHEET_NAME },
  ]);
};

const addHierarchySheet = (workbook: import('exceljs').Workbook, rows: HierarchyExportRow[]) => {
  const sheet = workbook.addWorksheet(HIERARCHY_SHEET_NAME, {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  sheet.columns = [
    { header: 'Node ID', key: 'nodeId', width: 18 },
    { header: 'Parent Node ID', key: 'parentNodeId', width: 18 },
    { header: 'Level', key: 'level', width: 8 },
    { header: 'Node Type', key: 'nodeType', width: 14 },
    { header: 'Name', key: 'nodeName', width: 30 },
    { header: 'Path', key: 'path', width: 48 },
    { header: 'System', key: 'system', width: 20 },
    { header: 'Subsystem', key: 'subsystem', width: 20 },
    { header: 'Component', key: 'component', width: 22 },
    { header: 'Function', key: 'functionName', width: 22 },
    { header: 'Failure Mode', key: 'failureMode', width: 24 },
    { header: 'Local Effect', key: 'localEffect', width: 28 },
    { header: 'Safety Mechanism', key: 'safetyMechanism', width: 30 },
    { header: 'Classification', key: 'classification', width: 14 },
    { header: 'ASIL', key: 'asil', width: 12 },
    { header: 'Safety Goal', key: 'safetyGoal', width: 26 },
    { header: 'DC %', key: 'diagnosticCoverage', width: 12 },
    { header: 'FIT', key: 'fitValue', width: 12 },
    { header: 'Safe FIT', key: 'safeFit', width: 12 },
    { header: 'Dangerous FIT', key: 'dangerousFit', width: 14 },
    { header: 'Children', key: 'childCount', width: 10 },
  ];

  styleWorksheetHeader(sheet, 1, '1D4ED8');
  sheet.autoFilter = 'A1:U1';

  rows.forEach((rowData) => {
    const row = sheet.addRow(rowData);
    const palette = TYPE_COLORS[rowData.nodeType];

    row.outlineLevel = Math.min(rowData.level, 7);
    row.eachCell((cell: import('exceljs').Cell) => {
      cell.fill = solidFill(palette.fill);
      cell.border = thinBorder;
      cell.alignment = { vertical: 'top', wrapText: true };
    });

    row.getCell('nodeName').font = {
      bold: rowData.nodeType !== 'FailureMode',
      color: { argb: palette.font },
    };
    row.getCell('nodeName').alignment = {
      vertical: 'top',
      wrapText: true,
      indent: Math.min(rowData.level * 2, 12),
    };
    row.getCell('nodeType').value = TYPE_LABELS[rowData.nodeType];
    row.getCell('diagnosticCoverage').numFmt = '0.0%';
    row.getCell('fitValue').numFmt = '0.00';
    row.getCell('safeFit').numFmt = '0.00';
    row.getCell('dangerousFit').numFmt = '0.00';

    if (rowData.classification === 'Safe' || rowData.classification === 'Dangerous') {
      row.getCell('classification').fill = solidFill(CLASSIFICATION_COLORS[rowData.classification].fill);
      row.getCell('classification').font = {
        bold: true,
        color: { argb: CLASSIFICATION_COLORS[rowData.classification].font },
      };
    }
  });

  hideWorksheetColumns(sheet, ['nodeId', 'parentNodeId']);
};

const addFailureModesSheet = (workbook: import('exceljs').Workbook, rows: FailureModeExportRow[]) => {
  const sheet = workbook.addWorksheet(FAILURE_MODES_SHEET_NAME, {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  sheet.columns = [
    { header: 'Failure Mode ID', key: 'nodeId', width: 18 },
    { header: 'Parent Function ID', key: 'parentNodeId', width: 18 },
    { header: 'System ID', key: 'systemId', width: 18 },
    { header: 'Subsystem ID', key: 'subsystemId', width: 18 },
    { header: 'Component ID', key: 'componentId', width: 18 },
    { header: 'Function ID', key: 'functionId', width: 18 },
    { header: 'System', key: 'system', width: 18 },
    { header: 'Subsystem', key: 'subsystem', width: 18 },
    { header: 'Component', key: 'component', width: 20 },
    { header: 'Function', key: 'functionName', width: 22 },
    { header: 'Failure Mode', key: 'failureMode', width: 24 },
    { header: 'Local Effect', key: 'localEffect', width: 28 },
    { header: 'Safety Mechanism', key: 'safetyMechanism', width: 28 },
    { header: 'Classification', key: 'classification', width: 14 },
    { header: 'Diagnostic Coverage', key: 'diagnosticCoverage', width: 16 },
    { header: 'FIT Rate', key: 'fitRate', width: 12 },
    { header: 'Safe FIT', key: 'safeFit', width: 12 },
    { header: 'Dangerous FIT', key: 'dangerousFit', width: 14 },
    { header: 'ASIL', key: 'asil', width: 12 },
    { header: 'Safety Goal', key: 'safetyGoal', width: 26 },
    { header: 'Path', key: 'path', width: 48 },
  ];

  styleWorksheetHeader(sheet, 1, '0F766E');
  sheet.autoFilter = 'A1:U1';

  rows.forEach((rowData) => {
    const row = sheet.addRow(rowData);
    row.eachCell((cell: import('exceljs').Cell) => {
      cell.border = thinBorder;
      cell.alignment = { vertical: 'top', wrapText: true };
    });

    row.getCell('classification').fill = solidFill(CLASSIFICATION_COLORS[rowData.classification].fill);
    row.getCell('classification').font = {
      bold: true,
      color: { argb: CLASSIFICATION_COLORS[rowData.classification].font },
    };
    row.getCell('diagnosticCoverage').numFmt = '0.0%';
    row.getCell('fitRate').numFmt = '0.00';
    row.getCell('safeFit').numFmt = '0.00';
    row.getCell('dangerousFit').numFmt = '0.00';
  });

  hideWorksheetColumns(sheet, ['nodeId', 'parentNodeId', 'systemId', 'subsystemId', 'componentId', 'functionId']);
};

/**
 * Exports the flat FMEDA data and project context to a JSON file.
 * Uses the File System Access API for a native "Save As" experience when available.
 */
export const exportToJson = async (nodes: FmedaNode[], projectContext: ProjectContext | null): Promise<ExportResult> => {
  const exportData = {
    nodes,
    projectContext: projectContext || {},
  };

  const dataStr = JSON.stringify(exportData, null, 2);
  const exportFileDefaultName = getExportFileName(projectContext?.projectName, 'json');

  return saveBlob(
    new Blob([dataStr], { type: JSON_MIME }),
    exportFileDefaultName,
    'JSON File',
    { [JSON_MIME]: ['.json'] }
  );
};

export const exportToCsv = async (nodes: FmedaNode[], projectContext: ProjectContext | null): Promise<ExportResult> => {
  const { failureModeRows } = buildExportDataset(nodes, projectContext);
  const exportFileDefaultName = getExportFileName(projectContext?.projectName, 'csv');

  const header = [
    'System',
    'Subsystem',
    'Component',
    'Function',
    'Failure Mode',
    'Local Effect',
    'Safety Mechanism',
    'Classification',
    'Diagnostic Coverage %',
    'FIT Rate',
    'Safe FIT',
    'Dangerous FIT',
    'ASIL',
    'Safety Goal',
    'Path',
  ];

  const csvBody = failureModeRows.map((row) => [
    row.system,
    row.subsystem,
    row.component,
    row.functionName,
    row.failureMode,
    row.localEffect,
    row.safetyMechanism,
    row.classification,
    formatNumberLabel(row.diagnosticCoverage * 100, 1),
    formatNumberLabel(row.fitRate),
    formatNumberLabel(row.safeFit),
    formatNumberLabel(row.dangerousFit),
    row.asil,
    row.safetyGoal,
    row.path,
  ]);

  const csvString = [header, ...csvBody]
    .map((row) => row.map((value) => escapeCsv(value)).join(','))
    .join('\r\n');

  return saveBlob(
    new Blob(['\uFEFF', csvString], { type: CSV_MIME }),
    exportFileDefaultName,
    'CSV File',
    { 'text/csv': ['.csv'] }
  );
};

export const exportToExcel = async (nodes: FmedaNode[], projectContext: ProjectContext | null): Promise<ExportResult> => {
  const { hierarchyRows, failureModeRows, documentRows, summary } = buildExportDataset(nodes, projectContext);
  const exportFileDefaultName = getExportFileName(projectContext?.projectName, 'xlsx');
  const ExcelJS = await import('exceljs');
  const workbook = new ExcelJS.Workbook();

  workbook.creator = EXPORT_APP_NAME;
  workbook.lastModifiedBy = EXPORT_APP_NAME;
  workbook.created = new Date();
  workbook.modified = new Date();
  workbook.subject = 'FMEDA analysis export';
  workbook.title = `${summary.projectName} FMEDA Export`;
  workbook.company = EXPORT_APP_NAME;

  addOverviewSheet(workbook, summary);
  addProjectDocumentsSheet(workbook, documentRows);
  addHierarchySheet(workbook, hierarchyRows);
  addFailureModesSheet(workbook, failureModeRows);
  addMetadataSheet(workbook);

  const buffer = await workbook.xlsx.writeBuffer();

  return saveBlob(
    new Blob([buffer], { type: XLSX_MIME }),
    exportFileDefaultName,
    'Excel Workbook',
    { [XLSX_MIME]: ['.xlsx'] }
  );
};

/**
 * Validates if an object matches the FmedaNode structure.
 */
const isFmedaNode = (value: unknown): value is FmedaNode => {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.id === 'string' &&
    typeof obj.name === 'string' &&
    typeof obj.type === 'string' &&
    (obj.parentId === null || typeof obj.parentId === 'string') &&
    Array.isArray(obj.childIds)
  );
};

export interface ImportResult {
  nodes: Record<string, FmedaNode>;
  projectContext: ProjectContext | null;
}

type SupportedImportFormat = 'json' | 'csv' | 'xlsx';

interface FailureModeImportRow {
  nodeId?: string;
  parentNodeId?: string;
  systemId?: string;
  subsystemId?: string;
  componentId?: string;
  functionId?: string;
  system: string;
  subsystem: string;
  component: string;
  functionName: string;
  failureMode: string;
  localEffect: string;
  safetyMechanism: string;
  classification: 'Safe' | 'Dangerous';
  diagnosticCoverage: number;
  fitRate: number;
  asil: string;
  safetyGoal: string;
  path: string;
}

interface HierarchyImportRow {
  rowNumber: number;
  nodeId?: string;
  parentNodeId?: string;
  level: number;
  nodeType: FmedaNodeType;
  name: string;
  system: string;
  subsystem: string;
  component: string;
  functionName: string;
  failureMode: string;
  localEffect: string;
  safetyMechanism: string;
  classification: 'Safe' | 'Dangerous';
  diagnosticCoverage: number;
  fitRate: number;
  asil: string;
  safetyGoal: string;
}

interface WorksheetRecord {
  [header: string]: string | number | boolean | null;
}

const SUPPORTED_IMPORT_EXTENSIONS = ['json', 'csv', 'xlsx'] as const;

const getFileExtension = (fileName: string): string => {
  const parts = fileName.toLowerCase().split('.');
  return parts.length > 1 ? parts.pop() || '' : '';
};

const inferImportFormat = (file: File): SupportedImportFormat | null => {
  const extension = getFileExtension(file.name);

  if (extension === 'json' || extension === 'csv' || extension === 'xlsx') {
    return extension;
  }

  if (file.type === JSON_MIME) return 'json';
  if (file.type === XLSX_MIME) return 'xlsx';
  if (file.type.includes('csv')) return 'csv';

  return null;
};

const normalizeHeader = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/\uFEFF/g, '')
    .replace(/[%/]/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const normalizeText = (value: unknown): string => {
  if (value == null) return '';

  if (typeof value === 'string') {
    return value.replace(/\uFEFF/g, '').trim();
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value).trim();
  }

  if (typeof value === 'object' && value && 'text' in value && typeof (value as { text?: unknown }).text === 'string') {
    return ((value as { text: string }).text || '').trim();
  }

  return String(value).trim();
};

const normalizeProjectContextValue = (value: string): string | undefined => {
  const trimmed = value.trim();
  if (!trimmed || trimmed.toLowerCase() === 'not specified') {
    return undefined;
  }
  return trimmed;
};

const parseNumericCell = (value: unknown, { allowPercent = false }: { allowPercent?: boolean } = {}): number => {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return 0;
    if (allowPercent && value > 1) return value / 100;
    return value;
  }

  const text = normalizeText(value);
  if (!text) return 0;

  const hasPercent = text.includes('%');
  const normalized = Number.parseFloat(text.replace(/[^0-9.+-]/g, ''));
  if (!Number.isFinite(normalized)) return 0;

  if (allowPercent && (hasPercent || normalized > 1)) {
    return normalized / 100;
  }

  return normalized;
};

const normalizeClassification = (value: unknown): 'Safe' | 'Dangerous' => {
  const text = normalizeText(value).toLowerCase();
  return text === 'dangerous' ? 'Dangerous' : 'Safe';
};

const normalizeNodeAsil = (value: unknown): FmedaNode['asil'] => {
  const text = normalizeText(value).toUpperCase();

  switch (text) {
    case 'QM':
      return 'QM';
    case 'ASIL A':
      return 'ASIL A';
    case 'ASIL B':
      return 'ASIL B';
    case 'ASIL C':
      return 'ASIL C';
    case 'ASIL D':
      return 'ASIL D';
    default:
      return 'QM';
  }
};

const readJsonFile = async (file: File): Promise<ImportResult> => {
  let json: unknown;

  try {
    json = JSON.parse(await file.text());
  } catch {
    throw new Error('Failed to parse JSON file. Please choose a valid FMEDA export.');
  }

  let projectContext: ProjectContext | null = null;
  let nodesData = json;

  if (!Array.isArray(json) && typeof json === 'object' && json !== null && 'nodes' in json) {
    const exportPayload = json as { nodes: unknown; projectContext?: ProjectContext | null };
    nodesData = exportPayload.nodes;
    projectContext = normalizeProjectContext(exportPayload.projectContext);
  }

  if (!Array.isArray(nodesData)) {
    if (typeof nodesData === 'object' && nodesData !== null) {
      const values = Object.values(nodesData);
      if (values.length === 0 || values.every(isFmedaNode)) {
        return { nodes: nodesData as Record<string, FmedaNode>, projectContext };
      }
    }

    throw new Error('Invalid JSON import format. Expected an FMEDA node array or nodes record.');
  }

  if (nodesData.length === 0) {
    return { nodes: {}, projectContext };
  }

  if (nodesData.every(isFmedaNode)) {
    const nodesRecord: Record<string, FmedaNode> = {};
    nodesData.forEach((node: FmedaNode) => {
      nodesRecord[node.id] = node;
    });
    return { nodes: nodesRecord, projectContext };
  }

  if (isLegacyFormat(nodesData)) {
    return { nodes: migrateLegacyToFlat(nodesData), projectContext };
  }

  throw new Error('Invalid FMEDA JSON data. The file does not match the supported flat or legacy project structure.');
};

const parseCsvText = (text: string): string[][] => {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentValue = '';
  let insideQuotes = false;

  const normalizedText = text.replace(/^\uFEFF/, '');

  for (let index = 0; index < normalizedText.length; index += 1) {
    const char = normalizedText[index];
    const nextChar = normalizedText[index + 1];

    if (insideQuotes) {
      if (char === '"' && nextChar === '"') {
        currentValue += '"';
        index += 1;
      } else if (char === '"') {
        insideQuotes = false;
      } else {
        currentValue += char;
      }
      continue;
    }

    if (char === '"') {
      insideQuotes = true;
      continue;
    }

    if (char === ',') {
      currentRow.push(currentValue);
      currentValue = '';
      continue;
    }

    if (char === '\n') {
      currentRow.push(currentValue);
      rows.push(currentRow);
      currentRow = [];
      currentValue = '';
      continue;
    }

    if (char === '\r') {
      continue;
    }

    currentValue += char;
  }

  if (currentValue.length > 0 || currentRow.length > 0) {
    currentRow.push(currentValue);
    rows.push(currentRow);
  }

  return rows;
};

const getColumnValue = (row: string[], headerIndexes: Record<string, number>, aliases: string[]): string => {
  for (const alias of aliases) {
    const index = headerIndexes[normalizeHeader(alias)];
    if (index != null && index < row.length) {
      return normalizeText(row[index]);
    }
  }
  return '';
};

const getRecordValue = (record: WorksheetRecord, aliases: string[]): unknown => {
  const entries = Object.entries(record);
  for (const alias of aliases) {
    const normalizedAlias = normalizeHeader(alias);
    const match = entries.find(([key]) => normalizeHeader(key) === normalizedAlias);
    if (match) {
      return match[1];
    }
  }
  return '';
};

const normalizeOptionalId = (value: unknown): string | undefined => {
  const text = normalizeText(value);
  return text || undefined;
};

const parseFailureModeRowsFromCsv = (text: string): FailureModeImportRow[] => {
  const rows = parseCsvText(text).filter((row) => row.some((cell) => normalizeText(cell) !== ''));

  if (rows.length === 0) {
    throw new Error('The CSV file is empty.');
  }

  const [headerRow, ...dataRows] = rows;
  const headerIndexes = Object.fromEntries(headerRow.map((header, index) => [normalizeHeader(header), index]));
  const requiredColumns = ['Failure Mode', 'Classification', 'FIT Rate'];
  const missingColumns = requiredColumns.filter((column) => headerIndexes[normalizeHeader(column)] == null);

  if (missingColumns.length > 0) {
    throw new Error(`This CSV file is not a supported FMEDA export. Missing required columns: ${missingColumns.join(', ')}.`);
  }

  if (dataRows.length === 0) {
    throw new Error('This CSV export contains no failure mode rows to import.');
  }

  return dataRows.map((row) => ({
    system: getColumnValue(row, headerIndexes, ['System']),
    subsystem: getColumnValue(row, headerIndexes, ['Subsystem']),
    component: getColumnValue(row, headerIndexes, ['Component']),
    functionName: getColumnValue(row, headerIndexes, ['Function']),
    failureMode: getColumnValue(row, headerIndexes, ['Failure Mode']),
    localEffect: getColumnValue(row, headerIndexes, ['Local Effect']),
    safetyMechanism: getColumnValue(row, headerIndexes, ['Safety Mechanism']),
    classification: normalizeClassification(getColumnValue(row, headerIndexes, ['Classification'])),
    diagnosticCoverage: parseNumericCell(
      getColumnValue(row, headerIndexes, ['Diagnostic Coverage %', 'Diagnostic Coverage']),
      { allowPercent: true }
    ),
    fitRate: parseNumericCell(getColumnValue(row, headerIndexes, ['FIT Rate', 'FIT'])),
    asil: getColumnValue(row, headerIndexes, ['ASIL']),
    safetyGoal: getColumnValue(row, headerIndexes, ['Safety Goal']),
    path: getColumnValue(row, headerIndexes, ['Path']),
  })).filter((row) => row.failureMode);
};

const deriveProjectNameFromFileName = (fileName: string): string | undefined => {
  const baseName = fileName.replace(/\.[^.]+$/, '');
  const cleaned = baseName
    .replace(/^fmeda-/, '')
    .replace(/-\d{4}-\d{2}-\d{2}$/i, '')
    .replace(/[-_]+/g, ' ')
    .trim();

  if (!cleaned) return undefined;

  return cleaned.replace(/\b\w/g, (match) => match.toUpperCase());
};

const createNodeKey = (type: FmedaNodeType, parentId: string | null, name: string) =>
  `${parentId ?? 'root'}|${type}|${name.trim().toLowerCase()}`;

const appendChildId = (nodes: Record<string, FmedaNode>, parentId: string | null, childId: string) => {
  if (!parentId || !nodes[parentId]) return;
  if (!nodes[parentId].childIds.includes(childId)) {
    nodes[parentId] = {
      ...nodes[parentId],
      childIds: [...nodes[parentId].childIds, childId],
    };
  }
};

const removeChildId = (nodes: Record<string, FmedaNode>, parentId: string | null, childId: string) => {
  if (!parentId || !nodes[parentId]) return;
  if (nodes[parentId].childIds.includes(childId)) {
    nodes[parentId] = {
      ...nodes[parentId],
      childIds: nodes[parentId].childIds.filter((currentChildId) => currentChildId !== childId),
    };
  }
};

const finalizeImportedNodes = (nodes: Record<string, FmedaNode>): Record<string, FmedaNode> => {
  Object.values(nodes).forEach((node) => {
    nodes[node.id] = {
      ...node,
      childIds: Array.from(new Set(node.childIds)).filter((childId) => nodes[childId]?.parentId === node.id),
    };
  });

  return nodes;
};

const buildNodesFromFailureModeRows = (
  rows: FailureModeImportRow[],
  existingNodes: Record<string, FmedaNode> = {}
): Record<string, FmedaNode> => {
  if (rows.length === 0) {
    throw new Error('No importable failure mode rows were found in the file.');
  }

  const nodes: Record<string, FmedaNode> = Object.fromEntries(
    Object.values(existingNodes).map((node) => [
      node.id,
      {
        ...node,
        childIds: [...node.childIds],
      },
    ])
  );
  const preserveSeedHierarchy = Object.keys(existingNodes).length > 0;
  const usedIds = new Set(Object.keys(nodes));
  const nodeKeys = new Map<string, string>();
  const seenFailureModeRowIds = new Set<string>();

  Object.values(nodes).forEach((node) => {
    nodeKeys.set(createNodeKey(node.type, node.parentId, node.name), node.id);
  });

  const ensureNode = (
    type: Exclude<FmedaNodeType, 'FailureMode'>,
    name: string,
    parentId: string | null,
    metadata?: Partial<FmedaNode>,
    preferredId?: string
  ) => {
    const trimmedName = name.trim();
    if (!trimmedName) return null;

    if (preserveSeedHierarchy && preferredId && existingNodes[preferredId]) {
      return preferredId;
    }

    const key = createNodeKey(type, parentId, trimmedName);
    const existingId = nodeKeys.get(key);
    let id = existingId;

    if (!id && preferredId && nodes[preferredId]) {
      id = preferredId;
    }

    if (!id) {
      id = preferredId && !usedIds.has(preferredId) ? preferredId : generateId();
      usedIds.add(id);
    }

    const previousNode = nodes[id];
    if (previousNode) {
      nodeKeys.delete(createNodeKey(previousNode.type, previousNode.parentId, previousNode.name));
      if (previousNode.parentId !== parentId) {
        removeChildId(nodes, previousNode.parentId, id);
      }
    }

    nodes[id] = {
      ...previousNode,
      id,
      name: trimmedName,
      type,
      parentId,
      childIds: previousNode?.childIds ?? [],
      ...(type === 'System' || type === 'Subsystem' || type === 'Component'
        ? {
            asil: metadata?.asil || previousNode?.asil || 'QM',
            safetyGoal: metadata?.safetyGoal || previousNode?.safetyGoal || '',
          }
        : {}),
    };

    if (parentId) {
      appendChildId(nodes, parentId, id);
    }

    nodeKeys.set(key, id);
    return id;
  };

  rows.forEach((row, index) => {
    let parentId: string | null = null;
    const hierarchy = [
      { type: 'System' as const, name: row.system, preferredId: row.systemId },
      { type: 'Subsystem' as const, name: row.subsystem, preferredId: row.subsystemId },
      { type: 'Component' as const, name: row.component, preferredId: row.componentId },
      { type: 'Function' as const, name: row.functionName || 'Imported Function', preferredId: row.functionId },
    ];

    hierarchy.forEach(({ type, name, preferredId }) => {
      if (!name && type !== 'Function') return;

      const assignContextToThisNode =
        type === 'Component'
        || (type === 'Subsystem' && !row.component)
        || (type === 'System' && !row.component && !row.subsystem);

      const nextParentId = ensureNode(type, name, parentId, assignContextToThisNode
        ? {
            asil: normalizeNodeAsil(row.asil),
            safetyGoal: row.safetyGoal || '',
          }
        : undefined, preferredId);

      if (nextParentId) {
        parentId = nextParentId;
      }
    });

    if (!parentId) {
      throw new Error(`Row ${index + 2} is missing the hierarchy required to attach failure mode "${row.failureMode}".`);
    }

    const trimmedFailureModeName = row.failureMode.trim();
    if (!trimmedFailureModeName) {
      throw new Error(`Row ${index + 2} is missing a failure mode name.`);
    }

    const failureModeKey = createNodeKey('FailureMode', parentId, trimmedFailureModeName);
    const preferredFailureModeId =
      row.nodeId && !seenFailureModeRowIds.has(row.nodeId) ? row.nodeId : undefined;
    if (row.nodeId) {
      seenFailureModeRowIds.add(row.nodeId);
    }

    let failureModeId = preferredFailureModeId && nodes[preferredFailureModeId]
      ? preferredFailureModeId
      : nodeKeys.get(failureModeKey);
    if (!failureModeId) {
      failureModeId = preferredFailureModeId && !usedIds.has(preferredFailureModeId)
        ? preferredFailureModeId
        : generateId();
      usedIds.add(failureModeId);
    }

    const previousFailureMode = nodes[failureModeId];
    if (previousFailureMode) {
      nodeKeys.delete(createNodeKey(previousFailureMode.type, previousFailureMode.parentId, previousFailureMode.name));
      if (previousFailureMode.parentId !== parentId) {
        removeChildId(nodes, previousFailureMode.parentId, failureModeId);
      }
    }

    nodes[failureModeId] = {
      ...previousFailureMode,
      id: failureModeId,
      name: row.failureMode,
      type: 'FailureMode',
      parentId,
      childIds: [],
      localEffect: row.localEffect,
      safetyMechanism: row.safetyMechanism,
      diagnosticCoverage: row.diagnosticCoverage,
      fitRate: row.fitRate,
      classification: row.classification,
    };
    appendChildId(nodes, parentId, failureModeId);
    nodeKeys.set(failureModeKey, failureModeId);
  });

  return finalizeImportedNodes(nodes);
};

const getWorksheetRecords = (worksheet: import('exceljs').Worksheet): WorksheetRecord[] => {
  const headerRow = worksheet.getRow(1);
  const headers: string[] = [];

  headerRow.eachCell({ includeEmpty: true }, (cell: import('exceljs').Cell, columnNumber: number) => {
    headers[columnNumber - 1] = normalizeText(cell.value);
  });

  const records: WorksheetRecord[] = [];
  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const record: WorksheetRecord = {};
    let hasValues = false;

    headers.forEach((header, index) => {
      if (!header) return;
      const cellValue = row.getCell(index + 1).value;
      if (normalizeText(cellValue) !== '') {
        hasValues = true;
      }
      record[header] = typeof cellValue === 'number' || typeof cellValue === 'boolean'
        ? cellValue
        : normalizeText(cellValue);
    });

    if (hasValues) {
      records.push(record);
    }
  }

  return records;
};

const parseNodeTypeLabel = (value: unknown): FmedaNodeType | null => {
  const normalized = normalizeText(value).toLowerCase();
  switch (normalized) {
    case 'system':
      return 'System';
    case 'subsystem':
      return 'Subsystem';
    case 'component':
      return 'Component';
    case 'function':
      return 'Function';
    case 'failure mode':
      return 'FailureMode';
    default:
      return null;
  }
};

const parseHierarchyRows = (worksheet: import('exceljs').Worksheet): HierarchyImportRow[] => {
  const rows = getWorksheetRecords(worksheet);
  if (rows.length === 0) {
    throw new Error('The Excel hierarchy sheet is empty.');
  }

  return rows.map((row, index) => {
    const nodeType = parseNodeTypeLabel(getRecordValue(row, ['Node Type']));
    const name = normalizeText(getRecordValue(row, ['Name', 'Failure Mode']));
    if (!nodeType || !name) {
      throw new Error(`The Hierarchy sheet contains an invalid row at line ${index + 2}.`);
    }

    return {
      rowNumber: index + 2,
      nodeId: normalizeOptionalId(getRecordValue(row, ['Node ID'])),
      parentNodeId: normalizeOptionalId(getRecordValue(row, ['Parent Node ID'])),
      level: parseNumericCell(getRecordValue(row, ['Level'])),
      nodeType,
      name,
      system: normalizeText(getRecordValue(row, ['System'])),
      subsystem: normalizeText(getRecordValue(row, ['Subsystem'])),
      component: normalizeText(getRecordValue(row, ['Component'])),
      functionName: normalizeText(getRecordValue(row, ['Function'])),
      failureMode: normalizeText(getRecordValue(row, ['Failure Mode'])),
      localEffect: normalizeText(getRecordValue(row, ['Local Effect'])),
      safetyMechanism: normalizeText(getRecordValue(row, ['Safety Mechanism'])),
      classification: normalizeClassification(getRecordValue(row, ['Classification'])),
      diagnosticCoverage: parseNumericCell(getRecordValue(row, ['DC %', 'Diagnostic Coverage']), { allowPercent: true }),
      fitRate: parseNumericCell(getRecordValue(row, ['FIT', 'FIT Rate'])),
      asil: normalizeText(getRecordValue(row, ['ASIL'])),
      safetyGoal: normalizeText(getRecordValue(row, ['Safety Goal'])),
    };
  });
};

const parseHierarchyWorksheet = (worksheet: import('exceljs').Worksheet): Record<string, FmedaNode> => {
  const rows = parseHierarchyRows(worksheet);
  const nodes: Record<string, FmedaNode> = {};
  const rowIds: string[] = [];
  const usedIds = new Set<string>();

  rows.forEach((row) => {
    const id = row.nodeId && !usedIds.has(row.nodeId) ? row.nodeId : generateId();
    usedIds.add(id);
    rowIds.push(id);

    const node: FmedaNode = {
      id,
      name: row.name,
      type: row.nodeType,
      parentId: null,
      childIds: [],
    };

    if (row.nodeType === 'FailureMode') {
      node.localEffect = row.localEffect;
      node.safetyMechanism = row.safetyMechanism;
      node.classification = row.classification;
      node.diagnosticCoverage = row.diagnosticCoverage;
      node.fitRate = row.fitRate;
    }

    if (row.nodeType === 'System' || row.nodeType === 'Subsystem' || row.nodeType === 'Component') {
      node.asil = normalizeNodeAsil(row.asil);
      node.safetyGoal = row.safetyGoal;
    }

    nodes[id] = node;
  });

  const levelStack = new Map<number, string>();

  rows.forEach((row, index) => {
    const id = rowIds[index];
    let parentId: string | null = null;

    if (row.parentNodeId && nodes[row.parentNodeId] && row.parentNodeId !== id) {
      parentId = row.parentNodeId;
    } else if (row.level > 0) {
      parentId = levelStack.get(row.level - 1) || null;
      if (!parentId) {
        throw new Error(`The Hierarchy sheet row for "${row.name}" has an invalid nesting level.`);
      }
    }

    nodes[id] = {
      ...nodes[id],
      parentId,
    };

    appendChildId(nodes, parentId, id);
    levelStack.set(row.level, id);
    Array.from(levelStack.keys())
      .filter((stackLevel) => stackLevel > row.level)
      .forEach((stackLevel) => levelStack.delete(stackLevel));
  });

  return finalizeImportedNodes(nodes);
};

const parseFailureModeWorksheet = (worksheet: import('exceljs').Worksheet): FailureModeImportRow[] => {
  const rows = getWorksheetRecords(worksheet);

  if (rows.length === 0) {
    throw new Error('The Excel failure mode sheet is empty.');
  }

  return rows
    .map((row) => ({
      nodeId: normalizeOptionalId(getRecordValue(row, ['Failure Mode ID', 'Node ID'])),
      parentNodeId: normalizeOptionalId(getRecordValue(row, ['Parent Function ID', 'Parent Node ID'])),
      systemId: normalizeOptionalId(getRecordValue(row, ['System ID'])),
      subsystemId: normalizeOptionalId(getRecordValue(row, ['Subsystem ID'])),
      componentId: normalizeOptionalId(getRecordValue(row, ['Component ID'])),
      functionId: normalizeOptionalId(getRecordValue(row, ['Function ID'])),
      system: normalizeText(getRecordValue(row, ['System'])),
      subsystem: normalizeText(getRecordValue(row, ['Subsystem'])),
      component: normalizeText(getRecordValue(row, ['Component'])),
      functionName: normalizeText(getRecordValue(row, ['Function'])),
      failureMode: normalizeText(getRecordValue(row, ['Failure Mode'])),
      localEffect: normalizeText(getRecordValue(row, ['Local Effect'])),
      safetyMechanism: normalizeText(getRecordValue(row, ['Safety Mechanism'])),
      classification: normalizeClassification(getRecordValue(row, ['Classification'])),
      diagnosticCoverage: parseNumericCell(getRecordValue(row, ['Diagnostic Coverage', 'Diagnostic Coverage %']), { allowPercent: true }),
      fitRate: parseNumericCell(getRecordValue(row, ['FIT Rate'])),
      asil: normalizeText(getRecordValue(row, ['ASIL'])),
      safetyGoal: normalizeText(getRecordValue(row, ['Safety Goal'])),
      path: normalizeText(getRecordValue(row, ['Path'])),
    }))
    .filter((row) => row.failureMode);
};

const parseProjectDocumentsWorksheet = (worksheet: import('exceljs').Worksheet | undefined): ProjectDocument[] => {
  if (!worksheet) return [];

  return normalizeProjectDocuments(
    getWorksheetRecords(worksheet).map((row) => ({
      id: normalizeText(getRecordValue(row, ['Document ID'])),
      kind: normalizeText(getRecordValue(row, ['Kind'])) === 'notes' ? 'notes' : 'uploaded',
      name: normalizeText(getRecordValue(row, ['Name'])),
      uploadedAt: normalizeText(getRecordValue(row, ['Uploaded At'])),
      extractedText: normalizeText(getRecordValue(row, ['Extracted Text'])),
    }))
  );
};

const findWorksheetValueByLabel = (worksheet: import('exceljs').Worksheet, label: string): string => {
  const normalizedLabel = normalizeHeader(label);

  for (let rowNumber = 1; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    for (let columnNumber = 1; columnNumber <= row.cellCount; columnNumber += 1) {
      const currentLabel = normalizeText(row.getCell(columnNumber).value);
      if (normalizeHeader(currentLabel) === normalizedLabel) {
        return normalizeText(row.getCell(columnNumber + 1).value);
      }
    }
  }

  return '';
};

const parseOverviewContext = (worksheet: import('exceljs').Worksheet | undefined): ProjectContext | null => {
  if (!worksheet) return null;

  return normalizeProjectContext({
    projectName: normalizeProjectContextValue(findWorksheetValueByLabel(worksheet, 'Project Name')),
    safetyStandard: normalizeProjectContextValue(findWorksheetValueByLabel(worksheet, 'Safety Standard')),
    targetAsil: normalizeProjectContextValue(findWorksheetValueByLabel(worksheet, 'Target ASIL')),
    safetyGoal: normalizeProjectContextValue(findWorksheetValueByLabel(worksheet, 'Safety Goal')),
  });
};

const readExcelFile = async (file: File): Promise<ImportResult> => {
  const ExcelJS = await import('exceljs');
  const workbook = new ExcelJS.Workbook();

  try {
    await workbook.xlsx.load(await file.arrayBuffer());
  } catch {
    throw new Error('Failed to read the Excel workbook. Please choose a valid .xlsx export from FMEDA Pro.');
  }

  const hierarchySheet = workbook.getWorksheet(HIERARCHY_SHEET_NAME);
  const failureModesSheet = workbook.getWorksheet(FAILURE_MODES_SHEET_NAME);
  const documentsSheet = workbook.getWorksheet(DOCUMENTS_SHEET_NAME);
  const overviewSheet = workbook.getWorksheet(OVERVIEW_SHEET_NAME);
  const projectDocuments = parseProjectDocumentsWorksheet(documentsSheet);
  const projectContext = normalizeProjectContext({
    ...(parseOverviewContext(overviewSheet) ?? {
      projectName: deriveProjectNameFromFileName(file.name),
    }),
    ...(projectDocuments.length > 0 ? { documents: projectDocuments } : {}),
  }) || {
    projectName: deriveProjectNameFromFileName(file.name),
  };

  let hierarchyError: Error | null = null;
  let nodesFromHierarchy: Record<string, FmedaNode> | null = null;
  if (hierarchySheet) {
    try {
      nodesFromHierarchy = parseHierarchyWorksheet(hierarchySheet);
    } catch (error) {
      hierarchyError = error instanceof Error ? error : new Error('Failed to parse the Excel hierarchy sheet.');
    }
  }

  let failureModesError: Error | null = null;
  let nodesFromFailureModes: Record<string, FmedaNode> | null = null;
  if (failureModesSheet) {
    try {
      const failureModeRows = parseFailureModeWorksheet(failureModesSheet);
      nodesFromFailureModes = buildNodesFromFailureModeRows(failureModeRows, nodesFromHierarchy ?? {});
    } catch (error) {
      failureModesError = error instanceof Error ? error : new Error('Failed to parse the Excel failure mode sheet.');
    }
  }

  if (nodesFromFailureModes) {
    return { nodes: nodesFromFailureModes, projectContext };
  }

  if (nodesFromHierarchy) {
    return { nodes: nodesFromHierarchy, projectContext };
  }

  if (failureModesError || hierarchyError) {
    const details = [hierarchyError?.message, failureModesError?.message]
      .filter(Boolean)
      .join(' ');
    throw new Error(`This Excel file could not be imported. ${details}`.trim());
  }

  throw new Error(`This Excel file is not a supported FMEDA export. Expected a "${HIERARCHY_SHEET_NAME}" or "${FAILURE_MODES_SHEET_NAME}" worksheet.`);
};

const readCsvFile = async (file: File): Promise<ImportResult> => {
  const failureModeRows = parseFailureModeRowsFromCsv(await file.text());
  return {
    nodes: buildNodesFromFailureModeRows(failureModeRows),
    projectContext: {
      projectName: deriveProjectNameFromFileName(file.name),
    },
  };
};

/**
 * Imports FMEDA data from a JSON, CSV, or Excel export file.
 */
export const importProjectFile = async (file: File): Promise<ImportResult> => {
  const format = inferImportFormat(file);

  if (!format) {
    throw new Error(`Unsupported file type. Import a ${SUPPORTED_IMPORT_EXTENSIONS.map((extension) => `.${extension}`).join(', ')} file exported from FMEDA Pro.`);
  }

  switch (format) {
    case 'json':
      return readJsonFile(file);
    case 'csv':
      return readCsvFile(file);
    case 'xlsx':
      return readExcelFile(file);
    default:
      throw new Error('Unsupported import format.');
  }
};

export const importFromJson = importProjectFile;
