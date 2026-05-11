(function () {
  const index = window.STANDARD_SEARCH_INDEX || { records: [], products: [], standards: [] };
  const records = index.records || [];

  const searchInput = document.getElementById("searchInput");
  const productFilter = document.getElementById("productFilter");
  const typeFilter = document.getElementById("typeFilter");
  const sortMode = document.getElementById("sortMode");
  const clearButton = document.getElementById("clearButton");
  const results = document.getElementById("results");
  const emptyState = document.getElementById("emptyState");
  const resultTitle = document.getElementById("resultTitle");
  const resultMeta = document.getElementById("resultMeta");
  const stats = document.getElementById("stats");
  const productList = document.getElementById("productList");
  const standardList = document.getElementById("standardList");

  const collator = new Intl.Collator("zh-CN", { numeric: true, sensitivity: "base" });

  function normalize(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/[∕／]/g, "/")
      .replace(/[_\s\-:：()[\]（）【】《》]+/g, "")
      .trim();
  }

  function displayDate(value) {
    if (!value) return "";
    return value.replace("T", " ");
  }

  function fileUrl(path) {
    const directPath = path.startsWith("http://") || path.startsWith("https://") || path.startsWith("files/") || path.startsWith("./");
    const raw = directPath ? path : `../${path}`;
    return raw
      .split("/")
      .map((part, index) => {
        if (index === 0 && /^https?:$/.test(part)) return part;
        if (part === ".." || part === "") return part;
        return encodeURIComponent(part);
      })
      .join("/");
  }

  function recordUrl(record) {
    return record.urlPath || record.path;
  }

  function linkTarget(record) {
    return record.type === "PDF" ? "_self" : "_blank";
  }

  function formatSize(bytes) {
    if (!bytes) return "";
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  function queryTerms(query) {
    return String(query || "")
      .split(/\s+/)
      .map((term) => term.trim())
      .filter(Boolean);
  }

  function scoreRecord(record, terms, product) {
    if (product && record.product !== product) return -1;
    const raw = [
      record.title,
      record.filename,
      record.path,
      record.folder,
      record.product,
      (record.standards || []).join(" "),
      record.searchText,
    ].join(" ");
    const normalized = normalize(raw);
    let score = 0;

    if (!terms.length) return 1;
    for (const term of terms) {
      const termNorm = normalize(term);
      if (!termNorm) continue;
      let termScore = 0;
      if (normalize(record.product).includes(termNorm)) termScore += 80;
      if (normalize((record.standards || []).join(" ")).includes(termNorm)) termScore += 70;
      if (normalize(record.title).includes(termNorm)) termScore += 55;
      if (normalize(record.path).includes(termNorm)) termScore += 35;
      if (normalized.includes(termNorm)) termScore += 18;
      if (!termScore) return -1;
      score += termScore;
    }
    return score;
  }

  function snippet(record, terms) {
    const source = record.text || record.searchText || "";
    if (!source) return "";
    const normalizedSource = normalize(source);
    let pos = -1;
    for (const term of terms) {
      const found = normalizedSource.indexOf(normalize(term));
      if (found >= 0) {
        pos = Math.max(0, found - 80);
        break;
      }
    }
    if (pos < 0) pos = 0;
    const text = source.slice(pos, pos + 240);
    return highlight(text, terms);
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function highlight(value, terms) {
    let html = escapeHtml(value);
    const escapedTerms = terms
      .filter((term) => term.length >= 2)
      .map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    if (!escapedTerms.length) return html;
    const pattern = new RegExp(`(${escapedTerms.join("|")})`, "gi");
    return html.replace(pattern, "<mark>$1</mark>");
  }

  function renderStats() {
    const pdfCount = records.filter((record) => record.type === "PDF").length;
    stats.innerHTML = [
      `<span class="stat">${records.length} 个文件</span>`,
      `<span class="stat">${index.products.length} 个产品类别</span>`,
      `<span class="stat">${index.standards.length} 个标准编号</span>`,
      `<span class="stat">${pdfCount} 个 PDF</span>`,
      `<span class="stat">索引：${displayDate(index.generatedAt)}</span>`,
    ].join("");
  }

  function renderFilters() {
    for (const product of index.products) {
      productFilter.add(new Option(product, product));
    }

    const types = Array.from(new Set(records.map((record) => record.type))).sort(collator.compare);
    for (const type of types) {
      typeFilter.add(new Option(type, type));
    }

    productList.innerHTML = index.products
      .map((product) => `<button class="chip" type="button" data-product="${escapeHtml(product)}">${escapeHtml(product)}</button>`)
      .join("");

    const popularStandards = index.standards.slice(0, 70);
    standardList.innerHTML = popularStandards
      .map((standard) => `<button class="standard-link" type="button" data-standard="${escapeHtml(standard)}">${escapeHtml(standard)}</button>`)
      .join("");
  }

  function sortRecords(items) {
    const mode = sortMode.value;
    return items.sort((a, b) => {
      if (mode === "score") return b._score - a._score || collator.compare(a.title, b.title);
      if (mode === "product") return collator.compare(a.product, b.product) || collator.compare(a.title, b.title);
      if (mode === "title") return collator.compare(a.title, b.title);
      if (mode === "modified") return collator.compare(b.modified, a.modified);
      return 0;
    });
  }

  function renderResults() {
    const terms = queryTerms(searchInput.value);
    const product = productFilter.value;
    const type = typeFilter.value;
    let matched = records
      .map((record) => ({ ...record, _score: scoreRecord(record, terms, product) }))
      .filter((record) => record._score >= 0 && (!type || record.type === type));

    matched = sortRecords(matched);
    resultTitle.textContent = terms.length ? `搜索：${searchInput.value}` : product || "全部文件";
    resultMeta.textContent = `找到 ${matched.length} 个文件`;
    emptyState.hidden = matched.length > 0;
    results.hidden = matched.length === 0;

    results.innerHTML = matched
      .slice(0, 300)
      .map((record) => {
        const standards = (record.standards || []).slice(0, 8);
        const shownSnippet = snippet(record, terms);
        const badges = [
          `<span class="badge">${escapeHtml(record.product)}</span>`,
          `<span class="badge">${escapeHtml(record.type)}</span>`,
          ...standards.map((standard) => `<span class="badge">${escapeHtml(standard)}</span>`),
        ].join("");
        return `
          <article class="result-card">
            <div class="result-main">
              <div>
                <h3><a class="open-document" href="${fileUrl(recordUrl(record))}" target="${linkTarget(record)}" rel="noreferrer">${highlight(record.title, terms)}</a></h3>
                <div class="meta">${escapeHtml(record.folder)} / ${escapeHtml(record.filename)}</div>
              </div>
              <div class="meta">${formatSize(record.size)}${record.pageCount ? ` · ${record.pageCount} 页` : ""}</div>
            </div>
            <div class="badges">${badges}</div>
            ${shownSnippet ? `<p class="snippet">${shownSnippet}</p>` : ""}
            ${record.note ? `<p class="note">${escapeHtml(record.note)}</p>` : ""}
          </article>
        `;
      })
      .join("");
  }

  function syncActiveProducts() {
    const current = productFilter.value;
    productList.querySelectorAll(".chip").forEach((button) => {
      button.classList.toggle("active", button.dataset.product === current);
    });
  }

  function update() {
    syncActiveProducts();
    renderResults();
  }

  renderStats();
  renderFilters();
  renderResults();

  searchInput.addEventListener("input", update);
  productFilter.addEventListener("change", update);
  typeFilter.addEventListener("change", update);
  sortMode.addEventListener("change", update);
  clearButton.addEventListener("click", () => {
    searchInput.value = "";
    productFilter.value = "";
    typeFilter.value = "";
    sortMode.value = "score";
    update();
    searchInput.focus();
  });
  productList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-product]");
    if (!button) return;
    productFilter.value = productFilter.value === button.dataset.product ? "" : button.dataset.product;
    update();
  });
  standardList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-standard]");
    if (!button) return;
    searchInput.value = button.dataset.standard;
    update();
    searchInput.focus();
  });
})();
