// ========== 全局状态 ==========
let currentView = 'dashboard';
let currentFilters = {
  keyword: '',
  category: 'all',
  subsidiary: 'all',
  status: 'all',
  sortBy: 'updatedAt',
  sortOrder: 'desc'
};
let subsidiaries = [];

// ========== 静态模式标识 ==========
const IS_STATIC = typeof window.STATIC_DATA !== 'undefined';
const STATIC_STORE = IS_STATIC ? window.STATIC_DATA : null;

const CATEGORIES = ['营业执照', '许可证', '供应商合同', '发明专利', '荣誉证书', '保险保单', '其他'];
const CATEGORY_ICONS = {
  '营业执照': '🏢',
  '许可证': '📜',
  '供应商合同': '🤝',
  '发明专利': '💡',
  '荣誉证书': '🏆',
  '保险保单': '🛡️',
  '其他': '📦'
};

// ========== 静态数据辅助函数 ==========
function staticGetStats() {
  const docs = STATIC_STORE.documents;
  const stats = { total: docs.length, valid: 0, expiring: 0, expired: 0, permanent: 0, byCategory: {}, bySubsidiary: {}, expiringSoon: [], recent: [] };
  docs.forEach(d => {
    const status = getDocStatus(d);
    if (stats.hasOwnProperty(status)) stats[status]++;
    if (d.category) stats.byCategory[d.category] = (stats.byCategory[d.category] || 0) + 1;
    if (d.subsidiary) stats.bySubsidiary[d.subsidiary] = (stats.bySubsidiary[d.subsidiary] || 0) + 1;
    if (status === 'expiring') stats.expiringSoon.push(d);
  });
  stats.expiringSoon.sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate));
  stats.recent = [...docs].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5);
  return stats;
}

function staticSearch(filters) {
  let results = [...STATIC_STORE.documents];
  if (filters.keyword) {
    const kw = filters.keyword.toLowerCase();
    results = results.filter(d =>
      (d.title && d.title.toLowerCase().includes(kw)) ||
      (d.subsidiary && d.subsidiary.toLowerCase().includes(kw)) ||
      (d.supplier && d.supplier.toLowerCase().includes(kw)) ||
      (d.documentNumber && d.documentNumber.toLowerCase().includes(kw)) ||
      (d.description && d.description.toLowerCase().includes(kw)) ||
      (d.tags && d.tags.toLowerCase().includes(kw)));
  }
  if (filters.category && filters.category !== 'all') results = results.filter(d => d.category === filters.category);
  if (filters.subsidiary && filters.subsidiary !== 'all') results = results.filter(d => d.subsidiary === filters.subsidiary);
  if (filters.status && filters.status !== 'all') results = results.filter(d => getDocStatus(d) === filters.status);
  const sortBy = filters.sortBy || 'updatedAt';
  const sortOrder = filters.sortOrder || 'desc';
  results.sort((a, b) => { let va = a[sortBy] || '', vb = b[sortBy] || ''; if (va < vb) return sortOrder === 'asc' ? -1 : 1; if (va > vb) return sortOrder === 'asc' ? 1 : -1; return 0; });
  return results;
}

function staticGetSubsidiaries() {
  const set = new Set();
  STATIC_STORE.documents.forEach(d => { if (d.subsidiary) set.add(d.subsidiary); });
  return Array.from(set).sort();
}

function staticGetById(id) {
  return STATIC_STORE.documents.find(d => d.id === parseInt(id));
}

// ========== API 调用 ==========
async function api(url, options = {}) {
  if (IS_STATIC) {
    if (url === '/api/stats') return staticGetStats();
    if (url === '/api/subsidiaries') return staticGetSubsidiaries();
    if (url.startsWith('/api/documents?')) {
      const params = new URLSearchParams(url.split('?')[1]);
      return staticSearch({
        keyword: params.get('keyword') || '',
        category: params.get('category') || 'all',
        subsidiary: params.get('subsidiary') || 'all',
        status: params.get('status') || 'all',
        sortBy: params.get('sortBy') || 'updatedAt',
        sortOrder: params.get('sortOrder') || 'desc'
      });
    }
    const match = url.match(/^\/api\/documents\/(\d+)$/);
    if (match) {
      const doc = staticGetById(match[1]);
      if (!doc) throw new Error('文档不存在');
      return doc;
    }
    throw new Error('静态模式不支持此操作');
  }
  const res = await fetch(url, options);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: '请求失败' }));
    throw new Error(err.error || '请求失败');
  }
  return res.json();
}

