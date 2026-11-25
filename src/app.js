(function () {
  'use strict';

  const Parser = window.FormulaParser;
  const STORAGE_KEY = 'foliotex:v1';
  const LEGACY_STORAGE_KEY = 'formula-extractor:v1';
  const PASTE_CACHE_KEY = 'foliotex:paste:v1';
  const LEGACY_PASTE_CACHE_KEY = 'formula-extractor:paste:v1';
  const PASTE_CACHE_LIMIT = 1500000;
  const FORMATS = ['markdown', 'paren', 'raw', 'original'];

  const els = {
    workbench: document.getElementById('workbench'),
    inputPane: document.getElementById('inputPane'),
    splitResizer: document.getElementById('splitResizer'),
    toggleInputBtn: document.getElementById('toggleInputBtn'),
    inputText: document.getElementById('inputText'),
    inputCount: document.getElementById('inputCount'),
    extractBtn: document.getElementById('extractBtn'),
    pasteBtn: document.getElementById('pasteBtn'),
    emptyPasteBtn: document.getElementById('emptyPasteBtn'),
    exampleBtn: document.getElementById('exampleBtn'),
    emptyExampleBtn: document.getElementById('emptyExampleBtn'),
    clearBtn: document.getElementById('clearBtn'),
    includeCode: document.getElementById('includeCode'),
    dedupe: document.getElementById('dedupe'),
    notice: document.getElementById('notice'),
    resultsPanel: document.getElementById('resultsPanel'),
    results: document.getElementById('results'),
    docView: document.getElementById('docView'),
    docTip: document.getElementById('docTip'),
    emptyState: document.getElementById('emptyState'),
    stats: document.getElementById('stats'),
    viewGroup: document.getElementById('viewGroup'),
    filterGroup: document.getElementById('filterGroup'),
    searchInput: document.getElementById('searchInput'),
    formatSelect: document.getElementById('formatSelect'),
    formulaSheetBtn: document.getElementById('formulaSheetBtn'),
    formulaSheetBtnLabel: document.getElementById('formulaSheetBtnLabel'),
    copyDocBtn: document.getElementById('copyDocBtn'),
    copyAllBtn: document.getElementById('copyAllBtn'),
    exportBtn: document.getElementById('exportBtn'),
    formulaSheetModal: document.getElementById('formulaSheetModal'),
    formulaSheetSubtitle: document.getElementById('formulaSheetSubtitle'),
    formulaSheetBody: document.getElementById('formulaSheetBody'),
    formulaSheetClose: document.getElementById('formulaSheetClose'),
    themeToggle: document.getElementById('themeToggle'),
    themeIcon: document.getElementById('themeIcon'),
    cardTemplate: document.getElementById('cardTemplate'),
    exampleText: document.getElementById('exampleText'),
    toast: document.getElementById('toast')
  };

  const state = {
    input: '',
    formulas: [],
    formulasInput: '',
    format: 'markdown',
    view: 'doc',
    filter: 'all',
    search: '',
    includeCode: false,
    dedupe: true,
    theme: '',
    inputCollapsed: false,
    splitWidth: 39,
    lastPasteHtml: '',
    lastPasteText: ''
  };

  let saveTimer = null;
  let toastTimer = null;
  let docFormulaEntries = [];

  function normalizeFormula(formula) {
    if (!formula || typeof formula.source !== 'string' || !formula.source.trim()) return null;
    return {
      source: formula.source,
      originalSource: typeof formula.originalSource === 'string' ? formula.originalSource : formula.source,
      type: formula.type === 'display' ? 'display' : 'inline',
      wrapper: typeof formula.wrapper === 'string' ? formula.wrapper : 'text',
      origin: ['text', 'html', 'code'].indexOf(formula.origin) !== -1 ? formula.origin : 'text',
      contextBefore: typeof formula.contextBefore === 'string' ? formula.contextBefore : '',
      contextAfter: typeof formula.contextAfter === 'string' ? formula.contextAfter : '',
      start: Number.isFinite(formula.start) ? formula.start : -1,
      end: Number.isFinite(formula.end) ? formula.end : -1
    };
  }

  function loadState() {
    let saved = null;
    try {
      const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY);
      saved = JSON.parse(raw || 'null');
    } catch (error) {
      saved = null;
    }
    if (!saved || typeof saved !== 'object') return;

    state.input = typeof saved.input === 'string' ? saved.input : '';
    state.formulasInput = typeof saved.formulasInput === 'string' ? saved.formulasInput : '';
    state.includeCode = !!saved.includeCode;
    state.dedupe = saved.dedupe !== false;
    state.format = FORMATS.indexOf(saved.format) !== -1 ? saved.format : 'markdown';
    state.view = saved.view === 'cards' || saved.view === 'doc' ? saved.view : 'doc';

    if (Array.isArray(saved.formulas)) {
      state.formulas = saved.formulas.map(normalizeFormula).filter(Boolean);
    }

    if (saved.theme === 'dark' || saved.theme === 'light') {
      state.theme = saved.theme;
    }

    if (typeof saved.inputCollapsed === 'boolean') {
      state.inputCollapsed = saved.inputCollapsed;
    }

    if (typeof saved.splitWidth === 'number' && Number.isFinite(saved.splitWidth)) {
      state.splitWidth = Math.min(62, Math.max(24, saved.splitWidth));
    }

    try {
      const rawPaste = sessionStorage.getItem(PASTE_CACHE_KEY) || sessionStorage.getItem(LEGACY_PASTE_CACHE_KEY);
      const cached = JSON.parse(rawPaste || 'null');
      if (cached && cached.text === state.input && typeof cached.html === 'string') {
        state.lastPasteHtml = cached.html;
        state.lastPasteText = cached.text;
      }
    } catch (error) {
      // The rich paste cache is best-effort only.
    }
  }

  function savePasteCache(html, text) {
    try {
      if (!html || !text || html.length > PASTE_CACHE_LIMIT) {
        sessionStorage.removeItem(PASTE_CACHE_KEY);
        return;
      }
      sessionStorage.setItem(PASTE_CACHE_KEY, JSON.stringify({ text: text, html: html }));
    } catch (error) {
      // Quota or privacy mode can reject sessionStorage writes.
    }
  }

  function saveState() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
          input: state.input,
          formulas: state.formulas,
          formulasInput: state.formulasInput,
          format: state.format,
          view: state.view,
          includeCode: state.includeCode,
          dedupe: state.dedupe,
          theme: state.theme,
          inputCollapsed: state.inputCollapsed,
          splitWidth: state.splitWidth
        }));
      } catch (error) {
        // A very large clipboard can exceed the localStorage quota.
      }
    }, 180);
  }

  function preferredTheme() {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  const ICON_SUN = '<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="9" r="3.4"/><line x1="9" y1="2" x2="9" y2="3.4"/><line x1="9" y1="14.6" x2="9" y2="16"/><line x1="2" y1="9" x2="3.4" y2="9"/><line x1="14.6" y1="9" x2="16" y2="9"/><line x1="4.05" y1="4.05" x2="5.05" y2="5.05"/><line x1="12.95" y1="12.95" x2="13.95" y2="13.95"/><line x1="13.95" y1="4.05" x2="12.95" y2="5.05"/><line x1="5.05" y1="12.95" x2="4.05" y2="13.95"/></svg>';
  const ICON_MOON = '<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14.6 10.65A5.85 5.85 0 0 1 7.35 3.4 5.95 5.95 0 1 0 14.6 10.65Z"/></svg>';

  function applyTheme(theme) {
    const resolved = theme === 'dark' ? 'dark' : 'light';
    state.theme = resolved;
    document.documentElement.dataset.theme = resolved;
    els.themeIcon.innerHTML = resolved === 'dark' ? ICON_SUN : ICON_MOON;
    els.themeToggle.setAttribute('aria-label', resolved === 'dark' ? '切换到浅色纸面' : '切换到深色书房');
    els.themeToggle.title = resolved === 'dark' ? '切换到浅色纸面' : '切换到深色书房';
  }

  function applySplitWidth(percent) {
    const clamped = Math.min(62, Math.max(24, Number(percent) || 39));
    state.splitWidth = clamped;
    document.documentElement.style.setProperty('--split-width', clamped.toFixed(2) + '%');
  }

  function applyInputCollapsed(collapsed) {
    state.inputCollapsed = !!collapsed;
    if (els.workbench) {
      els.workbench.classList.toggle('input-collapsed', state.inputCollapsed);
    }
    if (els.toggleInputBtn) {
      els.toggleInputBtn.setAttribute('aria-pressed', state.inputCollapsed ? 'true' : 'false');
      const label = els.toggleInputBtn.querySelector('.toggle-input-label');
      if (label) label.textContent = state.inputCollapsed ? '展开输入' : '收起输入';
    }
  }

  function toggleInputPane() {
    applyInputCollapsed(!state.inputCollapsed);
    saveState();
  }

  function initSplitResizer() {
    if (!els.splitResizer || !els.workbench) return;

    els.splitResizer.addEventListener('pointerdown', function (event) {
      if (window.innerWidth <= 900 || state.inputCollapsed) return;
      event.preventDefault();
      els.workbench.classList.add('is-resizing');
      els.splitResizer.setPointerCapture(event.pointerId);

      function onMove(moveEvent) {
        const rect = els.workbench.getBoundingClientRect();
        if (!rect.width) return;
        const pct = ((moveEvent.clientX - rect.left) / rect.width) * 100;
        applySplitWidth(pct);
      }

      function onUp() {
        els.workbench.classList.remove('is-resizing');
        els.splitResizer.removeEventListener('pointermove', onMove);
        els.splitResizer.removeEventListener('pointerup', onUp);
        els.splitResizer.removeEventListener('pointercancel', onUp);
        saveState();
      }

      els.splitResizer.addEventListener('pointermove', onMove);
      els.splitResizer.addEventListener('pointerup', onUp);
      els.splitResizer.addEventListener('pointercancel', onUp);
    });

    els.splitResizer.addEventListener('dblclick', function () {
      applySplitWidth(39);
      saveState();
    });
  }

  function toggleTheme() {
    applyTheme(state.theme === 'dark' ? 'light' : 'dark');
    saveState();
  }

  function updateInputCount() {
    const count = state.input.length;
    els.inputCount.textContent = count.toLocaleString('zh-CN') + ' 字符';
  }

  function setNotice(messages, type) {
    const list = (messages || []).filter(Boolean);
    if (!list.length) {
      els.notice.hidden = true;
      els.notice.textContent = '';
      els.notice.className = 'notice';
      return;
    }
    els.notice.hidden = false;
    els.notice.className = 'notice' + (type === 'warn' ? ' warn' : '');
    els.notice.textContent = list.join(' ');
  }

  function showToast(message, isError) {
    clearTimeout(toastTimer);
    els.toast.textContent = message;
    els.toast.className = 'toast show' + (isError ? ' error' : '');
    toastTimer = setTimeout(function () {
      els.toast.classList.remove('show');
    }, 2200);
  }

  function legacyCopy(text) {
    const previousFocus = document.activeElement;
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    textarea.style.top = '0';
    document.body.appendChild(textarea);
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);
    let copied = false;
    try {
      copied = document.execCommand('copy');
    } catch (error) {
      copied = false;
    }
    textarea.remove();
    if (previousFocus && typeof previousFocus.focus === 'function') {
      previousFocus.focus();
    }
    return copied;
  }

  async function copyText(text) {
    if (!text) return false;
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (error) {
        // file:// pages or a denied permission can reject the async API.
      }
    }
    return legacyCopy(text);
  }

  function copyFormula(formula, rawOnly) {
    const text = rawOnly
      ? Parser.stripOuterDelimiters(formula.source)
      : Parser.formatFormula(formula, state.format);
    if (!text) {
      showToast('公式为空，无法复制', true);
      return;
    }
    copyText(text).then(function (copied) {
      showToast(copied ? (rawOnly ? '已复制源码' : '已复制公式') : '复制失败，请手动选择源码复制', !copied);
    }).catch(function () {
      showToast('复制失败，请手动选择源码复制', true);
    });
  }

  function copyAll() {
    const parts = state.formulas.map(function (formula) {
      return Parser.formatFormula(formula, state.format);
    }).filter(Boolean);

    if (!parts.length) {
      showToast('还没有可复制的公式', true);
      return;
    }

    copyText(parts.join('\n\n')).then(function (copied) {
      showToast(copied ? '已复制全部 ' + parts.length + ' 个公式' : '复制失败，请手动选择源码复制', !copied);
    }).catch(function () {
      showToast('复制失败，请手动选择源码复制', true);
    });
  }

  function formatFileDate(date) {
    const pad = function (value) { return String(value).padStart(2, '0'); };
    return String(date.getFullYear()) + pad(date.getMonth() + 1) + pad(date.getDate()) + '-' + pad(date.getHours()) + pad(date.getMinutes());
  }

  function exportMarkdown() {
    const parts = state.formulas.map(function (formula) {
      return Parser.formatFormula(formula, state.format);
    }).filter(Boolean);

    if (!parts.length) {
      showToast('还没有可导出的公式', true);
      return;
    }

    const blob = new Blob([parts.join('\n\n') + '\n'], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'foliotex-' + formatFileDate(new Date()) + '.md';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    showToast('已导出 ' + parts.length + ' 个公式');
  }

  function getVisibleFormulas() {
    const search = state.search.trim().toLowerCase();
    return state.formulas.map(function (formula, index) {
      return { formula: formula, index: index };
    }).filter(function (item) {
      const formula = item.formula;
      if (state.filter === 'inline' && formula.type !== 'inline') return false;
      if (state.filter === 'display' && formula.type !== 'display') return false;
      if (!search) return true;
      return formula.source.toLowerCase().indexOf(search) !== -1;
    });
  }

  function updateStats(visibleCount) {
    const total = state.formulas.length;
    if (!total) {
      els.stats.textContent = state.input.trim() ? '未找到公式 · 全文已渲染' : '等待提取';
      return;
    }

    const inline = state.formulas.filter(function (formula) { return formula.type === 'inline'; }).length;
    const display = total - inline;
    let text = '共 ' + total + ' 个公式 · 行内 ' + inline + ' · 行间 ' + display;
    if (visibleCount !== total) text += ' · 当前显示 ' + visibleCount;
    if (state.input !== state.formulasInput) text += ' · 输入已修改';
    els.stats.textContent = text;
  }

  function updateFilterButtons() {
    els.filterGroup.querySelectorAll('button').forEach(function (button) {
      button.classList.toggle('active', button.dataset.filter === state.filter);
    });
  }

  function autoSizeSource(textarea) {
    textarea.style.height = 'auto';
    const height = Math.min(260, Math.max(42, textarea.scrollHeight + 2));
    textarea.style.height = height + 'px';
    textarea.style.overflowY = textarea.scrollHeight > 260 ? 'auto' : 'hidden';
  }

  function renderPreview(container, formula) {
    container.classList.toggle('is-inline', formula.type === 'inline');
    const source = Parser.getPreviewSource(formula.source);
    if (!source) {
      container.replaceChildren();
      return;
    }
    if (!window.katex) {
      container.textContent = source;
      return;
    }
    try {
      window.katex.render(source, container, {
        displayMode: formula.type === 'display',
        throwOnError: false,
        strict: 'ignore',
        trust: false,
        maxExpand: 1000,
        output: 'htmlAndMathml'
      });
    } catch (error) {
      container.replaceChildren();
      const message = document.createElement('span');
      message.className = 'preview-error';
      message.textContent = '预览失败：' + error.message;
      container.appendChild(message);
    }
  }

  const FORMAT_LABELS = {
    markdown: 'Markdown（$ / $$）',
    paren: 'LaTeX 括号（\\( / \\[）',
    raw: '纯公式',
    original: '原始包装'
  };

  const INLINE_MARK_RE = /(`[^`\n]+`|\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)|\*\*\*((?:[^*\n]|\*(?!\*\*))+?)\*\*\*(?!\*)|\*\*((?:[^*\n]|\*(?!\*))+?)\*\*(?!\*)|~~((?:[^~\n]|~(?!~))+?)~~|\*(?!\s)((?:[^*\n]*?[^\s*])|[^\s*])\*(?!\*))/g;

  const HTML_MATH_SOURCE_SELECTOR = 'annotation[encoding*="x-tex"], script[type^="math/tex"], [data-latex], [data-tex]';

  const DOC_ALLOWED_TAGS = new Set([
    'P', 'DIV', 'SPAN', 'BR', 'HR', 'STRONG', 'B', 'EM', 'I', 'U', 'S', 'DEL', 'INS', 'MARK', 'SMALL',
    'SUB', 'SUP', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
    'UL', 'OL', 'LI', 'DL', 'DT', 'DD', 'BLOCKQUOTE', 'PRE', 'CODE', 'A',
    'TABLE', 'THEAD', 'TBODY', 'TFOOT', 'TR', 'TD', 'TH', 'CAPTION', 'COLGROUP', 'COL',
    'FIGURE', 'FIGCAPTION', 'DETAILS', 'SUMMARY'
  ]);

  const DOC_DROP_TAGS = new Set([
    'SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'IFRAME', 'OBJECT', 'EMBED', 'SVG', 'MATH',
    'IMG', 'VIDEO', 'AUDIO', 'CANVAS', 'LINK', 'META', 'INPUT', 'BUTTON', 'TEXTAREA',
    'SELECT', 'OPTION', 'FORM', 'MJX-CONTAINER'
  ]);

  function makeDocFormula(source, type, renderType) {
    const renderAs = renderType === 'display' || renderType === 'inline' ? renderType : type;
    const span = document.createElement('span');
    span.className = 'doc-formula ' + (renderAs === 'display' ? 'doc-display' : 'doc-inline');
    span.setAttribute('data-doc-formula', '1');
    span.dataset.source = source;
    span.dataset.type = type;
    span.dataset.render = renderAs;
    span.setAttribute('role', 'button');
    span.tabIndex = 0;
    span.title = '点击复制公式（Shift+点击复制纯源码）';
    return span;
  }

  function buildDocLookup() {
    const byKey = new Map();
    const bySource = new Map();
    state.formulas.forEach(function (formula) {
      const key = formula.type + '::' + Parser.normalizeSource(formula.originalSource);
      if (!byKey.has(key)) byKey.set(key, formula);
      const sourceKey = Parser.normalizeSource(formula.originalSource);
      if (!bySource.has(sourceKey)) bySource.set(sourceKey, formula);
    });
    return { byKey: byKey, bySource: bySource };
  }

  function resolveDocFormula(lookup, source, type) {
    const normalized = Parser.normalizeSource(source);
    return lookup.byKey.get(type + '::' + normalized) || lookup.bySource.get(normalized) || {
      source: source,
      originalSource: source,
      type: type,
      wrapper: 'text',
      origin: 'text'
    };
  }

  function hasActiveSelection() {
    if (!window.getSelection) return false;
    const sel = window.getSelection();
    return !!(sel && !sel.isCollapsed && sel.toString().trim().length > 0);
  }

  function cleanHeadingLabel(el) {
    if (!el) return '';
    const clone = el.cloneNode(true);
    clone.querySelectorAll('.katex-mathml').forEach(function (n) { n.remove(); });
    return (clone.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function hydrateDocFormulas(root) {
    const lookup = buildDocLookup();
    docFormulaEntries = [];

    // Track nearest preceding heading for each formula so Formula Sheet can group by section
    const flowNodes = Array.from(root.querySelectorAll('h1, h2, h3, h4, [data-doc-formula]'));
    const sectionBySpan = new Map();
    let currentSection = '';
    flowNodes.forEach(function (node) {
      if (/^H[1-4]$/.test(node.tagName)) {
        currentSection = cleanHeadingLabel(node);
      } else {
        sectionBySpan.set(node, currentSection);
      }
    });

    root.querySelectorAll('[data-doc-formula]').forEach(function (span, idx) {
      const source = span.dataset.source || '';
      if (!source) return;
      const type = span.dataset.type === 'display' ? 'display' : 'inline';
      const renderType = span.dataset.render === 'display' ? 'display' : 'inline';
      const formula = resolveDocFormula(lookup, source, type);
      span.title = '点击复制公式（Shift+点击复制纯源码）';
      renderPreview(span, {
        source: formula.source,
        type: renderType
      });

      docFormulaEntries.push({
        index: idx + 1,
        section: sectionBySpan.get(span) || '',
        formula: formula,
        renderType: renderType,
        span: span
      });

      function copyThis(rawOnly) {
        copyFormula(formula, !!rawOnly);
        span.classList.remove('copied');
        void span.offsetWidth;
        span.classList.add('copied');
      }

      span.addEventListener('click', function (event) {
        if (hasActiveSelection()) return;
        copyThis(event.shiftKey);
      });
      span.addEventListener('keydown', function (event) {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        copyThis(event.shiftKey);
      });
      span.addEventListener('animationend', function () {
        span.classList.remove('copied');
      });
    });

    updateFormulaSheetButton();
  }

  function updateFormulaSheetButton() {
    if (!els.formulaSheetBtn) return;
    const count = docFormulaEntries.length;
    const show = state.view === 'doc' && count > 0;
    els.formulaSheetBtn.hidden = !show;
    if (show) {
      if (els.formulaSheetBtnLabel) {
        els.formulaSheetBtnLabel.textContent = '公式速览 (' + count + ')';
      } else {
        els.formulaSheetBtn.textContent = '公式速览 (' + count + ')';
      }
    }
  }

  function closeFormulaSheet() {
    if (!els.formulaSheetModal) return;
    els.formulaSheetModal.hidden = true;
  }

  function openFormulaSheet() {
    if (!els.formulaSheetModal || !els.formulaSheetBody || !docFormulaEntries.length) {
      showToast('当前全文视图中没有可速览的公式', true);
      return;
    }

    const displayCount = docFormulaEntries.filter(function (e) { return e.formula.type === 'display'; }).length;
    const inlineCount = docFormulaEntries.length - displayCount;
    els.formulaSheetSubtitle.textContent =
      '共 ' + docFormulaEntries.length + ' 个公式（行间 ' + displayCount + ' · 行内 ' + inlineCount + '）· 直接点击公式即可复制';

    els.formulaSheetBody.replaceChildren();

    const groups = [];
    docFormulaEntries.forEach(function (entry) {
      const label = entry.section || '公式列表';
      const last = groups[groups.length - 1];
      if (last && last.label === label) last.items.push(entry);
      else groups.push({ label: label, items: [entry] });
    });

    const frag = document.createDocumentFragment();
    groups.forEach(function (group) {
      const sec = document.createElement('section');
      if (groups.length > 1 || group.label !== '公式列表') {
        const h = document.createElement('h3');
        h.className = 'sheet-section-title';
        h.textContent = group.label;
        sec.appendChild(h);
      }

      const list = document.createElement('div');
      list.className = 'sheet-list';

      group.items.forEach(function (entry) {
        const row = document.createElement('div');
        row.className = 'sheet-row';

        const bar = document.createElement('div');
        bar.className = 'sheet-row-bar';

        const meta = document.createElement('div');
        meta.className = 'sheet-row-meta';
        meta.textContent = '(' + entry.index + ') · ' + (entry.formula.type === 'display' ? '行间' : '行内');

        const actions = document.createElement('div');
        actions.className = 'sheet-row-actions';

        const jumpBtn = document.createElement('button');
        jumpBtn.type = 'button';
        jumpBtn.className = 'sheet-action-btn';
        jumpBtn.textContent = '定位 ↵';
        jumpBtn.addEventListener('click', function () {
          closeFormulaSheet();
          entry.span.scrollIntoView({ behavior: 'smooth', block: 'center' });
          entry.span.classList.remove('eq-highlight');
          void entry.span.offsetWidth;
          entry.span.classList.add('eq-highlight');
        });

        const copyBtn = document.createElement('button');
        copyBtn.type = 'button';
        copyBtn.className = 'sheet-action-btn primary';
        copyBtn.textContent = '复制 LaTeX';

        function copyEntry(event) {
          if (hasActiveSelection()) return;
          copyFormula(entry.formula, !!(event && event.shiftKey));
          copyBtn.textContent = '已复制 ✓';
          row.classList.add('is-copied');
          setTimeout(function () {
            copyBtn.textContent = '复制 LaTeX';
            row.classList.remove('is-copied');
          }, 1100);
        }

        copyBtn.addEventListener('click', copyEntry);

        actions.appendChild(jumpBtn);
        actions.appendChild(copyBtn);
        bar.appendChild(meta);
        bar.appendChild(actions);

        const eqBox = document.createElement('div');
        eqBox.className = 'sheet-eq-box';
        eqBox.title = '点击复制公式（Shift+点击复制纯源码）';
        eqBox.addEventListener('click', copyEntry);
        renderPreview(eqBox, {
          source: entry.formula.source,
          type: entry.formula.type
        });

        row.appendChild(bar);
        row.appendChild(eqBox);
        list.appendChild(row);
      });

      sec.appendChild(list);
      frag.appendChild(sec);
    });

    els.formulaSheetBody.appendChild(frag);
    els.formulaSheetModal.hidden = false;
  }

  function appendTextWithPlaceholders(parent, value, transform, placeholders, placeholderRe) {
    if (!value) return;
    if (!placeholders || !placeholders.length || !placeholderRe) {
      parent.appendChild(document.createTextNode(transform ? transform(value) : value));
      return;
    }
    placeholderRe.lastIndex = 0;
    let last = 0;
    let match;
    while ((match = placeholderRe.exec(value))) {
      if (match.index > last) {
        const chunk = value.slice(last, match.index);
        parent.appendChild(document.createTextNode(transform ? transform(chunk) : chunk));
      }
      const occ = placeholders[Number(match[1])];
      if (occ) {
        parent.appendChild(makeDocFormula(occ.source, occ.type));
      }
      last = match.index + match[0].length;
    }
    if (last < value.length) {
      const rest = value.slice(last);
      parent.appendChild(document.createTextNode(transform ? transform(rest) : rest));
    }
  }

  function appendFormattedLine(parent, line, transform, placeholders, placeholderRe, depth) {
    if (!line) return;
    const level = depth || 0;
    if (level > 6) {
      appendTextWithPlaceholders(parent, line, transform, placeholders, placeholderRe);
      return;
    }

    const re = new RegExp(INLINE_MARK_RE.source, 'g');
    let last = 0;
    let match;
    while ((match = re.exec(line))) {
      if (match.index > last) {
        appendTextWithPlaceholders(parent, line.slice(last, match.index), transform, placeholders, placeholderRe);
      }
      const token = match[0];
      if (token.charAt(0) === '`') {
        const code = document.createElement('code');
        appendTextWithPlaceholders(code, token.slice(1, -1), null, placeholders, placeholderRe);
        parent.appendChild(code);
      } else if (match[2] != null && match[3] != null) {
        const a = document.createElement('a');
        a.href = match[3];
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        appendFormattedLine(a, match[2], transform, placeholders, placeholderRe, level + 1);
        parent.appendChild(a);
      } else if (match[4] != null) {
        const strong = document.createElement('strong');
        const em = document.createElement('em');
        appendFormattedLine(em, match[4], transform, placeholders, placeholderRe, level + 1);
        strong.appendChild(em);
        parent.appendChild(strong);
      } else if (match[5] != null) {
        const strong = document.createElement('strong');
        appendFormattedLine(strong, match[5], transform, placeholders, placeholderRe, level + 1);
        parent.appendChild(strong);
      } else if (match[6] != null) {
        const del = document.createElement('del');
        appendFormattedLine(del, match[6], transform, placeholders, placeholderRe, level + 1);
        parent.appendChild(del);
      } else if (match[7] != null) {
        const em = document.createElement('em');
        appendFormattedLine(em, match[7], transform, placeholders, placeholderRe, level + 1);
        parent.appendChild(em);
      } else {
        appendTextWithPlaceholders(parent, token, transform, placeholders, placeholderRe);
      }
      last = match.index + token.length;
    }
    if (last < line.length) {
      appendTextWithPlaceholders(parent, line.slice(last), transform, placeholders, placeholderRe);
    }
  }

  function appendFormattedText(parent, text, transform, placeholders, placeholderRe) {
    if (!text) return;
    const lines = text.split('\n');
    lines.forEach(function (line, index) {
      if (index > 0) parent.appendChild(document.createElement('br'));
      appendFormattedLine(parent, line, transform, placeholders, placeholderRe, 0);
    });
  }

  function appendInlineSegment(parent, text, segStart, segEnd, inlineOccurrences, transform) {
    if (segStart >= segEnd) return;
    if (!inlineOccurrences.length) {
      appendFormattedText(parent, text.slice(segStart, segEnd), transform);
      return;
    }

    const rawSlice = text.slice(segStart, segEnd);
    let openMark = '\uE000';
    let closeMark = '\uE001';
    while (rawSlice.indexOf(openMark) !== -1 || rawSlice.indexOf(closeMark) !== -1) {
      openMark += '\uE000';
      closeMark += '\uE001';
    }

    const placeholders = [];
    let combined = '';
    let cursor = segStart;
    inlineOccurrences.forEach(function (occurrence) {
      if (occurrence.start > cursor) {
        combined += text.slice(cursor, occurrence.start);
      }
      const idx = placeholders.length;
      placeholders.push(occurrence);
      combined += openMark + idx + closeMark;
      cursor = occurrence.end;
    });
    if (cursor < segEnd) {
      combined += text.slice(cursor, segEnd);
    }

    const esc = function (s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); };
    const placeholderRe = new RegExp(esc(openMark) + '(\\d+)' + esc(closeMark), 'g');
    appendFormattedText(parent, combined, transform, placeholders, placeholderRe);
  }

  function appendInlineRange(parent, text, start, end, occurrences, transform) {
    let segStart = start;
    let inlineBatch = [];
    occurrences.forEach(function (occurrence) {
      if (occurrence.start < start || occurrence.end > end) return;
      if (occurrence.type === 'display') {
        appendInlineSegment(parent, text, segStart, occurrence.start, inlineBatch, transform);
        inlineBatch = [];
        parent.appendChild(makeDocFormula(occurrence.source, occurrence.type));
        segStart = occurrence.end;
      } else {
        inlineBatch.push(occurrence);
      }
    });
    appendInlineSegment(parent, text, segStart, end, inlineBatch, transform);
  }

  function occurrencesInRange(occurrences, start, end) {
    return occurrences.filter(function (occurrence) {
      return occurrence.start >= start && occurrence.end <= end;
    });
  }

  function getBlockLines(text, start, end) {
    const lines = [];
    let lineStart = start;
    for (let i = start; i <= end; i++) {
      if (i === end || text.charAt(i) === '\n') {
        lines.push({ start: lineStart, end: i });
        lineStart = i + 1;
      }
    }
    return lines;
  }

  function trimLine(text, line) {
    let start = line.start;
    let end = line.end;
    while (start < end && (text.charAt(start) === ' ' || text.charAt(start) === '\t')) start++;
    while (end > start && /[ \t\r]/.test(text.charAt(end - 1))) end--;
    return { start: start, end: end, text: text.slice(start, end) };
  }

  function appendParagraph(body, text, start, end, occurrences) {
    const p = document.createElement('p');
    appendInlineRange(p, text, start, end, occurrences);
    body.appendChild(p);
  }

  function appendListBlock(body, text, start, end, occurrences, ordered) {
    const crossesLines = occurrences.some(function (occurrence) {
      return text.slice(occurrence.start, occurrence.end).indexOf('\n') !== -1;
    });
    if (crossesLines) return false;

    const pattern = ordered ? /^\d{1,9}[.)][ \t]+/ : /^[-*+][ \t]+/;
    const list = document.createElement(ordered ? 'ol' : 'ul');
    let item = null;

    getBlockLines(text, start, end).forEach(function (line) {
      const trimmed = trimLine(text, line);
      if (!trimmed.text) {
        item = null;
        return;
      }
      const marker = pattern.exec(trimmed.text);
      if (marker) {
        item = document.createElement('li');
        appendInlineRange(item, text, trimmed.start + marker[0].length, trimmed.end, occurrences);
        list.appendChild(item);
      } else if (item) {
        item.appendChild(document.createElement('br'));
        appendInlineRange(item, text, trimmed.start, trimmed.end, occurrences);
      } else {
        item = null;
      }
    });

    if (!list.children.length) return false;
    body.appendChild(list);
    return true;
  }

  function appendQuoteBlock(body, text, start, end, occurrences) {
    const crossesLines = occurrences.some(function (occurrence) {
      return text.slice(occurrence.start, occurrence.end).indexOf('\n') !== -1;
    });
    if (crossesLines) return false;

    const quote = document.createElement('blockquote');
    let written = 0;

    getBlockLines(text, start, end).forEach(function (line) {
      const trimmed = trimLine(text, line);
      if (!trimmed.text) return;
      let contentStart = trimmed.start;
      const marker = /^>[ \t]?/.exec(trimmed.text);
      if (marker) contentStart += marker[0].length;
      if (written > 0) quote.appendChild(document.createElement('br'));
      appendInlineRange(quote, text, contentStart, trimmed.end, occurrences);
      written++;
    });

    if (!written) return false;
    body.appendChild(quote);
    return true;
  }

  function stripTableEscapes(value) {
    return value.replace(/\\\|/g, '|');
  }

  function appendTableBlock(body, text, table, occurrences) {
    const width = table.header.length;
    const tableEl = document.createElement('table');
    const head = document.createElement('thead');
    const headRow = document.createElement('tr');

    function makeCell(cell, tag, column) {
      const element = document.createElement(tag);
      if (table.align[column]) element.setAttribute('data-align', table.align[column]);
      if (cell) appendInlineRange(element, text, cell.start, cell.end, occurrences, stripTableEscapes);
      return element;
    }

    for (let c = 0; c < width; c++) {
      headRow.appendChild(makeCell(table.header[c], 'th', c));
    }
    head.appendChild(headRow);
    tableEl.appendChild(head);

    if (table.rows.length) {
      const tbody = document.createElement('tbody');
      table.rows.forEach(function (row) {
        const tr = document.createElement('tr');
        for (let c = 0; c < width; c++) {
          tr.appendChild(makeCell(row.cells[c], 'td', c));
        }
        tbody.appendChild(tr);
      });
      tableEl.appendChild(tbody);
    }

    tableEl.dataset.markdown = table.markdown;
    body.appendChild(tableEl);
  }

  function appendBlock(body, text, start, end, occurrences) {
    while (start < end && /\s/.test(text.charAt(start))) start++;
    while (end > start && /\s/.test(text.charAt(end - 1))) end--;
    if (start >= end) return;

    let table = null;
    try {
      table = Parser.findTable(text, start, end);
    } catch (error) {
      table = null;
    }
    if (table) {
      if (table.start > start) appendBlock(body, text, start, table.start, occurrences);
      appendTableBlock(body, text, table, occurrences);
      if (table.end < end) appendBlock(body, text, table.end, end, occurrences);
      return;
    }

    const blockText = text.slice(start, end);
    const local = occurrencesInRange(occurrences, start, end);

    const heading = /^(#{1,6})[ \t]+/.exec(blockText);
    if (heading) {
      const element = document.createElement('h' + heading[1].length);
      appendInlineRange(element, text, start + heading[0].length, end, local);
      body.appendChild(element);
      return;
    }

    if (/^(?:-{3,}|\*{3,}|_{3,})[ \t]*$/.test(blockText) && !local.length) {
      body.appendChild(document.createElement('hr'));
      return;
    }

    if (/^[ \t]*[-*+][ \t]+/.test(blockText)) {
      if (!appendListBlock(body, text, start, end, local, false)) {
        appendParagraph(body, text, start, end, local);
      }
      return;
    }

    if (/^[ \t]*\d{1,9}[.)][ \t]+/.test(blockText)) {
      if (!appendListBlock(body, text, start, end, local, true)) {
        appendParagraph(body, text, start, end, local);
      }
      return;
    }

    if (/^[ \t]*>[ \t]?/.test(blockText)) {
      if (!appendQuoteBlock(body, text, start, end, local)) {
        appendParagraph(body, text, start, end, local);
      }
      return;
    }

    appendParagraph(body, text, start, end, local);
  }

  function appendProse(body, text, start, end, occurrences) {
    let s = start;
    let e = end;
    while (s < e && /\s/.test(text.charAt(s))) s++;
    while (e > s && /\s/.test(text.charAt(e - 1))) e--;
    if (s >= e) return;

    const local = occurrences.filter(function (occurrence) {
      return occurrence.start < e && occurrence.end > s;
    });
    const blocks = [];
    let blockStart = s;
    let i = s;
    let occurrenceIndex = 0;

    while (i < e) {
      const occurrence = local[occurrenceIndex];
      if (occurrence && occurrence.end <= i) {
        occurrenceIndex++;
        continue;
      }
      if (occurrence && occurrence.start <= i) {
        i = Math.min(occurrence.end, e);
        continue;
      }
      if (text.charAt(i) === '\n') {
        let j = i + 1;
        while (j < e && /[ \t\r]/.test(text.charAt(j))) j++;
        if (j < e && text.charAt(j) === '\n') {
          let k = j + 1;
          while (k < e && /\s/.test(text.charAt(k))) k++;
          blocks.push({ start: blockStart, end: i });
          blockStart = k;
          i = k;
          continue;
        }
      }
      i++;
    }

    blocks.push({ start: blockStart, end: e });
    blocks.forEach(function (block) {
      appendBlock(body, text, block.start, block.end, occurrences);
    });
  }

  function appendCodeRange(parent, text, start, end, occurrences) {
    let cursor = start;
    occurrences.forEach(function (occurrence) {
      if (occurrence.start < start || occurrence.end > end) return;
      if (occurrence.start > cursor) {
        parent.appendChild(document.createTextNode(text.slice(cursor, occurrence.start)));
      }
      parent.appendChild(makeDocFormula(occurrence.source, occurrence.type, 'inline'));
      cursor = occurrence.end;
    });
    if (cursor < end) parent.appendChild(document.createTextNode(text.slice(cursor, end)));
  }

  function appendFence(body, text, fence, occurrences) {
    if (fence.isMath) {
      const source = text.slice(fence.contentStart, fence.contentEnd).trim();
      if (source) body.appendChild(makeDocFormula(source, 'display'));
      return;
    }

    const pre = document.createElement('pre');
    const code = document.createElement('code');
    const contentEnd = fence.contentEnd > fence.contentStart && text.charAt(fence.contentEnd - 1) === '\n'
      ? fence.contentEnd - 1
      : fence.contentEnd;

    if (state.includeCode) {
      const local = occurrencesInRange(occurrences, fence.contentStart, contentEnd);
      if (local.length) {
        appendCodeRange(code, text, fence.contentStart, contentEnd, local);
        pre.appendChild(code);
        body.appendChild(pre);
        return;
      }
    }

    code.textContent = text.slice(fence.contentStart, contentEnd);
    pre.appendChild(code);
    body.appendChild(pre);
  }

  function buildDocFromText(text) {
    const body = document.createElement('div');
    body.className = 'doc-body';

    let fences = [];
    try {
      fences = Parser.findCodeFences(text);
    } catch (error) {
      fences = [];
    }

    let occurrences = [];
    try {
      occurrences = Parser.extractFromText(text, {
        includeCode: state.includeCode,
        dedupe: false
      }).formulas.slice().sort(function (a, b) { return a.start - b.start; });
    } catch (error) {
      occurrences = [];
    }

    let cursor = 0;
    fences.forEach(function (fence) {
      if (fence.start > cursor) appendProse(body, text, cursor, fence.start, occurrences);
      appendFence(body, text, fence, occurrences);
      cursor = Math.max(cursor, fence.end);
    });
    if (cursor < text.length) appendProse(body, text, cursor, text.length, occurrences);

    return body;
  }

  function htmlMathSource(el) {
    const tag = el.tagName.toLowerCase();
    if (tag === 'script' || tag === 'annotation') return (el.textContent || '').trim();
    return (el.getAttribute('data-latex') || el.getAttribute('data-tex') || '').trim();
  }

  // Chromium's closest() can skip a nearer HTML ancestor when the selector list
  // mixes class selectors with MathML type selectors, so walk the tree manually.
  function closestAncestor(el, predicate) {
    let node = el;
    while (node && node.nodeType === 1) {
      if (predicate(node)) return node;
      node = node.parentElement;
    }
    return null;
  }

  function isMathDisplayNode(node) {
    if (node.getAttribute('data-display') === 'true') return true;
    if (node.classList) {
      if (node.classList.contains('katex-display') || node.classList.contains('MathJax_Display')) return true;
    }
    return node.tagName.toLowerCase() === 'mjx-container' && node.getAttribute('display') === 'true';
  }

  function isMathWrapperNode(node) {
    if (node.tagName.toLowerCase() === 'mjx-container') return true;
    if (!node.classList) return false;
    return node.classList.contains('katex') ||
      node.classList.contains('MathJax') ||
      node.classList.contains('MathJax_Display');
  }

  function replaceHtmlMath(root) {
    Array.from(root.querySelectorAll(HTML_MATH_SOURCE_SELECTOR)).forEach(function (el) {
      if (!el.isConnected) return;
      const source = htmlMathSource(el);
      if (!source) return;

      const displayNode = closestAncestor(el, isMathDisplayNode);
      const math = closestAncestor(el, function (node) { return node.tagName.toLowerCase() === 'math'; });
      let display = !!displayNode ||
        /mode\s*=\s*display/i.test(el.getAttribute('type') || '') ||
        el.getAttribute('data-display') === 'true' ||
        !!(math && math.getAttribute('display') === 'block');

      let container = display ? displayNode : closestAncestor(el, isMathWrapperNode);
      if (!container) {
        container = closestAncestor(el, function (node) { return node.tagName.toLowerCase() === 'math'; });
      }
      if (!container) container = el;

      container.replaceWith(makeDocFormula(source, display ? 'display' : 'inline'));
    });

    root.querySelectorAll([
      'math', 'mjx-container', 'mjx-assistive-mml',
      '.katex', '.katex-display',
      '.MathJax', '.MathJax_Display', '.MathJax_Preview'
    ].join(', ')).forEach(function (el) {
      el.remove();
    });
  }

  function copySafeDocAttributes(source, target, tag) {
    if (tag === 'A') {
      const href = source.getAttribute('href') || '';
      if (/^(https?:|mailto:)/i.test(href)) {
        target.setAttribute('href', href);
        target.setAttribute('target', '_blank');
        target.setAttribute('rel', 'noopener noreferrer');
      }
      const title = source.getAttribute('title');
      if (title) target.setAttribute('title', title);
    } else if (tag === 'TD' || tag === 'TH') {
      ['colspan', 'rowspan'].forEach(function (name) {
        const value = source.getAttribute(name);
        if (value && /^\d{1,3}$/.test(value)) target.setAttribute(name, value);
      });
      const styleAlign = /text-align\s*:\s*(left|center|right)/i.exec(source.getAttribute('style') || '');
      const align = (source.getAttribute('align') || '').toLowerCase();
      const value = /^(left|center|right)$/.test(align) ? align : (styleAlign ? styleAlign[1].toLowerCase() : '');
      if (value) target.setAttribute('data-align', value);
    } else if (tag === 'OL') {
      const start = source.getAttribute('start');
      if (start && /^-?\d{1,6}$/.test(start)) target.setAttribute('start', start);
    }
  }

  function sanitizeDocChildren(source, target) {
    Array.from(source.childNodes).forEach(function (node) {
      if (node.nodeType === 3) {
        target.appendChild(document.createTextNode(node.nodeValue || ''));
        return;
      }
      if (node.nodeType !== 1) return;

      if (node.hasAttribute('data-doc-formula')) {
        const span = document.createElement('span');
        span.className = node.getAttribute('class') || 'doc-formula doc-inline';
        span.setAttribute('data-doc-formula', '1');
        const formulaType = node.getAttribute('data-type') === 'display' ? 'display' : 'inline';
        const renderAttr = node.getAttribute('data-render');
        span.dataset.source = node.getAttribute('data-source') || '';
        span.dataset.type = formulaType;
        span.dataset.render = renderAttr === 'inline' || renderAttr === 'display' ? renderAttr : formulaType;
        span.setAttribute('role', 'button');
        span.tabIndex = 0;
        span.title = '点击复制公式';
        target.appendChild(span);
        return;
      }

      const tag = node.tagName.toUpperCase();
      if (DOC_DROP_TAGS.has(tag)) return;
      if (!DOC_ALLOWED_TAGS.has(tag)) {
        sanitizeDocChildren(node, target);
        return;
      }

      const element = document.createElement(tag.toLowerCase());
      copySafeDocAttributes(node, element, tag);
      sanitizeDocChildren(node, element);
      target.appendChild(element);
    });
  }

  function buildDocFromHtml(html) {
    let doc;
    try {
      doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
    } catch (error) {
      return null;
    }
    if (!doc || !doc.body) return null;

    replaceHtmlMath(doc);
    const body = document.createElement('div');
    body.className = 'doc-body';
    sanitizeDocChildren(doc.body, body);
    return body;
  }

  function formatDocFormulaSpan(span, lookup, forceInline) {
    const source = span.getAttribute('data-source') || '';
    if (!source) return '';
    const rawType = span.getAttribute('data-type') === 'display' ? 'display' : 'inline';
    const resolved = resolveDocFormula(lookup, source, rawType);
    const targetFormula = forceInline
      ? Object.assign({}, resolved, { type: 'inline' })
      : resolved;
    return Parser.formatFormula(targetFormula, state.format);
  }

  function markdownCellText(cell, lookup) {
    const activeLookup = lookup || buildDocLookup();
    let out = '';
    Array.from(cell.childNodes).forEach(function (node) {
      if (node.nodeType === 3) {
        out += (node.nodeValue || '').replace(/\|/g, '\\|');
        return;
      }
      if (node.nodeType !== 1) return;

      const tag = node.tagName.toUpperCase();
      if (tag === 'BR') {
        out += '<br>';
        return;
      }
      if (node.hasAttribute('data-doc-formula')) {
        out += formatDocFormulaSpan(node, activeLookup, true).replace(/\|/g, '\\|');
        return;
      }
      if (tag === 'CODE') {
        out += '`' + (node.textContent || '') + '`';
        return;
      }
      if (tag === 'STRONG' || tag === 'B') {
        out += '**' + markdownCellText(node, activeLookup) + '**';
        return;
      }
      if (tag === 'EM' || tag === 'I') {
        out += '*' + markdownCellText(node, activeLookup) + '*';
        return;
      }
      if (tag === 'DEL' || tag === 'S') {
        out += '~~' + markdownCellText(node, activeLookup) + '~~';
        return;
      }
      if (tag === 'A') {
        const href = node.getAttribute('href') || '';
        out += '[' + markdownCellText(node, activeLookup) + '](' + href + ')';
        return;
      }
      out += markdownCellText(node, activeLookup);
    });
    return out.replace(/[ \t\r\n]+/g, ' ').trim();
  }

  function tableToMarkdown(table, lookup) {
    const activeLookup = lookup || buildDocLookup();
    const matrix = Array.from(table.rows).map(function (row) {
      return Array.from(row.cells).map(function (cell) {
        return {
          text: markdownCellText(cell, activeLookup),
          align: (cell.getAttribute('data-align') || '').toLowerCase()
        };
      });
    }).filter(function (cells) { return cells.length > 0; });

    if (!matrix.length) return '';

    const width = matrix[0].length;
    const delimiter = matrix[0].map(function (cell) {
      if (cell.align === 'center') return ':---:';
      if (cell.align === 'right') return '---:';
      if (cell.align === 'left') return ':---';
      return '---';
    });

    const rowText = function (cells) {
      const parts = [];
      for (let i = 0; i < width; i++) parts.push(cells[i] ? cells[i].text : '');
      return '| ' + parts.join(' | ') + ' |';
    };

    const lines = [rowText(matrix[0]), '| ' + delimiter.join(' | ') + ' |'];
    matrix.slice(1).forEach(function (cells) {
      lines.push(rowText(cells));
    });
    return lines.join('\n');
  }

  function serializeDocNode(node, lookup, context) {
    if (node.nodeType === 3) {
      return node.nodeValue || '';
    }
    if (node.nodeType !== 1) return '';

    if (
      node.classList &&
      (node.classList.contains('doc-table-copy') || node.classList.contains('doc-note'))
    ) {
      return '';
    }

    const tag = node.tagName.toUpperCase();
    if (tag === 'BR') return '\n';
    if (tag === 'HR') return '\n\n---\n\n';

    if (node.hasAttribute('data-doc-formula')) {
      const inPre = !!(context && context.inPre);
      const formatted = formatDocFormulaSpan(node, lookup, inPre);
      if (!formatted) return '';
      const isDisplay = node.getAttribute('data-type') === 'display' && !inPre;
      return isDisplay ? '\n\n' + formatted + '\n\n' : formatted;
    }

    if (node.classList && node.classList.contains('katex-display')) {
      const tex = node.querySelector('annotation[encoding*="x-tex"]');
      if (!tex || !tex.textContent) return '';
      return '\n\n' + Parser.formatFormula({
        source: tex.textContent.trim(),
        originalSource: tex.textContent.trim(),
        type: 'display',
        wrapper: 'double',
        origin: 'text'
      }, state.format) + '\n\n';
    }

    if (node.classList && node.classList.contains('katex')) {
      const tex = node.querySelector('annotation[encoding*="x-tex"]');
      if (!tex || !tex.textContent) return '';
      return Parser.formatFormula({
        source: tex.textContent.trim(),
        originalSource: tex.textContent.trim(),
        type: 'inline',
        wrapper: 'dollar',
        origin: 'text'
      }, state.format);
    }

    if (tag === 'TABLE') {
      const md = tableToMarkdown(node, lookup);
      return md ? '\n\n' + md + '\n\n' : '';
    }

    if (tag === 'PRE') {
      const codeEl = node.querySelector('code') || node;
      const raw = Array.from(codeEl.childNodes)
        .map(function (child) { return serializeDocNode(child, lookup, { inPre: true }); })
        .join('')
        .replace(/\n+$/, '');
      return '\n\n```\n' + raw + '\n```\n\n';
    }

    if (tag === 'CODE') {
      return '`' + (node.textContent || '') + '`';
    }

    if (tag === 'STRONG' || tag === 'B') {
      const inner = Array.from(node.childNodes)
        .map(function (child) { return serializeDocNode(child, lookup, context); })
        .join('');
      return inner ? '**' + inner + '**' : '';
    }

    if (tag === 'EM' || tag === 'I') {
      const inner = Array.from(node.childNodes)
        .map(function (child) { return serializeDocNode(child, lookup, context); })
        .join('');
      return inner ? '*' + inner + '*' : '';
    }

    if (tag === 'DEL' || tag === 'S') {
      const inner = Array.from(node.childNodes)
        .map(function (child) { return serializeDocNode(child, lookup, context); })
        .join('');
      return inner ? '~~' + inner + '~~' : '';
    }

    if (tag === 'A') {
      const inner = Array.from(node.childNodes)
        .map(function (child) { return serializeDocNode(child, lookup, context); })
        .join('');
      const href = node.getAttribute('href') || '';
      return href ? '[' + inner + '](' + href + ')' : inner;
    }

    if (tag === 'OL') {
      const startNum = parseInt(node.getAttribute('start') || '1', 10);
      let idx = Number.isFinite(startNum) ? startNum : 1;
      const items = [];
      Array.from(node.children).forEach(function (child) {
        if (child.tagName.toUpperCase() !== 'LI') return;
        const text = Array.from(child.childNodes)
          .map(function (c) { return serializeDocNode(c, lookup, context); })
          .join('')
          .trim();
        items.push(String(idx++) + '. ' + text);
      });
      return items.length ? '\n\n' + items.join('\n') + '\n\n' : '';
    }

    if (tag === 'UL') {
      const items = [];
      Array.from(node.children).forEach(function (child) {
        if (child.tagName.toUpperCase() !== 'LI') return;
        const text = Array.from(child.childNodes)
          .map(function (c) { return serializeDocNode(c, lookup, context); })
          .join('')
          .trim();
        items.push('- ' + text);
      });
      return items.length ? '\n\n' + items.join('\n') + '\n\n' : '';
    }

    if (tag === 'LI') {
      const text = Array.from(node.childNodes)
        .map(function (c) { return serializeDocNode(c, lookup, context); })
        .join('')
        .trim();
      return '\n- ' + text;
    }

    if (tag === 'TR') {
      const cells = Array.from(node.children).map(function (c) {
        return markdownCellText(c, lookup);
      });
      return cells.length ? '\n| ' + cells.join(' | ') + ' |' : '';
    }

    const childrenText = Array.from(node.childNodes)
      .map(function (child) { return serializeDocNode(child, lookup, context); })
      .join('');

    const headingMatch = /^H([1-6])$/.exec(tag);
    if (headingMatch) {
      const level = parseInt(headingMatch[1], 10);
      return '\n\n' + '#'.repeat(level) + ' ' + childrenText.trim() + '\n\n';
    }

    if (tag === 'BLOCKQUOTE') {
      const quoted = childrenText
        .trim()
        .split('\n')
        .map(function (line) { return line.trim() ? '> ' + line : '>'; })
        .join('\n');
      return '\n\n' + quoted + '\n\n';
    }

    if (/^(P|DIV|SECTION|ARTICLE|FIGURE|DETAILS|SUMMARY)$/.test(tag)) {
      return '\n\n' + childrenText.trim() + '\n\n';
    }

    return childrenText;
  }

  function serializeDocFragment(fragment, lookup) {
    const activeLookup = lookup || buildDocLookup();
    const raw = Array.from(fragment.childNodes)
      .map(function (child) { return serializeDocNode(child, activeLookup, {}); })
      .join('');
    return raw
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function findOuterDocFormula(node) {
    const el = node && node.nodeType === 1 ? node : (node && node.parentElement ? node.parentElement : null);
    if (!el || !el.closest) return null;
    return el.closest('[data-doc-formula]') || el.closest('.katex-display') || el.closest('.katex');
  }

  function handleDocCopy(event) {
    if (!window.getSelection || !event.clipboardData) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;

    const range = sel.getRangeAt(0);
    if (!els.docView.contains(range.commonAncestorContainer)) return;

    const expanded = range.cloneRange();
    const startFormula = findOuterDocFormula(expanded.startContainer);
    if (startFormula && els.docView.contains(startFormula)) {
      expanded.setStartBefore(startFormula);
    }
    const endFormula = findOuterDocFormula(expanded.endContainer);
    if (endFormula && els.docView.contains(endFormula)) {
      expanded.setEndAfter(endFormula);
    }

    const fragment = expanded.cloneContents();
    const hasFormula = !!fragment.querySelector('[data-doc-formula], .katex, .katex-display');
    const hasTable = !!fragment.querySelector('table, .doc-table, .doc-table-copy');
    if (!hasFormula && !hasTable) return;

    const cleaned = serializeDocFragment(fragment, buildDocLookup());
    if (!cleaned) return;

    event.preventDefault();
    event.clipboardData.setData('text/plain', cleaned);
    showToast(hasFormula ? '已复制选中内容（含 LaTeX 公式）' : '已复制选中内容（含表格）');
  }

  function copyDocMarkdown() {
    if (!state.input.trim()) {
      showToast('还没有可复制的内容', true);
      return;
    }

    let body = els.docView.querySelector('.doc-body');
    if (!body) {
      if (state.lastPasteHtml && state.lastPasteText === state.input) {
        body = buildDocFromHtml(state.lastPasteHtml);
      }
      if (!body) body = buildDocFromText(state.input);
    }

    if (!body) {
      showToast('没有可复制的内容', true);
      return;
    }

    const text = serializeDocFragment(body, buildDocLookup());
    if (!text) {
      showToast('没有可复制的内容', true);
      return;
    }

    copyText(text).then(function (copied) {
      showToast(
        copied
          ? '已复制全文 · ' + (FORMAT_LABELS[state.format] || FORMAT_LABELS.markdown)
          : '复制失败，请手动选择复制',
        !copied
      );
    }).catch(function () {
      showToast('复制失败，请手动选择复制', true);
    });
  }

  function setupDocTables(body) {
    Array.from(body.querySelectorAll('table')).forEach(function (table) {
      if (table.parentElement && table.parentElement.closest('.doc-table')) return;

      const markdown = table.dataset.markdown || tableToMarkdown(table);
      if (!markdown) return;

      const container = document.createElement('div');
      container.className = 'doc-table';
      const scroll = document.createElement('div');
      scroll.className = 'doc-table-scroll';
      scroll.title = '点击表格复制整个表格（Markdown）';

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'doc-table-copy';
      button.textContent = '复制表格';
      button.title = '复制整个表格（Markdown）';
      button.setAttribute('aria-label', '复制整个表格的 Markdown');

      const parent = table.parentNode;
      if (!parent) return;
      parent.insertBefore(container, table);
      container.appendChild(button);
      container.appendChild(scroll);
      scroll.appendChild(table);
      table.removeAttribute('data-markdown');

      function copyTable() {
        copyText(markdown).then(function (copied) {
          showToast(copied ? '已复制整个表格' : '复制失败，请手动选择表格内容复制', !copied);
        }).catch(function () {
          showToast('复制失败，请手动选择表格内容复制', true);
        });
        container.classList.remove('copied');
        void container.offsetWidth;
        container.classList.add('copied');
      }

      button.addEventListener('click', function (event) {
        event.stopPropagation();
        copyTable();
      });

      scroll.addEventListener('click', function (event) {
        if (event.target.closest('a, [data-doc-formula]')) return;
        const selection = window.getSelection ? String(window.getSelection()) : '';
        if (selection.trim()) return;
        copyTable();
      });

      container.addEventListener('animationend', function () {
        container.classList.remove('copied');
      });
    });
  }

  function renderDoc() {
    els.docView.replaceChildren();
    docFormulaEntries = [];
    if (!state.input.trim()) {
      updateFormulaSheetButton();
      return;
    }

    let body = null;
    if (state.lastPasteHtml && state.lastPasteText === state.input) {
      body = buildDocFromHtml(state.lastPasteHtml);
      if (body) {
        const htmlCount = body.querySelectorAll('[data-doc-formula]').length;
        let textCount = 0;
        try {
          textCount = Parser.extractFromText(state.input, {
            includeCode: state.includeCode,
            dedupe: false
          }).formulas.length;
        } catch (error) {
          textCount = 0;
        }
        const emptyHtml = !body.textContent.trim() && htmlCount === 0;
        const missingMath = textCount > 0 && htmlCount < Math.ceil(textCount / 2);
        if (emptyHtml || missingMath) body = null;
      }
    }

    if (!body) body = buildDocFromText(state.input);
    if (!body.childNodes.length) return;

    if (!body.querySelector('[data-doc-formula]') && state.formulas.length) {
      const note = document.createElement('div');
      note.className = 'doc-note';
      note.textContent = '当前文本中没有可定位的公式源码，原始富文本已不可用。请重新粘贴原始回答，或切到“卡片”视图复制公式。';
      body.appendChild(note);
    }

    els.docView.appendChild(body);
    setupDocTables(body);
    hydrateDocFormulas(body);
  }

  function updateDocTip() {
    if (!els.docTip) return;
    if (!state.input.trim()) {
      els.docTip.textContent = '所有内容仅在本地浏览器处理，不会上传';
      return;
    }
    if (state.view === 'doc') {
      els.docTip.textContent =
        '点击公式复制（Shift+点击纯源码） · 划选跨块 Ctrl+C · 按 F 速览';
    } else {
      els.docTip.textContent =
        '点击公式预览直接复制 · 点“编辑”修改源码并实时渲染';
    }
  }

  function wrapperLabel(formula) {
    if (formula.origin === 'html' || formula.origin === 'code') return '';
    if (formula.wrapper === 'double') return '$$';
    if (formula.wrapper === 'bracket') return '\\[ \\]';
    if (formula.wrapper === 'dollar') return '$';
    if (formula.wrapper === 'paren') return '\\( \\)';
    if (formula.wrapper === 'env') {
      const match = /^\\begin\{([^}]+)\}/.exec(formula.source);
      return match ? match[1] : '环境';
    }
    return '';
  }

  function createCard(formula, index) {
    const card = els.cardTemplate.content.firstElementChild.cloneNode(true);
    const indexEl = card.querySelector('.formula-index');
    const typeBadge = card.querySelector('.type-badge');
    const originBadge = card.querySelector('.origin-badge');
    const wrapperEl = card.querySelector('.wrapper-label');
    const editedDot = card.querySelector('.edited-dot');
    const contextEl = card.querySelector('.formula-context');
    const previewEl = card.querySelector('.formula-preview');
    const sourceWrap = card.querySelector('.card-source-wrap');
    const sourceEl = card.querySelector('.formula-source');
    const toggleEditBtn = card.querySelector('.toggle-edit');
    const copyButton = card.querySelector('.copy-one');
    const rawButton = card.querySelector('.copy-raw');

    indexEl.textContent = String(index + 1).padStart(2, '0');
    typeBadge.textContent = formula.type === 'display' ? '行间' : '行内';
    typeBadge.classList.add(formula.type);

    if (formula.origin === 'html') {
      originBadge.hidden = false;
      originBadge.textContent = '富文本';
    } else if (formula.origin === 'code') {
      originBadge.hidden = false;
      originBadge.textContent = '代码块';
      originBadge.classList.add('code');
    }

    const label = wrapperLabel(formula);
    if (label) wrapperEl.textContent = label;
    else wrapperEl.hidden = true;

    const contextParts = [];
    if (formula.contextBefore) contextParts.push('…' + formula.contextBefore);
    if (formula.contextAfter) contextParts.push(formula.contextAfter + '…');
    if (contextParts.length) {
      contextEl.hidden = false;
      contextEl.textContent = contextParts.join(' ');
      contextEl.title = contextParts.join(' ');
    }

    const isEdited = formula.source !== formula.originalSource;
    sourceEl.value = formula.source;
    sourceEl.classList.toggle('is-edited', isEdited);
    if (editedDot) editedDot.hidden = !isEdited;
    if (sourceWrap) {
      sourceWrap.hidden = !isEdited;
      if (toggleEditBtn) toggleEditBtn.textContent = isEdited ? '收起' : '编辑';
    }
    renderPreview(previewEl, formula);

    if (toggleEditBtn && sourceWrap) {
      toggleEditBtn.addEventListener('click', function () {
        const nextOpen = sourceWrap.hidden;
        sourceWrap.hidden = !nextOpen;
        toggleEditBtn.textContent = nextOpen ? '收起' : '编辑';
        if (nextOpen) {
          autoSizeSource(sourceEl);
          sourceEl.focus();
        }
      });
    }

    let previewTimer = null;
    sourceEl.addEventListener('input', function () {
      formula.source = sourceEl.value;
      const edited = formula.source !== formula.originalSource;
      sourceEl.classList.toggle('is-edited', edited);
      if (editedDot) editedDot.hidden = !edited;
      autoSizeSource(sourceEl);
      clearTimeout(previewTimer);
      previewTimer = setTimeout(function () {
        renderPreview(previewEl, formula);
      }, 140);
      saveState();
    });

    previewEl.title = '点击复制公式（Shift+点击复制纯源码）';
    previewEl.addEventListener('click', function (event) {
      if (hasActiveSelection()) return;
      copyFormula(formula, event.shiftKey);
    });

    copyButton.addEventListener('click', function () { copyFormula(formula, false); });
    rawButton.addEventListener('click', function () { copyFormula(formula, true); });

    return card;
  }

  function createNoMatchState() {
    const wrapper = document.createElement('div');
    wrapper.className = 'empty-state compact';
    const title = document.createElement('h3');
    const text = document.createElement('p');
    if (state.formulas.length) {
      title.textContent = '没有匹配的公式';
      text.textContent = '试试清空搜索，或切换到“全部”筛选。';
    } else {
      title.textContent = '这段内容里没有公式';
      text.textContent = '切到“全文”视图即可查看完整内容，表格也可以直接复制。';
    }
    wrapper.appendChild(title);
    wrapper.appendChild(text);
    return wrapper;
  }

  function updateViewControls() {
    const isDoc = state.view === 'doc';
    const hasContent = !!state.input.trim();
    const hasFormulas = state.formulas.length > 0;
    els.viewGroup.querySelectorAll('button').forEach(function (button) {
      button.classList.toggle('active', button.dataset.view === state.view);
    });
    els.filterGroup.hidden = isDoc || !hasContent;
    els.searchInput.closest('.search-box').hidden = isDoc || !hasContent;
    els.docView.hidden = !isDoc || !hasContent;
    els.results.hidden = isDoc || !hasContent;
    if (els.copyDocBtn) els.copyDocBtn.hidden = !isDoc || !hasContent;
    if (els.copyAllBtn) els.copyAllBtn.hidden = isDoc || !hasFormulas;
    if (els.exportBtn) els.exportBtn.hidden = !hasFormulas;
    updateFormulaSheetButton();
    updateDocTip();
  }

  function renderCards(visible) {
    els.results.replaceChildren();
    if (!visible.length) {
      els.results.appendChild(createNoMatchState());
      return;
    }

    const fragment = document.createDocumentFragment();
    visible.forEach(function (item) {
      fragment.appendChild(createCard(item.formula, item.index));
    });
    els.results.appendChild(fragment);

    els.results.querySelectorAll('.formula-source').forEach(function (textarea) {
      autoSizeSource(textarea);
    });
  }

  function render() {
    const visible = getVisibleFormulas();
    const isDoc = state.view === 'doc';
    updateStats(isDoc ? state.formulas.length : visible.length);
    updateFilterButtons();
    updateViewControls();

    const hasContent = !!state.input.trim();
    els.emptyState.hidden = hasContent;

    if (!hasContent) {
      els.results.replaceChildren();
      els.docView.replaceChildren();
      return;
    }

    if (isDoc) {
      els.results.replaceChildren();
      renderDoc();
      return;
    }

    els.docView.replaceChildren();
    renderCards(visible);
  }

  function extract(options) {
    const opts = options || {};
    const text = els.inputText.value;
    state.input = text;
    updateInputCount();

    if (!text.trim()) {
      state.formulas = [];
      state.formulasInput = '';
      state.lastPasteHtml = '';
      state.lastPasteText = '';
      savePasteCache('', '');
      render();
      setNotice(['请先粘贴包含公式或表格的 AI 回答。'], 'warn');
      saveState();
      if (!opts.silent) showToast('输入为空', true);
      return;
    }

    const parsed = Parser.extractFromText(text, {
      includeCode: state.includeCode,
      dedupe: state.dedupe
    });

    let htmlFormulas = [];
    const canUseHtml = state.lastPasteHtml && state.lastPasteText === text;
    if (canUseHtml) {
      try {
        htmlFormulas = Parser.extractFromHtml(state.lastPasteHtml);
      } catch (error) {
        htmlFormulas = [];
      }
    }

    const merged = Parser.mergeFormulas(parsed.formulas, htmlFormulas, { dedupe: state.dedupe });
    state.formulas = merged.formulas.map(function (formula) {
      return normalizeFormula({
        source: formula.source,
        originalSource: formula.source,
        type: formula.type,
        wrapper: formula.wrapper,
        origin: formula.origin,
        contextBefore: formula.contextBefore,
        contextAfter: formula.contextAfter,
        start: formula.start,
        end: formula.end
      });
    }).filter(Boolean);
    state.formulasInput = text;

    const messages = [];
    if (merged.addedHtml > 0) {
      messages.push('已从剪贴板富文本中恢复 ' + merged.addedHtml + ' 个公式。');
    }
    parsed.warnings.forEach(function (warning) {
      messages.push(warning + '。');
    });

    let hasTable = false;
    try {
      hasTable = !!Parser.findTable(text, 0, text.length);
    } catch (error) {
      hasTable = false;
    }
    if (!hasTable && canUseHtml) {
      hasTable = /<table[\s>]/i.test(state.lastPasteHtml);
    }

    let noticeType = messages.length ? 'info' : '';
    if (!state.formulas.length) {
      if (!hasTable) {
        messages.push('没有找到公式或表格，已按全文渲染内容。');
        if (canUseHtml) {
          messages.push('剪贴板富文本中也没有可解析的 MathML/KaTeX 源码；如果原文公式是图片或纯排版字符，无法还原 LaTeX。');
        }
      }
    } else if (parsed.warnings.length) {
      noticeType = 'warn';
    }

    setNotice(messages, noticeType);
    render();
    saveState();

    if (opts.scroll && state.input.trim() && window.innerWidth <= 900) {
      els.resultsPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    if (!opts.silent) {
      if (state.formulas.length) showToast('提取到 ' + state.formulas.length + ' 个公式');
      else if (hasTable) showToast('已渲染全文，点击表格即可复制');
      else showToast('没有找到公式或表格', true);
    }
  }

  function loadExample() {
    const text = (els.exampleText.textContent || '').trim();
    els.inputText.value = text;
    state.input = text;
    state.lastPasteHtml = '';
    state.lastPasteText = '';
    savePasteCache('', '');
    state.search = '';
    state.filter = 'all';
    els.searchInput.value = '';
    updateInputCount();
    updateFilterButtons();
    extract({ scroll: true });
  }

  function clearAll() {
    els.inputText.value = '';
    state.input = '';
    state.formulas = [];
    state.formulasInput = '';
    state.lastPasteHtml = '';
    state.lastPasteText = '';
    savePasteCache('', '');
    state.search = '';
    state.filter = 'all';
    els.searchInput.value = '';
    updateInputCount();
    clearActiveEdits();
    render();
    setNotice([], '');
    saveState();
    els.inputText.focus();
    showToast('已清空');
  }

  function clearActiveEdits() {
    const active = document.activeElement;
    if (active && active.classList && active.classList.contains('formula-source')) {
      active.blur();
    }
  }

  function handlePaste(event) {
    const target = event.target;
    const isInputTarget = target === els.inputText;
    const editable = target && target.closest
      ? target.closest('textarea, input, select, [contenteditable="true"]')
      : null;
    if (editable && !isInputTarget) return;

    let text = '';
    let html = '';
    try {
      if (event.clipboardData) {
        text = event.clipboardData.getData('text/plain') || '';
        html = event.clipboardData.getData('text/html') || '';
      }
    } catch (error) {
      text = '';
      html = '';
    }

    if (isInputTarget) {
      state.lastPasteHtml = html;
      setTimeout(function () {
        if (!els.inputText.value && html) {
          try {
            const fallback = new DOMParser().parseFromString(html, 'text/html').body.innerText || '';
            if (fallback) els.inputText.value = fallback;
          } catch (error) {
            // Leave the textarea empty.
          }
        }
        state.input = els.inputText.value;
        state.lastPasteText = state.input;
        savePasteCache(state.lastPasteHtml, state.lastPasteText);
        updateInputCount();
        extract({ silent: true });
      }, 0);
      return;
    }

    if (!text && !html) return;
    event.preventDefault();

    if (!text && html) {
      try {
        text = new DOMParser().parseFromString(html, 'text/html').body.innerText || '';
      } catch (error) {
        text = '';
      }
    }

    const insertAt = els.inputText.value.length;
    els.inputText.focus();
    els.inputText.setSelectionRange(insertAt, insertAt);
    els.inputText.setRangeText(text, insertAt, insertAt, 'end');
    state.input = els.inputText.value;
    state.lastPasteHtml = html;
    state.lastPasteText = state.input;
    savePasteCache(state.lastPasteHtml, state.lastPasteText);
    updateInputCount();
    extract({ silent: true });
  }

  async function pasteFromClipboard() {
    let text = '';
    let html = '';

    try {
      if (navigator.clipboard && typeof navigator.clipboard.read === 'function') {
        const items = await navigator.clipboard.read();
        for (const item of items) {
          if (!text && item.types.indexOf('text/plain') !== -1) {
            text = await (await item.getType('text/plain')).text();
          }
          if (!html && item.types.indexOf('text/html') !== -1) {
            html = await (await item.getType('text/html')).text();
          }
        }
      } else if (navigator.clipboard && typeof navigator.clipboard.readText === 'function') {
        text = await navigator.clipboard.readText();
      } else {
        throw new Error('clipboard API unavailable');
      }
    } catch (error) {
      els.inputText.focus();
      showToast('浏览器未授权读取剪贴板，请在输入框中按 Ctrl+V', true);
      return;
    }

    if (!text && !html) {
      showToast('剪贴板里没有文本内容', true);
      return;
    }

    if (!text && html) {
      try {
        text = new DOMParser().parseFromString(html, 'text/html').body.innerText || '';
      } catch (error) {
        text = '';
      }
    }

    els.inputText.value = text;
    state.input = text;
    state.lastPasteHtml = html;
    state.lastPasteText = text;
    savePasteCache(state.lastPasteHtml, state.lastPasteText);
    updateInputCount();
    extract({ scroll: true });
  }

  function bindEvents() {
    els.inputText.addEventListener('input', function () {
      state.input = els.inputText.value;
      updateInputCount();
      updateStats(state.view === 'doc' ? state.formulas.length : getVisibleFormulas().length);
      saveState();
    });

    els.extractBtn.addEventListener('click', function () { extract({ scroll: true }); });
    els.pasteBtn.addEventListener('click', pasteFromClipboard);
    if (els.emptyPasteBtn) els.emptyPasteBtn.addEventListener('click', pasteFromClipboard);
    if (els.toggleInputBtn) els.toggleInputBtn.addEventListener('click', toggleInputPane);
    els.exampleBtn.addEventListener('click', loadExample);
    els.emptyExampleBtn.addEventListener('click', loadExample);
    els.clearBtn.addEventListener('click', clearAll);

    els.includeCode.addEventListener('change', function () {
      state.includeCode = els.includeCode.checked;
      saveState();
      if (state.input.trim()) extract({ silent: true });
    });

    els.dedupe.addEventListener('change', function () {
      state.dedupe = els.dedupe.checked;
      saveState();
      if (state.input.trim()) extract({ silent: true });
    });

    els.viewGroup.addEventListener('click', function (event) {
      const button = event.target.closest('button[data-view]');
      if (!button || button.dataset.view === state.view) return;
      state.view = button.dataset.view;
      saveState();
      render();
    });

    els.filterGroup.addEventListener('click', function (event) {
      const button = event.target.closest('button[data-filter]');
      if (!button) return;
      state.filter = button.dataset.filter;
      render();
    });

    els.searchInput.addEventListener('input', function () {
      state.search = els.searchInput.value;
      render();
    });

    els.formatSelect.addEventListener('change', function () {
      state.format = els.formatSelect.value;
      saveState();
      updateDocTip();
    });

    els.docView.addEventListener('copy', handleDocCopy);
    if (els.copyDocBtn) els.copyDocBtn.addEventListener('click', copyDocMarkdown);
    if (els.formulaSheetBtn) els.formulaSheetBtn.addEventListener('click', openFormulaSheet);
    if (els.formulaSheetClose) els.formulaSheetClose.addEventListener('click', closeFormulaSheet);
    if (els.formulaSheetModal) {
      els.formulaSheetModal.addEventListener('click', function (event) {
        if (event.target === els.formulaSheetModal) closeFormulaSheet();
      });
    }

    els.copyAllBtn.addEventListener('click', copyAll);
    els.exportBtn.addEventListener('click', exportMarkdown);
    els.themeToggle.addEventListener('click', toggleTheme);

    document.addEventListener('paste', handlePaste);

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && els.formulaSheetModal && !els.formulaSheetModal.hidden) {
        closeFormulaSheet();
        return;
      }

      if (
        event.key === '\\' &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey
      ) {
        const active = document.activeElement;
        const isEditable = active && active.matches && active.matches('input, textarea, select, [contenteditable="true"]');
        if (!isEditable && window.innerWidth > 900) {
          event.preventDefault();
          toggleInputPane();
          return;
        }
      }

      if (
        event.key &&
        event.key.toLowerCase() === 'f' &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey
      ) {
        const active = document.activeElement;
        const isEditable = active && active.matches && active.matches('input, textarea, select, [contenteditable="true"]');
        if (!isEditable && state.view === 'doc' && docFormulaEntries.length > 0) {
          event.preventDefault();
          if (els.formulaSheetModal && !els.formulaSheetModal.hidden) closeFormulaSheet();
          else openFormulaSheet();
          return;
        }
      }

      if (!(event.ctrlKey || event.metaKey) || event.key !== 'Enter') return;
      const target = event.target;
      if (target && target.matches && target.matches('.formula-source, .search-box input, select')) return;
      event.preventDefault();
      extract({ scroll: true });
    });
  }

  function init() {
    loadState();
    els.inputText.value = state.input;
    els.includeCode.checked = state.includeCode;
    els.dedupe.checked = state.dedupe;
    els.formatSelect.value = state.format;
    updateInputCount();
    applyTheme(state.theme || document.documentElement.dataset.theme || preferredTheme());
    applySplitWidth(state.splitWidth);
    applyInputCollapsed(state.inputCollapsed);
    initSplitResizer();
    bindEvents();

    if (state.formulas.length && state.formulasInput === state.input) {
      render();
    } else if (state.input.trim()) {
      extract({ silent: true });
    } else {
      render();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
