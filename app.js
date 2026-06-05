const aliases = {
  payee: ["收款人", "收款户名", "开户名", "开户人", "户名", "持卡人", "领款人", "代领人", "监护人", "母亲姓名", "父亲姓名", "人员名单"],
  beneficiary: ["补助对象", "受益人", "享受人", "学生姓名", "儿童姓名", "孩子姓名", "人员姓名"],
  name: ["姓名", "名字"],
  card: ["社保卡号", "银行卡", "银行卡号", "银行账号", "账号", "卡号", "一卡通"],
  amount: ["应发金额", "实发金额", "发放金额", "申请金额", "金额", "小计", "合计", "总计", "报酬", "工资", "补贴"],
  idNo: ["身份证号", "身份证号码", "证件号", "居民身份证"],
  unit: ["单位", "乡镇", "乡镇街道", "村居", "村", "部门"],
  remark: ["备注", "说明", "发放说明", "关系"],
};

const state = {
  files: [],
  sheetResults: [],
  records: [],
  issues: [],
  filteredRecords: [],
  exportSelections: {},
  exportSelectionTouched: {},
  retryOverrides: {},
  retryOverrideTouched: {},
  manualUnits: {},
  expandedPreviews: {},
};

const projectCodes = {
  财补: "AG0025",
  代发工资: "AG0001",
};

const baseUnitReferences =
  typeof window !== "undefined" && Array.isArray(window.PAYROLL_UNIT_REFERENCES) ? window.PAYROLL_UNIT_REFERENCES : [];

const unitAliases =
  typeof window !== "undefined" && window.PAYROLL_UNIT_ALIASES && typeof window.PAYROLL_UNIT_ALIASES === "object"
    ? window.PAYROLL_UNIT_ALIASES
    : {};

const unitFolders =
  typeof window !== "undefined" && window.PAYROLL_UNIT_FOLDERS && typeof window.PAYROLL_UNIT_FOLDERS === "object"
    ? window.PAYROLL_UNIT_FOLDERS
    : {};

const townFolders =
  typeof window !== "undefined" && window.PAYROLL_TOWN_FOLDERS && typeof window.PAYROLL_TOWN_FOLDERS === "object"
    ? window.PAYROLL_TOWN_FOLDERS
    : {};

const villageFolders =
  typeof window !== "undefined" && Array.isArray(window.PAYROLL_VILLAGE_FOLDERS) ? window.PAYROLL_VILLAGE_FOLDERS : [];

const unitReferences = [...new Set([...baseUnitReferences, ...Object.keys(unitFolders)].filter(Boolean))];

const unitReferenceIndex = unitReferences.map((name) => ({
  name,
  full: normalizeUnitForMatch(name),
  core: normalizeUnitCore(name),
}));

const unitAliasIndex = Object.entries(unitAliases).map(([alias, name]) => ({
  alias,
  name,
  full: normalizeUnitForMatch(alias),
  core: normalizeUnitCore(alias),
}));

const unitFolderIndex = Object.entries(unitFolders).map(([unit, folder]) => ({
  unit,
  folder,
  full: normalizeUnitForMatch(unit),
  core: normalizeUnitCore(unit),
}));

const townFolderIndex = Object.entries(townFolders).map(([town, folder]) => ({
  town,
  folder,
  full: normalizeUnitForMatch(town),
  core: normalizeUnitCore(town),
}));

const villageFolderIndex = villageFolders.map((item) => ({
  town: item.town,
  village: item.village,
  folder: item.folder,
  full: normalizeUnitForMatch(item.village),
  core: normalizeVillageCore(item.village),
}));

const els = {
  dropZone: document.querySelector("#dropZone"),
  fileInput: document.querySelector("#fileInput"),
  pickButton: document.querySelector("#pickButton"),
  clearButton: document.querySelector("#clearButton"),
  exportButton: document.querySelector("#exportButton"),
  projectSelect: document.querySelector("#projectSelect"),
  fileQueue: document.querySelector("#fileQueue"),
  exportPreview: document.querySelector("#exportPreview"),
  recordsBody: document.querySelector("#recordsBody"),
  issuesList: document.querySelector("#issuesList"),
  searchInput: document.querySelector("#searchInput"),
  statusFilter: document.querySelector("#statusFilter"),
  fileCount: document.querySelector("#fileCount"),
  sheetCount: document.querySelector("#sheetCount"),
  recordCount: document.querySelector("#recordCount"),
  issueCount: document.querySelector("#issueCount"),
};

els.pickButton.addEventListener("click", () => els.fileInput.click());
els.fileInput.addEventListener("change", (event) => parseFiles([...event.target.files]));
els.clearButton.addEventListener("click", resetState);
els.exportButton.addEventListener("click", () => {
  exportWorkbook().catch((error) => {
    state.issues.unshift({
      level: "error",
      title: "导出失败",
      message: error.message || "生成导出文件时发生错误",
    });
    renderIssues();
  });
});
els.searchInput.addEventListener("input", () => {
  renderRecords();
  renderExportPreview();
});
els.statusFilter.addEventListener("change", () => {
  renderRecords();
  renderExportPreview();
});
els.projectSelect.addEventListener("change", renderExportPreview);

els.exportPreview.addEventListener("change", (event) => {
  const selectBox = event.target.closest("[data-export-select]");
  if (selectBox) {
    state.exportSelections[selectBox.dataset.groupId] = selectBox.checked;
    state.exportSelectionTouched[selectBox.dataset.groupId] = true;
    renderExportPreview();
    return;
  }

  const retryToggle = event.target.closest("[data-retry-toggle]");
  if (retryToggle) {
    state.retryOverrides[retryToggle.dataset.groupId] = retryToggle.checked;
    state.retryOverrideTouched[retryToggle.dataset.groupId] = true;
    renderExportPreview();
    return;
  }

  const unitInput = event.target.closest("[data-unit-input]");
  if (unitInput) {
    saveManualUnit(unitInput.dataset.groupId, unitInput.value, true);
  }
});

els.exportPreview.addEventListener("input", (event) => {
  const unitInput = event.target.closest("[data-unit-input]");
  if (!unitInput) return;
  state.manualUnits[unitInput.dataset.groupId] = unitInput.value;
  updateUnitSuggestionPanel(unitInput);
});

els.exportPreview.addEventListener("focusin", (event) => {
  const unitInput = event.target.closest("[data-unit-input]");
  if (!unitInput) return;
  updateUnitSuggestionPanel(unitInput);
});

els.exportPreview.addEventListener("mousedown", (event) => {
  const suggestion = event.target.closest("[data-unit-suggestion]");
  if (!suggestion) return;
  event.preventDefault();
  saveManualUnit(suggestion.dataset.groupId, suggestion.dataset.unitName, true);
});

els.exportPreview.addEventListener("click", (event) => {
  const toggleButton = event.target.closest("[data-preview-toggle]");
  if (toggleButton) {
    const groupId = toggleButton.dataset.groupId;
    state.expandedPreviews[groupId] = !state.expandedPreviews[groupId];
    renderExportPreview();
    return;
  }

  const matchButton = event.target.closest("[data-unit-match]");
  if (matchButton) {
    const input = matchButton.closest(".export-card")?.querySelector("[data-unit-input]");
    saveManualUnit(matchButton.dataset.groupId, input?.value || "", true);
  }
});

els.exportPreview.addEventListener("keydown", (event) => {
  const unitInput = event.target.closest("[data-unit-input]");
  if (!unitInput || event.key !== "Enter") return;
  event.preventDefault();
  const firstSuggestion = unitInput.closest(".unit-input-wrap")?.querySelector("[data-unit-suggestion]");
  saveManualUnit(unitInput.dataset.groupId, firstSuggestion?.dataset.unitName || unitInput.value, true);
});

["dragenter", "dragover"].forEach((name) => {
  els.dropZone.addEventListener(name, (event) => {
    event.preventDefault();
    els.dropZone.classList.add("is-dragging");
  });
});

["dragleave", "drop"].forEach((name) => {
  els.dropZone.addEventListener(name, (event) => {
    event.preventDefault();
    els.dropZone.classList.remove("is-dragging");
  });
});

els.dropZone.addEventListener("drop", (event) => {
  parseFiles([...event.dataTransfer.files]);
});