// ========== 生成手机端静态链接 ==========
async function buildMobileLink() {
  if (IS_STATIC) {
    alert('静态模式不支持此功能');
    return;
  }
  const btn = event.target;
  btn.disabled = true;
  btn.textContent = '⏳ 正在生成手机端文件包...';
  try {
    const result = await api('/api/build-static-zip', { method: 'POST' });
    if (result.success) {
      // 自动下载 ZIP 文件
      const link = document.createElement('a');
      link.href = result.zipPath;
      link.download = '企业资质知识库_手机查看版.zip';
      link.click();
      alert('✅ 手机端文件包已生成并开始下载！\n\n使用方法：\n1. 将下载的 ZIP 文件通过微信/QQ 发送到手机\n2. 手机端解压后，用浏览器打开 index.html 即可查看\n\n注意：这是当前数据的静态快照，查看最新数据需重新生成。');
    } else {
      alert('❌ 生成失败：' + (result.error || '未知错误'));
    }
  } catch (err) {
    alert('❌ 生成失败：' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = '📱 生成手机查看链接';
  }
}

// ========== 导航 ==========
function navigateTo(view, params = {}) {
  console.log('[导航] 切换到:', view, '参数:', params);
  currentView = view;
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  const navEl = document.querySelector(`.nav-item[data-view="${view}"]`);
  if (navEl) navEl.classList.add('active');

  if (params.category) {
    currentFilters.category = params.category;
    // 同步更新筛选下拉框
    const filterSelect = document.getElementById('filterCategory');
    if (filterSelect) filterSelect.value = params.category;
  }

  // 移动端自动关闭侧边栏
  closeSidebar();

  render();
}

// ========== 移动端侧边栏 ==========
function toggleSidebar() {
  document.querySelector('.sidebar').classList.toggle('open');
  document.getElementById('sidebarOverlay').classList.toggle('show');
}

function closeSidebar() {
  document.querySelector('.sidebar').classList.remove('open');
  document.getElementById('sidebarOverlay').classList.remove('show');
}

// ========== 渲染入口 ==========
function render() {
  const container = document.getElementById('view-container');
  if (currentView === 'dashboard') {
    renderDashboard(container);
  } else if (currentView === 'documents') {
    renderDocuments(container);
  } else if (currentView === 'upload') {
    renderUpload(container);
  } else if (currentView === 'import') {
    renderImport(container);
  }
}

// ========== 仪表盘 ==========
async function renderDashboard(container) {
  container.innerHTML = `
    <div class="page-title">仪表盘</div>
    <div class="page-subtitle">企业资质文档总览与预警</div>
    <div id="dashboard-content"><div class="empty-state">加载中...</div></div>
  `;

  try {
    const stats = await api('/api/stats');
    const html = `
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-icon blue">📋</div>
          <div class="stat-info">
            <div class="stat-value">${stats.total}</div>
            <div class="stat-label">文档总数</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon green">✅</div>
          <div class="stat-info">
            <div class="stat-value">${stats.valid}</div>
            <div class="stat-label">有效文档</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon orange">⏰</div>
          <div class="stat-info">
            <div class="stat-value">${stats.expiring}</div>
            <div class="stat-label">即将过期（30天内）</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon red">❌</div>
          <div class="stat-info">
            <div class="stat-value">${stats.expired}</div>
            <div class="stat-label">已过期</div>
          </div>
        </div>
      </div>

      <div class="dashboard-row">
        <div class="panel">
          <div class="panel-header">
            <div class="panel-title">分类统计</div>
          </div>
          ${renderCategoryBars(stats.byCategory, stats.total)}
        </div>
        <div class="panel">
          <div class="panel-header">
            <div class="panel-title">过期预警</div>
            ${stats.expiringSoon.length > 0 ? `<span class="badge badge-orange">${stats.expiringSoon.length} 项</span>` : ''}
          </div>
          ${renderExpiryAlerts(stats.expiringSoon)}
        </div>
      </div>

      <div class="panel">
        <div class="panel-header">
          <div class="panel-title">最近添加</div>
          <a href="#" onclick="navigateTo('documents');return false" style="font-size:13px;color:var(--primary);text-decoration:none;">查看全部 →</a>
        </div>
        ${renderRecentList(stats.recent)}
      </div>
    `;
    document.getElementById('dashboard-content').innerHTML = html;
  } catch (err) {
    document.getElementById('dashboard-content').innerHTML = `<div class="empty-state">加载失败: ${err.message}</div>`;
  }
}

function renderCategoryBars(byCategory, total) {
  const colors = ['#2563eb', '#0891b2', '#16a34a', '#d97706', '#7c3aed', '#dc2626'];
  const entries = Object.entries(byCategory);
  if (entries.length === 0) {
    return '<div class="empty-state" style="padding:30px;"><div class="empty-state-icon">📊</div>暂无数据</div>';
  }
  return entries.map(([cat, count], i) => {
    const pct = total > 0 ? Math.round(count / total * 100) : 0;
    const color = colors[i % colors.length];
    return `
      <div class="category-bar">
        <div class="category-bar-label">${CATEGORY_ICONS[cat] || '📄'} ${cat}</div>
        <div class="category-bar-track">
          <div class="category-bar-fill" style="width:${pct}%;background:${color};">${count}</div>
        </div>
        <div style="font-size:12px;color:var(--text-secondary);width:36px;text-align:right;">${pct}%</div>
      </div>
    `;
  }).join('');
}

function renderExpiryAlerts(alerts) {
  if (alerts.length === 0) {
    return '<div class="empty-state" style="padding:30px;"><div class="empty-state-icon">✅</div>暂无即将过期的文档</div>';
  }
  return alerts.slice(0, 6).map(doc => {
    const days = Math.floor((new Date(doc.expiryDate) - new Date()) / (1000 * 60 * 60 * 24));
    return `
      <div class="alert-item" onclick="showDetail(${doc.id})">
        <div class="alert-badge" style="background:var(--warning-light);">⏰</div>
        <div class="alert-info">
          <div class="alert-title">${escapeHtml(doc.title)}</div>
          <div class="alert-meta">${doc.subsidiary || '-'} · ${formatDate(doc.expiryDate)}</div>
        </div>
        <div class="alert-days" style="background:var(--warning-light);color:var(--warning);">${days}天</div>
      </div>
    `;
  }).join('');
}

function renderRecentList(recent) {
  if (recent.length === 0) {
    return '<div class="empty-state" style="padding:30px;"><div class="empty-state-icon">📭</div>暂无文档，点击右上角上传</div>';
  }
  return recent.map(doc => `
    <div class="recent-item" onclick="showDetail(${doc.id})">
      <div class="recent-icon">${CATEGORY_ICONS[doc.category] || '📄'}</div>
      <div class="recent-info">
        <div class="recent-title">${escapeHtml(doc.title)}</div>
        <div class="recent-meta">${doc.category} · ${doc.subsidiary || '-'} · ${formatDate(doc.createdAt)}</div>
      </div>
      <span class="badge ${getStatusBadgeClass(doc)}">${getStatusText(doc)}</span>
    </div>
  `).join('');
}

// ========== 文档列表 ==========
async function renderDocuments(container) {
  container.innerHTML = `
    <div class="page-title">资质文档</div>
    <div class="page-subtitle">管理所有资质文件，支持搜索、筛选和排序</div>
    <div class="filter-bar">
      <div class="filter-group">
        <span class="filter-label">分类</span>
        <select class="filter-select" id="filterCategory" onchange="onFilterChange()">
          <option value="all">全部分类</option>
          ${CATEGORIES.map(c => `<option value="${c}" ${currentFilters.category === c ? 'selected' : ''}>${c}</option>`).join('')}
        </select>
      </div>
      <div class="filter-group">
        <span class="filter-label">分公司</span>
        <select class="filter-select" id="filterSubsidiary" onchange="onFilterChange()">
          <option value="all">全部分公司</option>
        </select>
      </div>
      <div class="filter-group">
        <span class="filter-label">状态</span>
        <select class="filter-select" id="filterStatus" onchange="onFilterChange()">
          <option value="all">全部状态</option>
          <option value="valid">有效</option>
          <option value="expiring">即将过期</option>
          <option value="expired">已过期</option>
          <option value="permanent">长期有效</option>
        </select>
      </div>
      <div class="filter-actions">
        <button class="btn btn-secondary btn-sm" onclick="resetFilters()">重置筛选</button>
      </div>
    </div>
    <div id="documents-table"><div class="empty-state">加载中...</div></div>
  `;

  // 加载分公司列表
  try {
    subsidiaries = await api('/api/subsidiaries');
    const sel = document.getElementById('filterSubsidiary');
    subsidiaries.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s;
      opt.textContent = s;
      if (currentFilters.subsidiary === s) opt.selected = true;
      sel.appendChild(opt);
    });
  } catch (e) {}

  loadDocumentsTable();
}

