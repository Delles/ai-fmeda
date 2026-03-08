import { FmedaNode, FmedaNodeType, ProjectContext } from '../types/fmeda';
import { isLegacyFormat, migrateLegacyToFlat } from './migration';

const JSON_MIME = 'application/json';
const CSV_MIME = 'text/csv;charset=utf-8';
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const EXPORT_APP_NAME = 'FMEDA Pro';

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
      const handle = await (window as any).showSaveFilePicker({
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
  } catch (err: any) {
    if (err.name === 'AbortError') {
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
      failureModeRows.push({
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

  return { hierarchyRows, failureModeRows, summary };
};

const styleWorksheetHeader = (worksheet: any, rowNumber: number, fillColor = '1D4ED8') => {
  const row = worksheet.getRow(rowNumber);
  row.height = 22;
  row.eachCell((cell: any) => {
    cell.fill = solidFill(fillColor);
    cell.font = { bold: true, color: { argb: 'FFFFFF' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = thinBorder;
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

const addOverviewSheet = (workbook: any, summary: ExportSummary) => {
  const riskSignal = getOverviewRiskSignal(summary);
  const sheet = workbook.addWorksheet('Overview', {
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

      row.eachCell((cell: any) => {
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
};

const addHierarchySheet = (workbook: any, rows: HierarchyExportRow[]) => {
  const sheet = workbook.addWorksheet('Hierarchy', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  sheet.columns = [
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
  sheet.autoFilter = 'A1:S1';

  rows.forEach((rowData) => {
    const row = sheet.addRow(rowData);
    const palette = TYPE_COLORS[rowData.nodeType];

    row.outlineLevel = Math.min(rowData.level, 7);
    row.eachCell((cell: any) => {
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
};

const addFailureModesSheet = (workbook: any, rows: FailureModeExportRow[]) => {
  const sheet = workbook.addWorksheet('Failure Modes', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  sheet.columns = [
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
  sheet.autoFilter = 'A1:O1';

  rows.forEach((rowData) => {
    const row = sheet.addRow(rowData);
    row.eachCell((cell: any) => {
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
  const { hierarchyRows, failureModeRows, summary } = buildExportDataset(nodes, projectContext);
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
  addHierarchySheet(workbook, hierarchyRows);
  addFailureModesSheet(workbook, failureModeRows);

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
const isFmedaNode = (obj: any): obj is FmedaNode => {
  return (
    typeof obj === 'object' &&
    obj !== null &&
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

/**
 * Imports FMEDA data from a JSON file, supporting new flat with context, flat array, and legacy formats.
 */
export const importFromJson = (file: File): Promise<ImportResult> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);

        let projectContext: ProjectContext | null = null;
        let nodesData = json;

        // Check if it's the new format with nodes and projectContext
        if (!Array.isArray(json) && typeof json === 'object' && json !== null && 'nodes' in json) {
          nodesData = json.nodes;
          projectContext = json.projectContext || null;
        }

        if (!Array.isArray(nodesData)) {
          // Check if it's already a record (Record<string, FmedaNode>)
          if (typeof nodesData === 'object' && nodesData !== null) {
            const values = Object.values(nodesData);
            if (values.length > 0 && values.every(isFmedaNode)) {
              return resolve({ nodes: nodesData as Record<string, FmedaNode>, projectContext });
            }
          }
          return reject(new Error('Invalid file format: Expected an array or a valid nodes record.'));
        }

        if (nodesData.length === 0) {
          return resolve({ nodes: {}, projectContext });
        }

        // Check if it's the new flat format (array of nodes)
        if (nodesData.every(isFmedaNode)) {
          const nodesRecord: Record<string, FmedaNode> = {};
          nodesData.forEach((node: FmedaNode) => {
            nodesRecord[node.id] = node;
          });
          return resolve({ nodes: nodesRecord, projectContext });
        }

        // Check if it's the legacy nested format
        if (isLegacyFormat(nodesData)) {
          return resolve({ nodes: migrateLegacyToFlat(nodesData), projectContext });
        }

        reject(new Error('Invalid FMEDA data format: The file does not match the expected flat or legacy structure.'));
      } catch (error) {
        reject(new Error('Failed to parse JSON file.'));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file.'));
    reader.readAsText(file);
  });
};