async function parseFiles(files) {
  const inputFiles = files.filter((file) => /\.(xls|xlsx|csv|zip)$/i.test(file.name));
  if (!inputFiles.length) return;

  resetState(false);
  state.files = inputFiles.map((file) => ({
    name: file.name,
    status: "识别中",
    entries: 0,
    sheets: 0,
    records: 0,
    issues: 0,
    sheetResults: [],
  }));
  renderAll();

  for (const [fileIndex, file] of inputFiles.entries()) {
    try {
      const originalData = await file.arrayBuffer();
      state.files[fileIndex].originalData = originalData;
      const spreadsheetEntries = await expandInputFile(file, originalData);
      if (!spreadsheetEntries.length) {
        throw new Error("压缩包内没有找到 .xls、.xlsx 或 .csv 文件");
      }

      const results = { records: [], issues: [], sheetResults: [] };
      for (const entry of spreadsheetEntries) {
        const entryResults = parseSpreadsheetEntry(entry);
        results.records.push(...entryResults.records);
        results.issues.push(...entryResults.issues);
        results.sheetResults.push(...entryResults.sheetResults);
      }

      state.sheetResults.push(...results.sheetResults);
      state.records.push(...results.records);
      state.issues.push(...results.issues);
      state.files[fileIndex].status = results.records.length ? "已识别" : results.issues.length ? "需处理" : "未找到明细";
      state.files[fileIndex].entries = spreadsheetEntries.length;
      state.files[fileIndex].sheets = results.sheetResults.filter((sheet) => sheet.status === "已识别").length;
      state.files[fileIndex].records = results.records.length;
      state.files[fileIndex].issues = results.issues.length;
      state.files[fileIndex].sheetResults = results.sheetResults;
    } catch (error) {
      state.files[fileIndex].status = "读取失败";
      state.files[fileIndex].issues = 1;
      state.issues.push({
        level: "error",
        title: "文件读取失败",
        message: `${file.name}：${error.message || "无法解析该文件"}`,
      });
    }
    renderAll();
  }
}

async function expandInputFile(file, originalData) {
  if (!/\.zip$/i.test(file.name)) {
    return [{ name: file.name, data: originalData }];
  }

  if (!window.JSZip) {
    throw new Error("压缩包解析组件未加载");
  }

  const archive = await JSZip.loadAsync(originalData);
  const entries = Object.values(archive.files).filter((entry) => {
    const name = entry.name.split("/").pop() || "";
    return !entry.dir && !name.startsWith(".") && !entry.name.includes("__MACOSX") && /\.(xls|xlsx|csv)$/i.test(name);
  });

  const spreadsheetEntries = [];
  for (const entry of entries) {
    spreadsheetEntries.push({
      name: `${file.name} / ${entry.name}`,
      data: await entry.async("arraybuffer"),
    });
  }
  return spreadsheetEntries;
}

function parseSpreadsheetEntry(entry) {
  const workbook = XLSX.read(entry.data, { type: "array", raw: false, cellDates: false, cellStyles: true });
  return parseWorkbook(workbook, entry.name);
}

function parseWorkbook(workbook, fileName) {
  const records = [];
  const issues = [];
  const sheetResults = [];

  workbook.SheetNames.forEach((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: "",
      blankrows: false,
      raw: false,
    });
    const sourceUnit = inferSourceUnit(rows, fileName, sheetName);
    const yellowResult = parseYellowMarkedSheet(sheet, rows, fileName, sheetName, sourceUnit);
    if (yellowResult.markedRows > 0) {
      records.push(...yellowResult.records);
      issues.push(...yellowResult.issues);
      sheetResults.push({
        fileName,
        sheetName,
        status: yellowResult.records.length ? "已识别" : "黄底不完整",
        rows: yellowResult.records.length,
        reason: yellowResult.records.length
          ? `按黄底标记提取${yellowResult.incompleteRows ? `，${yellowResult.incompleteRows} 行黄底不完整` : ""}`
          : "黄底标记不完整",
        extractionMode: "黄底标记",
        ignoredRows: 0,
        incompleteRows: yellowResult.incompleteRows,
      });
      return;
    }

    const headerInfo = findHeader(rows);
    if (!headerInfo) {
      sheetResults.push({
        fileName,
        sheetName,
        status: "跳过",
        rows: 0,
        reason: "没有同时找到姓名、卡号、金额字段",
      });
      return;
    }

    if (headerInfo.ambiguities?.length) {
      headerInfo.ambiguities.forEach((ambiguity) => {
        issues.push({
          level: "error",
          title: "字段不唯一",
          message: `${fileName} / ${sheetName}：${ambiguity.label}存在多个候选列（${formatCandidateColumns(ambiguity.candidates)}）。请在原表中将正确的姓名、账户、金额单元格标黄后重新导入`,
        });
      });
      sheetResults.push({
        fileName,
        sheetName,
        status: "字段不唯一",
        rows: 0,
        reason: headerInfo.ambiguities.map((item) => `${item.label}不唯一`).join("、"),
        columns: headerInfo.columns,
      });
      return;
    }

    const sheetRecords = [];
    let ignoredRows = 0;
    for (let rowIndex = headerInfo.rowIndex + 1; rowIndex < rows.length; rowIndex += 1) {
      const row = rows[rowIndex];
      const record = normalizeRecord(row, headerInfo.columns, {
        fileName,
        sheetName,
        rowNumber: rowIndex + 1,
        sourceUnit,
      });
      if (!record) {
        if (isIncompleteAmountRow(row, headerInfo.columns)) ignoredRows += 1;
        continue;
      }
      record.issues = validateRecord(record);
      sheetRecords.push(record);
    }

    removeTrailingAmountTotalRecord(sheetRecords);
    collectRecordIssues(sheetRecords, issues);
    records.push(...sheetRecords);
    sheetResults.push({
      fileName,
      sheetName,
      status: sheetRecords.length ? "已识别" : "空明细",
      rows: sheetRecords.length,
      reason: `${sheetRecords.length ? `表头第 ${headerInfo.rowIndex + 1} 行` : "没有完整明细行"}${ignoredRows ? `，已忽略 ${ignoredRows} 行非明细金额行` : ""}`,
      columns: headerInfo.columns,
      extractionMode: "自动识别",
      ignoredRows,
    });
  });

  return { records, issues, sheetResults };
}

function findHeader(rows) {
  let best = null;
  rows.slice(0, 30).forEach((row, rowIndex) => {
    const headerCheck = analyzeHeaderRow(rows, row, rowIndex);
    const score = ["name", "card", "amount"].filter((field) => headerCheck.candidates[field].length).length;
    const optionalScore = ["beneficiary", "idNo", "unit", "remark"].filter((field) => headerCheck.columns[field] !== undefined).length;
    const confidenceScore =
      score * 10 +
      optionalScore +
      headerCheck.candidates.name.reduce((sum, item) => sum + item.score, 0) +
      headerCheck.candidates.card.reduce((sum, item) => sum + item.score, 0) +
      headerCheck.candidates.amount.reduce((sum, item) => sum + item.score, 0);
    if (score >= 3 && (!best || confidenceScore > best.score)) {
      best = {
        rowIndex,
        columns: buildHeaderColumns(headerCheck),
        ambiguities: getHeaderAmbiguities(headerCheck),
        score: confidenceScore,
      };
    }
  });
  return best;
}

function analyzeHeaderRow(rows, row, rowIndex) {
  const columns = {};
  const candidates = {
    name: [],
    card: [],
    amount: [],
  };

  row.forEach((cell, colIndex) => {
    const text = clean(cell);
    if (!text) return;

    ["beneficiary", "idNo", "unit", "remark"].forEach((field) => {
      if (columns[field] !== undefined) return;
      if (matchesAnyAlias(text, aliases[field])) columns[field] = colIndex;
    });
  });

  inferFieldCandidates(rows, row, rowIndex, columns, candidates);
  ["name", "card", "amount"].forEach((field) => {
    candidates[field].sort((a, b) => (b.score || 0) - (a.score || 0));
  });

  return { columns, candidates };
}

function inferFieldCandidates(rows, headerRow, headerRowIndex, columns, candidates) {
  const maxColCount = rows.slice(headerRowIndex + 1, headerRowIndex + 201).reduce((max, row) => Math.max(max, row.length), 0);

  for (let colIndex = 0; colIndex < maxColCount; colIndex += 1) {
    const headerText = clean(headerRow[colIndex]);
    const profile = profileColumn(rows, headerRowIndex, colIndex);
    const nameScore = scoreNameColumn(headerText, profile);
    const cardScore = scoreCardColumn(headerText, profile);
    const amountScore = scoreAmountColumn(headerText, profile);

    if (nameScore >= 4) {
      addCandidate(candidates.name, {
        colIndex,
        label: headerText || "多数为姓名",
        sourceField: matchesAnyAlias(headerText, aliases.payee) || /名单|人员|职工|员工/.test(headerText) ? "payee" : "name",
        score: nameScore,
        inferred: !headerText,
      });
    }
    if (cardScore >= 4) {
      addCandidate(candidates.card, {
        colIndex,
        label: headerText || "多数为19/23位账号",
        sourceField: "card",
        score: cardScore,
        inferred: !headerText,
      });
    }
    if (amountScore >= 4) {
      addCandidate(candidates.amount, {
        colIndex,
        label: headerText || "多数为金额",
        sourceField: "amount",
        score: amountScore,
        inferred: !headerText,
      });
    }
  }
}

function profileColumn(rows, headerRowIndex, colIndex) {
  const profile = {
    total: 0,
    nameLike: 0,
    cardLike: 0,
    amountLike: 0,
    longNumberLike: 0,
    sequenceLike: 0,
  };
  const serialNumbers = [];

  for (let rowIndex = headerRowIndex + 1; rowIndex < Math.min(rows.length, headerRowIndex + 201); rowIndex += 1) {
    const row = rows[rowIndex] || [];
    if (isTotalRow(row)) continue;
    const raw = row[colIndex];
    const value = stripInnerSpaces(raw);
    if (!value) continue;
    profile.total += 1;
    if (isNameText(value)) profile.nameLike += 1;
    if (isCardText(value)) profile.cardLike += 1;
    if (isAmountText(value)) profile.amountLike += 1;
    if (/^\d{12,30}$/.test(normalizeCard(value))) profile.longNumberLike += 1;
    if (/^\d+$/.test(value)) serialNumbers.push(Number(value));
  }

  if (
    profile.total >= 2 &&
    serialNumbers.length / profile.total >= 0.8 &&
    serialNumbers.every((value, index) => value === index + 1)
  ) {
    profile.sequenceLike = 1;
  }

  return profile;
}