async function loadDocumentsTable() {
  const params = new URLSearchParams(currentFilters).toString();
  try {
    const docs = await api(`/api/documents?${params}`);
    const html = renderTable(docs);
    document.getElementById('documents-table').innerHTML = html;
  } catch (err) {
    document.getElementById('documents-table').innerHTML = `<div class="empty-state">加载失败: ${err.message}</div>`;
  }
}

function renderTable(docs) {
  if (docs.length === 0) {
    return `
      <div class="table-container">
        <div class="empty-state">
          <div class="empty-state-icon">📭</div>
          <div style="font-size:16px;font-weight:600;margin-bottom:4px;">暂无文档</div>
          <div style="margin-bottom:16px;">${currentFilters.keyword || currentFilters.category !== 'all' ? '没有符合条件的文档，试试调整筛选条件' : '点击右上角上传第一批文档'}</div>
          ${currentFilters.keyword || currentFilters.category !== 'all' ? '<button class="btn btn-secondary" onclick="resetFilters()">清除筛选</button>' : '<button class="btn btn-primary" onclick="navigateTo(\'upload\')">+ 上传文档</button>'}
        </div>
      </div>
    `;
  }

  return `
    <div class="table-container">
      <table>
        <thead>
          <tr>
            <th>文档名称</th>
            <th>分类</th>
            <th>分公司</th>
            <th class="mobile-hide">供应商/相关方</th>
            <th class="sortable" onclick="toggleSort('expiryDate')">到期日期 ${sortIcon('expiryDate')}</th>
            <th>状态</th>
            <th class="sortable mobile-hide" onclick="toggleSort('updatedAt')">更新时间 ${sortIcon('updatedAt')}</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          ${docs.map(doc => `
            <tr>
              <td>
                <div class="doc-title-cell" onclick="showDetail(${doc.id})">
                  <span class="doc-file-icon">${getFileIcon(doc.fileType)}</span>
                  <span class="doc-name">${escapeHtml(doc.title)}</span>
                </div>
              </td>
              <td><span class="badge badge-blue">${CATEGORY_ICONS[doc.category] || '📄'} ${doc.category}</span></td>
              <td>${escapeHtml(doc.subsidiary || '-')}</td>
              <td class="mobile-hide">${escapeHtml(doc.supplier || '-')}</td>
              <td>${doc.expiryDate ? formatDate(doc.expiryDate) : '<span style="color:var(--text-light)">长期</span>'}</td>
              <td><span class="badge ${getStatusBadgeClass(doc)}">${getStatusText(doc)}</span></td>
              <td class="mobile-hide" style="color:var(--text-secondary);font-size:13px;">${formatDate(doc.updatedAt)}</td>
              <td>
                <button class="btn-icon" title="查看" onclick="showDetail(${doc.id})">👁</button>
                ${IS_STATIC ? '' : `<button class="btn-icon" title="编辑" onclick="showEdit(${doc.id})">✏️</button>`}
                ${IS_STATIC ? '' : `<button class="btn-icon" title="删除" onclick="deleteDoc(${doc.id})">🗑</button>`}
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    <div style="text-align:center;color:var(--text-light);font-size:13px;margin-top:12px;">共 ${docs.length} 条记录</div>
  `;
}

function toggleSort(field) {
  if (currentFilters.sortBy === field) {
    currentFilters.sortOrder = currentFilters.sortOrder === 'asc' ? 'desc' : 'asc';
  } else {
    currentFilters.sortBy = field;
    currentFilters.sortOrder = 'desc';
  }
  loadDocumentsTable();
}

function sortIcon(field) {
  if (currentFilters.sortBy !== field) return '<span style="opacity:0.3;">↕</span>';
  return currentFilters.sortOrder === 'asc' ? '↑' : '↓';
}

function onFilterChange() {
  currentFilters.category = document.getElementById('filterCategory').value;
  currentFilters.subsidiary = document.getElementById('filterSubsidiary').value;
  currentFilters.status = document.getElementById('filterStatus').value;
  loadDocumentsTable();
}

function resetFilters() {
  currentFilters = {
    keyword: '',
    category: 'all',
    subsidiary: 'all',
    status: 'all',
    sortBy: 'updatedAt',
    sortOrder: 'desc'
  };
  document.getElementById('globalSearch').value = '';
  render();
}

// ========== 上传页面 ==========
function renderUpload(container) {
  container.innerHTML = `
    <div class="page-title">上传文档</div>
    <div class="page-subtitle">支持批量上传，填写资质信息便于后续检索</div>
    <div class="upload-container">
      <div class="upload-card">
        <div class="drop-zone" id="dropZone" onclick="document.getElementById('fileInput').click()">
          <div class="drop-zone-icon">📎</div>
          <div class="drop-zone-text">点击或拖拽文件到此处上传</div>
          <div class="drop-zone-hint">支持 PDF / 图片 / Word / Excel / PPT / 压缩包，单文件最大 50MB</div>
          <input type="file" id="fileInput" multiple style="display:none" onchange="handleFileSelect(event)">
        </div>
        <div class="file-list" id="fileList"></div>

        <form id="uploadForm" onsubmit="submitUpload(event)">
          <div class="form-group">
            <label class="form-label">文档标题 <span class="required">*</span></label>
            <input type="text" class="form-input" name="title" required placeholder="例：北京分公司营业执照">
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">分类 <span class="required">*</span></label>
              <select class="form-select" name="category" required>
                ${CATEGORIES.map(c => `<option value="${c}">${CATEGORY_ICONS[c]} ${c}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">所属分公司</label>
              <input type="text" class="form-input" name="subsidiary" placeholder="例：北京分公司" list="subsidiaryList">
              <datalist id="subsidiaryList">
                ${subsidiaries.map(s => `<option value="${escapeHtml(s)}">`).join('')}
              </datalist>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">供应商 / 相关方</label>
              <input type="text" class="form-input" name="supplier" placeholder="例：XX科技有限公司">
            </div>
            <div class="form-group">
              <label class="form-label">证书 / 合同编号</label>
              <input type="text" class="form-input" name="documentNumber" placeholder="例：91110000XXXXX">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">签发日期</label>
              <input type="date" class="form-input" name="issueDate">
            </div>
            <div class="form-group">
              <label class="form-label">到期日期</label>
              <input type="date" class="form-input" name="expiryDate">
              <div style="font-size:12px;color:var(--text-light);margin-top:4px;">无到期日期则视为长期有效</div>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">标签（逗号分隔）</label>
            <input type="text" class="form-input" name="tags" placeholder="例：重要, 已续期, 2025年度">
          </div>
          <div class="form-group">
            <label class="form-label">备注说明</label>
            <textarea class="form-textarea" name="description" placeholder="补充文档相关信息..."></textarea>
          </div>
          <div class="form-actions">
            <button type="button" class="btn btn-secondary" onclick="navigateTo('documents')">取消</button>
            <button type="submit" class="btn btn-primary" id="submitBtn">上传文档</button>
          </div>
        </form>
      </div>
    </div>
  `;

  // 拖拽事件
  const dropZone = document.getElementById('dropZone');
  dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('dragover'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
  dropZone.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    handleFiles(e.dataTransfer.files);
  });
}

let selectedFiles = [];

function handleFileSelect(event) {
  handleFiles(event.target.files);
}

function handleFiles(files) {
  for (const file of files) {
    selectedFiles.push(file);
  }
  renderFileList();
}

function renderFileList() {
  const list = document.getElementById('fileList');
  if (selectedFiles.length === 0) {
    list.innerHTML = '';
    return;
  }
  list.innerHTML = selectedFiles.map((file, i) => `
    <div class="file-item">
      <span>${getFileIcon('.' + file.name.split('.').pop())}</span>
      <span>${escapeHtml(file.name)}</span>
      <span style="color:var(--text-light);">${formatFileSize(file.size)}</span>
      <button class="file-item-remove" onclick="removeFile(${i})">&times;</button>
    </div>
  `).join('');
}

function removeFile(index) {
  selectedFiles.splice(index, 1);
  renderFileList();
}

async function submitUpload(event) {
  if (IS_STATIC) { showToast('只读模式，无法上传', 'info'); return; }
  event.preventDefault();
  if (selectedFiles.length === 0) {
    showToast('请至少选择一个文件', 'error');
    return;
  }

  const form = event.target;
  const formData = new FormData();
  selectedFiles.forEach(file => formData.append('files', file));
  
  ['title', 'category', 'subsidiary', 'supplier', 'documentNumber', 'issueDate', 'expiryDate', 'tags', 'description'].forEach(field => {
    formData.append(field, form[field].value);
  });

  const btn = document.getElementById('submitBtn');
  btn.disabled = true;
  btn.textContent = '上传中...';

  try {
    const res = await fetch('/api/documents', { method: 'POST', body: formData });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || '上传失败');
    }
    showToast('上传成功！', 'success');
    selectedFiles = [];
    navigateTo('documents');
  } catch (err) {
    showToast('上传失败: ' + err.message, 'error');
    btn.disabled = false;
    btn.textContent = '上传文档';
  }
}

