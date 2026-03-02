function normalizeName(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[\s·•・()（）\-_,.]/g, "")
    .replace(/（.*?）|\(.*?\)/g, "");
}

function levenshteinDistance(a, b) {
  const s = normalizeName(a);
  const t = normalizeName(b);
  const m = s.length;
  const n = t.length;

  if (m === 0) return n;
  if (n === 0) return m;

  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i += 1) dp[i][0] = i;
  for (let j = 0; j <= n; j += 1) dp[0][j] = j;

  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }

  return dp[m][n];
}

function toStudentMap(students) {
  return students.map((student, index) => ({
    studentId: student.studentId || `row-${index}`,
    name: student.name || "",
    normalized: normalizeName(student.name || ""),
    raw: student
  }));
}

function findById(studentMap, id) {
  return studentMap.find((s) => s.studentId === id) || null;
}

function findBestFuzzy(importName, candidates, maxDistance = 2) {
  let best = null;
  for (const student of candidates) {
    const distance = levenshteinDistance(importName, student.name);
    if (distance > maxDistance) continue;
    if (!best || distance < best.distance) {
      best = { student, distance };
    }
  }
  return best;
}

function createResultRow(row, student, status, confidence) {
  return {
    importedName: row.name || "",
    score: row.score,
    status,
    confidence,
    suggestedStudentId: student?.studentId || "",
    suggestedStudentName: student?.name || "",
    selectedStudentId: student?.studentId || "",
    selectedStudentName: student?.name || "",
    candidates: []
  };
}

export function matchImportedToStudents(importedRows, students, nameMappings = {}) {
  const mappingDict = nameMappings || {};
  const mappedStudents = toStudentMap(Array.isArray(students) ? students : []);
  const usedStudentIds = new Set();
  const results = [];

  for (const row of importedRows || []) {
    const importedName = String(row.name || "").trim();
    const normalizedImport = normalizeName(importedName);

    if (!importedName) {
      results.push({
        importedName,
        score: row.score,
        status: "unmatched",
        confidence: 0,
        suggestedStudentId: "",
        suggestedStudentName: "",
        selectedStudentId: "",
        selectedStudentName: "",
        candidates: mappedStudents.slice(0, 10).map((s) => ({ studentId: s.studentId, name: s.name, distance: null }))
      });
      continue;
    }

    const mappedName = mappingDict[importedName] || mappingDict[normalizedImport];
    if (mappedName) {
      const student = mappedStudents.find(
        (s) => !usedStudentIds.has(s.studentId) && (s.name === mappedName || s.normalized === normalizeName(mappedName))
      );
      if (student) {
        usedStudentIds.add(student.studentId);
        results.push(createResultRow(row, student, "mapped", 1));
        continue;
      }
    }

    const exact = mappedStudents.find((s) => !usedStudentIds.has(s.studentId) && s.name === importedName);
    if (exact) {
      usedStudentIds.add(exact.studentId);
      results.push(createResultRow(row, exact, "exact", 1));
      continue;
    }

    const normalized = mappedStudents.find(
      (s) => !usedStudentIds.has(s.studentId) && s.normalized === normalizedImport
    );
    if (normalized) {
      usedStudentIds.add(normalized.studentId);
      results.push(createResultRow(row, normalized, "normalized", 0.95));
      continue;
    }

    const contains = mappedStudents.find(
      (s) =>
        !usedStudentIds.has(s.studentId) &&
        (s.normalized.includes(normalizedImport) || normalizedImport.includes(s.normalized))
    );
    if (contains) {
      usedStudentIds.add(contains.studentId);
      results.push(createResultRow(row, contains, "contains", 0.8));
      continue;
    }

    const available = mappedStudents.filter((s) => !usedStudentIds.has(s.studentId));
    const fuzzy = findBestFuzzy(importedName, available, 2);
    if (fuzzy) {
      const confidence = fuzzy.distance === 0 ? 1 : Math.max(0.6, 1 - fuzzy.distance * 0.2);
      usedStudentIds.add(fuzzy.student.studentId);
      const fuzzyRow = createResultRow(row, fuzzy.student, "fuzzy", confidence);
      fuzzyRow.candidates = available
        .map((s) => ({ studentId: s.studentId, name: s.name, distance: levenshteinDistance(importedName, s.name) }))
        .sort((a, b) => (a.distance ?? 99) - (b.distance ?? 99))
        .slice(0, 5);
      results.push(fuzzyRow);
      continue;
    }

    results.push({
      importedName,
      score: row.score,
      status: "unmatched",
      confidence: 0,
      suggestedStudentId: "",
      suggestedStudentName: "",
      selectedStudentId: "",
      selectedStudentName: "",
      candidates: mappedStudents
        .map((s) => ({ studentId: s.studentId, name: s.name, distance: levenshteinDistance(importedName, s.name) }))
        .sort((a, b) => (a.distance ?? 99) - (b.distance ?? 99))
        .slice(0, 8)
    });
  }

  const summary = {
    total: results.length,
    exact: results.filter((r) => r.status === "exact").length,
    normalized: results.filter((r) => r.status === "normalized").length,
    mapped: results.filter((r) => r.status === "mapped").length,
    contains: results.filter((r) => r.status === "contains").length,
    fuzzy: results.filter((r) => r.status === "fuzzy").length,
    unmatched: results.filter((r) => r.status === "unmatched").length
  };

  return { results, summary };
}

export function buildMappingFromManualAdjustments(matchedRows) {
  const nextMapping = {};
  for (const row of matchedRows || []) {
    if (!row.importedName || !row.selectedStudentName) continue;
    if (normalizeName(row.importedName) === normalizeName(row.selectedStudentName)) continue;
    nextMapping[row.importedName] = row.selectedStudentName;
    nextMapping[normalizeName(row.importedName)] = row.selectedStudentName;
  }
  return nextMapping;
}

export { normalizeName, levenshteinDistance, findById };