function scoreNameColumn(headerText, profile) {
  let score = 0;
  if (matchesAnyAlias(headerText, aliases.payee)) score += 8;
  else if (matchesAnyAlias(headerText, aliases.name) || /名单|人员|职工|员工/.test(headerText)) score += 6;
  if (profile.total >= 1 && profile.nameLike / profile.total >= 0.6) score += 5;
  if (profile.cardLike) score -= 5;
  if (profile.longNumberLike) score -= 4;
  return score;
}

function scoreCardColumn(headerText, profile) {
  let score = 0;
  if (matchesAnyAlias(headerText, aliases.card)) score += 8;
  if (profile.total >= 1 && profile.cardLike / profile.total >= 0.6) score += 7;
  else if (profile.cardLike >= 1) score += 5;
  if (profile.nameLike) score -= 4;
  return score;
}

function scoreAmountColumn(headerText, profile) {
  let score = 0;
  const normalizedHeader = stripInnerSpaces(headerText);
  const serialHeader = /^(序号|编号|行号|序列|序数|no|No|NO)$/.test(normalizedHeader);
  const strictAmountHeader = matchesAnyAlias(normalizedHeader, aliases.amount) || /^(小计|合计|总计|发放合计|工资合计|补助合计|补贴合计)$/.test(normalizedHeader);
  if (strictAmountHeader && !matchesAnyAlias(headerText, aliases.card)) score += 8;
  if (profile.total >= 1 && profile.amountLike / profile.total >= 0.6) score += 6;
  else if (profile.amountLike >= 1 && strictAmountHeader) score += 4;
  if (serialHeader || profile.sequenceLike) score -= 12;
  if (profile.cardLike || profile.longNumberLike) score -= 8;
  return score;
}

function addCandidate(candidates, candidate) {
  const existing = candidates.find((item) => item.colIndex === candidate.colIndex);
  if (!existing) {
    candidates.push(candidate);
    return;
  }
  if ((candidate.score || 0) > (existing.score || 0) || (existing.inferred && !candidate.inferred)) {
    existing.label = candidate.label;
    existing.inferred = false;
    existing.score = candidate.score;
    existing.sourceField = candidate.sourceField;
  }
}

function buildHeaderColumns(headerCheck) {
  const columns = { ...headerCheck.columns };
  const nameCandidate = headerCheck.candidates.name[0];
  if (nameCandidate) columns[nameCandidate.sourceField === "payee" ? "payee" : "name"] = nameCandidate.colIndex;
  const cardCandidate = headerCheck.candidates.card[0];
  if (cardCandidate) columns.card = cardCandidate.colIndex;
  const amountCandidate = headerCheck.candidates.amount[0];
  if (amountCandidate) columns.amount = amountCandidate.colIndex;
  return columns;
}

function getHeaderAmbiguities(headerCheck) {
  return [
    { field: "name", label: "姓名", candidates: headerCheck.candidates.name },
    { field: "card", label: "账户", candidates: headerCheck.candidates.card },
    { field: "amount", label: "金额", candidates: headerCheck.candidates.amount },
  ].filter((item) => {
    if (item.candidates.length <= 1) return false;
    const [best, second] = item.candidates;
    return (second.score || 0) >= (best.score || 0) - 2;
  });
}

function matchesAnyAlias(text, words) {
  return words.some((word) => text.includes(word));
}

function formatCandidateColumns(candidates) {
  return candidates.map((candidate) => `${numberToColumnName(candidate.colIndex)}列：${candidate.label}`).join("；");
}

function numberToColumnName(index) {
  let value = index + 1;
  let name = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    value = Math.floor((value - 1) / 26);
  }
  return name;
}

function collectRecordIssues(records, issues) {
  records.forEach((record) => {
    record.issues.forEach((item) => {
      issues.push({
        level: item.level,
        title: item.title,
        message: `${record.name || "未填姓名"}，${record.fileName} / ${record.sheetName} 第 ${record.rowNumber} 行：${item.message}`,
      });
    });
  });
}

function removeTrailingAmountTotalRecord(records) {
  if (records.length < 2) return;

  const lastNumericIndex = findLastIndex(records, (record) => Number.isFinite(record.amount));
  if (lastNumericIndex <= 0 || lastNumericIndex !== records.length - 1) return;

  const candidate = records[lastNumericIndex];
  const previousRecords = records.slice(0, lastNumericIndex).filter((record) => Number.isFinite(record.amount));
  if (previousRecords.length < 2) return;

  const previousSum = sumAmounts(previousRecords);
  const looksLikeTotal = !candidate.name || !isCardText(candidate.card);
  if (looksLikeTotal && amountsEqual(candidate.amount, previousSum)) records.splice(lastNumericIndex, 1);
}

function findLastIndex(items, predicate) {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (predicate(items[index], index)) return index;
  }
  return -1;
}

function amountsEqual(left, right) {
  return Math.abs(Number(left) - Number(right)) < 0.005;
}

function parseYellowMarkedSheet(sheet, rows, fileName, sheetName, sourceUnit) {
  const records = [];
  const issues = [];
  const range = sheet["!ref"] ? XLSX.utils.decode_range(sheet["!ref"]) : null;
  if (!range) return { records, issues, markedRows: 0, incompleteRows: 0 };

  const yellowRows = new Map();
  for (let rowIndex = range.s.r; rowIndex <= range.e.r; rowIndex += 1) {
    for (let colIndex = range.s.c; colIndex <= range.e.c; colIndex += 1) {
      const address = XLSX.utils.encode_cell({ r: rowIndex, c: colIndex });
      const cell = sheet[address];
      if (!cell || !isYellowCell(cell)) continue;
      if (!yellowRows.has(rowIndex)) yellowRows.set(rowIndex, []);
      yellowRows.get(rowIndex).push({
        colIndex,
        value: clean(cell.w ?? cell.v),
        header: findNearestHeader(rows, rowIndex, colIndex),
      });
    }
  }

  let incompleteRows = 0;
  yellowRows.forEach((cells, rowIndex) => {
    const record = normalizeYellowRecord(cells, {
      fileName,
      sheetName,
      rowNumber: rowIndex + 1,
      sourceUnit,
    });
    if (!record) {
      incompleteRows += 1;
      issues.push({
        level: "error",
        title: "黄底标记不完整",
        message: `${fileName} / ${sheetName} 第 ${rowIndex + 1} 行：黄底区域没有同时包含姓名、账户、金额`,
      });
      return;
    }
    record.issues = validateRecord(record);
    records.push(record);
  });

  removeTrailingAmountTotalRecord(records);
  collectRecordIssues(records, issues);
  return { records, issues, markedRows: yellowRows.size, incompleteRows };
}

function normalizeYellowRecord(cells, source) {
  const cardCell = pickYellowCardCell(cells);
  const amountCell = pickYellowAmountCell(cells, cardCell);
  const payeeCell = pickYellowPayeeCell(cells, cardCell, amountCell);
  if (!cardCell || !amountCell || !payeeCell) return null;

  return {
    name: stripInnerSpaces(payeeCell?.value),
    beneficiary: "",
    card: normalizeCard(cardCell?.value),
    amount: parseAmount(amountCell?.value),
    amountText: stripInnerSpaces(amountCell?.value),
    idNo: "",
    unit: source.sourceUnit || inferUnit(source.fileName, source.sheetName),
    sourceUnit: source.sourceUnit || "",
    fileName: source.fileName,
    sheetName: source.sheetName,
    rowNumber: source.rowNumber,
  };
}

function pickYellowCardCell(cells) {
  return cells
    .filter((cell) => clean(cell.value))
    .sort((a, b) => scoreCardHeader(b.header, b.value) - scoreCardHeader(a.header, a.value))[0];
}

function pickYellowAmountCell(cells, cardCell) {
  const amountCells = cells.filter((cell) => {
    if (cell === cardCell) return false;
    const value = parseAmount(cell.value);
    return Number.isFinite(value);
  });
  return amountCells.sort((a, b) => scoreAmountHeader(b.header) - scoreAmountHeader(a.header))[0];
}

function pickYellowPayeeCell(cells, cardCell, amountCell) {
  const nameCells = cells.filter((cell) => {
    if (cell === cardCell || cell === amountCell) return false;
    return /^[\u4e00-\u9fa5·]{2,8}$/.test(stripInnerSpaces(cell.value));
  });
  return nameCells.sort((a, b) => scorePayeeHeader(b.header) - scorePayeeHeader(a.header))[0];
}