// ========== 文档详情 ==========
async function showDetail(id) {
  try {
    const doc = await api(`/api/documents/${id}`);
    const body = document.getElementById('detailBody');
    document.getElementById('detailTitle').textContent = doc.title;

    let filePreview = '';
    const isPlaceholder = doc.fileName && doc.fileName.startsWith('placeholder');
    const fileUrl = IS_STATIC ? (isPlaceholder ? '' : (window.IS_CLOUD_STUDIO ? (window.LAN_SERVER || '') + '/api/documents/' + doc.id + '/file' : '/files/' + doc.filePath)) : '/api/documents/' + doc.id + '/file';

    if (isPlaceholder) {
      filePreview = `
        <div class="file-preview file-preview-other">
          <div class="file-preview-other-icon">📭</div>
          <div style="margin-bottom:4px;font-weight:600;">暂无附件文件</div>
          <div style="font-size:13px;color:var(--text-secondary);">此记录从Excel导入，尚未上传实际证件文件</div>
        </div>
      `;
    } else if (doc.fileType && ['.jpg', '.jpeg', '.png', '.gif', '.bmp'].includes(doc.fileType)) {
      filePreview = `
        <div class="file-preview">
          <img src="${fileUrl}" alt="${escapeHtml(doc.title)}" style="max-width:100%;cursor:pointer;" onclick="window.open('${fileUrl}','_blank')">
        </div>
      `;
    } else if (doc.fileType === '.pdf') {
      filePreview = `
        <div class="file-preview file-preview-pdf">
          <a href="${fileUrl}" target="_blank">📄 查看PDF文件</a>
        </div>
      `;
    } else {
      filePreview = `
        <div class="file-preview file-preview-other">
          <div class="file-preview-other-icon">${getFileIcon(doc.fileType)}</div>
          <div style="margin-bottom:12px;">${escapeHtml(doc.fileName || '')}</div>
          <a href="${fileUrl}" target="_blank" class="btn btn-primary">下载文件</a>
        </div>
      `;
    }

    body.innerHTML = `
      <div class="detail-section">
        <div class="file-preview" style="margin-bottom:20px;">
          ${filePreview}
        </div>
      </div>
      <div class="detail-section">
        <div class="detail-section-title">基本信息</div>
        <div class="detail-grid">
          <div>
            <div class="detail-field-label">分类</div>
            <div class="detail-field-value"><span class="badge badge-blue">${CATEGORY_ICONS[doc.category] || '📄'} ${doc.category}</span></div>
          </div>
          <div>
            <div class="detail-field-label">状态</div>
            <div class="detail-field-value"><span class="badge ${getStatusBadgeClass(doc)}">${getStatusText(doc)}</span></div>
          </div>
          <div>
            <div class="detail-field-label">所属分公司</div>
            <div class="detail-field-value">${escapeHtml(doc.subsidiary || '-')}</div>
          </div>
          <div>
            <div class="detail-field-label">供应商/相关方</div>
            <div class="detail-field-value">${escapeHtml(doc.supplier || '-')}</div>
          </div>
          <div>
            <div class="detail-field-label">证书/合同编号</div>
            <div class="detail-field-value">${escapeHtml(doc.documentNumber || '-')}</div>
          </div>
          <div>
            <div class="detail-field-label">文件大小</div>
            <div class="detail-field-value">${formatFileSize(doc.fileSize || 0)}</div>
          </div>
          <div>
            <div class="detail-field-label">签发日期</div>
            <div class="detail-field-value">${doc.issueDate ? formatDate(doc.issueDate) : '-'}</div>
          </div>
          <div>
            <div class="detail-field-label">到期日期</div>
            <div class="detail-field-value">${doc.expiryDate ? formatDate(doc.expiryDate) : '<span style="color:var(--text-light)">长期有效</span>'}</div>
          </div>
        </div>
      </div>
      ${doc.tags ? `
      <div class="detail-section">
        <div class="detail-section-title">标签</div>
        <div>${doc.tags.split(',').map(t => `<span class="badge badge-gray" style="margin-right:6px;">${escapeHtml(t.trim())}</span>`).join('')}</div>
      </div>` : ''}
      ${doc.description ? `
      <div class="detail-section">
        <div class="detail-section-title">备注说明</div>
        <div style="font-size:14px;line-height:1.8;color:var(--text-secondary);">${escapeHtml(doc.description)}</div>
      </div>` : ''}
      <div class="detail-section">
        <div class="detail-section-title">时间信息</div>
        <div class="detail-grid">
          <div>
            <div class="detail-field-label">创建时间</div>
            <div class="detail-field-value">${formatDateTime(doc.createdAt)}</div>
          </div>
          <div>
            <div class="detail-field-label">更新时间</div>
            <div class="detail-field-value">${formatDateTime(doc.updatedAt)}</div>
          </div>
        </div>
      </div>
      <div class="detail-actions">
        <button class="btn btn-secondary" onclick="closeModal('detailModal')">关闭</button>
        ${IS_STATIC ? '' : `<button class="btn btn-primary" onclick="closeModal('detailModal');showEdit(${doc.id})">编辑</button>`}
        ${IS_STATIC ? '' : `<button class="btn btn-danger" onclick="deleteDoc(${doc.id}, true)">删除</button>`}
        ${isPlaceholder ? '' : `<a href="${fileUrl}" target="_blank" class="btn btn-secondary" style="margin-left:auto;">下载文件</a>`}
      </div>
    `;

    openModal('detailModal');
  } catch (err) {
    showToast('加载失败: ' + err.message, 'error');
  }
}

