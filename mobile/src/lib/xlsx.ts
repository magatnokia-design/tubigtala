// Minimal .xlsx writer: an Office Open XML workbook is a zip of XML parts. Writing them
// directly (zipped with fflate) keeps the app free of a large spreadsheet library and lets
// the export use TubigTala's colours. Strings are written inline (no shared-strings part).
import { strToU8, zipSync } from 'fflate';

export type CellStyle = 'title' | 'header' | 'muted' | 'bold' | 'normal' | 'warning' | 'critical' | 'cell' | 'cellAlt';
export type CellValue = string | number | null;
export type Cell = CellValue | { v: CellValue; s: CellStyle };

export interface Sheet {
  name: string;
  rows: Cell[][];
  /** 1-based row of the table header: frozen and given filter buttons */
  headerRow?: number;
  /** ranges to merge, e.g. "A1:F1" (title banners, long notes) */
  merges?: string[];
}

// Index into <cellXfs> below. 0 is the default style.
const STYLE_INDEX: Record<CellStyle, number> = { title: 1, header: 2, muted: 3, bold: 4, normal: 5, warning: 6, critical: 7, cell: 8, cellAlt: 9 };
// Long text that spans merged cells; left out of column auto-fit.
const SPANNING: CellStyle[] = ['title', 'muted'];

const BRAND = 'FF0079CE';
const BRAND_DEEP = 'FF085698';

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="7">
<font><sz val="11"/><name val="Calibri"/></font>
<font><b/><sz val="16"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
<font><sz val="10"/><color rgb="FF4F6B85"/><name val="Calibri"/></font>
<font><b/><sz val="11"/><color rgb="FF0B2540"/><name val="Calibri"/></font>
<font><b/><sz val="11"/><color rgb="FF13865A"/><name val="Calibri"/></font>
<font><b/><sz val="11"/><color rgb="FFC9372C"/><name val="Calibri"/></font>
</fonts>
<fills count="7">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="${BRAND}"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFFFF4DE"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFFDECEA"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFEEF7FD"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="${BRAND_DEEP}"/><bgColor indexed="64"/></patternFill></fill>
</fills>
<borders count="2">
<border><left/><right/><top/><bottom/><diagonal/></border>
<border><left/><right/><top/><bottom style="thin"><color rgb="FFCFE4F3"/></bottom><diagonal/></border>
</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="10">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="6" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" indent="1"/></xf>
<xf numFmtId="0" fontId="2" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" indent="1"/></xf>
<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>
<xf numFmtId="0" fontId="4" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1"/>
<xf numFmtId="0" fontId="5" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1"/>
<xf numFmtId="0" fontId="4" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="0" fontId="6" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="left" indent="1"/></xf>
<xf numFmtId="0" fontId="0" fillId="5" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" indent="1"/></xf>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

export function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    // Characters XML 1.0 forbids (control chars) would corrupt the file.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
}

/** 0 -> A, 25 -> Z, 26 -> AA */
export function columnName(index: number): string {
  let n = index + 1;
  let name = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    name = String.fromCharCode(65 + r) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
}

/** Excel sheet names: max 31 chars, none of : \ / ? * [ ] */
export function safeSheetName(name: string): string {
  return name.replace(/[:\\/?*[\]]/g, ' ').slice(0, 31) || 'Sheet';
}

function cellXml(cell: Cell, ref: string): string {
  const { v, s } = cell !== null && typeof cell === 'object' ? cell : { v: cell, s: undefined };
  const style = s ? ` s="${STYLE_INDEX[s]}"` : '';
  if (v === null || v === '') return style ? `<c r="${ref}"${style}/>` : '';
  if (typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}"${style}><v>${v}</v></c>`;
  return `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${escapeXml(String(v))}</t></is></c>`;
}

const MAX_COL = 16384;

/** Width in characters that fits a column's content (Excel has no auto-fit on open). */
export function autoWidths(rows: Cell[][]): number[] {
  const widths: number[] = [];
  for (const row of rows) {
    row.forEach((c, i) => {
      const { v, s } = c !== null && typeof c === 'object' ? c : { v: c, s: undefined };
      if (v === null || v === '' || (s && SPANNING.includes(s))) return;
      const len = String(v).length + (s === 'header' || s === 'bold' ? 2 : 0);
      widths[i] = Math.max(widths[i] ?? 0, len);
    });
  }
  return widths.map((w) => Math.min(60, Math.max(10, (w ?? 0) + 4)));
}

function sheetXml(sheet: Sheet): string {
  const used = Math.max(...sheet.rows.map((r) => r.length), 1);
  const widths = autoWidths(sheet.rows);
  // Visible columns sized to content; every column after them hidden, so the sheet ends at the data.
  const cols = Array.from({ length: used }, (_, i) => `<col min="${i + 1}" max="${i + 1}" width="${widths[i] ?? 12}" customWidth="1"/>`).join('')
    + (used < MAX_COL ? `<col min="${used + 1}" max="${MAX_COL}" width="9" hidden="1"/>` : '');
  const h = sheet.headerRow;
  const rows = sheet.rows
    .map((row, r) => {
      const cells = row.map((c, i) => cellXml(c, `${columnName(i)}${r + 1}`)).join('');
      const first = row[0];
      const isTitle = first !== null && typeof first === 'object' && first.s === 'title';
      const ht = isTitle ? 30 : h === r + 1 ? 22 : 18;
      return `<row r="${r + 1}" ht="${ht}" customHeight="1">${cells}</row>`;
    })
    .join('');
  // Gridlines off; rows not written above are hidden (zeroHeight), so only the data shows.
  const view = h
    ? `<sheetView workbookViewId="0" showGridLines="0"><pane ySplit="${h}" topLeftCell="A${h + 1}" activePane="bottomLeft" state="frozen"/></sheetView>`
    : '<sheetView workbookViewId="0" showGridLines="0"/>';
  const lastRow = sheet.rows.length;
  const filter = h && lastRow > h ? `<autoFilter ref="A${h}:${columnName(used - 1)}${lastRow}"/>` : '';
  const merges = sheet.merges?.length ? `<mergeCells count="${sheet.merges.length}">${sheet.merges.map((m) => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>` : '';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:${columnName(used - 1)}${Math.max(lastRow, 1)}"/><sheetViews>${view}</sheetViews><sheetFormatPr defaultRowHeight="15" zeroHeight="1"/><cols>${cols}</cols><sheetData>${rows}</sheetData>${filter}${merges}</worksheet>`;
}

export function buildXlsx(sheets: Sheet[]): Uint8Array {
  if (!sheets.length) throw new Error('A workbook needs at least one sheet');
  const names = sheets.map((s) => safeSheetName(s.name));
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
${names.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('\n')}
</Types>`),
    '_rels/.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`),
    'xl/workbook.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>${names.map((n, i) => `<sheet name="${escapeXml(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>
</workbook>`),
    'xl/_rels/workbook.xml.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${names.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('\n')}
<Relationship Id="rId${names.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`),
    'xl/styles.xml': strToU8(STYLES),
  };
  sheets.forEach((s, i) => {
    files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(sheetXml(s));
  });
  return zipSync(files, { level: 6 });
}