function scoreCardHeader(header, value) {
  const text = clean(header);
  let score = 0;
  if (aliases.card.some((word) => text.includes(word))) score += 4;
  if (isCardText(value)) score += 3;
  if (/^\d{12,30}$/.test(normalizeCard(value))) score += 2;
  if (Number.isFinite(parseAmount(value)) && !/^\d{12,30}$/.test(normalizeCard(value))) score -= 2;
  return score;
}

function scorePayeeHeader(header) {
  const text = clean(header);
  if (aliases.payee.some((word) => text.includes(word))) return 3;
  if (aliases.beneficiary.some((word) => text.includes(word))) return 1;
  if (aliases.name.some((word) => text.includes(word))) return 2;
  return 0;
}

function scoreAmountHeader(header) {
  const text = clean(header);
  if (/(实发|发放|代发)/.test(text)) return 3;
  if (/(应发|金额|报酬|工资|补贴)/.test(text)) return 2;
  return 0;
}

function findNearestHeader(rows, rowIndex, colIndex) {
  for (let current = rowIndex - 1; current >= Math.max(0, rowIndex - 10); current -= 1) {
    const text = clean(rows[current]?.[colIndex]);
    if (text) return text;
  }
  return "";
}

function isYellowCell(cell) {
  const rgb = clean(cell.s?.fgColor?.rgb).toUpperCase();
  if (!rgb) return false;
  const hex = rgb.length === 8 ? rgb.slice(2) : rgb;
  if (!/^[0-9A-F]{6}$/.test(hex)) return false;
  const red = parseInt(hex.slice(0, 2), 16);
  const green = parseInt(hex.slice(2, 4), 16);
  const blue = parseInt(hex.slice(4, 6), 16);
  return red >= 220 && green >= 180 && blue <= 120;
}

function isCardText(value) {
  return /^(?:\d{19}|\d{23})$/.test(normalizeCard(value));
}

function isNameText(value) {
  return /^[\u4e00-\u9fa5·]{2,8}$/.test(stripInnerSpaces(value));
}

function isAmountText(value) {
  const normalized = stripInnerSpaces(value).replace(/,/g, "").replace(/[￥¥元]/g, "");
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return false;
  if (/^\d{12,30}$/.test(normalized)) return false;
  return Number(normalized) >= 0;
}

function normalizeCard(value) {
  return stripInnerSpaces(value);
}

function normalizeRecord(row, columns, source) {
  if (isTotalRow(row)) return null;

  const payeeFromColumn = columns.payee === undefined ? "" : stripInnerSpaces(row[columns.payee]);
  const fallbackName = columns.name === undefined ? "" : stripInnerSpaces(row[columns.name]);
  const remark = columns.remark === undefined ? "" : clean(row[columns.remark]);
  const name = payeeFromColumn || extractPayeeFromRemark(remark) || fallbackName;
  const beneficiary = stripInnerSpaces(row[columns.beneficiary]);
  const card = normalizeCard(row[columns.card]);
  const amountText = stripInnerSpaces(row[columns.amount]);
  const amount = parseAmount(amountText);
  const idNo = columns.idNo === undefined ? "" : stripInnerSpaces(row[columns.idNo]);
  const unitParts = ["unit"].map((key) => clean(row[columns[key]])).filter(Boolean);
  const unit = unitParts.join(" / ");

  if (!name && !card && !amountText && !idNo && !unit) return null;
  if (!name || !card || !amountText) return null;
  return {
    name,
    beneficiary: beneficiary && beneficiary !== name ? beneficiary : "",
    card,
    amount,
    amountText,
    idNo,
    unit: unit || source.sourceUnit || inferUnit(source.fileName, source.sheetName),
    sourceUnit: source.sourceUnit || "",
    fileName: source.fileName,
    sheetName: source.sheetName,
    rowNumber: source.rowNumber,
  };
}

function isIncompleteAmountRow(row, columns) {
  if (isTotalRow(row)) return false;
  const amountText = columns.amount === undefined ? "" : stripInnerSpaces(row[columns.amount]);
  const hasAmountLikeValue = amountText || row.some((cell) => Number.isFinite(parseAmount(cell)));
  if (!hasAmountLikeValue) return false;

  const payeeFromColumn = columns.payee === undefined ? "" : stripInnerSpaces(row[columns.payee]);
  const fallbackName = columns.name === undefined ? "" : stripInnerSpaces(row[columns.name]);
  const remark = columns.remark === undefined ? "" : clean(row[columns.remark]);
  const name = payeeFromColumn || extractPayeeFromRemark(remark) || fallbackName;
  const card = columns.card === undefined ? "" : normalizeCard(row[columns.card]);
  return !name || !card;
}

function isTotalRow(row) {
  return row.some((cell) => /合计|总计/.test(stripInnerSpaces(cell)));
}

function extractPayeeFromRemark(remark) {
  const match = clean(remark).match(/(?:收款人|开户名|户名|持卡人|领款人|代领人|监护人|母亲|父亲)[:：为是 ]*([\u4e00-\u9fa5]{2,4})/);
  return match ? match[1] : "";
}

function validateRecord(record) {
  const issues = [];
  if (!record.name) {
    issues.push({ level: "error", title: "姓名缺失", message: "未识别到姓名" });
  }
  if (!/^(?:\d{19}|\d{23})$/.test(record.card)) {
    issues.push({ level: "warn", title: "卡号异常", message: "导出时会标黄提示复核" });
  }
  if (!Number.isFinite(record.amount) || record.amount < 0) {
    issues.push({ level: "error", title: "金额异常", message: `金额“${record.amountText || "空"}”不是有效金额` });
  } else if (!hasAllowedAmountPrecision(record.amountText)) {
    issues.push({ level: "error", title: "金额格式异常", message: `金额“${record.amountText}”小数位不能超过两位` });
  }
  if (record.idNo && !/^\d{17}[\dXx]$/.test(record.idNo)) {
    issues.push({ level: "warn", title: "证件号异常", message: "身份证号格式不符合 18 位规则" });
  }
  return issues;
}

function parseAmount(value) {
  const normalized = stripInnerSpaces(value).replace(/,/g, "").replace(/[￥¥元]/g, "");
  if (!normalized) return NaN;
  return Number(normalized);
}

function hasAllowedAmountPrecision(value) {
  const normalized = stripInnerSpaces(value).replace(/,/g, "").replace(/[￥¥元]/g, "");
  return /^\d+(?:\.\d{1,2})?$/.test(normalized);
}

function clean(value) {
  return String(value ?? "").replace(/\u3000/g, " ").trim();
}

function stripInnerSpaces(value) {
  return clean(value).replace(/[\s\u00a0\u1680\u180e\u2000-\u200d\u2028\u2029\u202f\u205f\u2060\ufeff]+/g, "");
}

function inferUnit(fileName, sheetName) {
  const text = `${fileName} ${sheetName}`;
  const match = text.match(/颍东区|[\u4e00-\u9fa5]{2,8}(?:镇|乡|街道|社区|村|单位)/);
  return match ? match[0] : "";
}

function inferSourceUnit(rows, fileName, sheetName) {
  const hints = [fileName, lastPathPart(fileName), sheetName];
  rows.slice(0, 30).forEach((row) => {
    row.slice(0, 12).forEach((cell) => {
      const text = clean(cell);
      if (text && text.length <= 80) hints.push(text);
    });
  });
  return matchReferenceUnit(hints);
}

function resetState(shouldRender = true) {
  state.files = [];
  state.sheetResults = [];
  state.records = [];
  state.issues = [];
  state.filteredRecords = [];
  state.exportSelections = {};
  state.exportSelectionTouched = {};
  state.retryOverrides = {};
  state.retryOverrideTouched = {};
  state.manualUnits = {};
  state.expandedPreviews = {};
  els.fileInput.value = "";
  if (shouldRender) renderAll();
}

function renderAll() {
  renderMetrics();
  renderQueue();
  renderRecords();
  renderExportPreview();
  renderIssues();
}

function renderMetrics() {
  els.fileCount.textContent = state.files.length;
  els.sheetCount.textContent = state.sheetResults.filter((sheet) => sheet.status === "已识别").length;
  els.recordCount.textContent = state.records.length;
  els.issueCount.textContent = state.issues.length;
  els.exportButton.disabled = state.records.length === 0;
}

function renderQueue() {
  if (!state.files.length) {
    els.fileQueue.innerHTML = `<div class="empty">还没有导入文件。</div>`;
    return;
  }

  els.fileQueue.innerHTML = state.files
    .map((file) => {
      const statusClass = getStatusClass(file.status);
      const sheetRows = (file.sheetResults || [])
        .map((sheet) => `
          <div class="sheet-row">
            <span class="sheet-name">${escapeHtml(`${lastPathPart(sheet.fileName)} / ${sheet.sheetName}`)}</span>
            <span class="sheet-reason">${escapeHtml(sheet.reason || "")}</span>
            <span class="chip ${getStatusClass(sheet.status)}">${escapeHtml(sheet.status)}</span>
          </div>
        `)
        .join("");
      return `
        <article class="queue-row">
          <div>
            <p class="queue-title">${escapeHtml(file.name)}</p>
            <p class="queue-meta">${file.entries ? `${file.entries} 个电子表 · ` : ""}${file.sheets} 个明细 sheet · ${file.records} 条记录 · ${file.issues} 个问题</p>
          </div>
          <span class="chip ${statusClass}">${file.status}</span>
          ${sheetRows ? `<div class="sheet-list">${sheetRows}</div>` : ""}
        </article>
      `;
    })
    .join("");
}