// ========== 编辑文档 ==========
async function showEdit(id) {
  if (IS_STATIC) { showToast('只读模式，无法编辑', 'info'); return; }
  try {
    const doc = await api(`/api/documents/${id}`);
    const body = document.getElementById('editBody');
    body.innerHTML = `
      <form onsubmit="submitEdit(event, ${id})">
        <div class="form-group">
          <label class="form-label">文档标题 <span class="required">*</span></label>
          <input type="text" class="form-input" name="title" required value="${escapeAttr(doc.title)}">
        </div>

        <div class="form-group" style="margin-bottom:20px;">
          <label class="form-label">文件 / 附件</label>
          <div id="currentFileInfo" style="padding:12px 16px;background:var(--bg);border-radius:8px;border:1px solid var(--border);margin-bottom:12px;">
            ${doc.fileName && doc.filePath ? `
              <div style="display:flex;align-items:center;gap:10px;">
                <span style="font-size:20px;">${getFileIcon(doc.fileType)}</span>
                <div>
                  <div style="font-weight:600;">${escapeHtml(doc.fileName)}</div>
                  <div style="font-size:12px;color:var(--text-secondary);">${formatFileSize(doc.fileSize)} · ${doc.fileType} 文件</div>
                </div>
              </div>
            ` : `
              <div style="display:flex;align-items:center;gap:10px;color:var(--text-secondary);">
                <span style="font-size:20px;">📭</span>
                <div>
                  <div style="font-weight:500;">暂无附件文件</div>
                  <div style="font-size:12px;">此记录从Excel导入，尚未上传实际文件</div>
                </div>
              </div>
            `}
          </div>
          <div style="display:flex;align-items:center;gap:12px;">
            <label class="btn btn-secondary btn-sm" style="cursor:pointer;display:inline-flex;align-items:center;gap:4px;margin:0;">
              📎 选择新文件替换
              <input type="file" id="replaceFileInput" style="display:none" onchange="onReplaceFileSelected(event)" accept=".pdf,.jpg,.jpeg,.png,.gif,.bmp,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.rar">
            </label>
            <span id="replaceFileName" style="font-size:13px;color:var(--text-secondary);"></span>
            <button type="button" id="replaceFileBtn" class="btn btn-primary btn-sm" style="display:none;" onclick="submitReplaceFile(${id})">上传替换</button>
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label class="form-label">分类</label>
            <select class="form-select" name="category">
              ${CATEGORIES.map(c => `<option value="${c}" ${doc.category === c ? 'selected' : ''}>${CATEGORY_ICONS[c]} ${c}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">所属分公司</label>
            <input type="text" class="form-input" name="subsidiary" value="${escapeAttr(doc.subsidiary || '')}">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">供应商/相关方</label>
            <input type="text" class="form-input" name="supplier" value="${escapeAttr(doc.supplier || '')}">
          </div>
          <div class="form-group">
            <label class="form-label">证书/合同编号</label>
            <input type="text" class="form-input" name="documentNumber" value="${escapeAttr(doc.documentNumber || '')}">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">签发日期</label>
            <input type="date" class="form-input" name="issueDate" value="${doc.issueDate || ''}">
          </div>
          <div class="form-group">
            <label class="form-label">到期日期</label>
            <input type="date" class="form-input" name="expiryDate" value="${doc.expiryDate || ''}">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">标签</label>
          <input type="text" class="form-input" name="tags" value="${escapeAttr(doc.tags || '')}">
        </div>
        <div class="form-group">
          <label class="form-label">备注说明</label>
          <textarea class="form-textarea" name="description">${escapeHtml(doc.description || '')}</textarea>
        </div>
        <div class="form-actions">
          <button type="button" class="btn btn-secondary" onclick="closeModal('editModal')">取消</button>
          <button type="submit" class="btn btn-primary">保存修改</button>
        </div>
      </form>
    `;
    openModal('editModal');
  } catch (err) {
    showToast('加载失败: ' + err.message, 'error');
  }
}

async function submitEdit(event, id) {
  event.preventDefault();
  const form = event.target;
  const data = {};
  ['title', 'category', 'subsidiary', 'supplier', 'documentNumber', 'issueDate', 'expiryDate', 'tags', 'description'].forEach(field => {
    data[field] = form[field].value;
  });
  try {
    await api(`/api/documents/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    showToast('修改成功！', 'success');
    closeModal('editModal');
    if (currentView === 'documents') loadDocumentsTable();
    if (currentView === 'dashboard') render();
  } catch (err) {
    showToast('修改失败: ' + err.message, 'error');
  }
}

