import { parseScoreText } from "./csv-parser.js";

function getFirstSheetRows(file) {
  const xlsx = globalThis.XLSX;
  if (!xlsx) {
    throw new Error("XLSX 解析库未加载，请刷新扩展后重试");
  }

  return file.arrayBuffer().then((buffer) => {
    const workbook = xlsx.read(buffer, { type: "array" });
    const firstSheetName = workbook.SheetNames?.[0];
    if (!firstSheetName) {
      throw new Error("Excel 文件中未找到工作表");
    }

    const sheet = workbook.Sheets[firstSheetName];
    if (!sheet) {
      throw new Error("Excel 工作表读取失败");
    }

    return xlsx.utils.sheet_to_json(sheet, {
      header: 1,
      raw: false,
      defval: ""
    });
  });
}

function rowsToNormalizedText(rows) {
  const lines = [];

  for (const row of rows) {
    if (!Array.isArray(row)) continue;

    const cells = row.map((cell) => String(cell ?? "").trim());
    const nonEmpty = cells.filter(Boolean);
    if (!nonEmpty.length) continue;

    if (nonEmpty.length >= 2) {
      lines.push(`${nonEmpty[0]}\t${nonEmpty[1]}`);
    } else {
      lines.push(nonEmpty[0]);
    }
  }

  return lines.join("\n");
}

export async function parseXlsxFile(file, options = {}) {
  if (!file || typeof file.arrayBuffer !== "function") {
    throw new Error("无效的 Excel 文件");
  }

  const rows = await getFirstSheetRows(file);
  const normalizedText = rowsToNormalizedText(rows);
  return parseScoreText(normalizedText, options);
}
