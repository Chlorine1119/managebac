function splitCsvLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  result.push(current.trim());
  return result;
}

function normalizeScore(raw) {
  if (raw == null) return "";
  return String(raw).trim();
}

function looksLikeHeader(name, score) {
  const n = String(name || "").toLowerCase();
  const s = String(score || "").toLowerCase();
  return (n.includes("姓名") || n.includes("name")) && (s.includes("分") || s.includes("score"));
}

function isEmptyRow(name, score) {
  return String(name || "").trim() === "" && String(score || "").trim() === "";
}

function parseNameScoreLine(line) {
  const tabParts = line.split("\t").map((x) => x.trim()).filter(Boolean);
  if (tabParts.length >= 2) {
    return { name: tabParts[0], score: normalizeScore(tabParts[1]), format: "tab" };
  }

  const csvParts = splitCsvLine(line);
  if (csvParts.length >= 2) {
    return { name: csvParts[0], score: normalizeScore(csvParts[1]), format: "csv" };
  }

  const loose = line.trim().split(/\s+/);
  if (loose.length >= 2) {
    const score = normalizeScore(loose[loose.length - 1]);
    const name = loose.slice(0, -1).join(" ");
    return { name, score, format: "space" };
  }

  return null;
}

export function parseScoreText(text, options = {}) {
  const pageStudents = Array.isArray(options.pageStudents) ? options.pageStudents : [];
  const lines = String(text || "").split(/\r?\n/);
  const rows = [];
  const errors = [];
  let detectedMode = "named";

  const nonEmptyLines = lines.map((line) => line.trim()).filter(Boolean);
  const mostlySingleColumn = nonEmptyLines.every((line) => {
    if (line.includes("\t")) return false;
    if (line.includes(",")) {
      return splitCsvLine(line).length === 1;
    }
    return line.split(/\s+/).length === 1;
  });

  if (mostlySingleColumn) {
    detectedMode = "ordered";
    nonEmptyLines.forEach((line, index) => {
      const score = normalizeScore(line);
      if (!score) return;
      const student = pageStudents[index];
      rows.push({
        name: student?.name || "",
        score,
        originalLine: line,
        rowIndex: index
      });
    });
    return { rows, mode: detectedMode, errors };
  }

  for (let i = 0; i < lines.length; i += 1) {
    const rawLine = lines[i];
    if (!rawLine || !rawLine.trim()) continue;

    const parsed = parseNameScoreLine(rawLine);
    if (!parsed) {
      errors.push(`第 ${i + 1} 行无法解析：${rawLine}`);
      continue;
    }

    if (i === 0 && looksLikeHeader(parsed.name, parsed.score)) {
      continue;
    }

    if (isEmptyRow(parsed.name, parsed.score) || !parsed.score) {
      continue;
    }

    rows.push({
      name: String(parsed.name || "").trim(),
      score: parsed.score,
      originalLine: rawLine,
      rowIndex: i
    });
  }

  return { rows, mode: detectedMode, errors };
}

export async function parseCsvFile(file, options = {}) {
  if (!file || typeof file.text !== "function") {
    throw new Error("无效的文件对象");
  }

  const content = await file.text();
  return parseScoreText(content, options);
}