// ========== 文件替换 ==========
function onReplaceFileSelected(event) {
  const file = event.target.files[0];
  if (!file) return;
  document.getElementById('replaceFileName').textContent = file.name + ' (' + formatFileSize(file.size) + ')';
  document.getElementById('replaceFileBtn').style.display = 'inline-flex';
}

async function submitReplaceFile(id) {
  if (IS_STATIC) { showToast('只读模式，无法替换文件', 'info'); return; }
  const fileInput = document.getElementById('replaceFileInput');
  if (!fileInput.files.length) {
    showToast('请先选择文件', 'error');
    return;
  }

  const btn = document.getElementById('replaceFileBtn');
  btn.disabled = true;
  btn.textContent = '上传中...';

  const formData = new FormData();
  formData.append('file', fileInput.files[0]);

  try {
    const res = await fetch(`/api/documents/${id}/replace-file`, {
      method: 'POST',
      body: formData
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: '替换失败' }));
      throw new Error(err.error || '替换失败');
    }
    const data = await res.json();
    showToast('文件替换成功！', 'success');

    // 更新编辑表单中的文件信息显示
    const doc = data.document;
    const fileInfoEl = document.getElementById('currentFileInfo');
    if (doc.fileName && doc.filePath) {
      fileInfoEl.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;">
          <span style="font-size:20px;">${getFileIcon(doc.fileType)}</span>
          <div>
            <div style="font-weight:600;">${escapeHtml(doc.fileName)}</div>
            <div style="font-size:12px;color:var(--text-secondary);">${formatFileSize(doc.fileSize)} · ${doc.fileType} 文件</div>
          </div>
        </div>
      `;
    }

    // 重置选择
    document.getElementById('replaceFileName').textContent = '';
    document.getElementById('replaceFileBtn').style.display = 'none';
    fileInput.value = '';
    btn.disabled = false;
    btn.textContent = '上传替换';
  } catch (err) {
    showToast('替换失败: ' + err.message, 'error');
    btn.disabled = false;
    btn.textContent = '上传替换';
  }
}

// ========== 删除文档 ==========
async function deleteDoc(id, fromDetail = false) {
  if (IS_STATIC) { showToast('只读模式，无法删除', 'info'); return; }
  if (!confirm('确定要删除这个文档吗？关联的文件也会被删除，此操作不可恢复。')) return;
  try {
    await api(`/api/documents/${id}`, { method: 'DELETE' });
    showToast('删除成功', 'success');
    if (fromDetail) closeModal('detailModal');
    if (currentView === 'documents') loadDocumentsTable();
    if (currentView === 'dashboard') render();
  } catch (err) {
    showToast('删除失败: ' + err.message, 'error');
  }
}

// ========== 工具函数 ==========
function getDocStatus(doc) {
  if (!doc.expiryDate) return 'permanent';
  const now = new Date();
  const expiry = new Date(doc.expiryDate);
  if (isNaN(expiry.getTime())) return 'permanent';
  const diffDays = Math.floor((expiry - now) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return 'expired';
  if (diffDays <= 30) return 'expiring';
  return 'valid';
}

function getStatusText(doc) {
  if (!doc.expiryDate) return '长期有效';
  const now = new Date();
  const expiry = new Date(doc.expiryDate);
  const diffDays = Math.floor((expiry - now) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return '已过期';
  if (diffDays <= 30) return `${diffDays}天后过期`;
  return '有效';
}

function getStatusBadgeClass(doc) {
  if (!doc.expiryDate) return 'badge-gray';
  const now = new Date();
  const expiry = new Date(doc.expiryDate);
  const diffDays = Math.floor((expiry - now) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return 'badge-red';
  if (diffDays <= 30) return 'badge-orange';
  return 'badge-green';
}

function getFileIcon(ext) {
  const icons = {
    '.pdf': '📕', '.doc': '📘', '.docx': '📘',
    '.xls': '📗', '.xlsx': '📗',
    '.ppt': '📙', '.pptx': '📙',
    '.jpg': '🖼️', '.jpeg': '🖼️', '.png': '🖼️', '.gif': '🖼️', '.bmp': '🖼️',
    '.zip': '🗜️', '.rar': '🗜️'
  };
  return icons[ext] || '📄';
}

function formatDate(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDateTime(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return `${formatDate(dateStr)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function escapeAttr(str) {
  if (!str) return '';
  return str.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ========== 弹窗控制 ==========
function openModal(id) {
  document.getElementById(id).classList.add('show');
}

function closeModal(id) {
  document.getElementById(id).classList.remove('show');
}

// 点击遮罩关闭
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', e => {
    if (e.target === overlay) overlay.classList.remove('show');
  });
});