function getStatusClass(status) {
  if (status === "已识别") return "ok";
  if (status === "识别中" || status === "需处理" || status === "字段不唯一") return "warn";
  return "error";
}

function renderRecords() {
  state.filteredRecords = getFilteredRecords();

  if (!state.filteredRecords.length) {
    els.recordsBody.innerHTML = `<tr><td colspan="7" class="empty-cell">暂无匹配记录。</td></tr>`;
    return;
  }

  els.recordsBody.innerHTML = state.filteredRecords
    .slice(0, 200)
    .map((record) => {
      const hasError = record.issues.some((issue) => issue.level === "error");
      const hasWarning = record.issues.length > 0;
      return `
        <tr>
          <td>${escapeHtml(record.name)}</td>
          <td>${escapeHtml(record.beneficiary)}</td>
          <td>${escapeHtml(record.card)}</td>
          <td class="amount">${formatAmount(record.amount)}</td>
          <td>${escapeHtml(record.unit)}</td>
          <td>${escapeHtml(record.sheetName)} · ${record.rowNumber} 行</td>
          <td><span class="chip ${hasError ? "warn" : "ok"}">${hasError ? `${record.issues.length} 项问题` : hasWarning ? "需复核" : "正常"}</span></td>
        </tr>
      `;
    })
    .join("");
}

function getFilteredRecords() {
  const keyword = clean(els.searchInput.value).toLowerCase();
  const status = els.statusFilter.value;
  return state.records.filter((record) => {
    const hasError = record.issues.some((issue) => issue.level === "error");
    const issueMatch = status === "all" || (status === "ok" && !hasError) || (status === "issue" && record.issues.length);
    const text = `${record.name} ${record.beneficiary} ${record.card} ${record.unit} ${record.fileName} ${record.sheetName}`.toLowerCase();
    return issueMatch && (!keyword || text.includes(keyword));
  });
}

function renderExportPreview() {
  const plan = buildExportPlan(getFilteredRecords());
  const blockedSheets = state.sheetResults.filter((sheet) => sheet.status !== "已识别");

  els.exportButton.disabled = !plan.groups.some((group) => group.selected);

  if (!plan.groups.length && !blockedSheets.length) {
    els.exportPreview.innerHTML = `<div class="empty">导入后显示将要导出的每张 Excel。</div>`;
    return;
  }

  const cards = plan.groups.map(renderExportCard).join("");
  const blocked = blockedSheets.length
    ? `
      <div class="blocked-sheets">
        <h4>无法生成导出表</h4>
        ${blockedSheets.map(renderBlockedSheet).join("")}
      </div>
    `
    : "";

  els.exportPreview.innerHTML = `
    ${cards || `<div class="empty">当前筛选结果没有可导出的明细表。</div>`}
    ${blocked}
  `;
}

function renderExportCard(group) {
  const expanded = Boolean(state.expandedPreviews[group.id]);
  const issueRows = getExportGroupIssues(group);
  const previewRows = group.records.slice(0, 12);
  const statusClass = group.hasError ? "error" : group.hasWarning ? "warn" : "ok";
  const statusText = group.hasError ? "有错误" : group.hasWarning ? "需复核" : "可导出";
  const ignoredText = group.ignoredRows ? `已忽略 ${group.ignoredRows} 行非明细金额行` : "无";

  return `
    <article class="export-card ${group.selected ? "" : "is-muted"}">
      <div class="export-card-head">
        <label class="export-check">
          <input type="checkbox" data-export-select data-group-id="${escapeHtml(group.id)}" ${group.selected ? "checked" : ""} />
          <span>导出</span>
        </label>
        <div class="export-title">
          <h4>${escapeHtml(group.detailFileName)}</h4>
          <p>${escapeHtml(lastPathPart(group.fileName))} / ${escapeHtml(group.sheetName)}</p>
        </div>
        <span class="chip ${statusClass}">${statusText}</span>
      </div>

      <div class="export-unit-row">
        <div class="unit-input-wrap">
          <label>
            <span>代发单位</span>
            <input data-unit-input data-group-id="${escapeHtml(group.id)}" value="${escapeHtml(group.unitName)}" placeholder="输入简称或关键词，如 向阳、残联、11中" autocomplete="off" />
          </label>
          <div class="unit-suggestions" data-unit-suggestions hidden></div>
        </div>
        <button class="button small" type="button" data-unit-match data-group-id="${escapeHtml(group.id)}">匹配单位</button>
        <span class="unit-source ${group.unitNeedsReview ? "needs-review" : ""}">${escapeHtml(group.unitSource)}</span>
      </div>

      <div class="export-facts">
        <div><strong>${group.records.length}</strong><span>笔数</span></div>
        <div><strong>${formatAmount(group.amount)}</strong><span>金额</span></div>
        <div><strong>${escapeHtml(group.projectCode)}</strong><span>项目代码</span></div>
        <div class="retry-fact">
          <label>
            <input type="checkbox" data-retry-toggle data-group-id="${escapeHtml(group.id)}" ${group.retryMarker ? "checked" : ""} />
            <strong>${group.retryMarker ? "1" : "空"}</strong>
          </label>
          <span>续发标记 E1</span>
        </div>
        <div><strong>${escapeHtml(group.extractionMode || "自动识别")}</strong><span>提取方式</span></div>
        <div><strong>${escapeHtml(group.folderName)}</strong><span>导出文件夹</span></div>
        <div><strong>${escapeHtml(ignoredText)}</strong><span>忽略行</span></div>
      </div>

      ${issueRows.length ? `<div class="export-issues">${issueRows.map((issue) => `<p>${escapeHtml(issue)}</p>`).join("")}</div>` : ""}

      <button class="link-button" type="button" data-preview-toggle data-group-id="${escapeHtml(group.id)}">
        ${expanded ? "收起明细" : "展开明细预览"}
      </button>
      ${
        expanded
          ? `
            <div class="mini-table-wrap">
              <table class="mini-table">
                <thead>
                  <tr><th>姓名</th><th>账户</th><th>金额</th><th>D1</th><th>E1</th></tr>
                </thead>
                <tbody>
                  <tr><td>姓名</td><td>账户</td><td>金额</td><td>${escapeHtml(group.projectCode)}</td><td>${group.retryMarker ? "1" : ""}</td></tr>
                  ${previewRows
                    .map(
                      (record) => `
                        <tr>
                          <td>${escapeHtml(record.name)}</td>
                          <td>${escapeHtml(record.card)}</td>
                          <td class="amount">${formatAmount(record.amount)}</td>
                          <td></td>
                          <td></td>
                        </tr>
                      `,
                    )
                    .join("")}
                </tbody>
              </table>
              ${group.records.length > previewRows.length ? `<p class="preview-more">仅预览前 ${previewRows.length} 行，共 ${group.records.length} 行。</p>` : ""}
            </div>
          `
          : ""
      }
    </article>
  `;
}

function renderBlockedSheet(sheet) {
  return `
    <div class="blocked-sheet">
      <strong>${escapeHtml(lastPathPart(sheet.fileName))} / ${escapeHtml(sheet.sheetName)}</strong>
      <span class="chip ${getStatusClass(sheet.status)}">${escapeHtml(sheet.status)}</span>
      <p>${escapeHtml(sheet.reason || "无法生成明细")}</p>
    </div>
  `;
}

function buildExportPlan(records = getFilteredRecords()) {
  const usedFileNames = new Set();
  const projectCode = getProjectCode();
  const groups = groupRecordsBySource(records).map((group) => {
    const id = getGroupId(group.fileName, group.sheetName);
    const sheetResult = findSheetResult(group.fileName, group.sheetName);
    const unit = resolvePayUnitName(group, id);
    const folder = resolveExportFolder(group, unit.name);
    const amount = sumAmounts(group.records);
    const hasError = group.records.some((record) => record.issues.some((issue) => issue.level === "error"));
    const hasRecordWarning = group.records.some((record) => record.issues.length > 0);
    const retryMarker = resolveRetryMarker(group, id);
    const hasWarning = hasRecordWarning || unit.needsReview || folder.needsReview || Boolean(sheetResult?.ignoredRows);
    if (!state.exportSelectionTouched[id]) state.exportSelections[id] = !hasError;

    return {
      ...group,
      id,
      amount,
      projectCode,
      selected: Boolean(state.exportSelections[id]),
      unitName: unit.name,
      unitSource: unit.source,
      unitNeedsReview: unit.needsReview,
      folderName: folder.name,
      folderSource: folder.source,
      folderNeedsReview: folder.needsReview,
      hasError,
      hasWarning,
      retryMarker,
      ignoredRows: sheetResult?.ignoredRows || 0,
      extractionMode: sheetResult?.extractionMode || "",
      detailFileName: createUniqueFileName(`${unit.name}${group.records.length}笔${formatFileAmount(amount)}元.xlsx`, usedFileNames),
    };
  });
  return { groups };
}

