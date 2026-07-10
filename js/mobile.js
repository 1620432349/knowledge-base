// ========== 手机端静态知识库 - 纯只读 ==========

// 从 data.js 注入的静态数据
const STORE = window.STATIC_DATA || { documents: [] };
const DOCS = STORE.documents || [];

const CATEGORIES = ['全部', '营业执照', '许可证', '供应商合同', '发明专利', '荣誉证书', '保险保单', '其他'];
const CATEGORY_ICONS = {
  '营业执照': '🏢', '许可证': '📜', '供应商合同': '🤝',
  '发明专利': '💡', '荣誉证书': '🏆', '保险保单': '🛡️', '其他': '📦'
};

let currentCategory = '全部';
let currentKeyword = '';
let sortBy = 'updatedAt';

// ========== 状态判断 ==========
function getStatus(doc) {
  if (!doc.expiryDate) return { type: 'permanent', label: '长期有效', cls: 's-permanent' };
  const now = Date.now();
  const exp = new Date(doc.expiryDate).getTime();
  if (exp < now) return { type: 'expired', label: '已过期', cls: 's-expired' };
  const days = Math.ceil((exp - now) / 86400000);
  if (days <= 30) return { type: 'expiring', label: days + '天后到期', cls: 's-expiring' };
  return { type: 'valid', label: '有效', cls: 's-valid' };
}

// ========== 搜索与筛选 ==========
function getFiltered() {
  let results = [...DOCS];
  if (currentCategory !== '全部') {
    results = results.filter(d => d.category === currentCategory);
  }
  if (currentKeyword) {
    const kw = currentKeyword.toLowerCase();
    results = results.filter(d =>
      (d.title && d.title.toLowerCase().includes(kw)) ||
      (d.subsidiary && d.subsidiary.toLowerCase().includes(kw)) ||
      (d.supplier && d.supplier.toLowerCase().includes(kw)) ||
      (d.documentNumber && d.documentNumber.toLowerCase().includes(kw)) ||
      (d.description && d.description.toLowerCase().includes(kw))
    );
  }
  results.sort((a, b) => {
    const va = a[sortBy] || '', vb = b[sortBy] || '';
    return vb > va ? 1 : vb < va ? -1 : 0;
  });
  return results;
}

// ========== 渲染 ==========
function render() {
  renderCategories();
  renderCards();
}

function renderCategories() {
  const cats = document.getElementById('categoryTabs');
  cats.innerHTML = CATEGORIES.map(c => {
    const active = c === currentCategory ? 'active' : '';
    const icon = c === '全部' ? '📋' : (CATEGORY_ICONS[c] || '📄');
    return `<span class="cat-tab ${active}" data-cat="${c}" onclick="selectCategory('${c}')">${icon} ${c}</span>`;
  }).join('');
}

function renderCards() {
  const results = getFiltered();
  const list = document.getElementById('docList');
  const count = document.getElementById('resultCount');

  if (count) count.textContent = `共 ${results.length} 条`;

  if (results.length === 0) {
    list.innerHTML = '<div class="empty">📭 没有找到匹配的文档</div>';
    return;
  }

  list.innerHTML = results.map(d => {
    const status = getStatus(d);
    const icon = CATEGORY_ICONS[d.category] || '📄';
    const hasFile = d.filePath && d.fileName && !(d.fileName || '').startsWith('placeholder');
    const fileUrl = hasFile ? `files/${d.filePath}` : '';
    const date = d.expiryDate ? new Date(d.expiryDate).toLocaleDateString('zh-CN') : '--';

    return `
    <div class="doc-card" id="card-${d.id}" onclick="toggleDetail(${d.id})">
      <div class="doc-header">
        <span class="doc-icon">${icon}</span>
        <div class="doc-info">
          <div class="doc-title">${esc(d.title || '无标题')}</div>
          <div class="doc-meta">
            ${d.subsidiary ? '<span class="tag">' + esc(d.subsidiary) + '</span>' : ''}
            ${d.documentNumber ? '<span class="tag tag-gray">' + esc(d.documentNumber) + '</span>' : ''}
          </div>
        </div>
        <span class="status-badge ${status.cls}">${status.label}</span>
        <span class="expand-icon" id="expand-${d.id}">▾</span>
      </div>
      <div class="doc-detail" id="detail-${d.id}" style="display:none">
        <div class="detail-grid">
          ${d.category ? '<div class="d-item"><span class="d-label">类别</span><span class="d-value">' + esc(d.category) + '</span></div>' : ''}
          ${d.subsidiary ? '<div class="d-item"><span class="d-label">分公司</span><span class="d-value">' + esc(d.subsidiary) + '</span></div>' : ''}
          ${d.supplier ? '<div class="d-item"><span class="d-label">供应商</span><span class="d-value">' + esc(d.supplier) + '</span></div>' : ''}
          ${d.documentNumber ? '<div class="d-item"><span class="d-label">编号</span><span class="d-value">' + esc(d.documentNumber) + '</span></div>' : ''}
          <div class="d-item"><span class="d-label">有效期</span><span class="d-value">${date}</span></div>
          ${d.issuingAuthority ? '<div class="d-item"><span class="d-label">颁发机构</span><span class="d-value">' + esc(d.issuingAuthority) + '</span></div>' : ''}
          ${d.createdAt ? '<div class="d-item"><span class="d-label">录入日期</span><span class="d-value">' + new Date(d.createdAt).toLocaleDateString('zh-CN') + '</span></div>' : ''}
        </div>
        ${d.description ? '<div class="d-desc">' + esc(d.description) + '</div>' : ''}
        ${fileUrl ? '<a href="' + fileUrl + '" class="btn-file" onclick="event.stopPropagation()" target="_blank">📎 查看文件：' + esc(d.fileName) + '</a>' : ''}
        ${d.tags ? '<div class="d-tags">' + d.tags.split(',').map(t => '<span class="t-tag">' + esc(t.trim()) + '</span>').join('') + '</div>' : ''}
      </div>
    </div>`;
  }).join('');
}

function esc(s) {
  if (!s) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ========== 交互 ==========
function selectCategory(cat) {
  currentCategory = cat;
  render();
  document.getElementById('categoryTabs').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function toggleDetail(id) {
  const detail = document.getElementById('detail-' + id);
  const expand = document.getElementById('expand-' + id);
  if (!detail || !expand) return;
  const isOpen = detail.style.display !== 'none';
  detail.style.display = isOpen ? 'none' : 'block';
  expand.textContent = isOpen ? '▾' : '▴';
  expand.classList.toggle('open', !isOpen);
}

// ========== 搜索 ==========
let searchTimer = null;
function onSearch(val) {
  currentKeyword = val.trim();
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => render(), 200);
}

// ========== 排序切换 ==========
function switchSort(by) {
  sortBy = by;
  document.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('sort-' + by).classList.add('active');
  render();
}

// ========== 初始化 ==========
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('searchInput').addEventListener('input', function() {
    onSearch(this.value);
  });
  render();
});