// ========== Toast ==========
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  const icons = { success: '✅', error: '❌', info: 'ℹ️' };
  toast.innerHTML = `<span>${icons[type]}</span> ${escapeHtml(message)}`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ========== Excel批量导入 ==========
let importPreviewData = null;

function renderImport(container) {
  container.innerHTML = `
    <div class="page-title">Excel 批量导入</div>
    <div class="page-subtitle">上传 Excel 文件，自动识别列结构，批量导入资质数据</div>
    <div class="upload-container" style="max-width:800px;">
      <div class="upload-card">
        <div class="drop-zone" id="importDropZone" onclick="document.getElementById('importFileInput').click()">
          <div class="drop-zone-icon">📊</div>
          <div class="drop-zone-text">点击或拖拽 Excel 文件到此处</div>
          <div class="drop-zone-hint">支持 .xlsx / .xls / .csv 文件</div>
          <input type="file" id="importFileInput" accept=".xlsx,.xls,.csv" style="display:none" onchange="handleImportFile(event)">
        </div>
        <div id="importPreview"></div>
      </div>
    </div>
  `;

  const dropZone = document.getElementById('importDropZone');
  dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('dragover'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
  dropZone.addEventListener('drop', e => {
    e.preventDefault(); dropZone.classList.remove('dragover');
    if (e.dataTransfer.files.length) {
      handleImportFileObj(e.dataTransfer.files[0]);
    }
  });
}

async function handleImportFile(event) {
  const file = event.target.files[0];
  if (!file) return;
  handleImportFileObj(file);
}

async function handleImportFileObj(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  if (!['xlsx', 'xls', 'csv'].includes(ext)) {
    showToast('请上传 Excel 文件', 'error');
    return;
  }

  const previewEl = document.getElementById('importPreview');
  previewEl.innerHTML = '<div class="empty-state">正在解析...</div>';

  const formData = new FormData();
  formData.append('file', file);

  try {
    const result = await fetch('/api/import/excel/preview', { method: 'POST', body: formData });
    if (!result.ok) throw new Error('解析失败');
    const data = await result.json();
    importPreviewData = data;
    renderImportPreview(data, file.name);
  } catch (err) {
    previewEl.innerHTML = `<div class="empty-state">解析失败: ${err.message}</div>`;
  }
}

function renderImportPreview(data, fileName) {
  const previewEl = document.getElementById('importPreview');

  // 字段映射选项
  const fieldOptions = [
    { value: '', label: '-- 不映射 --' },
    { value: 'title', label: '文档标题' },
    { value: 'category', label: '分类' },
    { value: 'subsidiary', label: '所属主体/分公司' },
    { value: 'supplier', label: '供应商/颁发机构' },
    { value: 'documentNumber', label: '证书编号' },
    { value: 'issueDate', label: '签发/颁发日期' },
    { value: 'expiryDate', label: '到期日期' },
    { value: 'tags', label: '标签' },
    { value: 'description', label: '备注说明' }
  ];

  let sheetsHtml = data.sheets.map(sheet => {
    // 智能默认映射：根据列名自动匹配
    const defaultMapping = {};
    sheet.columns.forEach(col => {
      const lower = col.toLowerCase();
      if (lower.includes('名称') || lower.includes('标题') || lower === '荣誉名称' || lower === '文件名称') defaultMapping[col] = 'title';
      else if (lower.includes('类型') || lower.includes('分类') || lower.includes('类别') || lower === '类型') defaultMapping[col] = 'category';
      else if (lower.includes('主体') || lower.includes('公司') || lower.includes('分公司') || lower.includes('子公司') || lower === '主体') defaultMapping[col] = 'subsidiary';
      else if (lower.includes('颁发') || lower.includes('机构') || lower.includes('供应商') || lower === '颁发机构') defaultMapping[col] = 'supplier';
      else if (lower.includes('编号') || lower.includes('证号')) defaultMapping[col] = 'documentNumber';
      else if (lower.includes('签发') || lower.includes('颁发日期') || lower.includes('获奖') || lower.includes('年份') || lower === '颁发日期' || lower === '获奖年份') defaultMapping[col] = 'issueDate';
      else if (lower.includes('到期') || lower.includes('有效') || lower.includes('截止')) defaultMapping[col] = 'expiryDate';
      else if (lower.includes('标签') || lower.includes('标记')) defaultMapping[col] = 'tags';
      else if (lower.includes('备注') || lower.includes('说明') || lower.includes('描述') || lower.includes('场景') || lower.includes('文档') || lower === '适用场景' || lower === '荣誉文件') defaultMapping[col] = 'description';
    });

    return `
      <div class="panel" style="margin-bottom:16px;">
        <div class="panel-header">
          <div class="panel-title">📌 Sheet: ${escapeHtml(sheet.name)} (${sheet.rows} 行数据)</div>
        </div>
        <div style="margin-bottom:16px;">
          <table style="width:100%;font-size:13px;">
            <thead>
              <tr style="background:var(--bg);">
                <th style="padding:8px;font-size:12px;">Excel列名</th>
                <th style="padding:8px;font-size:12px;">预览数据（前3行）</th>
                <th style="padding:8px;font-size:12px;">映射到字段</th>
              </tr>
            </thead>
            <tbody>
              ${sheet.columns.map(col => {
                const previewVals = sheet.data.map(row => String(row[col] || '').substring(0, 30)).join('、');
                const selected = defaultMapping[col] || '';
                return `
                  <tr>
                    <td style="padding:8px;font-weight:600;">${escapeHtml(col)}</td>
                    <td style="padding:8px;color:var(--text-secondary);max-width:200px;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(previewVals)}</td>
                    <td style="padding:8px;">
                      <select class="filter-select" style="width:100%;" data-sheet="${escapeAttr(sheet.name)}" data-column="${escapeAttr(col)}" onchange="updateImportMapping()">
                        ${fieldOptions.map(opt => `<option value="${opt.value}" ${opt.value === selected ? 'selected' : ''}>${opt.label}</option>`).join('')}
                      </select>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }).join('');

  previewEl.innerHTML = `
    <div style="margin-bottom:12px;font-size:15px;font-weight:600;">📄 ${escapeHtml(fileName)}</div>
    ${sheetsHtml}
    <div style="display:flex;gap:12px;align-items:center;margin-top:20px;padding-top:16px;border-top:1px solid var(--border);">
      <label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer;">
        <input type="checkbox" id="importClearExisting" style="width:16px;height:16px;">
        导入前清除现有数据
      </label>
      <div style="margin-left:auto;display:flex;gap:12px;">
        <button class="btn btn-secondary" onclick="navigateTo('documents')">取消</button>
        <button class="btn btn-primary" onclick="executeImport()">🚀 开始导入</button>
      </div>
    </div>
    <div id="importResult"></div>
  `;
}

function updateImportMapping() {
  // 映射实时更新，不需要额外操作
}

function buildMappingFromUI() {
  const mapping = {};
  document.querySelectorAll('select[data-sheet]').forEach(sel => {
    const sheetName = sel.dataset.sheet;
    const column = sel.dataset.column;
    const field = sel.value;
    if (field) {
      if (!mapping[sheetName]) mapping[sheetName] = {};
      mapping[sheetName][field] = column;
    }
  });
  return mapping;
}

async function executeImport() {
  if (!importPreviewData) {
    showToast('请先上传 Excel 文件', 'error');
    return;
  }

  // 检查是否有 title 映射
  const mapping = buildMappingFromUI();
  let hasTitle = false;
  Object.values(mapping).forEach(m => { if (m.title) hasTitle = true; });
  if (!hasTitle) {
    showToast('请至少映射一列到"文档标题"字段', 'error');
    return;
  }

  const clearExisting = document.getElementById('importClearExisting').checked;
  const resultEl = document.getElementById('importResult');
  resultEl.innerHTML = '<div class="empty-state" style="padding:20px;">正在导入，请稍候...</div>';

  // 需要重新上传文件
  const fileInput = document.getElementById('importFileInput');
  if (!fileInput.files.length) {
    resultEl.innerHTML = '<div class="empty-state" style="padding:20px;">请重新选择文件后导入</div>';
    showToast('文件引用已丢失，请重新上传', 'error');
    return;
  }

  const formData = new FormData();
  formData.append('file', fileInput.files[0]);
  formData.append('mapping', JSON.stringify(mapping));
  formData.append('clearExisting', clearExisting ? 'true' : 'false');

  try {
    const result = await fetch('/api/import/excel', { method: 'POST', body: formData });
    if (!result.ok) throw new Error('导入失败');
    const data = await result.json();

    resultEl.innerHTML = `
      <div class="panel" style="background:var(--success-light);border:1px solid var(--success);">
        <div style="font-size:16px;font-weight:600;color:var(--success);margin-bottom:8px;">✅ 导入成功！</div>
        <div>共导入 <strong>${data.imported}</strong> 条记录</div>
        <div style="margin-top:12px;">
          <button class="btn btn-primary" onclick="navigateTo('documents')">查看文档列表</button>
          <button class="btn btn-secondary" onclick="navigateTo('dashboard')">返回仪表盘</button>
        </div>
      </div>
    `;
    showToast(`成功导入 ${data.imported} 条记录！`, 'success');
  } catch (err) {
    resultEl.innerHTML = `<div class="empty-state" style="padding:20px;">导入失败: ${err.message}</div>`;
    showToast('导入失败: ' + err.message, 'error');
  }
}

// ========== 事件绑定 ==========
document.querySelectorAll('.nav-item[data-view]').forEach(el => {
  el.addEventListener('click', e => {
    e.preventDefault();
    navigateTo(el.dataset.view);
  });
});

document.querySelectorAll('.filter-link').forEach(el => {
  el.addEventListener('click', e => {
    e.preventDefault();
    navigateTo('documents', { category: el.dataset.category });
  });
});

let searchTimer;
document.getElementById('globalSearch').addEventListener('input', e => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    currentFilters.keyword = e.target.value;
    if (currentView !== 'documents') {
      navigateTo('documents');
    } else {
      loadDocumentsTable();
    }
  }, 300);
});

// ========== 初始化 ==========
render();