function getExportGroupIssues(group) {
  const issues = [];
  if (group.unitNeedsReview) issues.push("代发单位未匹配到本地全称，请手动输入简称或全称后点击匹配单位");
  if (group.folderNeedsReview) issues.push("导出文件夹未匹配到单位管理表，请检查代发单位或原始文件名");
  if (group.ignoredRows) issues.push(`已忽略 ${group.ignoredRows} 行只有金额或缺少姓名/账户的非明细行`);
  group.records.forEach((record) => {
    record.issues.forEach((issue) => {
      issues.push(`${record.rowNumber} 行：${issue.title}，${issue.message}`);
    });
  });
  return issues.slice(0, 8);
}

function saveManualUnit(groupId, value, shouldRender = false) {
  const text = clean(value);
  if (!text) {
    delete state.manualUnits[groupId];
  } else {
    state.manualUnits[groupId] = matchReferenceUnit([text]) || text;
  }
  if (shouldRender) renderExportPreview();
}

function updateUnitSuggestionPanel(input) {
  const panel = input.closest(".unit-input-wrap")?.querySelector("[data-unit-suggestions]");
  if (!panel) return;

  const suggestions = getUnitSuggestions(input.value);
  if (!suggestions.length) {
    panel.hidden = true;
    panel.innerHTML = "";
    return;
  }

  panel.hidden = false;
  panel.innerHTML = suggestions
    .map(
      (suggestion) => `
        <button type="button" data-unit-suggestion data-group-id="${escapeHtml(input.dataset.groupId)}" data-unit-name="${escapeHtml(suggestion.name)}">
          <strong>${escapeHtml(suggestion.name)}</strong>
          ${suggestion.hint ? `<span>${escapeHtml(suggestion.hint)}</span>` : ""}
        </button>
      `,
    )
    .join("");
}

function getUnitSuggestions(value, limit = 8) {
  const query = clean(value);
  const queryFull = normalizeUnitForMatch(query);
  const queryCore = normalizeUnitCore(query);
  if (!queryFull && !queryCore) return [];

  const scored = new Map();
  unitAliasIndex.forEach((alias) => {
    const score = scoreUnitSuggestion(queryFull, queryCore, alias.full, alias.core);
    if (score > 0) addUnitSuggestionScore(scored, alias.name, score + 12, `简称：${alias.alias}`);
  });
  unitReferenceIndex.forEach((reference) => {
    addUnitSuggestionScore(scored, reference.name, scoreUnitSuggestion(queryFull, queryCore, reference.full, reference.core), "");
  });

  return [...scored.values()]
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || left.name.length - right.name.length || left.name.localeCompare(right.name, "zh-CN"))
    .slice(0, limit);
}

function addUnitSuggestionScore(scored, name, score, hint) {
  if (score <= 0 || !name) return;
  const existing = scored.get(name);
  if (!existing || score > existing.score) scored.set(name, { name, score, hint });
}

function scoreUnitSuggestion(queryFull, queryCore, targetFull, targetCore) {
  const queryTexts = uniqueTexts([queryFull, queryCore]);
  const targetTexts = uniqueTexts([targetFull, targetCore]);
  let score = 0;

  queryTexts.forEach((queryText) => {
    targetTexts.forEach((targetText) => {
      if (!queryText || !targetText) return;
      if (queryText === targetText) score = Math.max(score, 120);
      if (targetText.startsWith(queryText)) score = Math.max(score, 100 + queryText.length);
      if (targetText.includes(queryText)) score = Math.max(score, 80 + queryText.length);
      if (queryText.includes(targetText)) score = Math.max(score, 70 + targetText.length);

      const common = longestCommonSubstringLength(queryText, targetText);
      if (queryText.length >= 2 && common >= Math.min(queryText.length, 3)) {
        score = Math.max(score, 45 + common * 4);
      }
    });
  });

  return score;
}

function resolvePayUnitName(group, groupId) {
  const manual = clean(state.manualUnits[groupId]);
  if (manual) {
    const matchedManual = matchReferenceUnit([manual]);
    if (matchedManual) return { name: matchedManual, source: "手动匹配", needsReview: false };
    return { name: sanitizeName(manual) || "未识别单位", source: "手动输入未匹配", needsReview: true };
  }

  const matchedUnit = matchReferenceUnit(collectUnitCandidates(group));
  if (matchedUnit) return { name: matchedUnit, source: "自动匹配", needsReview: false };

  return { name: inferPayUnitName(group), source: "自动推断需复核", needsReview: true };
}

function resolveExportFolder(group, unitName) {
  const sourceTexts = collectFolderSourceTexts(group);
  const villageMatch = matchVillageFolder(sourceTexts);
  if (villageMatch.status === "matched") {
    return {
      name: villageMatch.folder,
      source: `村居匹配：${villageMatch.village}`,
      needsReview: false,
    };
  }

  const unitFolder = matchUnitFolder([unitName, ...collectUnitCandidates(group)]);
  if (unitFolder) {
    return {
      name: unitFolder.folder,
      source: `单位匹配：${unitFolder.unit}`,
      needsReview: false,
    };
  }

  const townMatch = matchTownFolder(sourceTexts);
  if (townMatch) {
    return {
      name: townMatch.folder,
      source: `乡镇匹配：${townMatch.town}`,
      needsReview: false,
    };
  }

  if (villageMatch.status === "ambiguous") {
    return {
      name: "未分类",
      source: `村居重名：${villageMatch.village}`,
      needsReview: true,
    };
  }

  return { name: "未分类", source: "文件夹未匹配", needsReview: true };
}

function collectFolderSourceTexts(group) {
  return uniqueTexts([group.fileName, lastPathPart(group.fileName), group.sheetName]);
}

function matchVillageFolder(texts) {
  const matches = [];
  uniqueTexts(texts).forEach((text) => {
    const normalized = normalizeUnitForMatch(text);
    if (!normalized) return;
    villageFolderIndex.forEach((village) => {
      let score = 0;
      if (village.full && normalized.includes(village.full)) score = 100;
      else if (village.core && village.core.length >= 3 && normalized.includes(village.core)) score = 80;
      if (!score) return;
      if (hasTownClue(normalized, village.town)) score += 40;
      matches.push({ ...village, score });
    });
  });

  if (!matches.length) return { status: "none" };
  matches.sort((left, right) => right.score - left.score || right.full.length - left.full.length);
  const bestScore = matches[0].score;
  const bestMatches = matches.filter((item) => item.score === bestScore);
  const folders = new Set(bestMatches.map((item) => item.folder));
  if (folders.size > 1) {
    return { status: "ambiguous", village: bestMatches.map((item) => item.village).join("、") };
  }
  return { status: "matched", ...bestMatches[0] };
}

function hasTownClue(normalizedText, town) {
  const normalizedTown = normalizeUnitForMatch(town);
  return normalizedTown && normalizedText.includes(normalizedTown);
}

function matchUnitFolder(candidates) {
  const matchedUnit = matchReferenceUnit(candidates);
  if (matchedUnit && unitFolders[matchedUnit]) return { unit: matchedUnit, folder: unitFolders[matchedUnit] };

  let best = { unit: "", folder: "", score: 0 };
  uniqueTexts(candidates).forEach((candidate) => {
    const full = normalizeUnitForMatch(candidate);
    const core = normalizeUnitCore(candidate);
    if (!isUsableUnitCandidate(full, core)) return;

    unitFolderIndex.forEach((reference) => {
      const score = scoreUnitMatch({ full, core }, reference);
      if (score > best.score) best = { unit: reference.unit, folder: reference.folder, score };
    });
  });

  return best.score >= 0.72 ? best : null;
}

function matchTownFolder(texts) {
  let best = { town: "", folder: "", score: 0 };
  uniqueTexts(texts).forEach((text) => {
    const normalized = normalizeUnitForMatch(text);
    townFolderIndex.forEach((town) => {
      let score = 0;
      if (town.full && normalized.includes(town.full)) score = 100;
      else if (town.core && normalized.includes(town.core)) score = 90;
      if (score > best.score) best = { town: town.town, folder: town.folder, score };
    });
  });
  return best.score ? best : null;
}

function findSheetResult(fileName, sheetName) {
  return state.sheetResults.find((sheet) => sheet.fileName === fileName && sheet.sheetName === sheetName);
}

function hasRetryMarker(group) {
  return /(失败|续发|重发|补发|补打卡|打卡失败)/.test(`${group.fileName} ${group.sheetName}`);
}

function resolveRetryMarker(group, groupId) {
  if (state.retryOverrideTouched[groupId]) return Boolean(state.retryOverrides[groupId]);
  return hasRetryMarker(group);
}

function getGroupId(fileName, sheetName) {
  return `g${hashText(`${fileName}\u0000${sheetName}`)}`;
}

function hashText(text) {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function renderIssues() {
  if (!state.issues.length) {
    els.issuesList.innerHTML = `<div class="empty">暂无问题。</div>`;
    return;
  }

  els.issuesList.innerHTML = state.issues
    .slice(0, 80)
    .map((issue) => `
      <article class="issue-row">
        <strong>${escapeHtml(issue.title)}</strong>
        <p>${escapeHtml(issue.message)}</p>
      </article>
    `)
    .join("");
}

async function exportWorkbook() {
  const exportRecords = getFilteredRecords();
  const groups = buildExportPlan(exportRecords).groups.filter((group) => group.selected);
  if (!groups.length) return;

  const archive = new JSZip();
  const usedFileNames = new Set();
  const projectCode = getProjectCode();
  const projectName = els.projectSelect?.value || "财补";
  const summaryRows = [["代发单位", "导出文件夹", "明细文件名", "笔数", "金额", "项目", "项目代码", "来源表格", "来源Sheet"]];

  for (const group of groups) {
    const unitName = group.unitName;
    const count = group.records.length;
    const amount = sumAmounts(group.records);
    const workbook = XLSX.utils.book_new();
    const rows = [
      ["姓名", "账户", "金额", projectCode, group.retryMarker ? 1 : ""],
      ...group.records.map((record) => [record.name, record.card, formatAmountForExport(record.amount), "", ""]),
    ];
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), "明细");
    const invalidCardCells = group.records.flatMap((record, index) => (isCardText(record.card) ? [] : [`B${index + 2}`]));
    let data = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
    data = await highlightWorkbookCells(data, invalidCardCells);
    const detailFileName = createUniqueFileName(group.detailFileName, usedFileNames);
    const folderName = sanitizeZipPathPart(group.folderName || "未分类");
    archive.file(`${folderName}/${detailFileName}`, data);
    summaryRows.push([unitName, folderName, detailFileName, count, formatAmountForExport(amount), projectName, projectCode, lastPathPart(group.fileName), group.sheetName]);
  }

  const selectedRecords = groups.flatMap((group) => group.records);
  summaryRows.push(["合计", "", "", sumCounts(groups), formatAmountForExport(sumAmounts(selectedRecords)), "", "", "", ""]);
  const summaryWorkbook = XLSX.utils.book_new();
  const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows);
  summarySheet["!cols"] = [
    { wch: 30 },
    { wch: 18 },
    { wch: 38 },
    { wch: 10 },
    { wch: 14 },
    { wch: 12 },
    { wch: 12 },
    { wch: 34 },
    { wch: 20 },
  ];
  XLSX.utils.book_append_sheet(summaryWorkbook, summarySheet, "汇总");
  archive.file(createUniqueFileName("汇总表.xlsx", usedFileNames), XLSX.write(summaryWorkbook, { bookType: "xlsx", type: "array" }));
  appendOriginalInputFiles(archive);

  const blob = await archive.generateAsync({
    type: "blob",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
  downloadBlob(blob, `代发工资明细_${new Date().toISOString().slice(0, 10)}.zip`);
}

function appendOriginalInputFiles(archive) {
  const usedOriginalNames = new Set();
  state.files.forEach((file) => {
    if (!file.originalData) return;
    const originalName = createUniqueOriginalFileName(file.name, usedOriginalNames);
    archive.file(`原始导入文件/${originalName}`, file.originalData);
  });
}

function groupRecordsBySource(records) {
  const groups = new Map();
  records.forEach((record) => {
    const key = `${record.fileName}\u0000${record.sheetName}`;
    if (!groups.has(key)) {
      groups.set(key, {
        fileName: record.fileName,
        sheetName: record.sheetName,
        records: [],
      });
    }
    groups.get(key).records.push(record);
  });
  return [...groups.values()];
}

function getProjectCode() {
  return projectCodes[els.projectSelect?.value] || projectCodes.财补;
}

function sumAmounts(records) {
  return records.reduce((sum, record) => sum + (Number.isFinite(record.amount) ? record.amount : 0), 0);
}

function sumCounts(groups) {
  return groups.reduce((sum, group) => sum + group.records.length, 0);
}

function formatAmountForExport(value) {
  return Number.isFinite(value) ? value.toFixed(2) : "";
}

async function highlightWorkbookCells(workbookData, addresses) {
  if (!addresses.length) return workbookData;

  const archive = await JSZip.loadAsync(workbookData);
  const stylesFile = archive.file("xl/styles.xml");
  const sheetFile = archive.file("xl/worksheets/sheet1.xml");
  if (!stylesFile || !sheetFile) return workbookData;

  const styleResult = addYellowFillStyle(await stylesFile.async("string"));
  archive.file("xl/styles.xml", styleResult.xml);
  archive.file("xl/worksheets/sheet1.xml", patchSheetCellStyles(await sheetFile.async("string"), addresses, styleResult.styleIndex));
  return archive.generateAsync({
    type: "arraybuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
}

function addYellowFillStyle(stylesXml) {
  const fillCountMatch = stylesXml.match(/<fills count="(\d+)">/);
  const xfCountMatch = stylesXml.match(/<cellXfs count="(\d+)">/);
  if (!fillCountMatch || !xfCountMatch) return { xml: stylesXml, styleIndex: 0 };

  const fillIndex = Number(fillCountMatch[1]);
  const styleIndex = Number(xfCountMatch[1]);
  const yellowFill =
    '<fill><patternFill patternType="solid"><fgColor rgb="FFFFFF00"/><bgColor indexed="64"/></patternFill></fill>';
  const yellowXf = `<xf numFmtId="0" fontId="0" fillId="${fillIndex}" borderId="0" xfId="0" applyFill="1"/>`;

  return {
    styleIndex,
    xml: stylesXml
      .replace(/<fills count="(\d+)">/, `<fills count="${fillIndex + 1}">`)
      .replace("</fills>", `${yellowFill}</fills>`)
      .replace(/<cellXfs count="(\d+)">/, `<cellXfs count="${styleIndex + 1}">`)
      .replace("</cellXfs>", `${yellowXf}</cellXfs>`),
  };
}

function patchSheetCellStyles(sheetXml, addresses, styleIndex) {
  let xml = sheetXml;
  uniqueTexts(addresses).forEach((address) => {
    xml = patchSheetCellStyle(xml, address, styleIndex);
  });
  return xml;
}

function patchSheetCellStyle(sheetXml, address, styleIndex) {
  const escapedAddress = escapeRegExp(address);
  const cellPattern = new RegExp(`<c r="${escapedAddress}"([^>]*)>`);
  if (cellPattern.test(sheetXml)) {
    return sheetXml.replace(cellPattern, (match, attrs) => {
      if (/\ss="[^"]*"/.test(attrs)) return match.replace(/\ss="[^"]*"/, ` s="${styleIndex}"`);
      return `<c r="${address}"${attrs} s="${styleIndex}">`;
    });
  }

  const rowNumber = Number(address.match(/\d+$/)?.[0]);
  if (!rowNumber) return sheetXml;

  const rowPattern = new RegExp(`<row r="${rowNumber}"[^>]*>[\\s\\S]*?<\\/row>`);
  return sheetXml.replace(rowPattern, (rowXml) => insertStyledCellInRow(rowXml, address, styleIndex));
}

function insertStyledCellInRow(rowXml, address, styleIndex) {
  const targetCol = columnNameToNumber(address.match(/^[A-Z]+/)?.[0] || "");
  const cellXml = `<c r="${address}" s="${styleIndex}"/>`;
  const cellPattern = /<c r="([A-Z]+)\d+"[^>]*(?:>[\s\S]*?<\/c>|\/>)/g;
  let match;
  while ((match = cellPattern.exec(rowXml))) {
    if (columnNameToNumber(match[1]) > targetCol) {
      return `${rowXml.slice(0, match.index)}${cellXml}${rowXml.slice(match.index)}`;
    }
  }
  return rowXml.replace("</row>", `${cellXml}</row>`);
}

function columnNameToNumber(columnName) {
  return columnName.split("").reduce((sum, char) => sum * 26 + char.charCodeAt(0) - 64, 0);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function collectUnitCandidates(group) {
  const values = [
    group.fileName,
    lastPathPart(group.fileName),
    group.sheetName,
    ...group.records.map((record) => record.sourceUnit),
    ...group.records.map((record) => record.unit),
  ];
  return uniqueTexts(values.flatMap(splitUnitCandidateText));
}

function matchReferenceUnit(candidates) {
  if (!unitReferenceIndex.length) return "";

  let best = { name: "", score: 0 };
  uniqueTexts(candidates).forEach((candidate) => {
    const full = normalizeUnitForMatch(candidate);
    const core = normalizeUnitCore(candidate);
    if (!isUsableUnitCandidate(full, core)) return;

    unitAliasIndex.forEach((alias) => {
      const score = scoreAliasMatch({ full, core }, alias);
      if (score > best.score) best = { name: alias.name, score };
    });

    unitReferenceIndex.forEach((reference) => {
      const score = scoreUnitMatch({ full, core }, reference);
      if (score > best.score) best = { name: reference.name, score };
    });
  });

  return best.score >= 0.72 ? best.name : "";
}

function scoreAliasMatch(candidate, alias) {
  const candidateTexts = [candidate.full, candidate.core].filter(Boolean);
  const aliasTexts = [alias.full, alias.core].filter(Boolean);
  let score = 0;

  candidateTexts.forEach((candidateText) => {
    aliasTexts.forEach((aliasText) => {
      if (!candidateText || !aliasText) return;
      if (candidateText === aliasText) {
        score = Math.max(score, 1.12);
        return;
      }
      if (aliasText.length >= 2 && candidateText.includes(aliasText)) {
        score = Math.max(score, 1.04);
      }
      if (candidateText.length >= 3 && aliasText.includes(candidateText)) {
        score = Math.max(score, 0.98);
      }
    });
  });

  return score;
}

function scoreUnitMatch(candidate, reference) {
  const candidateTexts = [candidate.full, candidate.core].filter(Boolean);
  const referenceTexts = [reference.full, reference.core].filter(Boolean);
  let score = 0;

  candidateTexts.forEach((candidateText) => {
    referenceTexts.forEach((referenceText) => {
      if (!candidateText || !referenceText) return;
      if (candidateText === referenceText) {
        score = Math.max(score, 1);
        return;
      }
      if (candidateText.length >= 3 && referenceText.includes(candidateText)) {
        score = Math.max(score, 0.92 + Math.min(candidateText.length / referenceText.length, 0.06));
      }
      if (referenceText.length >= 3 && candidateText.includes(referenceText)) {
        score = Math.max(score, 0.96);
      }
      if (/^[\u4e00-\u9fa5]{2,8}(?:镇|乡)$/.test(candidateText) && referenceText.includes(`${candidateText}人民政府`)) {
        score = Math.max(score, 0.99);
      }
      if (/^[\u4e00-\u9fa5]{2,8}街道$/.test(candidateText) && referenceText.includes(`${candidateText}办事处`)) {
        score = Math.max(score, 0.99);
      }

      if (candidateText === candidate.core && referenceText === reference.core) {
        const common = longestCommonSubstringLength(candidateText, referenceText);
        const coverage = common / Math.min(candidateText.length, referenceText.length);
        const density = common / Math.max(candidateText.length, referenceText.length);
        if (common >= 3 && coverage >= 0.75) {
          score = Math.max(score, 0.5 + coverage * 0.28 + density * 0.18);
        }
      }
    });
  });

  return score;
}

function isUsableUnitCandidate(full, core) {
  const text = core || full;
  if (!text || text.length < 2) return false;
  if (unitAliasIndex.some((alias) => alias.full === full || alias.core === core || alias.full === text || alias.core === text)) return true;
  if (/^(颍东区|阜阳市|安徽省|单位|部门|乡镇|街道|村居|社区|学校|人民政府)$/.test(text)) return false;
  return text.length >= 3 || unitReferenceIndex.filter((reference) => reference.core.includes(text)).length === 1;
}

function normalizeUnitForMatch(value) {
  return sanitizeName(value)
    .replace(/\.(xlsx|xls|csv|zip)$/gi, "")
    .replace(/人社局/g, "人力资源和社会保障局")
    .replace(/卫健委/g, "卫生健康委员会")
    .replace(/医保局/g, "医疗保障局")
    .replace(/住建局/g, "住房和城乡建设局")
    .replace(/发改委/g, "发展和改革委员会")
    .replace(/经信局/g, "经济和信息化局")
    .replace(/文旅体局/g, "文化旅游体育局")
    .replace(/中心校/g, "中心学校")
    .replace(/插一/g, "插花镇一学区")
    .replace(/\d{4}年\d{0,2}月?/g, "")
    .replace(/\d{1,2}月/g, "")
    .replace(/第[一二三四五六七八九十\d]+(?:批|期)/g, "")
    .replace(
      /(代发工资|工资发放|工资表|花名册|明细表|明细|汇总表|汇总|人员|报酬|补助|补贴|发放|申请|附件|表格|名单|公示|银行转账|标准|模板|财政资金代管账户账簿项|账簿项名称|账簿项账号|单位编号)/g,
      "",
    )
    .replace(/[^\u4e00-\u9fa5A-Za-z0-9]/g, "");
}

function normalizeUnitCore(value) {
  return normalizeUnitForMatch(value)
    .replace(/中国人民政治协商会议安徽省/g, "政协")
    .replace(/中国共产主义青年团/g, "共青团")
    .replace(/中国人民解放军安徽省/g, "")
    .replace(/安徽省|阜阳市|颍东区/g, "");
}

function normalizeVillageCore(value) {
  return normalizeUnitForMatch(value).replace(/(村|社区|居委会)$/g, "");
}

function splitUnitCandidateText(value) {
  const text = clean(value);
  if (!text) return [];
  const withoutExt = text.replace(/\.(xlsx|xls|csv|zip)$/gi, "");
  const parts = withoutExt.split(/[\\/_\-—（）()、，,。；;：:\s]+/).filter(Boolean);
  return [text, withoutExt, lastPathPart(withoutExt), ...parts];
}

function uniqueTexts(values) {
  return [...new Set(values.map(clean).filter(Boolean))];
}

function longestCommonSubstringLength(left, right) {
  let best = 0;
  const previous = new Array(right.length + 1).fill(0);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    let diagonal = 0;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const saved = previous[rightIndex];
      previous[rightIndex] = left[leftIndex - 1] === right[rightIndex - 1] ? diagonal + 1 : 0;
      if (previous[rightIndex] > best) best = previous[rightIndex];
      diagonal = saved;
    }
  }
  return best;
}

function inferPayUnitName(group) {
  const matchedUnit = matchReferenceUnit(collectUnitCandidates(group));
  if (matchedUnit) return matchedUnit;

  const fileUnit = extractUnitNameFromText(lastPathPart(group.fileName));
  if (fileUnit) return fileUnit;

  const dominantUnit = getDominantUnit(group.records);
  if (dominantUnit) return dominantUnit;

  const sheetUnit = extractUnitNameFromText(group.sheetName);
  if (sheetUnit) return sheetUnit;

  return sanitizeName(lastPathPart(group.fileName).replace(/\.(xlsx|xls|csv)$/i, "")) || "未识别单位";
}

function getDominantUnit(records) {
  const counts = new Map();
  records.forEach((record) => {
    const unit = sanitizeName(record.unit);
    if (!unit || unit === "颍东区") return;
    counts.set(unit, (counts.get(unit) || 0) + 1);
  });
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  if (!sorted.length) return "";
  const [unit, count] = sorted[0];
  return count >= Math.max(2, records.length * 0.5) ? unit : "";
}

function extractUnitNameFromText(text) {
  const source = sanitizeName(text.replace(/\.(xlsx|xls|csv|zip)$/i, ""));
  const candidates = [
    source.match(/([\u4e00-\u9fa5]{2,20}(?:局|中心|委员会|办公室|公司|银行|学校|医院|院|所|站|镇|乡|街道|社区|村))/),
    source.match(/([\u4e00-\u9fa5]{2,20}区[\u4e00-\u9fa5]{0,12})/),
  ].filter(Boolean);
  if (candidates.length) return trimUnitName(candidates[0][1]);
  return trimUnitName(source);
}

function trimUnitName(name) {
  return sanitizeName(name)
    .replace(/^\d{4}年?\d{0,2}月?/, "")
    .replace(/^\d{1,2}月/, "")
    .replace(/^(关于|附件|表格|代发|发放)/, "")
    .replace(/(代发工资|工资表|工资|花名册|明细表|明细|汇总表|汇总|人员|报酬|补助|申请|发放|银行转账)+$/g, "")
    .replace(/^[\d._ -]+|[\d._ -]+$/g, "") || "";
}

function sanitizeName(name) {
  return clean(name).replace(/[\\/:*?"<>|[\]]/g, "").replace(/\s+/g, "");
}

function sanitizeZipPathPart(name) {
  return sanitizeName(name).replace(/^\.+|\.+$/g, "") || "未分类";
}

function lastPathPart(fileName) {
  const parts = clean(fileName).split("/");
  return clean(parts[parts.length - 1]) || fileName;
}

function formatFileAmount(amount) {
  return Number.isFinite(amount) ? amount.toFixed(2) : "0.00";
}

function createUniqueFileName(baseName, usedNames) {
  const cleaned = sanitizeName(baseName) || "明细.xlsx";
  const dotIndex = cleaned.toLowerCase().endsWith(".xlsx") ? cleaned.length - 5 : cleaned.length;
  const namePart = cleaned.slice(0, dotIndex);
  const ext = cleaned.toLowerCase().endsWith(".xlsx") ? ".xlsx" : "";
  let fileName = `${namePart}${ext}`;
  let index = 2;
  while (usedNames.has(fileName)) {
    const suffix = `_${index}`;
    fileName = `${namePart}${suffix}${ext}`;
    index += 1;
  }
  usedNames.add(fileName);
  return fileName;
}

function createUniqueOriginalFileName(baseName, usedNames) {
  const cleaned = sanitizeName(baseName) || "原始导入文件";
  const dotIndex = cleaned.lastIndexOf(".");
  const hasExt = dotIndex > 0 && dotIndex < cleaned.length - 1;
  const namePart = hasExt ? cleaned.slice(0, dotIndex) : cleaned;
  const ext = hasExt ? cleaned.slice(dotIndex) : "";
  let fileName = `${namePart}${ext}`;
  let index = 2;
  while (usedNames.has(fileName)) {
    fileName = `${namePart}_${index}${ext}`;
    index += 1;
  }
  usedNames.add(fileName);
  return fileName;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function formatAmount(value) {
  if (!Number.isFinite(value)) return "";
  return value.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function escapeHtml(value) {
  return clean(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

renderAll();
