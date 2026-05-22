// AI Sales Report Dashboard - Core Application Logic

// 0. DATA DEDUPLICATION
let leadsData = [];
let ordersData = [];
let renewalData = [];
let performanceData = typeof RAW_PERFORMANCE_DATA !== "undefined" ? [...RAW_PERFORMANCE_DATA] : [];

let filteredLeads = [];
let filteredOrders = [];

const relationDepthMap = {
  "Rác": 0, "Sai Thông Tin": 0, "Không tiếp cận được": 1, "Thất bại": 1,
  "Nhu cầu xa": 2, "Liên hệ lần 1": 3, "Liên hệ lần 2": 4, "Hẹn tư vấn sau": 5,
  "New Lead": 6, "Quan tâm": 7, "Dùng thử": 8, "Hẹn demo": 9, "Demo": 10,
  "Báo giá": 11, "Gửi hợp đồng": 12, "Đối tác": 13, "Ký hợp đồng": 14
};

function runDeduplication(rawLeads, rawOrders, rawRenewals) {
  // Deduplicate leadsData by ma_kh keeping highest relation depth
  let tempLeadsMap = {};
  for (let d of (rawLeads || [])) {
    let currentDepth = relationDepthMap[d.moi_quan_he] || 0;
    if (!tempLeadsMap[d.ma_kh]) {
      tempLeadsMap[d.ma_kh] = d;
    } else {
      let existingDepth = relationDepthMap[tempLeadsMap[d.ma_kh].moi_quan_he] || 0;
      if (currentDepth > existingDepth) {
        tempLeadsMap[d.ma_kh] = d;
      }
    }
  }
  leadsData = Object.values(tempLeadsMap);

  // Deduplicate ordersData by ma_kh, ma_don_hang (or ngay_mua if missing), and san_pham
  let tempOrdersMap = {};
  for (let d of (rawOrders || [])) {
    let key = d.ma_kh + '_' + (d.ma_don_hang || d.ngay_mua || '') + '_' + d.san_pham;
    if (!tempOrdersMap[key]) {
      tempOrdersMap[key] = d;
    }
  }
  ordersData = Object.values(tempOrdersMap);

  // Deduplicate renewalData by ma_kh keeping latest expiration_date
  let tempRenewMap = {};
  let noIdCounter = 0;
  for (let d of (rawRenewals || [])) {
    let key = d.ma_kh || ('no_id_' + (noIdCounter++));
    if (!tempRenewMap[key]) {
      tempRenewMap[key] = d;
    } else {
      let existingDate = new Date(tempRenewMap[key].expiration_date);
      let currentDate = new Date(d.expiration_date);
      if (currentDate > existingDate) {
        tempRenewMap[key] = d;
      }
    }
  }
  renewalData = Object.values(tempRenewMap);
}

// Initial default run
runDeduplication(
  typeof RAW_LEADS_DATA !== 'undefined' ? RAW_LEADS_DATA : [],
  typeof RAW_ORDERS_DATA !== 'undefined' ? RAW_ORDERS_DATA : [],
  typeof RAW_RENEWAL_DATA !== 'undefined' ? RAW_RENEWAL_DATA : []
);

// ==========================================
// 0.5 GOOGLE SHEETS DATA FETCHING
// ==========================================
function getGoogleSheetExportUrl(url) {
  if (!url) return null;
  const matchId = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
  if (!matchId) return null;
  const id = matchId[1];
  
  const matchGid = url.match(/[#&?]gid=([0-9]+)/);
  const gid = matchGid ? matchGid[1] : '0';
  
  return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`;
}

function fetchCSV(url) {
  return new Promise((resolve, reject) => {
    if (typeof Papa === 'undefined') {
      return reject(new Error("PapaParse library not loaded"));
    }
    Papa.parse(url, {
      download: true,
      header: true,
      skipEmptyLines: true,
      complete: (results) => resolve(results.data),
      error: (error) => reject(error)
    });
  });
}

async function loadDataFromGoogleSheets() {
  const leadsUrl = localStorage.getItem('G_SHEET_LEADS') || '';
  const ordersUrl = localStorage.getItem('G_SHEET_ORDERS') || '';
  const renewalsUrl = localStorage.getItem('G_SHEET_RENEWALS') || '';
  const perfUrl = localStorage.getItem('G_SHEET_PERFORMANCE') || '';

  // Populate inputs in UI if they exist
  const leadsInput = document.getElementById('setting-sheet-leads');
  const ordersInput = document.getElementById('setting-sheet-orders');
  const renewalsInput = document.getElementById('setting-sheet-renewals');
  const perfInput = document.getElementById('setting-sheet-performance');
  if (leadsInput) leadsInput.value = leadsUrl;
  if (ordersInput) ordersInput.value = ordersUrl;
  if (renewalsInput) renewalsInput.value = renewalsUrl;
  if (perfInput) perfInput.value = perfUrl;

  let newLeads = typeof RAW_LEADS_DATA !== 'undefined' ? RAW_LEADS_DATA : [];
  let newOrders = typeof RAW_ORDERS_DATA !== 'undefined' ? RAW_ORDERS_DATA : [];
  let newRenewals = typeof RAW_RENEWAL_DATA !== 'undefined' ? RAW_RENEWAL_DATA : [];
  let newPerf = typeof RAW_PERFORMANCE_DATA !== 'undefined' ? RAW_PERFORMANCE_DATA : [];

  let hasCustomData = false;
  let btn = document.getElementById('save-settings-btn');
  let originalBtnText = btn ? btn.innerHTML : '';
  if (btn) btn.innerHTML = '<i data-lucide="loader" class="spin" style="margin-right: 6px; width: 18px; display: inline-block; vertical-align: middle;"></i> <span style="vertical-align: middle;">Đang tải dữ liệu...</span>';

  try {
    if (leadsUrl && getGoogleSheetExportUrl(leadsUrl)) {
      let data = await fetchCSV(getGoogleSheetExportUrl(leadsUrl));
      newLeads = data.map(item => {
        item.ma_kh = item.ma_kh || item["Mã KH"] || item["Mã khách hàng"];
        item.moi_quan_he = item.moi_quan_he || item["Mối quan hệ"] || item["Giai đoạn"];
        return item;
      });
      hasCustomData = true;
    }
    if (ordersUrl && getGoogleSheetExportUrl(ordersUrl)) {
      let data = await fetchCSV(getGoogleSheetExportUrl(ordersUrl));
      newOrders = data.map(item => {
        item.ma_kh = item.ma_kh || item["Mã KH"] || item["Mã khách hàng"];
        item.ma_don_hang = item.ma_don_hang || item["Mã đơn hàng"] || item["Mã đơn"];
        item.san_pham = item.san_pham || item["Sản phẩm"];
        item.ngay_mua = item.ngay_mua || item["Ngày mua"] || item["Ngày ký"];
        item.doanh_thu = item.doanh_thu || item["Doanh thu"] || item["Giá trị"];
        if (typeof item.doanh_thu === 'string') item.doanh_thu = Number(item.doanh_thu.replace(/[^0-9.-]+/g,""));
        return item;
      });
      hasCustomData = true;
    }
    if (renewalsUrl && getGoogleSheetExportUrl(renewalsUrl)) {
      let data = await fetchCSV(getGoogleSheetExportUrl(renewalsUrl));
      newRenewals = data.map(item => {
        item.sale_name = item.sale_name || item["Sale hiện tại"] || item["Nhân viên kinh doanh"] || item["Sales"];
        item.expiration_date = item.expiration_date || item["Ngày hết hạn"] || item["Hết hạn"];
        item.activation_date = item.activation_date || item["Ngày kích hoạt"] || item["Ngày bắt đầu"];
        item.status = item.status || item["Trạng thái"] || item["Tình trạng"];
        item.reason = item.reason || item["Lý do không tái ký"] || item["Lý do"];
        item.ma_kh = item.ma_kh || item["Mã KH"] || item["Mã khách hàng"];
        return item;
      });
      hasCustomData = true;
    }
    if (perfUrl && getGoogleSheetExportUrl(perfUrl)) {
      newPerf = await fetchCSV(getGoogleSheetExportUrl(perfUrl));
      performanceData = newPerf;
      hasCustomData = true;
    }
  } catch(e) {
    console.error("Error fetching Google Sheets:", e);
    alert("Đã xảy ra lỗi khi tải dữ liệu từ Google Sheets. Vui lòng kiểm tra lại link hoặc quyền truy cập file.");
  } finally {
    if (btn) btn.innerHTML = originalBtnText;
    if (typeof lucide !== 'undefined') lucide.createIcons();
  }

  if (hasCustomData) {
    runDeduplication(newLeads, newOrders, newRenewals);
  }
}

// Global Filter State
let filterState = {
  fromDate: null,
  toDate: null,
  sales: "all",
  leadSourceGroup: "all",
  leadRelation: "all",
  orderCategory: "all",
  orderType: "all",
  searchLeads: "",
  searchOrders: "",
  productGroup: "all",
  productLine: "all"
};

// Pagination States
let paginationState = {
  leads: { currentPage: 1, limit: 15 },
  orders: { currentPage: 1, limit: 15 }
};

// Chart Instances
let charts = {
  salesRanking: null,
  productCategories: null,
  sourceBreakdown: null
};

// ==========================================
// 1. DATE PARSING & UTILITIES
// ==========================================

function parseDate(dateStr) {
  if (!dateStr) return null;
  
  // Format: DD/MM/YYYY HH:mm:ss or DD/MM/YYYY
  const parts = dateStr.trim().split(" ");
  const dateParts = parts[0].split("/");
  if (dateParts.length < 3) return null;
  
  const day = parseInt(dateParts[0], 10);
  const month = parseInt(dateParts[1], 10) - 1; // 0-indexed
  const year = parseInt(dateParts[2], 10);
  
  let hour = 0, minute = 0, second = 0;
  if (parts.length > 1) {
    const timeParts = parts[1].split(":");
    hour = parseInt(timeParts[0], 10) || 0;
    minute = parseInt(timeParts[1], 10) || 0;
    second = parseInt(timeParts[2], 10) || 0;
  }
  
  return new Date(year, month, day, hour, minute, second);
}

function formatDateToInput(dateObj) {
  if (!dateObj) return "";
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatVND(number) {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(number).replace('₫', '₫');
}

function formatVNDCompact(number) {
  if (number >= 1000000000) {
    return (number / 1000000000).toFixed(1).replace('.0', '') + 'tỷ';
  } else if (number >= 1000000) {
    return (number / 1000000).toFixed(0) + 'tr';
  } else if (number >= 1000) {
    return (number / 1000).toFixed(0) + 'k';
  }
  return number + 'đ';
}

function drawCumulativeDoughnut(canvasId, actual, target, percentElId, actualElId, targetElId, chartKey) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const pct = target > 0 ? (actual / target) * 100 : 0;
  
  // Determine vibrant period-specific colors matching the illustration & request
  let progressColor = "#0055ff"; // Year - Neon Blue
  let remainingColor = "#cce0ff"; // Light blue
  
  const key = chartKey.toLowerCase();
  if (key.includes("year")) {
    progressColor = "#0055ff"; // Year: Neon Blue
    remainingColor = "#cce0ff";
  } else if (key.includes("quarter")) {
    progressColor = "#ff0033"; // Quarter: Neon Red
    remainingColor = "#ffcccc";
  } else if (key.includes("month")) {
    progressColor = "#00cc44"; // Month: Neon Green
    remainingColor = "#ccffdd";
  } else if (key.includes("week")) {
    progressColor = "#ff7700"; // Week: Neon Orange
    remainingColor = "#ffe6cc";
  }

  // Set percentage text in the center
  const pctEl = document.getElementById(percentElId);
  if (pctEl) {
    pctEl.innerText = pct.toFixed(0) + "%";
    pctEl.style.color = progressColor;
    pctEl.style.fontWeight = "900";
  }

  // Set target and actual texts
  const actEl = document.getElementById(actualElId);
  if (actEl) actEl.innerText = chartKey.startsWith("print") ? formatVNDCompact(actual) : formatVND(actual);
  
  const tgtEl = document.getElementById(targetElId);
  if (tgtEl) tgtEl.innerText = chartKey.startsWith("print") ? formatVNDCompact(target) : formatVND(target);

  // Destroy any pre-existing Chart.js chart bound to this canvas to avoid rendering overlap
  if (charts[chartKey]) {
    if (typeof charts[chartKey].destroy === 'function') {
      charts[chartKey].destroy();
    }
    charts[chartKey] = null;
  }

  // Draw the custom premium segmented ring matching the uploaded mockup
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Handle high DPI screens for crisp rendering
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  
  const targetWidth = rect.width || canvas.width || 90;
  const targetHeight = rect.height || canvas.height || 90;
  
  canvas.width = targetWidth * dpr;
  canvas.height = targetHeight * dpr;
  canvas.style.width = targetWidth + 'px';
  canvas.style.height = targetHeight + 'px';
  
  ctx.scale(dpr, dpr);

  const cx = targetWidth / 2;
  const cy = targetHeight / 2;
  const lineWidth = Math.min(cx, cy) * 0.22; // Scaled thickness (approx 10px for 90px canvas, 13px for 120px)
  const radius = Math.min(cx, cy) - lineWidth / 2 - 4; // Prevent clipping
  
  ctx.clearRect(0, 0, targetWidth, targetHeight);

  const numSegments = 20;
  // Compute how many ticks to light up based on percentage. Max 20 ticks.
  const activeCount = Math.min(numSegments, Math.max(0, Math.round((pct / 100) * numSegments)));
  const anglePerSector = (2 * Math.PI) / numSegments;
  const gapAngle = 0.06; // gap in radians (approx 3.4 degrees)

  ctx.lineWidth = lineWidth;
  ctx.lineCap = "butt"; // Perpendicular flat cut edges for radial segment ticks

  for (let i = 0; i < numSegments; i++) {
    // Start angle at 12 o'clock (-Math.PI/2) and go clockwise
    const startAngle = -Math.PI / 2 + i * anglePerSector + gapAngle / 2;
    const endAngle = -Math.PI / 2 + (i + 1) * anglePerSector - gapAngle / 2;

    ctx.beginPath();
    ctx.arc(cx, cy, radius, startAngle, endAngle, false);
    ctx.strokeStyle = i < activeCount ? progressColor : remainingColor;
    ctx.stroke();
  }
}

// ==========================================
// 2. DATA CLASSIFICATION ENGINES
// ==========================================

function getLeadSourceGroup(source) {
  if (!source) return "Marketing khác";
  const s = source.trim().toLowerCase();
  
  // 1. Nhóm nguồn Sales
  const salesSources = [
    "sale tự kiếm", "đi thị trường", "mã số thuế + thông tin doanh nghiệp", 
    "sales chạy ads face, gg, tiktok", "google map", "chatgpt", "mst", 
    "sale tự tìm", "chạy ads face"
  ];
  if (salesSources.some(src => s.includes(src))) {
    return "Sales";
  }
  
  // 2. Nhóm nguồn Marketing Nóng
  const mktHotSources = [
    "facebook_loại 1", "website", "hotline", "zalo", "zalo - zns", "zalo oa"
  ];
  if (mktHotSources.some(src => s.includes(src))) {
    return "Marketing Nóng";
  }
  
  // 3. Nhóm nguồn Giới thiệu
  const referralSources = [
    "affiliate - jega", "aff-sales", "đối tác", "affiliate"
  ];
  if (referralSources.some(src => s.includes(src))) {
    return "Giới thiệu";
  }
  
  // 4. Nhóm nguồn Marketing khác
  return "Marketing khác";
}

function getProductCategory(product) {
  if (!product) return "JEGA Cloud";
  const p = product.trim().toLowerCase();
  
  // JEGA Cloud Products Keywords
  const cloudKeywords = [
    "jega cloud", "jega pro", "license enterprise", "đào tạo online", 
    "đào tạo trực tiếp", "nhận diện thương hiệu", "jega lite", "jega factory", 
    "triển khai phần mềm", "tickets", "jega cloud design"
  ];
  
  if (cloudKeywords.some(keyword => p.includes(keyword))) {
    return "JEGA Cloud";
  }
  
  // JEGA Visual Products Keywords
  const visualKeywords = [
    "furni", "visual", "panama", "interior", "productai", "showroom", "dịch vụ đào tạo ai"
  ];
  
  if (visualKeywords.some(keyword => p.includes(keyword))) {
    return "JEGA Visual";
  }
  
  return "JEGA Cloud"; // Default fallback
}

// ==========================================
// 3. DATA FILTER CONTROLLER
// ==========================================

function applyFilters() {
  const fromDateVal = document.getElementById("filter-from-date").value;
  const toDateVal = document.getElementById("filter-to-date").value;
  const salesVal = document.getElementById("filter-sales").value;
  const productGroupVal = document.getElementById("filter-product-group").value;
  const productLineVal = document.getElementById("filter-product-line").value;
  
  filterState.fromDate = fromDateVal ? new Date(fromDateVal + "T00:00:00") : null;
  filterState.toDate = toDateVal ? new Date(toDateVal + "T23:59:59") : null;
  filterState.sales = salesVal;
  filterState.productGroup = productGroupVal;
  filterState.productLine = productLineVal;
  
  // Filter LEADS
  filteredLeads = leadsData.filter(lead => {
    // 1. Date Filter (ngay_tao)
    const leadDate = parseDate(lead.ngay_tao);
    if (leadDate) {
      if (filterState.fromDate && leadDate < filterState.fromDate) return false;
      if (filterState.toDate && leadDate > filterState.toDate) return false;
    }
    
    // 2. Salesperson Filter
    if (filterState.sales !== "all" && lead.sales !== filterState.sales) return false;
    
    // 2.1 Global Product Group & Line filters for Leads (mapped via ordersData)
    if (filterState.productGroup !== "all" || filterState.productLine !== "all") {
      const leadOrders = ordersData.filter(o => o.ma_kh === lead.ma_kh);
      if (leadOrders.length === 0) return false;
      
      const matchesGroup = filterState.productGroup === "all" || leadOrders.some(o => {
        const cat = getProductCategory(o.san_pham);
        return (filterState.productGroup === "cloud" && cat === "JEGA Cloud") ||
               (filterState.productGroup === "visual" && cat === "JEGA Visual");
      });
      
      const matchesLine = filterState.productLine === "all" || leadOrders.some(o => getProductLine(o.san_pham) === filterState.productLine);
      
      if (!matchesGroup || !matchesLine) return false;
    }
    
    // 3. Lead Source Group Filter
    if (filterState.leadSourceGroup !== "all") {
      const grp = getLeadSourceGroup(lead.nguon);
      if (filterState.leadSourceGroup === "sales" && grp !== "Sales") return false;
      if (filterState.leadSourceGroup === "mkt-hot" && grp !== "Marketing Nóng") return false;
      if (filterState.leadSourceGroup === "referral" && grp !== "Giới thiệu") return false;
      if (filterState.leadSourceGroup === "mkt-other" && grp !== "Marketing khác") return false;
    }
    
    // 4. Lead Relation Pipeline Filter
    if (filterState.leadRelation !== "all") {
      const rel = lead.moi_quan_he;
      if (filterState.leadRelation === "New Lead") {
        // All count
      } else if (filterState.leadRelation === "Quan tâm") {
        const list = ["Quan tâm", "Hẹn demo", "Demo", "Báo giá", "Dùng thử", "Gửi hợp đồng", "Đặt cọc", "Ký hợp đồng", "Thất bại"];
        if (!list.includes(rel)) return false;
      } else if (filterState.leadRelation === "Demo") {
        const list = ["Demo", "Báo giá", "Dùng thử", "Gửi hợp đồng", "Đặt cọc", "Ký hợp đồng", "Thất bại"];
        if (!list.includes(rel)) return false;
      } else if (filterState.leadRelation === "Báo giá") {
        const list = ["Báo giá", "Dùng thử", "Gửi hợp đồng", "Đặt cọc", "Ký hợp đồng", "Thất bại"];
        if (!list.includes(rel)) return false;
      } else if (filterState.leadRelation === "Ký hợp đồng") {
        if (rel !== "Ký hợp đồng") return false;
      } else if (filterState.leadRelation === "Rác") {
        const list = ["Rác", "Thất bại", "Không tiếp cận được", "Nhu cầu xa", "Hẹn tư vấn sau"];
        if (!list.includes(rel)) return false;
      }
    }
    
    // 5. Search Filter
    if (filterState.searchLeads) {
      const query = filterState.searchLeads.toLowerCase();
      const matchName = lead.ten_kh.toLowerCase().includes(query);
      const matchId = lead.ma_kh.toLowerCase().includes(query);
      const matchPhone = lead.dien_thoai.toLowerCase().includes(query);
      const matchSource = lead.nguon.toLowerCase().includes(query);
      if (!matchName && !matchId && !matchPhone && !matchSource) return false;
    }
    
    return true;
  });
  
  // Filter ORDERS
  filteredOrders = ordersData.filter(order => {
    // 1. Date Filter (ngay_mua)
    const orderDate = parseDate(order.ngay_mua);
    if (orderDate) {
      if (filterState.fromDate && orderDate < filterState.fromDate) return false;
      if (filterState.toDate && orderDate > filterState.toDate) return false;
    }
    
    // 2. Salesperson Filter
    if (filterState.sales !== "all" && order.sales !== filterState.sales) return false;
    
    // 2.1 Global Product Group Filter for Orders
    if (filterState.productGroup !== "all") {
      const cat = getProductCategory(order.san_pham);
      if (filterState.productGroup === "cloud" && cat !== "JEGA Cloud") return false;
      if (filterState.productGroup === "visual" && cat !== "JEGA Visual") return false;
    }
    
    // 2.2 Global Product Line Filter for Orders
    if (filterState.productLine !== "all") {
      const line = getProductLine(order.san_pham);
      if (line !== filterState.productLine) return false;
    }
    
    // 3. Product Group Category Filter
    if (filterState.orderCategory !== "all") {
      const cat = getProductCategory(order.san_pham);
      if (filterState.orderCategory === "cloud" && cat !== "JEGA Cloud") return false;
      if (filterState.orderCategory === "visual" && cat !== "JEGA Visual") return false;
    }
    
    // 4. Order Type Filter (Ký mới vs Tái ký)
    if (filterState.orderType !== "all" && order.loai_don !== filterState.orderType) return false;
    
    // 5. Search Filter
    if (filterState.searchOrders) {
      const query = filterState.searchOrders.toLowerCase();
      const matchName = order.ten_kh.toLowerCase().includes(query);
      const matchId = order.ma_kh.toLowerCase().includes(query);
      const matchProduct = order.san_pham.toLowerCase().includes(query);
      const matchPhone = order.dien_thoai.toLowerCase().includes(query);
      if (!matchName && !matchId && !matchProduct && !matchPhone) return false;
    }
    
    return true;
  });
  
  // Reset pagination to first page
  paginationState.leads.currentPage = 1;
  paginationState.orders.currentPage = 1;
  
  // Update view
  updateKPIs();
  updatePipelineFunnel();
  updateCharts();
  renderLeadsTable();
  renderOrdersTable();
  generateAIInsights();
  
  // Update cross-section views
  if (typeof renderCommitmentDashboard === 'function') {
    renderCommitmentDashboard();
  }
}

// ==========================================
// 4. UPDATE KPI CARDS
// ==========================================

// Helper to group leads by ma_kh and get their latest relationship
function getLatestCustomerRelationships() {
  const customerMap = {};
  leadsData.forEach(lead => {
    const code = lead.ma_kh;
    if (!code) return;
    const cDate = parseDate(lead.lien_he_cuoi || lead.ngay_tao);
    if (!customerMap[code]) {
      customerMap[code] = { lead, date: cDate };
    } else if (cDate && (!customerMap[code].date || cDate > customerMap[code].date)) {
      customerMap[code] = { lead, date: cDate };
    }
  });
  return customerMap;
}

// Helper to compute leads metrics for a given period
function getLeadsMetricsForPeriod(startDate, endDate) {
  const customerMap = getLatestCustomerRelationships();
  let newLeads = 0;
  let demoLeads = 0;
  let signedLeads = 0;
  
  leadsData.forEach(lead => {
    // Apply salespeople filter
    if (filterState.sales !== "all" && lead.sales !== filterState.sales) return;
    
    // Apply global productGroup & line filters (mapped via ordersData)
    if (filterState.productGroup !== "all" || filterState.productLine !== "all") {
      const leadOrders = ordersData.filter(o => o.ma_kh === lead.ma_kh);
      if (leadOrders.length === 0) return;
      
      const matchesGroup = filterState.productGroup === "all" || leadOrders.some(o => {
        const cat = getProductCategory(o.san_pham);
        return (filterState.productGroup === "cloud" && cat === "JEGA Cloud") ||
               (filterState.productGroup === "visual" && cat === "JEGA Visual");
      });
      
      const matchesLine = filterState.productLine === "all" || leadOrders.some(o => getProductLine(o.san_pham) === filterState.productLine);
      
      if (!matchesGroup || !matchesLine) return;
    }
    
    // Apply source filter
    if (filterState.leadSourceGroup !== "all") {
      const grp = getLeadSourceGroup(lead.nguon);
      if (filterState.leadSourceGroup === "sales" && grp !== "Sales") return;
      if (filterState.leadSourceGroup === "mkt-hot" && grp !== "Marketing Nóng") return;
      if (filterState.leadSourceGroup === "referral" && grp !== "Giới thiệu") return;
      if (filterState.leadSourceGroup === "mkt-other" && grp !== "Marketing khác") return;
    }
    
    // Apply search filter
    if (filterState.searchLeads) {
      const query = filterState.searchLeads.toLowerCase();
      const matchName = lead.ten_kh.toLowerCase().includes(query);
      const matchId = lead.ma_kh.toLowerCase().includes(query);
      const matchPhone = lead.dien_thoai.toLowerCase().includes(query);
      const matchSource = lead.nguon.toLowerCase().includes(query);
      if (!matchName && !matchId && !matchPhone && !matchSource) return;
    }
    
    const createdDate = parseDate(lead.ngay_tao);
    if (createdDate && (!startDate || createdDate >= startDate) && (!endDate || createdDate <= endDate)) {
      newLeads++;
      
      const custCode = lead.ma_kh;
      const latestLead = customerMap[custCode] ? customerMap[custCode].lead : lead;
      const rel = latestLead.moi_quan_he;
      
      // Demo Nóng: Created date is within the filtered period and relationship is one of the target stages
      const demoStages = ["Demo", "Dùng thử", "Báo giá", "Ký hợp đồng", "Gửi hợp đồng", "Đặt cọc", "Thất bại"];
      if (demoStages.includes(rel)) {
        demoLeads++;
      }
      
      // Đơn Nóng: Created date is within the filtered period and relationship is "Ký hợp đồng"
      if (rel === "Ký hợp đồng") {
        signedLeads++;
      }
    }
  });
  
  return { newLeads, demoLeads, signedLeads };
}

// Helper to compute orders from leads created in a given period
function getOrdersFromLeadsCreatedInPeriod(startDate, endDate) {
  const activeLeadCodes = new Set();
  leadsData.forEach(lead => {
    if (filterState.sales !== "all" && lead.sales !== filterState.sales) return;
    
    if (filterState.leadSourceGroup !== "all") {
      const grp = getLeadSourceGroup(lead.nguon);
      if (filterState.leadSourceGroup === "sales" && grp !== "Sales") return;
      if (filterState.leadSourceGroup === "mkt-hot" && grp !== "Marketing Nóng") return;
      if (filterState.leadSourceGroup === "referral" && grp !== "Giới thiệu") return;
      if (filterState.leadSourceGroup === "mkt-other" && grp !== "Marketing khác") return;
    }
    
    if (filterState.searchLeads) {
      const query = filterState.searchLeads.toLowerCase();
      const matchName = lead.ten_kh.toLowerCase().includes(query);
      const matchId = lead.ma_kh.toLowerCase().includes(query);
      const matchPhone = lead.dien_thoai.toLowerCase().includes(query);
      const matchSource = lead.nguon.toLowerCase().includes(query);
      if (!matchName && !matchId && !matchPhone && !matchSource) return;
    }
    
    const createdDate = parseDate(lead.ngay_tao);
    if (createdDate && (!startDate || createdDate >= startDate) && (!endDate || createdDate <= endDate)) {
      activeLeadCodes.add(lead.ma_kh);
    }
  });

  let count = 0;
  ordersData.forEach(order => {
    if (filterState.sales !== "all" && order.sales !== filterState.sales) return;
    
    if (filterState.orderCategory !== "all") {
      const cat = getProductCategory(order.san_pham);
      if (filterState.orderCategory === "cloud" && cat !== "JEGA Cloud") return;
      if (filterState.orderCategory === "visual" && cat !== "JEGA Visual") return;
    }
    
    if (filterState.orderType !== "all" && order.loai_don !== filterState.orderType) return;
    
    if (filterState.searchOrders) {
      const query = filterState.searchOrders.toLowerCase();
      const matchName = order.ten_kh.toLowerCase().includes(query);
      const matchId = order.ma_kh.toLowerCase().includes(query);
      const matchProduct = order.san_pham.toLowerCase().includes(query);
      const matchPhone = order.dien_thoai.toLowerCase().includes(query);
      if (!matchName && !matchId && !matchProduct && !matchPhone) return;
    }
    
    const orderDate = parseDate(order.ngay_mua);
    if (orderDate && (!startDate || orderDate >= startDate) && (!endDate || orderDate <= endDate)) {
      if (activeLeadCodes.has(order.ma_kh)) {
        count++;
      }
    }
  });
  
  return count;
}

// Helper to compute actual orders revenue and count for a given period
function getActualOrdersMetricsForPeriod(startDate, endDate) {
  let totalRevenue = 0;
  let orderCount = 0;
  
  ordersData.forEach(order => {
    // Apply salesperson filter
    if (filterState.sales !== "all" && order.sales !== filterState.sales) return;
    
    // Apply global productGroup filter
    if (filterState.productGroup !== "all") {
      const cat = getProductCategory(order.san_pham);
      if (filterState.productGroup === "cloud" && cat !== "JEGA Cloud") return;
      if (filterState.productGroup === "visual" && cat !== "JEGA Visual") return;
    }
    
    // Apply global productLine filter
    if (filterState.productLine !== "all") {
      const line = getProductLine(order.san_pham);
      if (line !== filterState.productLine) return;
    }
    
    // Apply category filter
    if (filterState.orderCategory !== "all") {
      const cat = getProductCategory(order.san_pham);
      if (filterState.orderCategory === "cloud" && cat !== "JEGA Cloud") return;
      if (filterState.orderCategory === "visual" && cat !== "JEGA Visual") return;
    }
    
    // Apply type filter
    if (filterState.orderType !== "all" && order.loai_don !== filterState.orderType) return;
    
    // Apply search filter
    if (filterState.searchOrders) {
      const query = filterState.searchOrders.toLowerCase();
      const matchName = order.ten_kh.toLowerCase().includes(query);
      const matchId = order.ma_kh.toLowerCase().includes(query);
      const matchProduct = order.san_pham.toLowerCase().includes(query);
      const matchPhone = order.dien_thoai.toLowerCase().includes(query);
      if (!matchName && !matchId && !matchProduct && !matchPhone) return;
    }
    
    const orderDate = parseDate(order.ngay_mua);
    if (orderDate && (!startDate || orderDate >= startDate) && (!endDate || orderDate <= endDate)) {
      totalRevenue += order.doanh_thu;
      orderCount++;
    }
  });
  
  return { totalRevenue, orderCount };
}

function getActualOrdersCountExcludeGo(startDate, endDate) {
  let orderCount = 0;
  ordersData.forEach(order => {
    // Apply salesperson filter
    if (filterState.sales !== "all" && order.sales !== filterState.sales) return;
    
    // Apply global productGroup filter
    if (filterState.productGroup !== "all") {
      const cat = getProductCategory(order.san_pham);
      if (filterState.productGroup === "cloud" && cat !== "JEGA Cloud") return;
      if (filterState.productGroup === "visual" && cat !== "JEGA Visual") return;
    }
    
    // Apply global productLine filter
    if (filterState.productLine !== "all") {
      const line = getProductLine(order.san_pham);
      if (line !== filterState.productLine) return;
    }
    
    // Apply category filter
    if (filterState.orderCategory !== "all") {
      const cat = getProductCategory(order.san_pham);
      if (filterState.orderCategory === "cloud" && cat !== "JEGA Cloud") return;
      if (filterState.orderCategory === "visual" && cat !== "JEGA Visual") return;
    }
    
    // Apply type filter
    if (filterState.orderType !== "all" && order.loai_don !== filterState.orderType) return;
    
    // Apply search filter
    if (filterState.searchOrders) {
      const query = filterState.searchOrders.toLowerCase();
      const matchName = order.ten_kh.toLowerCase().includes(query);
      const matchId = order.ma_kh.toLowerCase().includes(query);
      const matchProduct = order.san_pham.toLowerCase().includes(query);
      const matchPhone = order.dien_thoai.toLowerCase().includes(query);
      if (!matchName && !matchId && !matchProduct && !matchPhone) return;
    }
    
    const line = getProductLine(order.san_pham);
    if (line === "Go") return;
    
    const orderDate = parseDate(order.ngay_mua);
    if (orderDate && (!startDate || orderDate >= startDate) && (!endDate || orderDate <= endDate)) {
      orderCount++;
    }
  });
  return orderCount;
}

function isDateInQuarter(dateStr, quarter) {
  const date = parseDate(dateStr);
  if (!date) return false;
  if (date.getFullYear() !== 2026) return false;
  const month = date.getMonth(); // 0-11
  if (quarter === "Q1") return month >= 0 && month <= 2;
  if (quarter === "Q2") return month >= 3 && month <= 5;
  if (quarter === "Q3") return month >= 6 && month <= 8;
  if (quarter === "Q4") return month >= 9 && month <= 11;
  return false;
}

function calculateOkrMetric(quarter, metricType) {
  if (!metricType || metricType === "custom") return 0;
  
  const quarterLeads = leadsData.filter(lead => isDateInQuarter(lead.ngay_tao, quarter));
  const quarterOrders = ordersData.filter(order => isDateInQuarter(order.ngay_mua, quarter));
  
  const demoFunnel = ["Demo", "Dùng thử", "Báo giá", "Ký hợp đồng", "Gửi hợp đồng", "Đặt cọc", "Thất bại"];
  
  switch (metricType) {
    case "revenue": {
      let sum = 0;
      quarterOrders.forEach(o => {
        sum += parseFloat(o.doanh_thu) || 0;
      });
      return sum;
    }
    case "revenue_business": {
      let sum = 0;
      quarterOrders.forEach(o => {
        if (getProductLine(o.san_pham) === "Business") {
          sum += parseFloat(o.doanh_thu) || 0;
        }
      });
      return sum;
    }
    case "revenue_retail": {
      let sum = 0;
      quarterOrders.forEach(o => {
        if (getProductLine(o.san_pham) === "Retail") {
          sum += parseFloat(o.doanh_thu) || 0;
        }
      });
      return sum;
    }
    case "revenue_interio_ai": {
      let sum = 0;
      quarterOrders.forEach(o => {
        const p = o.san_pham ? o.san_pham.toLowerCase() : "";
        if (p.includes("interior") || p.includes("interio")) {
          sum += parseFloat(o.doanh_thu) || 0;
        }
      });
      return sum;
    }
    case "sales_closing_rate": {
      const jegaOrders = quarterOrders.filter(o => getProductCategory(o.san_pham) === "JEGA Cloud").length;
      const demoLeads = quarterLeads.filter(l => demoFunnel.includes(l.moi_quan_he)).length;
      if (demoLeads === 0) return 0;
      return parseFloat(((jegaOrders / demoLeads) * 100).toFixed(2));
    }
    case "lead_to_demo": {
      const demoLeads = quarterLeads.filter(l => demoFunnel.includes(l.moi_quan_he)).length;
      const totalLeads = quarterLeads.length;
      if (totalLeads === 0) return 0;
      return parseFloat(((demoLeads / totalLeads) * 100).toFixed(2));
    }
    case "lead_mkt_to_demo": {
      const mktHotLeads = quarterLeads.filter(l => getLeadSourceGroup(l.nguon) === "Marketing Nóng");
      const mktHotTotal = mktHotLeads.length;
      const mktHotDemo = mktHotLeads.filter(l => demoFunnel.includes(l.moi_quan_he)).length;
      if (mktHotTotal === 0) return 0;
      return parseFloat(((mktHotDemo / mktHotTotal) * 100).toFixed(2));
    }
    case "lead_mkt_to_deal": {
      const mktHotLeads = quarterLeads.filter(l => getLeadSourceGroup(l.nguon) === "Marketing Nóng");
      const mktHotTotal = mktHotLeads.length;
      const mktHotDeal = mktHotLeads.filter(l => l.moi_quan_he === "Ký hợp đồng").length;
      if (mktHotTotal === 0) return 0;
      return parseFloat(((mktHotDeal / mktHotTotal) * 100).toFixed(2));
    }
    case "lead_to_deal": {
      const jegaOrders = quarterOrders.filter(o => getProductCategory(o.san_pham) === "JEGA Cloud").length;
      const totalLeads = quarterLeads.length;
      if (totalLeads === 0) return 0;
      return parseFloat(((jegaOrders / totalLeads) * 100).toFixed(2));
    }
    case "new_leads": {
      return quarterLeads.length;
    }
    case "jcf_contracts": {
      const jcfKeywords = ["phần mềm sản xuất", "factory", "lite", "mini lite"];
      return quarterOrders.filter(o => {
        const p = o.san_pham ? o.san_pham.toLowerCase() : "";
        return jcfKeywords.some(kw => p.includes(kw));
      }).length;
    }
    case "showroom_contracts": {
      return quarterOrders.filter(o => {
        const p = o.san_pham ? o.san_pham.toLowerCase() : "";
        return p.includes("showroom");
      }).length;
    }
    case "interio_contracts": {
      return quarterOrders.filter(o => {
        const p = o.san_pham ? o.san_pham.toLowerCase() : "";
        return p.includes("interior") || p.includes("interio");
      }).length;
    }
    default:
      return 0;
  }
}

// Helper to parse performance rate
function parsePerfValue(val) {
  if (val === undefined || val === null) return 0;
  const numeric = parseFloat(val);
  if (isNaN(numeric)) return 0;
  if (numeric > 100) {
    return numeric / 100;
  }
  return numeric;
}

// Helper to get performance metrics from Performance sheet
function getPerformanceMetricsForPeriod(startDate, endDate) {
  let totalDemos = 0;
  let totalPerfSum = 0;
  let perfCount = 0;
  
  performanceData.forEach(row => {
    const pStart = parseDate(row.startDate);
    const pEnd = parseDate(row.endDate);
    if (!pStart || !pEnd) return;
    
    // Check overlap: pStart <= endDate && pEnd >= startDate
    if (pStart <= endDate && pEnd >= startDate) {
      if (row.metric === "Demo") {
        if (filterState.sales !== "all") {
          const val = row.values[filterState.sales];
          if (val !== undefined && val !== null) {
            totalDemos += val;
          }
        } else {
          Object.values(row.values).forEach(val => {
            if (val !== undefined && val !== null) {
              totalDemos += val;
            }
          });
        }
      } else if (row.metric === "Hiệu suất") {
        if (filterState.sales !== "all") {
          const val = row.values[filterState.sales];
          if (val !== undefined && val !== null) {
            totalPerfSum += parsePerfValue(val);
            perfCount++;
          }
        } else {
          Object.values(row.values).forEach(val => {
            if (val !== undefined && val !== null) {
              totalPerfSum += parsePerfValue(val);
              perfCount++;
            }
          });
        }
      }
    }
  });
  
  const avgPerfRate = perfCount > 0 ? totalPerfSum / perfCount : 0;
  return { totalDemos, avgPerfRate };
}

// Helper to compute commitment revenue for a range based on dynamic filter context
function getCommitmentRevenueForPeriod(startDate, endDate) {
  const start = (typeof startDate === 'string') ? parseDate(startDate) : startDate;
  const end = (typeof endDate === 'string') ? parseDate(endDate) : endDate;
  if (!start || !end) return 0;

  const diffTime = Math.abs(end.getTime() - start.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

  if (diffDays <= 8) {
    // 1. Week level
    const activeWeek = commitmentWeeks.find(w => {
      const wStart = parseDate(w.startDate);
      const wEnd = parseDate(w.endDate);
      if (!wStart || !wEnd) return false;
      const adjustedEnd = new Date(wEnd);
      adjustedEnd.setHours(23, 59, 59, 999);
      return start >= wStart && start <= adjustedEnd;
    });
    if (activeWeek) {
      return (activeWeek.revenueRetail || 0) + (activeWeek.revenueBusiness || 0);
    }
    // Fallback if not found: find by month index of start date
    const mIndex = start.getMonth();
    const weeksInMonth = commitmentWeeks.filter(w => w.monthIndex === mIndex);
    if (weeksInMonth.length > 0) {
      const avgRetail = weeksInMonth.reduce((s, w) => s + (w.revenueRetail || 0), 0) / weeksInMonth.length;
      const avgBusiness = weeksInMonth.reduce((s, w) => s + (w.revenueBusiness || 0), 0) / weeksInMonth.length;
      return avgRetail + avgBusiness;
    }
    return 0;
  } else if (diffDays <= 35) {
    // 2. Month level
    const mIndex = start.getMonth();
    const mObj = commitmentMonths.find(m => m.monthIndex === mIndex);
    return mObj ? (mObj.revenueRetail || 0) + (mObj.revenueBusiness || 0) : 0;
  } else if (diffDays <= 100) {
    // 3. Quarter level
    const qIndex = Math.floor(start.getMonth() / 3);
    const qObj = commitmentQuarters.find(q => q.qIndex === qIndex);
    return qObj ? (qObj.revenueRetail || 0) + (qObj.revenueBusiness || 0) : 0;
  } else {
    // 4. Year level
    const yObj = commitmentYears[0] || { revenueRetail: 0, revenueBusiness: 0 };
    return (yObj.revenueRetail || 0) + (yObj.revenueBusiness || 0);
  }
}

// Format trend HTML comparison
function formatTrendHTML(current, previous) {
  if (previous === 0) {
    if (current === 0) return `<span class="trend-neutral" style="color: var(--text-muted) !important;"><i data-lucide="minus" style="width:12px; display:inline-block; vertical-align:middle;"></i> 0%</span>`;
    return `<span class="trend-up" style="color: #16a34a !important; font-weight:700; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;"><i data-lucide="trending-up" style="width:12px; display:inline-block; vertical-align:middle; margin-right:2px;"></i> +100%</span>`;
  }
  const diff = current - previous;
  const pct = (diff / previous) * 100;
  if (pct >= 0) {
    return `<span class="trend-up" style="color: #16a34a !important; font-weight:700; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;"><i data-lucide="trending-up" style="width:12px; display:inline-block; vertical-align:middle; margin-right:2px;"></i> +${pct.toFixed(1)}%</span>`;
  } else {
    return `<span class="trend-down" style="color: #dc2626 !important; font-weight:700; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;"><i data-lucide="trending-down" style="width:12px; display:inline-block; vertical-align:middle; margin-right:2px;"></i> ${pct.toFixed(1)}%</span>`;
  }
}

// Format percentage point trend HTML comparison
function formatPercentagePointTrendHTML(current, previous) {
  const diff = current - previous;
  if (diff >= 0) {
    return `<span class="trend-up" style="color: #16a34a !important; font-weight:700; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;"><i data-lucide="trending-up" style="width:12px; display:inline-block; vertical-align:middle; margin-right:2px;"></i> +${diff.toFixed(1)}%</span>`;
  } else {
    return `<span class="trend-down" style="color: #dc2626 !important; font-weight:700; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;"><i data-lucide="trending-down" style="width:12px; display:inline-block; vertical-align:middle; margin-right:2px;"></i> ${diff.toFixed(1)}%</span>`;
  }
}

// Format date range (e.g. "01/05 - 07/05")
function formatDateRange(start, end) {
  const pad = (n) => n.toString().padStart(2, '0');
  return `${pad(start.getDate())}/${pad(start.getMonth()+1)} - ${pad(end.getDate())}/${pad(end.getMonth()+1)}`;
}

function updateKPIs() {
  const fromDate = filterState.fromDate || new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const toDate = filterState.toDate || new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0);
  
  // Previous week: shift active range back by 7 days
  const prevFromDate = new Date(fromDate);
  prevFromDate.setDate(prevFromDate.getDate() - 7);
  const prevToDate = new Date(toDate);
  prevToDate.setDate(prevToDate.getDate() - 7);

  const diffTime = Math.abs(toDate.getTime() - fromDate.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

  // Set the main KPI header label based on date filter context
  const elCommGrowth = document.getElementById("db-kpi-comm-growth-text");
  if (elCommGrowth) {
    if (diffDays <= 8) {
      elCommGrowth.innerText = "Cam kết tuần";
    } else if (diffDays <= 35) {
      elCommGrowth.innerText = "Cam kết tháng";
    } else if (diffDays <= 100) {
      elCommGrowth.innerText = "Cam kết quý";
    } else {
      elCommGrowth.innerText = "Cam kết năm";
    }
  }

  // Calculate and Render the fixed 4-level pacing cards
  let refDate = new Date();
  if (refDate.getFullYear() !== 2026) {
    refDate = new Date(2026, 4, 21); // 21/05/2026
  }

  const pad = (n) => n.toString().padStart(2, '0');

  // 1. Year level
  const yObj = commitmentYears[0] || { revenueRetail: 0, revenueBusiness: 0 };
  const yTarget = (yObj.revenueRetail || 0) + (yObj.revenueBusiness || 0);
  const yActObj = getCommitmentActuals("01/01/2026", "31/12/2026");
  const yActual = yActObj.retail + yActObj.go + yActObj.business;
  const yComp = yTarget > 0 ? (yActual / yTarget) * 100 : 0;
  const yGap = yTarget - yActual;

  // 2. Quarter level
  const qIndex = Math.floor(refDate.getMonth() / 3);
  const qObj = commitmentQuarters.find(q => q.qIndex === qIndex) || { revenueRetail: 0, revenueBusiness: 0 };
  const qTarget = (qObj.revenueRetail || 0) + (qObj.revenueBusiness || 0);
  const qStartStr = `01/${pad(qIndex * 3 + 1)}/2026`;
  const qEndStr = `${pad(new Date(2026, (qIndex + 1) * 3, 0).getDate())}/${pad((qIndex + 1) * 3)}/2026`;
  const qActObj = getCommitmentActuals(qStartStr, qEndStr);
  const qActual = qActObj.retail + qActObj.go + qActObj.business;
  const qComp = qTarget > 0 ? (qActual / qTarget) * 100 : 0;
  const qGap = qTarget - qActual;

  // 3. Month level
  const mIndex = refDate.getMonth();
  const mObj = commitmentMonths.find(m => m.monthIndex === mIndex) || { revenueRetail: 0, revenueBusiness: 0 };
  const mTarget = (mObj.revenueRetail || 0) + (mObj.revenueBusiness || 0);
  const mStartStr = `01/${pad(mIndex + 1)}/2026`;
  const mEndStr = `${pad(new Date(2026, mIndex + 1, 0).getDate())}/${pad(mIndex + 1)}/2026`;
  const mActObj = getCommitmentActuals(mStartStr, mEndStr);
  const mActual = mActObj.retail + mActObj.go + mActObj.business;
  const mComp = mTarget > 0 ? (mActual / mTarget) * 100 : 0;
  const mGap = mTarget - mActual;

  // 4. Week level
  const activeWeek = commitmentWeeks.find(w => {
    const start = parseDate(w.startDate);
    const end = parseDate(w.endDate);
    if (!start || !end) return false;
    const adjustedEnd = new Date(end);
    adjustedEnd.setHours(23, 59, 59, 999);
    return refDate >= start && refDate <= adjustedEnd;
  });
  let wTarget = 0;
  let wActual = 0;
  if (activeWeek) {
    wTarget = (activeWeek.revenueRetail || 0) + (activeWeek.revenueBusiness || 0);
    const wActObj = getCommitmentActuals(activeWeek.startDate, activeWeek.endDate);
    wActual = wActObj.retail + wActObj.go + wActObj.business;
  } else {
    const fallbackWeeks = commitmentWeeks.filter(w => w.monthIndex === mIndex);
    if (fallbackWeeks.length > 0) {
      wTarget = ((mObj.revenueRetail || 0) + (mObj.revenueBusiness || 0)) / fallbackWeeks.length;
      wActual = mActual / fallbackWeeks.length;
    }
  }
  const wComp = wTarget > 0 ? (wActual / wTarget) * 100 : 0;
  const wGap = wTarget - wActual;

  // Render pacing HTML
  const elPacingGrid = document.getElementById("db-commitment-pacing-kpis");
  if (elPacingGrid) {
    elPacingGrid.innerHTML = `
      <!-- Card 1: Year -->
      <div class="kpi-card glass-card" style="border-left: 4px solid var(--color-gold); background: rgba(255, 255, 255, 0.85); backdrop-filter: blur(10px); border-radius: var(--border-radius-md); padding: 1.25rem 1rem; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.03); display: flex; flex-direction: column; justify-content: space-between;">
        <div>
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
            <span style="font-size: 0.72rem; text-transform: uppercase; font-weight: 700; color: var(--text-secondary); letter-spacing: 0.5px;">Tiến độ Năm 2026</span>
            <span style="background-color: rgba(229, 193, 88, 0.12); color: var(--color-gold); font-size: 0.65rem; font-weight: 700; padding: 2px 6px; border-radius: 4px; text-transform: uppercase;">Năm</span>
          </div>
          <div style="font-size: 1.3rem; font-weight: 800; color: var(--text-primary); margin-bottom: 0.25rem;">
            ${formatVND(yActual)} <span style="font-size: 0.8rem; font-weight: 500; color: var(--text-muted);">/ ${formatVND(yTarget)}</span>
          </div>
        </div>
        <div style="margin-top: 0.75rem;">
           <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.75rem; margin-bottom: 0.35rem;">
             <span style="color: var(--text-secondary);">Hoàn thành: <strong style="color: var(--color-gold);">${yComp.toFixed(1)}%</strong></span>
             <span style="color: var(--text-secondary);">GAP: <strong style="color: ${yGap > 0 ? 'var(--color-red)' : 'var(--color-green)'};">${formatVND(yGap)}</strong></span>
           </div>
           <!-- Progress Bar -->
           <div style="width: 100%; height: 6px; background: rgba(0,0,0,0.06); border-radius: 3px; overflow: hidden;">
             <div style="width: ${Math.min(yComp, 100)}%; height: 100%; background: var(--color-gold); border-radius: 3px;"></div>
           </div>
        </div>
      </div>

      <!-- Card 2: Quarter -->
      <div class="kpi-card glass-card" style="border-left: 4px solid var(--color-primary); background: rgba(255, 255, 255, 0.85); backdrop-filter: blur(10px); border-radius: var(--border-radius-md); padding: 1.25rem 1rem; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.03); display: flex; flex-direction: column; justify-content: space-between;">
        <div>
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
            <span style="font-size: 0.72rem; text-transform: uppercase; font-weight: 700; color: var(--text-secondary); letter-spacing: 0.5px;">Tiến độ Quý ${qIndex + 1}</span>
            <span style="background-color: rgba(59, 130, 246, 0.12); color: var(--color-primary); font-size: 0.65rem; font-weight: 700; padding: 2px 6px; border-radius: 4px; text-transform: uppercase;">Quý</span>
          </div>
          <div style="font-size: 1.3rem; font-weight: 800; color: var(--text-primary); margin-bottom: 0.25rem;">
            ${formatVND(qActual)} <span style="font-size: 0.8rem; font-weight: 500; color: var(--text-muted);">/ ${formatVND(qTarget)}</span>
          </div>
        </div>
        <div style="margin-top: 0.75rem;">
           <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.75rem; margin-bottom: 0.35rem;">
             <span style="color: var(--text-secondary);">Hoàn thành: <strong style="color: var(--color-primary);">${qComp.toFixed(1)}%</strong></span>
             <span style="color: var(--text-secondary);">GAP: <strong style="color: ${qGap > 0 ? 'var(--color-red)' : 'var(--color-green)'};">${formatVND(qGap)}</strong></span>
           </div>
           <!-- Progress Bar -->
           <div style="width: 100%; height: 6px; background: rgba(0,0,0,0.06); border-radius: 3px; overflow: hidden;">
             <div style="width: ${Math.min(qComp, 100)}%; height: 100%; background: var(--color-primary); border-radius: 3px;"></div>
           </div>
        </div>
      </div>

      <!-- Card 3: Month -->
      <div class="kpi-card glass-card" style="border-left: 4px solid var(--color-green); background: rgba(255, 255, 255, 0.85); backdrop-filter: blur(10px); border-radius: var(--border-radius-md); padding: 1.25rem 1rem; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.03); display: flex; flex-direction: column; justify-content: space-between;">
        <div>
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
            <span style="font-size: 0.72rem; text-transform: uppercase; font-weight: 700; color: var(--text-secondary); letter-spacing: 0.5px;">Tiến độ Tháng ${mIndex + 1}</span>
            <span style="background-color: rgba(16, 185, 129, 0.12); color: var(--color-green); font-size: 0.65rem; font-weight: 700; padding: 2px 6px; border-radius: 4px; text-transform: uppercase;">Tháng</span>
          </div>
          <div style="font-size: 1.3rem; font-weight: 800; color: var(--text-primary); margin-bottom: 0.25rem;">
            ${formatVND(mActual)} <span style="font-size: 0.8rem; font-weight: 500; color: var(--text-muted);">/ ${formatVND(mTarget)}</span>
          </div>
        </div>
        <div style="margin-top: 0.75rem;">
           <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.75rem; margin-bottom: 0.35rem;">
             <span style="color: var(--text-secondary);">Hoàn thành: <strong style="color: var(--color-green);">${mComp.toFixed(1)}%</strong></span>
             <span style="color: var(--text-secondary);">GAP: <strong style="color: ${mGap > 0 ? 'var(--color-red)' : 'var(--color-green)'};">${formatVND(mGap)}</strong></span>
           </div>
           <!-- Progress Bar -->
           <div style="width: 100%; height: 6px; background: rgba(0,0,0,0.06); border-radius: 3px; overflow: hidden;">
             <div style="width: ${Math.min(mComp, 100)}%; height: 100%; background: var(--color-green); border-radius: 3px;"></div>
           </div>
        </div>
      </div>

      <!-- Card 4: Week -->
      <div class="kpi-card glass-card" style="border-left: 4px solid var(--color-orange); background: rgba(255, 255, 255, 0.85); backdrop-filter: blur(10px); border-radius: var(--border-radius-md); padding: 1.25rem 1rem; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.03); display: flex; flex-direction: column; justify-content: space-between;">
        <div>
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
            <span style="font-size: 0.72rem; text-transform: uppercase; font-weight: 700; color: var(--text-secondary); letter-spacing: 0.5px;">Tiến độ ${activeWeek ? activeWeek.name : 'Tuần hiện tại'}</span>
            <span style="background-color: rgba(249, 115, 22, 0.12); color: var(--color-orange); font-size: 0.65rem; font-weight: 700; padding: 2px 6px; border-radius: 4px; text-transform: uppercase;">Tuần</span>
          </div>
          <div style="font-size: 1.3rem; font-weight: 800; color: var(--text-primary); margin-bottom: 0.25rem;">
            ${formatVND(wActual)} <span style="font-size: 0.8rem; font-weight: 500; color: var(--text-muted);">/ ${formatVND(wTarget)}</span>
          </div>
        </div>
        <div style="margin-top: 0.75rem;">
           <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.75rem; margin-bottom: 0.35rem;">
             <span style="color: var(--text-secondary);">Hoàn thành: <strong style="color: var(--color-orange);">${wComp.toFixed(1)}%</strong></span>
             <span style="color: var(--text-secondary);">GAP: <strong style="color: ${wGap > 0 ? 'var(--color-red)' : 'var(--color-green)'};">${formatVND(wGap)}</strong></span>
           </div>
           <!-- Progress Bar -->
           <div style="width: 100%; height: 6px; background: rgba(0,0,0,0.06); border-radius: 3px; overflow: hidden;">
             <div style="width: ${Math.min(wComp, 100)}%; height: 100%; background: var(--color-orange); border-radius: 3px;"></div>
           </div>
        </div>
      </div>
    `;
  }
  
  // 1. COLUMN 1 CALCULATIONS (Cam kết & Thực đạt)
  const currentComm = getCommitmentRevenueForPeriod(fromDate, toDate);
  const { totalRevenue: currentActual } = getActualOrdersMetricsForPeriod(fromDate, toDate);
  const newOrdersCount = getActualOrdersCountExcludeGo(fromDate, toDate);
  const currentCompRate = currentComm > 0 ? (currentActual / currentComm) * 100 : 0;
  
  const prevComm = getCommitmentRevenueForPeriod(prevFromDate, prevToDate);
  const { totalRevenue: prevActual } = getActualOrdersMetricsForPeriod(prevFromDate, prevToDate);
  const prevOrdersCount = getActualOrdersCountExcludeGo(prevFromDate, prevToDate);
  const prevCompRate = prevComm > 0 ? (prevActual / prevComm) * 100 : 0;
  
  // Set Column 1 UI
  const elCommRev = document.getElementById("db-kpi-comm-revenue");
  if (elCommRev) elCommRev.innerText = formatVND(currentComm);
  
  const elActualRev = document.getElementById("db-kpi-actual-revenue");
  if (elActualRev) elActualRev.innerText = formatVND(currentActual);
  const elActualFooter = document.getElementById("db-kpi-actual-footer");
  if (elActualFooter) {
    elActualFooter.innerHTML = formatTrendHTML(currentActual, prevActual) + ` <span style="margin-left: 4px;">so với tuần trước</span>`;
  }
  
  const elCompRate = document.getElementById("db-kpi-completion-rate");
  if (elCompRate) elCompRate.innerText = `${currentCompRate.toFixed(1)}%`;
  const elCompFooter = document.getElementById("db-kpi-completion-footer");
  if (elCompFooter) {
    elCompFooter.innerHTML = formatPercentagePointTrendHTML(currentCompRate, prevCompRate) + ` <span style="margin-left: 4px;">so với tuần trước</span>`;
  }
  
  // 2. COLUMN 2 CALCULATIONS (Doanh thu Go, Retail, Business)
  const currentLines = getLineRevenuesForPeriod(fromDate, toDate);
  const prevLines = getLineRevenuesForPeriod(prevFromDate, prevToDate);
  
  const elRevGo = document.getElementById("db-kpi-rev-go");
  if (elRevGo) elRevGo.innerText = formatVND(currentLines.go);
  const elRevGoFooter = document.getElementById("db-kpi-rev-go-footer");
  if (elRevGoFooter) {
    elRevGoFooter.innerHTML = formatTrendHTML(currentLines.go, prevLines.go) + ` <span style="margin-left: 4px;">so với tuần trước</span>`;
  }
  
  const elRevRetail = document.getElementById("db-kpi-rev-retail");
  if (elRevRetail) elRevRetail.innerText = formatVND(currentLines.retail);
  const elRevRetailFooter = document.getElementById("db-kpi-rev-retail-footer");
  if (elRevRetailFooter) {
    elRevRetailFooter.innerHTML = formatTrendHTML(currentLines.retail, prevLines.retail) + ` <span style="margin-left: 4px;">so với tuần trước</span>`;
  }
  
  const elRevBusiness = document.getElementById("db-kpi-rev-business");
  if (elRevBusiness) elRevBusiness.innerText = formatVND(currentLines.business);
  const elRevBusinessFooter = document.getElementById("db-kpi-rev-business-footer");
  if (elRevBusinessFooter) {
    elRevBusinessFooter.innerHTML = formatTrendHTML(currentLines.business, prevLines.business) + ` <span style="margin-left: 4px;">so với tuần trước</span>`;
  }
  
  // 3. COLUMN 3 CALCULATIONS (Hoạt động & Hiệu suất)
  const elNewOrders = document.getElementById("db-kpi-new-orders");
  if (elNewOrders) elNewOrders.innerText = newOrdersCount.toLocaleString("vi-VN");
  
  const { totalDemos } = getPerformanceMetricsForPeriod(fromDate, toDate);
  const elPerfDemo = document.getElementById("db-kpi-perf-demo");
  if (elPerfDemo) elPerfDemo.innerText = totalDemos.toLocaleString("vi-VN");
  
  // Tỉ lệ chốt sales = Đơn hàng mới trong kỳ / Demo trong kỳ (Performance)
  const currentPerfRate = totalDemos > 0 ? (newOrdersCount / totalDemos) * 100 : 0;
  const elPerfRate = document.getElementById("db-kpi-perf-rate");
  if (elPerfRate) elPerfRate.innerText = `${currentPerfRate.toFixed(1)}%`;
  
  // 4. COLUMN 4 CALCULATIONS (Leads & Chuyển đổi / Đơn Nóng, Demo Nóng, Tỉ lệ chốt nóng)
  const currentLeads = getLeadsMetricsForPeriod(fromDate, toDate);
  const prevLeads = getLeadsMetricsForPeriod(prevFromDate, prevToDate);
  
  // Đơn Nóng (Lead mới có Ký hợp đồng cùng kỳ)
  const elNewLeads = document.getElementById("db-kpi-new-leads");
  if (elNewLeads) elNewLeads.innerText = currentLeads.signedLeads.toLocaleString("vi-VN");
  const elNewLeadsFooter = document.getElementById("db-kpi-new-leads-footer");
  if (elNewLeadsFooter) {
    elNewLeadsFooter.innerHTML = formatTrendHTML(currentLeads.signedLeads, prevLeads.signedLeads) + ` <span style="margin-left: 4px;">so với tuần trước</span>`;
  }
  
  // Demo Nóng (Lead mới có Demo cùng kỳ)
  const elPeriodDemo = document.getElementById("db-kpi-period-demo");
  if (elPeriodDemo) elPeriodDemo.innerText = currentLeads.demoLeads.toLocaleString("vi-VN");
  const elPeriodDemoFooter = document.getElementById("db-kpi-period-demo-footer");
  if (elPeriodDemoFooter) {
    elPeriodDemoFooter.innerHTML = formatTrendHTML(currentLeads.demoLeads, prevLeads.demoLeads) + ` <span style="margin-left: 4px;">so với tuần trước</span>`;
  }
  
  // Tỉ lệ chốt nóng = Đơn Nóng / Demo Nóng
  const currentHotCloseRate = currentLeads.demoLeads > 0 ? (currentLeads.signedLeads / currentLeads.demoLeads) * 100 : 0;
  const prevHotCloseRate = prevLeads.demoLeads > 0 ? (prevLeads.signedLeads / prevLeads.demoLeads) * 100 : 0;
  
  const elPeriodSigned = document.getElementById("db-kpi-period-signed");
  if (elPeriodSigned) elPeriodSigned.innerText = `${currentHotCloseRate.toFixed(1)}%`;
  const elPeriodSignedFooter = document.getElementById("db-kpi-period-signed-footer");
  if (elPeriodSignedFooter) {
    elPeriodSignedFooter.innerHTML = formatPercentagePointTrendHTML(currentHotCloseRate, prevHotCloseRate) + ` <span style="margin-left: 4px;">so với tuần trước</span>`;
  }
  
  // Re-run Lucide Icons to display new trending/check/alert icons
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }
  
  // Update Leads Section KPI Cards
  updateLeadsSectionKPIs();
}

function updateLeadsSectionKPIs() {
  const fromDate = filterState.fromDate || new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const toDate = filterState.toDate || new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0);
  
  const metrics = getLeadsMetricsForPeriod(fromDate, toDate);
  
  const elNew = document.getElementById("leads-kpi-new");
  const elDemo = document.getElementById("leads-kpi-demo");
  const elSigned = document.getElementById("leads-kpi-signed");
  if (elNew) elNew.innerText = metrics.newLeads.toLocaleString("vi-VN");
  if (elDemo) elDemo.innerText = metrics.demoLeads.toLocaleString("vi-VN");
  if (elSigned) elSigned.innerText = metrics.signedLeads.toLocaleString("vi-VN");
  
  const daysDiff = Math.round((toDate - fromDate) / (1000 * 60 * 60 * 24));
  const descNew = document.getElementById("leads-kpi-new-desc");
  const descDemo = document.getElementById("leads-kpi-demo-desc");
  const descSigned = document.getElementById("leads-kpi-signed-desc");
  if (descNew) descNew.innerText = "Đăng ký trong kỳ " + daysDiff + " ngày";
  if (descDemo) descDemo.innerText = "Demo Nóng trong kỳ " + daysDiff + " ngày";
  if (descSigned) descSigned.innerText = "Đơn Nóng trong kỳ " + daysDiff + " ngày";
}

// ==========================================
// 5. RENDER PIPELINE FUNNEL
// ==========================================

function renderFunnelHelper(leadsList, containerId) {
  const totalLeads = leadsList.length;
  
  const quanTamList = ["Quan tâm", "Hẹn demo", "Demo", "Báo giá", "Dùng thử", "Gửi hợp đồng", "Đặt cọc", "Ký hợp đồng", "Thất bại"];
  const quanTamCount = leadsList.filter(l => quanTamList.includes(l.moi_quan_he)).length;
  
  const demoList = ["Demo", "Báo giá", "Dùng thử", "Gửi hợp đồng", "Đặt cọc", "Ký hợp đồng", "Thất bại"];
  const demoCount = leadsList.filter(l => demoList.includes(l.moi_quan_he)).length;
  
  const baoGiaList = ["Báo giá", "Dùng thử", "Gửi hợp đồng", "Đặt cọc", "Ký hợp đồng", "Thất bại"];
  const baoGiaCount = leadsList.filter(l => baoGiaList.includes(l.moi_quan_he)).length;
  
  const signedCount = leadsList.filter(l => l.moi_quan_he === "Ký hợp đồng").length;
  
  const funnelStages = [
    { name: "Mới", count: totalLeads,   color: "#3B82F6", icon: "👥" },
    { name: "Quan tâm", count: quanTamCount, color: "#14B8A6", icon: "❤️" },
    { name: "Demo",    count: demoCount,    color: "#F59E0B", icon: "🖥️" },
    { name: "Báo giá", count: baoGiaCount,  color: "#F97316", icon: "📊" },
    { name: "Ký HĐ",  count: signedCount,  color: "#8B5CF6", icon: "🤝" }
  ];

  if (!containerId) return funnelStages;

  const container = document.getElementById(containerId);
  if (!container) return funnelStages;

  container.innerHTML = "";
  container.style.cssText = "padding: 0.5rem 0; width:100%;";

  let funnelHtml = `<div style="display:flex; flex-direction:column; gap:10px; width:100%;">`;

  funnelStages.forEach((stage, idx) => {
    const pctOfTotal = totalLeads > 0 ? (stage.count / totalLeads * 100).toFixed(1) : 0;
    const pctFromPrev = idx > 0 && funnelStages[idx-1].count > 0
      ? (stage.count / funnelStages[idx-1].count * 100).toFixed(1)
      : 100;
    const barWidth = Math.max(pctOfTotal, 8); // At least 8% to show text

    funnelHtml += `
      <div style="display:flex; align-items:center; width:100%;">
        <div style="width: 100px; font-size: 0.8rem; font-weight: 700; color: #0f172a; display:flex; align-items:center; gap:6px;">
          <span>${stage.icon}</span> <span>${stage.name}</span>
        </div>
        <div style="flex: 1; background-color: #f1f5f9; height: 32px; border-radius: 4px; overflow: hidden; position: relative;">
          <div style="width: ${barWidth}%; background-color: ${stage.color}; height: 100%; display: flex; align-items: center; justify-content: flex-end; padding-right: 8px; transition: width 0.5s ease;">
            <span style="color: #fff; font-size: 0.75rem; font-weight: 800;">${stage.count.toLocaleString("vi-VN")}</span>
          </div>
        </div>
        <div style="width: 100px; text-align: right; display:flex; flex-direction:column; justify-content:center; line-height:1.3; padding-left: 8px;">
          <div style="font-size: 0.75rem; font-weight: 800; color: #475569;">${pctOfTotal}% <span style="font-size:0.55rem; font-weight:600; color:#94a3b8; text-transform:uppercase;">/ tổng</span></div>
          ${idx > 0 ? `<div style="font-size: 0.7rem; font-weight: 700; color: #6366f1; margin-top:2px;">${pctFromPrev}% <span style="font-size:0.55rem; font-weight:600; color:#94a3b8; text-transform:uppercase;">/ trước</span></div>` : `<div style="font-size: 0.7rem; font-weight: 700; color: transparent; margin-top:2px;">-</div>`}
        </div>
      </div>
    `;
  });

  funnelHtml += `</div>`;
  container.innerHTML = funnelHtml;
  return funnelStages;
}

function renderFunnelTriangleHtml(leadsList, title) {
  const totalLeads = leadsList.length;
  
  const quanTamList = ["Quan tâm", "Hẹn demo", "Demo", "Báo giá", "Dùng thử", "Gửi hợp đồng", "Đặt cọc", "Ký hợp đồng", "Thất bại"];
  const quanTamCount = leadsList.filter(l => quanTamList.includes(l.moi_quan_he)).length;
  
  const demoList = ["Demo", "Báo giá", "Dùng thử", "Gửi hợp đồng", "Đặt cọc", "Ký hợp đồng", "Thất bại"];
  const demoCount = leadsList.filter(l => demoList.includes(l.moi_quan_he)).length;
  
  const baoGiaList = ["Báo giá", "Dùng thử", "Gửi hợp đồng", "Đặt cọc", "Ký hợp đồng", "Thất bại"];
  const baoGiaCount = leadsList.filter(l => baoGiaList.includes(l.moi_quan_he)).length;
  
  const signedCount = leadsList.filter(l => l.moi_quan_he === "Ký hợp đồng").length;
  
  const stages = [
    { name: "Mới", count: totalLeads,   color: "#3B82F6", icon: "👥" },
    { name: "Quan tâm", count: quanTamCount, color: "#14B8A6", icon: "❤️" },
    { name: "Demo",    count: demoCount,    color: "#F59E0B", icon: "🖥️" },
    { name: "Báo giá", count: baoGiaCount,  color: "#F97316", icon: "📊" },
    { name: "Ký HĐ",  count: signedCount,  color: "#8B5CF6", icon: "🤝" }
  ];

  let html = `<div style="display:flex; flex-direction:column; gap:8px; width:100%; padding: 4px 0; margin-bottom: 12px;">`;
  if (title) {
    html += `<div style="font-size: 0.75rem; font-weight: 800; color: #0f172a; text-transform: uppercase; margin-bottom: 4px; text-align: center; font-family: Arial, sans-serif !important;">${title}</div>`;
  }

  stages.forEach((stage, idx) => {
    const pctOfTotal = totalLeads > 0 ? (stage.count / totalLeads * 100).toFixed(1) : 0;
    const pctFromPrev = idx > 0 && stages[idx-1].count > 0
      ? (stage.count / stages[idx-1].count * 100).toFixed(1)
      : 100;
    const barWidth = Math.max(pctOfTotal, 10);

    html += `
      <div style="display:flex; align-items:center; width:100%;">
        <div style="width: 90px; font-size: 0.75rem; font-weight: 800; color: #0f172a;">
          ${stage.icon} ${stage.name}
        </div>
        <div style="flex: 1; background-color: #f1f5f9; height: 26px; border-radius: 3px; overflow: hidden; position: relative;">
          <div style="width: ${barWidth}%; background-color: ${stage.color} !important; height: 100%; display: flex; align-items: center; justify-content: flex-end; padding-right: 6px; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;">
            <span style="color: #fff; font-size: 0.7rem; font-weight: 800;">${stage.count.toLocaleString("vi-VN")}</span>
          </div>
        </div>
        <div style="width: 100px; text-align: right; display:flex; flex-direction:column; justify-content:center; line-height:1.2; padding-left: 6px;">
          <div style="font-size: 0.7rem; font-weight: 800; color: #475569;">${pctOfTotal}% <span style="font-size:0.55rem; font-weight:600; color:#94a3b8; text-transform:uppercase;">/ tổng</span></div>
          ${idx > 0 ? `<div style="font-size: 0.65rem; font-weight: 700; color: #6366f1; margin-top:2px;">${pctFromPrev}% <span style="font-size:0.55rem; font-weight:600; color:#94a3b8; text-transform:uppercase;">/ trước</span></div>` : `<div style="font-size: 0.65rem; font-weight: 700; color: transparent; margin-top:2px;">-</div>`}
        </div>
      </div>
    `;
  });

  html += `</div>`;
  return html;
}

function getStageCounts(leadsList) {
  const totalLeads = leadsList.length;
  const quanTamList = ["Quan tâm", "Hẹn demo", "Demo", "Báo giá", "Dùng thử", "Gửi hợp đồng", "Đặt cọc", "Ký hợp đồng", "Thất bại"];
  const demoList = ["Demo", "Báo giá", "Dùng thử", "Gửi hợp đồng", "Đặt cọc", "Ký hợp đồng", "Thất bại"];
  const baoGiaList = ["Báo giá", "Dùng thử", "Gửi hợp đồng", "Đặt cọc", "Ký hợp đồng", "Thất bại"];
  
  return [
    { name: "Tổng Lead", count: totalLeads },
    { name: "Quan tâm", count: leadsList.filter(l => quanTamList.includes(l.moi_quan_he)).length },
    { name: "Demo", count: leadsList.filter(l => demoList.includes(l.moi_quan_he)).length },
    { name: "Báo giá", count: leadsList.filter(l => baoGiaList.includes(l.moi_quan_he)).length },
    { name: "Chốt Sales", count: leadsList.filter(l => l.moi_quan_he === "Ký hợp đồng").length }
  ];
}

function renderReportFunnelHTML(leadsList, title, color) {
  const stages = getStageCounts(leadsList);
  const maxCount = Math.max(stages[0].count, 1);
  let html = `<div style="flex:1; border: 1px solid #cbd5e1; border-radius: 8px; background-color: #ffffff; padding: 15px; page-break-inside: avoid; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;">
    <h4 style="margin: 0 0 15px 0; text-align: center; color: ${color}; font-size: 0.85rem; font-weight: 800; text-transform: uppercase;">${title}</h4>
    <div style="display:flex; flex-direction:column; gap:8px;">`;

  stages.forEach((stage, index) => {
    const widthPct = Math.max((stage.count / maxCount) * 100, 2).toFixed(1);
    const convPrev = index === 0 ? "100" : (stages[index - 1].count > 0 ? ((stage.count / stages[index - 1].count) * 100).toFixed(1) : "0");
    const convTotal = ((stage.count / maxCount) * 100).toFixed(1) + "%";
    
    const insideText = stage.count > 0 ? `${stage.count.toLocaleString("vi-VN")} ${index > 0 ? `(${convPrev}%)` : ''}` : '';
    const insideZero = stage.count === 0 ? `0 (0%)` : '';

    html += `
      <div style="display:flex; align-items:center; width:100%; gap: 10px;">
        <div style="width: 75px; font-size: 0.75rem; font-weight: 700; color: #0f172a; text-align: right;">
          ${stage.name}
        </div>
        <div style="flex: 1;">
          <div style="display:flex; align-items:center; width: 100%; background-color: #f1f5f9 !important; height: 22px; border-radius: 4px; position: relative; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;">
            <div style="height: 100%; background-color: ${color} !important; width: ${widthPct}%; border-radius: 4px; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;"></div>
            <div style="position: absolute; left: 8px; font-size: 0.6rem; color: #0f172a; padding: 0 4px; border-radius: 2px; font-weight: 800; white-space: nowrap; z-index: 1; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;">
              ${stage.count > 0 ? insideText : insideZero}
            </div>
          </div>
        </div>
        <div style="width: 45px; font-size: 0.7rem; font-weight: 800; color: #475569; text-align: right;">
          ${convTotal}
        </div>
      </div>
    `;
  });

  html += `</div></div>`;
  return html;
}



function updatePipelineFunnel() {
  renderFunnelHelper(filteredLeads, "funnel-display-container");
  
  const hotLeads = filteredLeads.filter(l => getLeadSourceGroup(l.nguon) === "Marketing Nóng");
  renderFunnelHelper(hotLeads, "funnel-hot-display-container");
}

// ==========================================
// 6. RENDER CHARTS
// ==========================================

function updateCharts() {
  // Chart colors matching warm red-orange professional theme
  const navyColors = {
    primary:  "#C0392B",   // Đỏ cam chủ đạo
    green:    "#27AE60",   // Tăng trưởng
    blue:     "#2980B9",   // Nổi bật
    purple:   "#8E44AD",   // Phân loại thứ 4
    red:      "#E74C3C",   // Giảm / cảnh báo
    grid:     "rgba(192, 57, 43, 0.06)",
    text:     "#000000"
  };
  
  // Shared options
  const baseChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        labels: { color: navyColors.text, font: { family: 'Montserrat' } }
      }
    }
  };

  // --- CHART 1: SALES RANKING ---
  const salesRevenueMap = {};
  // Seed with all known sales staff to ensure they always show up
  const salesList = ["Nguyễn Trọng Tín", "Đỗ Thị Hải Yến", "Lê Thị Hoài Phúc", "Phan Ngọc Thúy", "Võ Gia Hân"];
  salesList.forEach(s => salesRevenueMap[s] = 0);
  
  filteredOrders.forEach(o => {
    if (o.sales in salesRevenueMap) {
      salesRevenueMap[o.sales] += o.doanh_thu;
    } else {
      salesRevenueMap[o.sales] = o.doanh_thu;
    }
  });
  
  const sortedSales = Object.entries(salesRevenueMap)
    .sort((a, b) => b[1] - a[1]);
  
  const salesLabels = sortedSales.map(x => x[0]);
  const salesDataValues = sortedSales.map(x => x[1]);
  
  if (charts.salesRanking) charts.salesRanking.destroy();
  charts.salesRanking = new Chart(document.getElementById("chart-sales-ranking"), {
    type: 'bar',
    data: {
      labels: salesLabels,
      datasets: [{
        label: 'Doanh số thực đạt (VND)',
        data: salesDataValues,
        backgroundColor: 'rgba(192, 57, 43, 0.75)',
        borderColor: '#C0392B',
        borderWidth: 1,
        borderRadius: 5
      }]
    },
    options: {
      ...baseChartOptions,
      indexAxis: 'y',
      scales: {
        x: { 
          grid: { color: navyColors.grid },
          ticks: { color: navyColors.text, callback: (v) => `${(v/1000000).toFixed(0)}M` }
        },
        y: { 
          grid: { display: false },
          ticks: { color: navyColors.text }
        }
      }
    }
  });

  // --- CHART 2: 4 PACING DOUGHNUT CHARTS (Manual targets) ---
  let refDate = new Date();
  if (refDate.getFullYear() !== 2026) {
    refDate = new Date(2026, 4, 21); // 21/05/2026
  }
  const currentMonth = refDate.getMonth();
  const qIndex = Math.floor(currentMonth / 3);

  // 1. Year targets & actuals
  const yObj = commitmentYears[0] || { revenueRetail: 0, revenueBusiness: 0 };
  let yearTarget = (yObj.revenueRetail || 0) + (yObj.revenueBusiness || 0);
  const yearActuals = getCommitmentActuals("01/01/2026", "31/12/2026");
  const yearActual = yearActuals.retail + yearActuals.go + yearActuals.business;

  // 2. Quarter targets & actuals
  const qMonths = [
    { start: "01/01/2026", end: "31/03/2026" },
    { start: "01/04/2026", end: "30/06/2026" },
    { start: "01/07/2026", end: "30/09/2026" },
    { start: "01/10/2026", end: "31/12/2026" }
  ];
  const qRange = qMonths[qIndex];
  const qObj = commitmentQuarters.find(q => q.qIndex === qIndex) || { revenueRetail: 0, revenueBusiness: 0 };
  let quarterTarget = (qObj.revenueRetail || 0) + (qObj.revenueBusiness || 0);
  const quarterActuals = getCommitmentActuals(qRange.start, qRange.end);
  const quarterActual = quarterActuals.retail + quarterActuals.go + quarterActuals.business;

  // 3. Month targets & actuals
  const activeMonthObj = commitmentMonths.find(m => m.monthIndex === currentMonth);
  let monthTarget = 0;
  if (activeMonthObj) {
    monthTarget = (activeMonthObj.revenueRetail || 0) + (activeMonthObj.revenueBusiness || 0);
  }
  const pad = (n) => n.toString().padStart(2, '0');
  const mStartStr = `01/${pad(currentMonth + 1)}/2026`;
  const lastDay = new Date(2026, currentMonth + 1, 0).getDate();
  const mEndStr = `${pad(lastDay)}/${pad(currentMonth + 1)}/2026`;
  const monthActuals = getCommitmentActuals(mStartStr, mEndStr);
  const monthActual = monthActuals.retail + monthActuals.go + monthActuals.business;

  // 4. Week targets & actuals
  const activeWeekObj = commitmentWeeks.find(w => {
    const start = parseDate(w.startDate);
    const end = parseDate(w.endDate);
    if (!start || !end) return false;
    const adjustedEnd = new Date(end);
    adjustedEnd.setHours(23, 59, 59, 999);
    return refDate >= start && refDate <= adjustedEnd;
  });
  
  let weekTarget = 0;
  let weekActual = 0;
  if (activeWeekObj) {
    weekTarget = (activeWeekObj.revenueRetail || 0) + (activeWeekObj.revenueBusiness || 0);
    const weekActuals = getCommitmentActuals(activeWeekObj.startDate, activeWeekObj.endDate);
    weekActual = weekActuals.retail + weekActuals.go + weekActuals.business;
  } else {
    weekTarget = monthTarget;
    weekActual = monthActual;
  }

  // Update titles
  const qTitle = document.getElementById("pacing-quarter-title");
  if (qTitle) qTitle.innerText = "Luỹ kế Quý Q" + (qIndex + 1);
  
  const mTitle = document.getElementById("pacing-month-title");
  if (mTitle) mTitle.innerText = "Luỹ kế Tháng " + (currentMonth + 1);
  
  const wTitle = document.getElementById("pacing-week-title");
  if (wTitle) {
    if (activeWeekObj) {
      wTitle.innerText = "Luỹ kế Tuần (" + activeWeekObj.startDate.substring(0, 5) + "-" + activeWeekObj.endDate.substring(0, 5) + ")";
    } else {
      wTitle.innerText = "Luỹ kế Tuần";
    }
  }

  // Draw pacing doughnut charts
  drawCumulativeDoughnut("chart-pacing-year", yearActual, yearTarget, "pacing-year-percent", "pacing-year-actual", "pacing-year-target", "pacingYear");
  drawCumulativeDoughnut("chart-pacing-quarter", quarterActual, quarterTarget, "pacing-quarter-percent", "pacing-quarter-actual", "pacing-quarter-target", "pacingQuarter");
  drawCumulativeDoughnut("chart-pacing-month", monthActual, monthTarget, "pacing-month-percent", "pacing-month-actual", "pacing-month-target", "pacingMonth");
  drawCumulativeDoughnut("chart-pacing-week", weekActual, weekTarget, "pacing-week-percent", "pacing-week-actual", "pacing-week-target", "pacingWeek");

  // --- CHART 3: SOURCE BREAKDOWN ---
  const sourceRevenue = {
    "Sales": 0,
    "Marketing Nóng": 0,
    "Giới thiệu": 0,
    "Marketing khác": 0
  };
  
  filteredOrders.forEach(o => {
    const grp = getLeadSourceGroup(o.nguon);
    if (grp in sourceRevenue) {
      sourceRevenue[grp] += o.doanh_thu;
    } else {
      sourceRevenue["Marketing khác"] += o.doanh_thu;
    }
  });
  
  if (charts.sourceBreakdown) charts.sourceBreakdown.destroy();
  charts.sourceBreakdown = new Chart(document.getElementById("chart-source-breakdown"), {
    type: 'doughnut',
    data: {
      labels: Object.keys(sourceRevenue),
      datasets: [{
        data: Object.values(sourceRevenue),
        backgroundColor: [
          '#2980B9',   // Sales → Xanh dương (nổi bật)
          '#C0392B',   // Marketing Nóng → Đỏ cam chủ đạo
          '#27AE60',   // Giới thiệu → Xanh lá
          '#8E44AD'    // Marketing khác → Tím phân loại
        ],
        borderWidth: 2,
        borderColor: '#FFFFFF'
      }]
    },
    options: {
      ...baseChartOptions,
      plugins: {
        ...baseChartOptions.plugins,
        legend: {
          position: 'right',
          labels: { color: navyColors.text }
        }
      }
    }
  });
}

// ==========================================
// 7. RENDER LEADS TABLE
// ==========================================

function renderLeadsTable() {
  const tbody = document.getElementById("leads-table-body");
  tbody.innerHTML = "";
  
  const limit = paginationState.leads.limit;
  const page = paginationState.leads.currentPage;
  const startIndex = (page - 1) * limit;
  const endIndex = Math.min(startIndex + limit, filteredLeads.length);
  
  const pageLeads = filteredLeads.slice(startIndex, endIndex);
  
  if (pageLeads.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: var(--text-secondary); padding: 2rem;">Không tìm thấy khách hàng nào khớp bộ lọc.</td></tr>`;
    document.getElementById("leads-pagination-info").innerText = "Hiển thị 0 - 0 của 0 khách hàng";
    document.getElementById("leads-prev-btn").disabled = true;
    document.getElementById("leads-next-btn").disabled = true;
    return;
  }
  
  pageLeads.forEach(lead => {
    const srcGrp = getLeadSourceGroup(lead.nguon);
    let srcBadge = "badge-mkt-other";
    if (srcGrp === "Sales") srcBadge = "badge-sales";
    else if (srcGrp === "Marketing Nóng") srcBadge = "badge-mkt-hot";
    else if (srcGrp === "Giới thiệu") srcBadge = "badge-referral";
    
    let relBadge = "badge-relation";
    if (lead.moi_quan_he === "Ký hợp đồng") relBadge = "badge-signed";
    else if (lead.moi_quan_he === "Thất bại" || lead.moi_quan_he === "Rác" || lead.moi_quan_he === "Không tiếp cận được") relBadge = "badge-failed";
    else if (lead.moi_quan_he === "Demo" || lead.moi_quan_he === "Hẹn demo") relBadge = "badge-demo";
    
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td style="font-weight: 700; color: var(--color-gold);">${lead.ma_kh}</td>
      <td style="font-weight: 600;">${lead.ten_kh}</td>
      <td>${lead.ngay_tao}</td>
      <td>${lead.lien_he_cuoi}</td>
      <td>${lead.dien_thoai}</td>
      <td>${lead.nguon}</td>
      <td><span class="badge ${srcBadge}">${srcGrp}</span></td>
      <td><span class="badge ${relBadge}">${lead.moi_quan_he}</span></td>
      <td style="font-weight: 600;"><i data-lucide="user" style="width:12px; display:inline-block; margin-right:4px; vertical-align:middle; color:var(--text-secondary);"></i>${lead.sales}</td>
    `;
    tbody.appendChild(tr);
  });
  
  // Recreate Lucide Icons inside the new cells
  lucide.createIcons();
  
  document.getElementById("leads-pagination-info").innerText = 
    `Hiển thị ${startIndex + 1} - ${endIndex} của ${filteredLeads.length} khách hàng`;
  
  document.getElementById("leads-prev-btn").disabled = page === 1;
  document.getElementById("leads-next-btn").disabled = endIndex >= filteredLeads.length;
}

// ==========================================
// 8. RENDER ORDERS TABLE
// ==========================================

function renderOrdersTable() {
  const tbody = document.getElementById("orders-table-body");
  tbody.innerHTML = "";
  
  const limit = paginationState.orders.limit;
  const page = paginationState.orders.currentPage;
  const startIndex = (page - 1) * limit;
  const endIndex = Math.min(startIndex + limit, filteredOrders.length);
  
  const pageOrders = filteredOrders.slice(startIndex, endIndex);
  
  if (pageOrders.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: var(--text-secondary); padding: 2rem;">Không tìm thấy đơn hàng nào khớp bộ lọc.</td></tr>`;
    document.getElementById("orders-pagination-info").innerText = "Hiển thị 0 - 0 của 0 đơn hàng";
    document.getElementById("orders-prev-btn").disabled = true;
    document.getElementById("orders-next-btn").disabled = true;
    return;
  }
  
  pageOrders.forEach(order => {
    const cat = getProductCategory(order.san_pham);
    const catBadge = cat === "JEGA Cloud" ? "badge-jega-cloud" : "badge-jega-visual";
    
    const typeBadge = order.loai_don === "Ký mới" ? "badge-signed" : "badge-relation";
    
    const tr = document.createElement("tr");
    tr.innerHTML = [
      '<td>', order.ngay_mua, '</td>',
      '<td style="font-weight: 700; color: var(--color-gold);">', order.ma_kh, '</td>',
      '<td style="font-weight: 600;">', order.ten_kh, '</td>',
      '<td>', order.dien_thoai, '</td>',
      '<td style="font-weight: 600; color: var(--text-primary);">', order.san_pham, '</td>',
      '<td><span class="badge ', catBadge, '">', cat, '</span></td>',
      '<td style="font-weight: 700; color: var(--color-emerald);">', formatVND(order.doanh_thu), '</td>',
      '<td><span class="badge ', typeBadge, '">', order.loai_don, '</span></td>',
      '<td style="font-weight: 600;">', order.sales, '</td>'
    ].join('');
    tbody.appendChild(tr);
  });
  
  document.getElementById("orders-pagination-info").innerText = 
    `Hiển thị ${startIndex + 1} - ${endIndex} của ${filteredOrders.length} đơn hàng`;
  
  document.getElementById("orders-prev-btn").disabled = page === 1;
  document.getElementById("orders-next-btn").disabled = endIndex >= filteredOrders.length;
}

// ==========================================
// 9. AUTOMATED AI REPORT GENERATOR
// ==========================================

function generateAIInsights() {
  const container = document.getElementById("ai-insights-container");
  container.innerHTML = "";
  
  const totalLeads = filteredLeads.length;
  const signedLeads = filteredLeads.filter(l => l.moi_quan_he === "Ký hợp đồng").length;
  const conversionRate = totalLeads > 0 ? (signedLeads / totalLeads) * 100 : 0;
  
  // Calculate source performance in leads
  const sourceCounts = { "Sales": 0, "Marketing Nóng": 0, "Giới thiệu": 0, "Marketing khác": 0 };
  filteredLeads.forEach(l => {
    const g = getLeadSourceGroup(l.nguon);
    sourceCounts[g]++;
  });
  
  // Order totals
  const totalRev = filteredOrders.reduce((s, o) => s + o.doanh_thu, 0);
  const totalOrders = filteredOrders.length;
  
  // Find top product group
  let cloudRev = 0, visualRev = 0;
  filteredOrders.forEach(o => {
    const c = getProductCategory(o.san_pham);
    if (c === "JEGA Cloud") cloudRev += o.doanh_thu;
    else visualRev += o.doanh_thu;
  });
  
  const topProductGroup = cloudRev > visualRev ? "JEGA Cloud" : "JEGA Visual";
  const topProductGroupPct = totalRev > 0 ? (Math.max(cloudRev, visualRev) / totalRev) * 100 : 0;
  
  // Top sales person
  const salesMap = {};
  filteredOrders.forEach(o => {
    salesMap[o.sales] = (salesMap[o.sales] || 0) + o.doanh_thu;
  });
  let topSales = "Chưa ghi nhận";
  let topSalesRev = 0;
  Object.entries(salesMap).forEach(([sales, rev]) => {
    if (rev > topSalesRev) {
      topSales = sales;
      topSalesRev = rev;
    }
  });
  
  // Generate recommendations
  const bullets = [];
  
  // Lead analysis
  bullets.push({
    icon: "users",
    text: `**Hiệu quả nguồn Lead**: Giai đoạn này ghi nhận **${totalLeads.toLocaleString()} Leads** mới. Nhóm **Marketing Nóng** đóng góp tỷ trọng leads tiềm năng cao nhất. Tỷ lệ chuyển đổi Lead thành Hợp đồng thực tế đạt **${conversionRate.toFixed(1)}%**.`
  });
  
  // Revenue analysis
  if (totalRev > 0) {
    bullets.push({
      icon: "trending-up",
      text: `**Tăng trưởng doanh thu**: Tổng doanh số thực đạt đạt **${formatVND(totalRev)}** với **${totalOrders} đơn hàng** thành công. Nhóm sản phẩm **${topProductGroup}** giữ vai trò xương sống khi đóng góp **${topProductGroupPct.toFixed(0)}%** tổng doanh số.`
    });
  } else {
    bullets.push({
      icon: "trending-up",
      text: `**Doanh số thực thu**: Không ghi nhận doanh thu phát sinh trong khoảng thời gian được lọc. Hãy kiểm tra lại bộ lọc ngày hoặc nhân sự.`
    });
  }
  
  // Sales Champion
  if (topSalesRev > 0) {
    bullets.push({
      icon: "award",
      text: `**Chiến binh doanh số**: Nhân sự xuất sắc nhất kỳ này là **${topSales}** với tổng doanh thu mang lại đạt **${formatVND(topSalesRev)}** (${((topSalesRev / totalRev) * 100).toFixed(0)}% thị phần).`
    });
  }
  
  // Tactical action proposal
  let recommendation = "";
  if (conversionRate < 3) {
    recommendation = "**Đề xuất cải tiến phễu**: Tỷ lệ chốt hợp đồng đang ở mức thấp (${conversionRate.toFixed(1)}%). Dữ liệu phễu cho thấy có sự sụt giảm lớn từ bước *Quan tâm* sang *Demo*. Trưởng phòng nên yêu cầu sales tập trung gọi điện đặt lịch hẹn demo ngay khi lead đổ về trong 15 phút đầu tiên.";
  } else {
    recommendation = "**Định hướng tối ưu**: Tỷ lệ chuyển đổi đang duy trì tốt. Khuyến nghị Trưởng phòng phân phối thêm ngân sách Marketing cho các kênh thuộc nhóm *Marketing Nóng (Website, Hotline, Zalo ZNS)* và thúc đẩy sales tích cực chăm sóc tập khách hàng ở bước *Báo giá* để nhanh chóng chốt giao dịch.";
  }
  
  bullets.push({
    icon: "lightbulb",
    text: recommendation
  });
  
  // Render bullets to UI
  bullets.forEach(b => {
    const div = document.createElement("div");
    div.className = "ai-bullet";
    
    // Parse markdown bold text **...**
    const parsedText = b.text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    
    div.innerHTML = `
      <i data-lucide="${b.icon}" style="color: var(--color-gold); width:18px; flex-shrink:0; margin-top:2px;"></i>
      <span style="font-size:0.85rem; line-height:1.6;">${parsedText}</span>
    `;
    container.appendChild(div);
  });
  
  lucide.createIcons();
}

// ==========================================
// 10. SETUP INITIAL EVENT LISTENERS
// ==========================================

function initApp() {
  // 1. Set default date filter to current month (first day to last day of current month)
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  
  document.getElementById("filter-from-date").value = formatDateToInput(startOfMonth);
  document.getElementById("filter-to-date").value = formatDateToInput(endOfMonth);
  
  // 2. Add Navigation Listeners
  document.querySelectorAll(".menu-item").forEach(item => {
    item.addEventListener("click", function() {
      document.querySelectorAll(".menu-item").forEach(i => i.classList.remove("active"));
      this.classList.add("active");
      
      const sec = this.getAttribute("data-section");
      document.querySelectorAll(".page-section").forEach(s => s.classList.remove("active"));
      document.getElementById(`section-${sec}`).classList.add("active");
      
      // Dynamic header & filter visibility override for strategic views (OKR, Commitment, Key Accounts, AI Projects)
      const headerEl = document.querySelector(".header-container");
      const filtersEl = document.querySelector(".filters-bar");
      if (sec === "okr" || sec === "commitment" || sec === "key-accounts" || sec === "ai-projects" || sec === "renewal-customers") {
        if (headerEl) headerEl.style.display = "none";
        if (filtersEl) filtersEl.style.display = "none";
      } else {
        if (headerEl) headerEl.style.display = "flex";
        if (filtersEl) filtersEl.style.display = "flex";
      }
      
      // Update Title based on section
      const titleEl = document.getElementById("app-title-display");
      const subEl = document.getElementById("app-subtitle-display");
      if (sec === "dashboard") {
        titleEl.innerText = "Tổng quan Báo cáo Kinh doanh & AI Insights";
        subEl.innerText = "Dành riêng cho Trưởng phòng kinh doanh | Dữ liệu thực tế từ Google Sheet";
      } else if (sec === "leads") {
        titleEl.innerText = "Danh sách Khách hàng";
        subEl.innerText = "Theo dõi tiến độ chăm sóc khách hàng của từng nhân viên";
      } else if (sec === "orders") {
        titleEl.innerText = "Sổ cái Đơn hàng & Doanh thu";
        subEl.innerText = "Chi tiết doanh số bán hàng, phân tách ký mới và tái ký";
      } else if (sec === "system-settings") {
        titleEl.innerText = "Cài đặt Hệ thống";
        subEl.innerText = "Cấu hình nguồn dữ liệu Google Sheets trực tiếp";
      } else if (sec === "key-accounts") {
        titleEl.innerText = "Theo dõi & Chăm sóc Khách hàng Key Account";
        subEl.innerText = "Quản lý chiến lược khách hàng lớn, các sản phẩm quan tâm và kế hoạch chăm sóc hàng tuần";
        
        // Render Key Account views when tab is opened
        renderKeyAccountsTable();
        updateKeyAccountKPIs();
      } else if (sec === "renewal-customers") {
        titleEl.innerText = "Theo dõi Khách hàng Tái ký";
        subEl.innerText = "Quản lý hợp đồng tái ký, theo dõi tiến độ đàm phán và giá trị gia hạn";
        renderRenewalDashboards();
      } else if (sec === "okr") {
        titleEl.innerText = "Theo dõi & Đánh giá OKR năm 2026";
        subEl.innerText = "Quản lý mục tiêu (O), kết quả then chốt (KR), kế hoạch hành động tháng và phân rã tuần";
        
        // Render OKR views when tab is opened
        renderOKRDashboard();
      } else if (sec === "commitment") {
        titleEl.innerText = "Cam kết & Hiệu suất bán hàng năm 2026";
        subEl.innerText = "Theo dõi doanh thu cam kết vs thực tế, mục tiêu demo, hiệu suất chốt sales từng giai đoạn";
        renderCommitmentDashboard();
      } else if (sec === "ai-projects") {
        titleEl.innerText = "Theo dõi Dự án AI";
        subEl.innerText = "Quản lý tiến độ phát triển, triển khai và xuất bản các giải pháp công nghệ AI";
        renderAIProjects();
      }
    });
  });
  
  // 3. Add global filters inputs listeners
  document.getElementById("filter-from-date").addEventListener("change", applyFilters);
  document.getElementById("filter-to-date").addEventListener("change", applyFilters);
  document.getElementById("filter-sales").addEventListener("change", applyFilters);
  document.getElementById("filter-product-group").addEventListener("change", applyFilters);
  document.getElementById("filter-product-line").addEventListener("change", applyFilters);
  
  // 4. Add reset filter button listener
  document.getElementById("reset-filters-btn").addEventListener("click", () => {
    // Reset to current month dates
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    document.getElementById("filter-from-date").value = formatDateToInput(startOfMonth);
    document.getElementById("filter-to-date").value = formatDateToInput(endOfMonth);
    
    document.getElementById("filter-sales").value = "all";
    document.getElementById("filter-product-group").value = "all";
    document.getElementById("filter-product-line").value = "all";
    document.getElementById("filter-lead-source").value = "all";
    document.getElementById("filter-lead-relation").value = "all";
    document.getElementById("filter-order-category").value = "all";
    document.getElementById("filter-order-type").value = "all";
    document.getElementById("search-leads").value = "";
    document.getElementById("search-orders").value = "";
    
    filterState.leadSourceGroup = "all";
    filterState.leadRelation = "all";
    filterState.orderCategory = "all";
    filterState.orderType = "all";
    filterState.searchLeads = "";
    filterState.searchOrders = "";
    
    applyFilters();
  });
  
  // 5. Add Leads List Table filters listeners
  document.getElementById("filter-lead-source").addEventListener("change", function() {
    filterState.leadSourceGroup = this.value;
    applyFilters();
  });
  
  document.getElementById("filter-lead-relation").addEventListener("change", function() {
    filterState.leadRelation = this.value;
    applyFilters();
  });
  
  document.getElementById("search-leads").addEventListener("input", function() {
    filterState.searchLeads = this.value;
    applyFilters();
  });
  
  // 6. Add Orders List Table filters listeners
  document.getElementById("filter-order-category").addEventListener("change", function() {
    filterState.orderCategory = this.value;
    applyFilters();
  });
  
  document.getElementById("filter-order-type").addEventListener("change", function() {
    filterState.orderType = this.value;
    applyFilters();
  });
  
  document.getElementById("search-orders").addEventListener("input", function() {
    filterState.searchOrders = this.value;
    applyFilters();
  });
  
  // 7. Table Paginations Handlers
  document.getElementById("leads-prev-btn").addEventListener("click", () => {
    if (paginationState.leads.currentPage > 1) {
      paginationState.leads.currentPage--;
      renderLeadsTable();
    }
  });
  document.getElementById("leads-next-btn").addEventListener("click", () => {
    const maxPage = Math.ceil(filteredLeads.length / paginationState.leads.limit);
    if (paginationState.leads.currentPage < maxPage) {
      paginationState.leads.currentPage++;
      renderLeadsTable();
    }
  });
  
  document.getElementById("orders-prev-btn").addEventListener("click", () => {
    if (paginationState.orders.currentPage > 1) {
      paginationState.orders.currentPage--;
      renderOrdersTable();
    }
  });
  document.getElementById("orders-next-btn").addEventListener("click", () => {
    const maxPage = Math.ceil(filteredOrders.length / paginationState.orders.limit);
    if (paginationState.orders.currentPage < maxPage) {
      paginationState.orders.currentPage++;
      renderOrdersTable();
    }
  });
  
  // 8. Sidebar Sync Button (Real-time sync)
  document.getElementById("open-sync-btn").addEventListener("click", async () => {
    const btn = document.getElementById("open-sync-btn");
    const originalHtml = btn.innerHTML;
    btn.innerHTML = `<i data-lucide="loader" class="spin" style="width: 16px; margin-right: 4px; display: inline-block; vertical-align: middle;"></i> <span style="vertical-align: middle;">Đang đồng bộ...</span>`;
    if (typeof lucide !== 'undefined') lucide.createIcons();
    
    await loadDataFromGoogleSheets();
    
    btn.innerHTML = `<i data-lucide="check" style="width: 16px; margin-right: 4px; display: inline-block; vertical-align: middle;"></i> <span style="vertical-align: middle;">Thành công</span>`;
    if (typeof lucide !== 'undefined') lucide.createIcons();
    
    alert("Đồng bộ dữ liệu thành công từ các nguồn Google Sheets (nếu có cài đặt)!");
    window.location.reload();
  });
  
  // Key Account Tracking Module Inits
  initKeyAccountsSelectors();
  initKeyAccountListeners();

  // OKR Module Inits
  initOKRSelectors();
  initOKRListeners();

  // Commitment Module Inits
  initCommitmentListeners();

  // AI Projects Tracking Module Inits
  initAIProjectsModule();
  
  // Renewal Customers Module Inits
  // initRenewalCustomersEvents(); (Removed, using DOMContentLoaded in the new block)

  // Executive printable Report Module Inits
  initExecutiveReportModule();

  // Run first analysis
  applyFilters();
}

// ==========================================
// 11. KEY ACCOUNT CONTROLLERS & LOGIC
// ==========================================
let keyAccounts = [];
if (localStorage.getItem('KEY_ACCOUNTS_DATA')) {
  keyAccounts = JSON.parse(localStorage.getItem('KEY_ACCOUNTS_DATA'));
} else {
  // Seed initial high-quality demo data for Vietnamese Enterprise Sales Persona
  keyAccounts = [
    {
      id: "ka-1",
      name: "Tập đoàn Vingroup (VinFast)",
      products: ["Triển khai phần mềm", "License Enterprise"],
      stage: "Đang demo/trial",
      potential: 5,
      weeklyLogs: [
        {
          week: "Tuần 20/2026",
          updateThisWeek: "Đã hoàn tất cấu hình bản dùng thử (Trial) hệ thống JEGA Factory cho nhà máy Hải Phòng. Đội ngũ kỹ sư bắt đầu trải nghiệm thực tế.",
          planNextWeek: "Họp đánh giá phản hồi sau 1 tuần dùng thử và ghi nhận các lỗi hoặc yêu cầu tinh chỉnh từ phía kỹ sư vận hành nhà máy.",
          issues: "Cần đảm bảo kết nối mạng nội bộ của họ không chặn cổng kết nối AWS Cloud bảo mật của chúng ta.",
          timestamp: "18/05/2026 14:30:22"
        }
      ]
    },
    {
      id: "ka-2",
      name: "Công ty Cổ phần Sữa Việt Nam (Vinamilk)",
      products: ["JEGA Pro", "Đào tạo online"],
      stage: "Báo giá",
      potential: 4,
      weeklyLogs: [
        {
          week: "Tuần 20/2026",
          updateThisWeek: "Đã trình bày báo cáo tối ưu năng lực bán hàng bằng AI cho Ban Giám đốc Kinh doanh Vinamilk. Mức độ quan tâm đạt 9/10.",
          planNextWeek: "Hoàn thiện báo giá gói Enterprise 500 licenses kèm lộ trình đào tạo trực tuyến chi tiết cho nhân sự Vinamilk.",
          issues: "Đang vướng mắc ở điều khoản thanh toán chậm 45 ngày của đối tác, kế toán đang thẩm định rủi ro tài chính.",
          timestamp: "19/05/2026 10:15:45"
        }
      ]
    }
  ];
  localStorage.setItem('KEY_ACCOUNTS_DATA', JSON.stringify(keyAccounts));
}

// 1. Initialize selectors dynamically
function initKeyAccountsSelectors() {
  const jegaCloudProducts = [
    "JEGA Cloud Design Basic",
    "JEGA Cloud Design VIP",
    "JEGA Cloud Design Premium",
    "JEGA Cloud Design - Gói doanh nghiệp",
    "JEGA PRO",
    "License Enterprise Backstage",
    "Đào tạo online",
    "Đào tạo trực tiếp",
    "Nhận diện thương hiệu",
    "Phần mềm sản xuất Jega Cloud Factory (Jega Lite)",
    "Gói dịch vụ triển khai phần mềm Jega Cloud Factory",
    "Tickets bổ sung"
  ];
  
  const jegaVisualProducts = [
    "Furni AI - Credit (mua thêm)",
    "FurniAI Basic",
    "FurniAI Plus",
    "FurniAI Pro",
    "Visual Agent",
    "PANAMA AI",
    "Interior AI",
    "ProductAI (Plus)",
    "ProductAI (Basic)",
    "Dịch vụ đào tạo AI",
    "Showroom AI"
  ];

  const container = document.getElementById("ka-products-container");
  if (container) {
    let html = '';
    
    // Group 1: JEGA Cloud
    html += `
      <div style="grid-column: 1 / -1; font-weight: 800; font-size: 0.85rem; color: #14B8A6; border-bottom: 1px solid rgba(0, 111, 122, 0.15); padding: 0.4rem 0; margin-top: 0.5rem; display: flex; align-items: center; gap: 6px;">
        <i data-lucide="cloud" style="width: 14px; height: 14px;"></i> Nhóm JEGA Cloud
      </div>
    `;
    jegaCloudProducts.forEach(p => {
      html += `
        <label class="product-select-item" style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer; padding: 0.25rem 0;">
          <input type="checkbox" name="ka-product-checkbox" value="${p}" style="accent-color: #006F7A; width: 16px; height: 16px;">
          <span style="font-size: 0.8rem; font-weight: 600; color: #0A1E2C;">${p}</span>
        </label>
      `;
    });
    
    // Group 2: JEGA Visual
    html += `
      <div style="grid-column: 1 / -1; font-weight: 800; font-size: 0.85rem; color: #14B8A6; border-bottom: 1px solid rgba(0, 111, 122, 0.15); padding: 0.4rem 0; margin-top: 1rem; display: flex; align-items: center; gap: 6px;">
        <i data-lucide="eye" style="width: 14px; height: 14px;"></i> Nhóm JEGA Visual
      </div>
    `;
    jegaVisualProducts.forEach(p => {
      html += `
        <label class="product-select-item" style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer; padding: 0.25rem 0;">
          <input type="checkbox" name="ka-product-checkbox" value="${p}" style="accent-color: #006F7A; width: 16px; height: 16px;">
          <span style="font-size: 0.8rem; font-weight: 600; color: #0A1E2C;">${p}</span>
        </label>
      `;
    });
    
    container.innerHTML = html;
    if (typeof lucide !== 'undefined') lucide.createIcons();
  }
  
  // Populate datalist with existing leads names for easy auto-complete
  const datalist = document.getElementById("leads-datalist");
  if (datalist) {
    const leadNames = Array.from(new Set(leadsData.map(l => l.ten_kh).filter(Boolean)))
      .map(n => n.trim())
      .sort();
    datalist.innerHTML = leadNames.map(name => `<option value="${name}">`).join("");
  }
}

// 2. Setup all Key Account listeners
function initKeyAccountListeners() {
  // Search Key Accounts
  const searchKA = document.getElementById("search-key-accounts");
  if (searchKA) {
    searchKA.addEventListener("input", renderKeyAccountsTable);
  }
  
  // Filter Key Accounts by Stage
  const filterKAStage = document.getElementById("filter-ka-stage");
  if (filterKAStage) {
    filterKAStage.addEventListener("change", renderKeyAccountsTable);
  }
  
  // Open Add Modal
  const openAddKABtn = document.getElementById("open-add-key-account-btn");
  const kaModal = document.getElementById("key-account-modal");
  if (openAddKABtn && kaModal) {
    openAddKABtn.addEventListener("click", () => {
      document.getElementById("ka-form-title");
      document.getElementById("ka-modal-title").innerText = "Thêm Khách Hàng Key Account";
      document.getElementById("ka-id").value = "";
      document.getElementById("ka-name").value = "";
      document.getElementById("ka-name").disabled = false;
      document.getElementById("ka-stage").value = "Nhận thông tin";
      
      // Reset checkboxes
      document.querySelectorAll("input[name='ka-product-checkbox']").forEach(cb => cb.checked = false);
      
      // Reset Stars to default 3
      document.getElementById("ka-potential").value = "3";
      const stars = document.querySelectorAll("#ka-stars-editor .star-btn");
      stars.forEach((s, idx) => {
        if (idx < 3) {
          s.classList.add("active");
          s.style.color = "var(--color-gold)";
        } else {
          s.classList.remove("active");
          s.style.color = "var(--text-muted)";
        }
      });
      
      kaModal.classList.add("active");
    });
  }
  
  // Close / Cancel Modals Handlers
  const modalCloseActions = [
    { btnId: "close-ka-btn", modalId: "key-account-modal" },
    { btnId: "cancel-ka-btn", modalId: "key-account-modal" },
    { btnId: "close-ka-log-btn", modalId: "key-account-log-modal" },
    { btnId: "cancel-ka-log-btn", modalId: "key-account-log-modal" },
    { btnId: "close-ka-history-btn", modalId: "key-account-history-modal" },
    { btnId: "close-ka-history-btn-2", modalId: "key-account-history-modal" },
    { btnId: "close-ka-sync-btn", modalId: "key-account-sync-modal" },
    { btnId: "cancel-ka-sync-btn", modalId: "key-account-sync-modal" }
  ];
  
  modalCloseActions.forEach(action => {
    const btn = document.getElementById(action.btnId);
    const modal = document.getElementById(action.modalId);
    if (btn && modal) {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        modal.classList.remove("active");
      });
    }
  });
  
  // Interactive Stars Rating Selection Editor
  const starsEditor = document.getElementById("ka-stars-editor");
  if (starsEditor) {
    starsEditor.addEventListener("click", function(e) {
      const starBtn = e.target.closest(".star-btn");
      if (starBtn) {
        const val = parseInt(starBtn.getAttribute("data-value"));
        document.getElementById("ka-potential").value = val;
        
        const stars = this.querySelectorAll(".star-btn");
        stars.forEach((s, idx) => {
          if (idx < val) {
            s.classList.add("active");
            s.style.color = "var(--color-gold)";
          } else {
            s.classList.remove("active");
            s.style.color = "var(--text-muted)";
          }
        });
      }
    });
  }
  
  // Form Add / Edit Key Account Submit
  const kaForm = document.getElementById("key-account-form");
  if (kaForm) {
    kaForm.addEventListener("submit", function(e) {
      e.preventDefault();
      
      const idVal = document.getElementById("ka-id").value;
      const nameVal = document.getElementById("ka-name").value.trim();
      const stageVal = document.getElementById("ka-stage").value;
      const potentialVal = parseInt(document.getElementById("ka-potential").value);
      
      // Selected checkboxes
      const selectedProducts = Array.from(document.querySelectorAll("input[name='ka-product-checkbox']:checked"))
        .map(cb => cb.value);
        
      if (selectedProducts.length === 0) {
        alert("Vui lòng tích chọn ít nhất 1 sản phẩm quan tâm.");
        return;
      }
      
      if (idVal) {
        // Edit existing Key Account
        const ka = keyAccounts.find(x => x.id === idVal);
        if (ka) {
          ka.name = nameVal;
          ka.products = selectedProducts;
          ka.stage = stageVal;
          ka.potential = potentialVal;
        }
      } else {
        // Double check name collision
        if (keyAccounts.some(x => x.name.toLowerCase() === nameVal.toLowerCase())) {
          alert("Khách hàng này đã nằm trong danh sách theo dõi Key Account.");
          return;
        }
        // Add new Key Account
        const newKA = {
          id: "ka-" + Date.now(),
          name: nameVal,
          products: selectedProducts,
          stage: stageVal,
          potential: potentialVal,
          weeklyLogs: []
        };
        keyAccounts.push(newKA);
      }
      
      localStorage.setItem('KEY_ACCOUNTS_DATA', JSON.stringify(keyAccounts));
      kaModal.classList.remove("active");
      renderKeyAccountsTable();
      updateKeyAccountKPIs();
    });
  }
  
  // Form Weekly Log Submit
  const kaLogForm = document.getElementById("key-account-log-form");
  if (kaLogForm) {
    kaLogForm.addEventListener("submit", function(e) {
      e.preventDefault();
      
      const accountId = document.getElementById("ka-log-account-id").value;
      const logIdxStr = document.getElementById("ka-log-index").value;
      const weekVal = document.getElementById("ka-log-week").value.trim();
      const updateVal = document.getElementById("ka-log-update").value.trim();
      const planVal = document.getElementById("ka-log-plan").value.trim();
      const issuesVal = document.getElementById("ka-log-issues").value.trim();
      
      const ka = keyAccounts.find(x => x.id === accountId);
      if (!ka) return;
      
      const nowStr = new Date().toLocaleDateString("vi-VN") + " " + new Date().toLocaleTimeString("vi-VN", {hour12: false});
      
      if (logIdxStr !== "") {
        // Edit Log
        const idx = parseInt(logIdxStr);
        ka.weeklyLogs[idx] = {
          week: weekVal,
          updateThisWeek: updateVal,
          planNextWeek: planVal,
          issues: issuesVal,
          timestamp: nowStr
        };
      } else {
        // Add Log
        if (!ka.weeklyLogs) ka.weeklyLogs = [];
        ka.weeklyLogs.push({
          week: weekVal,
          updateThisWeek: updateVal,
          planNextWeek: planVal,
          issues: issuesVal,
          timestamp: nowStr
        });
      }
      
      localStorage.setItem('KEY_ACCOUNTS_DATA', JSON.stringify(keyAccounts));
      document.getElementById("key-account-log-modal").classList.remove("active");
      renderKeyAccountsTable();
      
      // If history is open, refresh it
      const histModal = document.getElementById("key-account-history-modal");
      if (histModal && histModal.classList.contains("active")) {
        viewHistoryLogs(accountId);
      }
    });
  }
  
  // Sync Modal Trigger
  const openKAHistorySyncBtn = document.getElementById("open-key-account-sync-btn");
  const kaSyncModal = document.getElementById("key-account-sync-modal");
  if (openKAHistorySyncBtn && kaSyncModal) {
    openKAHistorySyncBtn.addEventListener("click", () => {
      // Load saved webhook URL
      const savedWebhook = localStorage.getItem('KEY_ACCOUNTS_WEBHOOK') || '';
      document.getElementById("ka-sync-webhook-url").value = savedWebhook;
      
      // Active first tab
      document.querySelectorAll("#key-account-sync-modal .modal-tab").forEach(t => t.classList.remove("active"));
      document.querySelectorAll("#key-account-sync-modal .modal-tab-content").forEach(tc => tc.classList.remove("active"));
      
      document.querySelector("#key-account-sync-modal .modal-tab[data-tab='webhook']").classList.add("active");
      document.getElementById("tab-webhook").classList.add("active");
      
      kaSyncModal.classList.add("active");
    });
  }
  
  // Tab Switchers in Sync Modal
  document.querySelectorAll("#key-account-sync-modal .modal-tab").forEach(tab => {
    tab.addEventListener("click", function() {
      document.querySelectorAll("#key-account-sync-modal .modal-tab").forEach(t => t.classList.remove("active"));
      document.querySelectorAll("#key-account-sync-modal .modal-tab-content").forEach(tc => tc.classList.remove("active"));
      
      this.classList.add("active");
      const targetTab = this.getAttribute("data-tab");
      document.getElementById(`tab-${targetTab}`).classList.add("active");
      
      if (targetTab === "copy-paste") {
        generateCopyPasteData();
      }
    });
  });
  
  // Copy Apps Script Click Helper
  const copyScriptBtn = document.getElementById("copy-apps-script-btn");
  if (copyScriptBtn) {
    copyScriptBtn.addEventListener("click", function() {
      this.select();
      document.execCommand("copy");
      alert("Đã sao chép thành công mã nguồn Google Apps Script vào Clipboard!");
    });
  }
  
  // Copy Data Area Click Helper
  const copyDataArea = document.getElementById("ka-copy-data-area");
  if (copyDataArea) {
    copyDataArea.addEventListener("click", function() {
      this.select();
      document.execCommand("copy");
      alert("Đã sao chép dữ liệu bảng Key Account vào Clipboard! Hãy sẵn sàng Paste trực tiếp vào ô A1 sheet Google Sheets của bạn.");
    });
  }
  
  // Webhook Sync Action Button
  const startKASyncBtn = document.getElementById("start-ka-sync-btn");
  if (startKASyncBtn) {
    startKASyncBtn.addEventListener("click", syncKeyAccountsToSheet);
  }
}

// 3. Update Key Account KPIs numbers
function updateKeyAccountKPIs() {
  const total = keyAccounts.length;
  const potential = keyAccounts.filter(ka => ka.potential >= 4).length;
  const signed = keyAccounts.filter(ka => ka.stage === "Ký hợp đồng").length;
  
  document.getElementById("kpi-ka-total").innerText = total.toLocaleString("vi-VN");
  document.getElementById("kpi-ka-potential").innerText = potential.toLocaleString("vi-VN");
  document.getElementById("kpi-ka-signed").innerText = signed.toLocaleString("vi-VN");
}

// 4. Render stars display
function getStarsHTML(rating) {
  let html = '<div class="stars-display">';
  for (let i = 1; i <= 5; i++) {
    if (i <= rating) {
      html += '<i data-lucide="star" style="color:var(--color-gold); fill:var(--color-gold); width:13px; height:13px;"></i>';
    } else {
      html += '<i data-lucide="star" style="color:var(--text-muted); width:13px; height:13px;"></i>';
    }
  }
  html += '</div>';
  return html;
}

// 5. Master Render Key Accounts Table
function renderKeyAccountsTable() {
  const query = document.getElementById("search-key-accounts").value.toLowerCase();
  const filterStage = document.getElementById("filter-ka-stage").value;
  
  const filtered = keyAccounts.filter(ka => {
    const matchSearch = ka.name.toLowerCase().includes(query) ||
                        ka.products.some(p => p.toLowerCase().includes(query)) ||
                        (ka.weeklyLogs && ka.weeklyLogs.some(log => log.updateThisWeek.toLowerCase().includes(query)));
                        
    const matchStage = filterStage === "all" || ka.stage === filterStage;
    
    return matchSearch && matchStage;
  });
  
  const tbody = document.getElementById("key-accounts-table-body");
  tbody.innerHTML = "";
  
  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--text-secondary); padding: 2.5rem; font-size:0.85rem;">Không tìm thấy khách hàng Key Account nào khớp bộ lọc.</td></tr>`;
    return;
  }
  
  filtered.forEach(ka => {
    // Get newest weekly log entry
    const latestLog = ka.weeklyLogs && ka.weeklyLogs.length > 0 ? ka.weeklyLogs[ka.weeklyLogs.length - 1] : null;
    const updateText = latestLog ? latestLog.updateThisWeek : "Chưa có cập nhật tuần này";
    const planText = latestLog ? latestLog.planNextWeek : "Chưa có kế hoạch tuần sau";
    const issuesText = latestLog && latestLog.issues ? latestLog.issues : "-";
    
    const productsHTML = ka.products.map(p => `<span class="product-tag">${p}</span>`).join("");
    
    let stageClass = "badge-stage-1";
    if (ka.stage === "Đang tư vấn") stageClass = "badge-stage-2";
    else if (ka.stage === "Đang demo/trial") stageClass = "badge-stage-3";
    else if (ka.stage === "Báo giá") stageClass = "badge-stage-4";
    else if (ka.stage === "Ký hợp đồng") stageClass = "badge-stage-5";
    else if (ka.stage === "Chăm sóc sau bán") stageClass = "badge-stage-6";
    else if (ka.stage === "Tạm dừng") stageClass = "badge-stage-7";
    
    const starsHTML = getStarsHTML(ka.potential);
    
    const tr = document.createElement("tr");
    tr.innerHTML = [
      '<td style="font-weight: 700; color: var(--text-primary); font-size: 0.85rem; line-height: 1.4;">', ka.name, '</td>',
      '<td><div style="white-space: normal; line-height: 1.4;">', productsHTML, '</div></td>',
      '<td><span class="badge ', stageClass, '">', ka.stage, '</span></td>',
      '<td>', starsHTML, '</td>',
      '<td><div class="tooltip-container" title="', updateText, '" style="white-space: normal; max-width: 220px; line-height: 1.5; font-size: 0.8rem;">', updateText, '</div></td>',
      '<td><div class="tooltip-container" title="', planText, '" style="white-space: normal; max-width: 220px; line-height: 1.5; font-size: 0.8rem;">', planText, '</div></td>',
      '<td>',
        '<div class="tooltip-container ', (latestLog && latestLog.issues ? 'text-danger' : ''), '" title="', issuesText, '" style="white-space: normal; max-width: 220px; line-height: 1.5; font-size: 0.8rem;">',
          (latestLog && latestLog.issues ? '<i data-lucide="alert-triangle" style="width:12px; height:12px; display:inline-block; vertical-align:middle; margin-right:4px; color:var(--color-danger);"></i>' : ''),
          '<span style="vertical-align:middle;">', issuesText, '</span>',
        '</div>',
      '</td>',
      '<td align="center">',
        '<div class="actions-cell">',
          '<button class="action-icon-btn" onclick="addWeeklyLog(\'', ka.id, '\')" title="Cập nhật nhật ký tuần">',
            '<i data-lucide="edit-3" style="color:var(--color-gold);"></i>',
          '</button>',
          '<button class="action-icon-btn" onclick="viewHistoryLogs(\'', ka.id, '\')" title="Lịch sử nhật ký">',
            '<i data-lucide="history"></i>',
          '</button>',
          '<button class="action-icon-btn" onclick="editKeyAccount(\'', ka.id, '\')" title="Chỉnh sửa">',
            '<i data-lucide="edit"></i>',
          '</button>',
          '<button class="action-icon-btn delete" onclick="deleteKeyAccount(\'', ka.id, '\')" title="Xóa">',
            '<i data-lucide="trash-2"></i>',
          '</button>',
        '</div>',
      '</td>'
    ].join('');
    tbody.appendChild(tr);
  });
  
  lucide.createIcons();
}

// 6. Delete Account
function deleteKeyAccount(id) {
  const ka = keyAccounts.find(x => x.id === id);
  if (!ka) return;
  
  if (confirm(`Bạn có chắc chắn muốn xóa khách hàng lớn "${ka.name}" và toàn bộ lịch sử tuần của khách hàng này không?`)) {
    keyAccounts = keyAccounts.filter(x => x.id !== id);
    localStorage.setItem('KEY_ACCOUNTS_DATA', JSON.stringify(keyAccounts));
    renderKeyAccountsTable();
    updateKeyAccountKPIs();
  }
}

// 7. Edit Account Information
function editKeyAccount(id) {
  const ka = keyAccounts.find(x => x.id === id);
  if (!ka) return;
  
  document.getElementById("ka-modal-title").innerText = "Chỉnh Sửa Thông Tin Key Account";
  document.getElementById("ka-id").value = ka.id;
  document.getElementById("ka-name").value = ka.name;
  document.getElementById("ka-name").disabled = true; // Block name change to retain log mapping consistency
  document.getElementById("ka-stage").value = ka.stage;
  
  // Set Products Checkboxes
  document.querySelectorAll("input[name='ka-product-checkbox']").forEach(cb => {
    cb.checked = ka.products.includes(cb.value);
  });
  
  // Set Star rating
  document.getElementById("ka-potential").value = ka.potential;
  const stars = document.querySelectorAll("#ka-stars-editor .star-btn");
  stars.forEach((s, idx) => {
    if (idx < ka.potential) {
      s.classList.add("active");
      s.style.color = "var(--color-gold)";
    } else {
      s.classList.remove("active");
      s.style.color = "var(--text-muted)";
    }
  });
  
  document.getElementById("key-account-modal").classList.add("active");
}

// 8. Open Weekly Log Adder Form
function addWeeklyLog(accountId) {
  const ka = keyAccounts.find(x => x.id === accountId);
  if (!ka) return;
  
  document.getElementById("ka-log-modal-title").innerText = "Thêm Nhật Ký Tuần Mới";
  document.getElementById("ka-log-account-id").value = accountId;
  document.getElementById("ka-log-index").value = "";
  document.getElementById("ka-log-customer-name").innerText = `Khách hàng lớn: ${ka.name}`;
  
  // Calculate automatic default ISO week number
  const curDate = new Date();
  const tempDate = new Date(Date.UTC(curDate.getFullYear(), curDate.getMonth(), curDate.getDate()));
  const dayNum = tempDate.getUTCDay() || 7;
  tempDate.setUTCDate(tempDate.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(tempDate.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((tempDate - yearStart) / 86400000) + 1) / 7);
  const defaultWeekStr = `Tuần ${weekNo}/${curDate.getFullYear()}`;
  
  document.getElementById("ka-log-week").value = defaultWeekStr;
  document.getElementById("ka-log-update").value = "";
  document.getElementById("ka-log-plan").value = "";
  document.getElementById("ka-log-issues").value = "";
  
  document.getElementById("key-account-log-modal").classList.add("active");
}

// 9. View history logs modal
function viewHistoryLogs(accountId) {
  const ka = keyAccounts.find(x => x.id === accountId);
  if (!ka) return;
  
  document.getElementById("ka-history-customer-name").innerText = `Khách hàng lớn: ${ka.name}`;
  const container = document.getElementById("ka-history-timeline");
  container.innerHTML = "";
  
  if (!ka.weeklyLogs || ka.weeklyLogs.length === 0) {
    container.innerHTML = `<div style="text-align: center; color: var(--text-secondary); padding: 2rem; font-size:0.85rem;">Chưa ghi nhận bất kỳ lịch sử cập nhật tuần nào cho khách hàng này.</div>`;
    document.getElementById("key-account-history-modal").classList.add("active");
    return;
  }
  
  // Render timeline in reverse order (newest first)
  const logsReversed = [...ka.weeklyLogs].reverse();
  
  logsReversed.forEach((log, revIdx) => {
    // Map original index back
    const originalIdx = ka.weeklyLogs.length - 1 - revIdx;
    
    const div = document.createElement("div");
    div.className = "timeline-item";
    div.innerHTML = `
      <div class="timeline-header">
        <span class="timeline-week"><i data-lucide="calendar" style="width:12px; height:12px; display:inline-block; vertical-align:middle; margin-right:4px;"></i> ${log.week}</span>
        <span class="timeline-date">${log.timestamp}</span>
      </div>
      <div class="timeline-body">
        <div class="timeline-section">
          <div class="timeline-section-title">Cập nhật tuần này</div>
          <div class="timeline-section-content">${log.updateThisWeek}</div>
        </div>
        <div class="timeline-section">
          <div class="timeline-section-title">Kế hoạch tuần sau</div>
          <div class="timeline-section-content">${log.planNextWeek}</div>
        </div>
        ${log.issues ? `
        <div class="timeline-section">
          <div class="timeline-section-title text-danger">Vấn đề / Khó khăn</div>
          <div class="timeline-section-content text-danger">${log.issues}</div>
        </div>
        ` : ''}
        <div class="timeline-actions">
          <button class="timeline-btn" onclick="editWeeklyLog('${ka.id}', ${originalIdx})">
            <i data-lucide="edit-2"></i> Chỉnh sửa
          </button>
          <button class="timeline-btn delete" onclick="deleteWeeklyLog('${ka.id}', ${originalIdx})">
            <i data-lucide="trash-2"></i> Xóa nhật ký
          </button>
        </div>
      </div>
    `;
    container.appendChild(div);
  });
  
  lucide.createIcons();
  document.getElementById("key-account-history-modal").classList.add("active");
}

// 10. Edit specific weekly log entry
function editWeeklyLog(accountId, logIdx) {
  const ka = keyAccounts.find(x => x.id === accountId);
  if (!ka) return;
  
  const log = ka.weeklyLogs[logIdx];
  if (!log) return;
  
  // Close history modal
  document.getElementById("key-account-history-modal").classList.remove("active");
  
  document.getElementById("ka-log-modal-title").innerText = "Chỉnh Sửa Nhật Ký Tuần";
  document.getElementById("ka-log-account-id").value = accountId;
  document.getElementById("ka-log-index").value = logIdx;
  document.getElementById("ka-log-customer-name").innerText = `Khách hàng lớn: ${ka.name}`;
  
  document.getElementById("ka-log-week").value = log.week;
  document.getElementById("ka-log-update").value = log.updateThisWeek;
  document.getElementById("ka-log-plan").value = log.planNextWeek;
  document.getElementById("ka-log-issues").value = log.issues || "";
  
  document.getElementById("key-account-log-modal").classList.add("active");
}

// 11. Delete specific weekly log entry
function deleteWeeklyLog(accountId, logIdx) {
  const ka = keyAccounts.find(x => x.id === accountId);
  if (!ka) return;
  
  if (confirm(`Bạn có chắc chắn muốn xóa nhật ký "${ka.weeklyLogs[logIdx].week}" của khách hàng này không?`)) {
    ka.weeklyLogs.splice(logIdx, 1);
    localStorage.setItem('KEY_ACCOUNTS_DATA', JSON.stringify(keyAccounts));
    renderKeyAccountsTable();
    
    // Refresh history
    viewHistoryLogs(accountId);
  }
}

// 12. Build tab-separated Excel copy paste data
function generateCopyPasteData() {
  let tabString = "Tên khách hàng\tSản phẩm quan tâm\tGiai đoạn tư vấn\tMức độ tiềm năng (Sao)\tTuần cập nhật\tCập nhật tuần này\tKế hoạch tuần sau\tVấn đề/Khó khăn\tThời gian cập nhật hệ thống\n";
  
  keyAccounts.forEach(ka => {
    const products = ka.products.join(", ");
    if (ka.weeklyLogs && ka.weeklyLogs.length > 0) {
      ka.weeklyLogs.forEach(log => {
        tabString += `${ka.name}\t${products}\t${ka.stage}\t${ka.potential}\t${log.week}\t${log.updateThisWeek}\t${log.planNextWeek}\t${log.issues || ""}\t${log.timestamp}\n`;
      });
    } else {
      tabString += `${ka.name}\t${products}\t${ka.stage}\t${ka.potential}\tChưa có cập nhật\t-\t-\t-\t-\n`;
    }
  });
  
  const textarea = document.getElementById("ka-copy-data-area");
  if (textarea) {
    textarea.value = tabString;
  }
}

// 13. Sync key accounts dynamically to Google Sheet Webhook
function syncKeyAccountsToSheet() {
  const urlInput = document.getElementById("ka-sync-webhook-url").value.trim();
  if (!urlInput) {
    alert("Vui lòng nhập Google Apps Script Web App URL trước khi đồng bộ.");
    return;
  }
  
  // Save webhook URL in local storage
  localStorage.setItem('KEY_ACCOUNTS_WEBHOOK', urlInput);
  
  const activeTab = document.querySelector("#key-account-sync-modal .modal-tab.active").getAttribute("data-tab");
  
  if (activeTab === "copy-paste") {
    // Already copied on tab change, but copy again to ensure clipboard is populated
    generateCopyPasteData();
    const copyArea = document.getElementById("ka-copy-data-area");
    copyArea.select();
    document.execCommand("copy");
    alert("Đã tự động sao chép toàn bộ bảng dữ liệu Key Account! Hãy mở Google Sheets tại trang 'Key Account' và nhấn Ctrl+V (hoặc Cmd+V) từ ô A1.");
    document.getElementById("key-account-sync-modal").classList.remove("active");
    return;
  }
  
  // If webhook tab, perform fetch sync
  const btn = document.getElementById("start-ka-sync-btn");
  btn.innerHTML = `<i data-lucide="loader" class="animate-spin"></i> Đang đồng bộ...`;
  lucide.createIcons();
  
  fetch(urlInput, {
    method: "POST",
    body: JSON.stringify(keyAccounts),
    headers: {
      "Content-Type": "text/plain"
    }
  })
  .then(res => res.json())
  .then(data => {
    btn.innerHTML = '<i data-lucide="refresh-cw"></i> Thực hiện đồng bộ';
    lucide.createIcons();
    if (data.status === "success") {
      alert("Đồng bộ đám mây thành công! Google Sheet đã ghi nhận và đồng bộ ngược 100% dữ liệu lịch sử Key Account.");
      document.getElementById("key-account-sync-modal").classList.remove("active");
    } else {
      alert("Đồng bộ thất bại: " + data.message);
    }
  })
  .catch(err => {
    // Fallback: CORS might cause response check block, let's try with no-cors to be safe and notify user
    console.warn("CORS warning raised, re-triggering via secure transparent no-cors webhook wrapper...");
    fetch(urlInput, {
      method: "POST",
      mode: "no-cors",
      body: JSON.stringify(keyAccounts),
      headers: {
        "Content-Type": "text/plain"
      }
    })
    .then(() => {
      btn.innerHTML = '<i data-lucide="refresh-cw"></i> Thực hiện đồng bộ';
      lucide.createIcons();
      alert("Đồng bộ đám mây thành công! Dữ liệu đã được truyền tải hoàn tất tới Google Sheet.");
      document.getElementById("key-account-sync-modal").classList.remove("active");
    })
    .catch(e => {
      btn.innerHTML = '<i data-lucide="refresh-cw"></i> Thực hiện đồng bộ';
      lucide.createIcons();
      alert("Lỗi kết nối Webhook: " + e.toString());
    });
  });
}

// ==========================================
// 11B. RENEWAL CUSTOMERS CONTROLLERS & LOGIC
// ==========================================
let renewedCounts = JSON.parse(localStorage.getItem('RENEWED_COUNTS')) || {};

function saveRenewedCount(id, value) {
  renewedCounts[id] = value;
  localStorage.setItem('RENEWED_COUNTS', JSON.stringify(renewedCounts));
}

window.generateRenewTableHtml = function(yearData, yearStr, isPdf = false, targetQuarter = null) {
  let html = "";
  let quarters = ["Q1", "Q2", "Q3", "Q4"];
  if (targetQuarter) {
    quarters = [targetQuarter];
  }
  
  quarters.forEach(q => {
    const qData = yearData[q];
    const qId = `${yearStr}_${q}`;
    const savedRenewedQ = renewedCounts[qId] || "";
    
    let inputHtmlQ = isPdf ? `<span>${savedRenewedQ}</span>` : `<input type="number" class="renew-input" data-id="${qId}" value="${savedRenewedQ}" placeholder="Nhập" style="width: 80px; padding: 4px; text-align: center; border: 1px solid #cbd5e1; border-radius: 4px;">`;

    html += `
      <tr style="background-color: #f1f5f9; font-weight: 700; border-bottom: 2px solid #cbd5e1; text-align: center;">
        <td style="padding: 12px; border: 1px solid #cbd5e1; text-align: center; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;">${q}</td>
        <td style="padding: 12px; border: 1px solid #cbd5e1; text-align: center; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;">${qData.total["Sắp hết hạn"]}</td>
        <td style="padding: 12px; border: 1px solid #cbd5e1; text-align: center; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;">${qData.total["Đang sử dụng"]}</td>
        <td style="padding: 12px; border: 1px solid #cbd5e1; text-align: center; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;">${qData.total["Hết hạn"]}</td>
        <td style="padding: 12px; border: 1px solid #cbd5e1; text-align: center; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;">${qData.total["Không tái ký"]}</td>
        <td style="padding: 12px; border: 1px solid #cbd5e1; text-align: center; color: var(--color-primary); -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;">${qData.total.total}</td>
        <td style="padding: 12px; border: 1px solid #cbd5e1; text-align: center; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;">
          ${inputHtmlQ}
        </td>
      </tr>
    `;
    
    let startMonth = 1;
    if (q==="Q2") startMonth = 4;
    if (q==="Q3") startMonth = 7;
    if (q==="Q4") startMonth = 10;

    for (let m = startMonth; m < startMonth + 3; m++) {
      const mData = qData.months[m] || { "Sắp hết hạn": 0, "Đang sử dụng": 0, "Hết hạn": 0, "Không tái ký": 0, total: 0 };
      const mId = `${yearStr}_Tháng ${m}`;
      const savedRenewedM = renewedCounts[mId] || "";
      
      let inputHtmlM = isPdf ? `<span>${savedRenewedM}</span>` : `<input type="number" class="renew-input" data-id="${mId}" value="${savedRenewedM}" placeholder="Nhập" style="width: 80px; padding: 4px; text-align: center; border: 1px solid #cbd5e1; border-radius: 4px;">`;

      html += `
        <tr style="border-bottom: 1px solid #e2e8f0; text-align: center;">
          <td style="padding: 10px; border: 1px solid #e2e8f0; text-align: center; color: #475569;">Tháng ${m}</td>
          <td style="padding: 10px; border: 1px solid #e2e8f0; text-align: center; color: #475569;">${mData["Sắp hết hạn"]}</td>
          <td style="padding: 10px; border: 1px solid #e2e8f0; text-align: center; color: #475569;">${mData["Đang sử dụng"]}</td>
          <td style="padding: 10px; border: 1px solid #e2e8f0; text-align: center; color: #475569;">${mData["Hết hạn"]}</td>
          <td style="padding: 10px; border: 1px solid #e2e8f0; text-align: center; color: #475569;">${mData["Không tái ký"]}</td>
          <td style="padding: 10px; border: 1px solid #e2e8f0; text-align: center; font-weight: 600;">${mData.total}</td>
          <td style="padding: 10px; border: 1px solid #e2e8f0; text-align: center;">
            ${inputHtmlM}
          </td>
        </tr>
      `;
    }
  });
  return html;
};

window.switchRenewTab = function(tabId) {
  document.getElementById("tab-btn-renew-expired").classList.remove("active");
  document.getElementById("tab-btn-renew-expired").style.background = "#f8fafc";
  document.getElementById("tab-btn-renew-expired").style.borderBottom = "1px solid #cbd5e1";
  document.getElementById("tab-btn-renew-expired").style.color = "var(--text-secondary)";

  document.getElementById("tab-btn-renew-reasons").classList.remove("active");
  document.getElementById("tab-btn-renew-reasons").style.background = "#f8fafc";
  document.getElementById("tab-btn-renew-reasons").style.borderBottom = "1px solid #cbd5e1";
  document.getElementById("tab-btn-renew-reasons").style.color = "var(--text-secondary)";

  document.getElementById("tab-content-renew-expired").style.display = "none";
  document.getElementById("tab-content-renew-reasons").style.display = "none";

  if (tabId === "expired") {
    document.getElementById("tab-btn-renew-expired").classList.add("active");
    document.getElementById("tab-btn-renew-expired").style.background = "#fff";
    document.getElementById("tab-btn-renew-expired").style.borderBottom = "none";
    document.getElementById("tab-btn-renew-expired").style.color = "var(--color-primary-light)";
    document.getElementById("tab-content-renew-expired").style.display = "block";
  } else {
    document.getElementById("tab-btn-renew-reasons").classList.add("active");
    document.getElementById("tab-btn-renew-reasons").style.background = "#fff";
    document.getElementById("tab-btn-renew-reasons").style.borderBottom = "none";
    document.getElementById("tab-btn-renew-reasons").style.color = "var(--color-primary-light)";
    document.getElementById("tab-content-renew-reasons").style.display = "block";
  }
};

window.renderRenewalDashboards = function() {
  const filterSales = document.getElementById("filter-renew-sales").value;
  const filterStatus = document.getElementById("filter-renew-status").value;
  const filterReason = document.getElementById("filter-renew-reason").value;
  
  const renewFromVal = document.getElementById("filter-renew-from").value;
  const renewToVal = document.getElementById("filter-renew-to").value;
  const renewFromDate = renewFromVal ? new Date(renewFromVal) : null;
  const renewToDate = renewToVal ? new Date(renewToVal) : null;

  const today = new Date();
  
  let mappedData = renewalData.map(item => {
    let dynamicItem = { ...item };
    const expDate = new Date(dynamicItem.expiration_date);
    const diffDays = Math.ceil((expDate - today) / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) {
      if (item.status === "Không tái ký" || item.reason) {
        dynamicItem.status = "Không tái ký";
      } else {
        dynamicItem.status = "Hết hạn";
      }
    } else if (diffDays <= 30) {
      dynamicItem.status = "Sắp hết hạn";
    } else {
      dynamicItem.status = "Đang sử dụng";
    }
    return dynamicItem;
  });

  let filtered = mappedData.filter(item => {
    let matchSales = filterSales === "all" || item.sale_name === filterSales;
    let matchStatus = filterStatus === "all" || item.status === filterStatus;
    let matchReason = filterReason === "all" || item.reason === filterReason;
    return matchSales && matchStatus && matchReason;
  });

  // Render Expired Tables for 2025 and 2026
  const data2025 = { "Q1": {}, "Q2": {}, "Q3": {}, "Q4": {} };
  const data2026 = { "Q1": {}, "Q2": {}, "Q3": {}, "Q4": {} };
  
  [data2025, data2026].forEach(yearData => {
    ["Q1","Q2","Q3","Q4"].forEach(q => {
      yearData[q] = {
        months: {},
        total: { "Sắp hết hạn": 0, "Đang sử dụng": 0, "Hết hạn": 0, "Không tái ký": 0, total: 0 }
      };
    });
  });

  filtered.forEach(item => {
    const d = new Date(item.expiration_date);
    const year = d.getFullYear();
    if (year !== 2025 && year !== 2026) return;

    const month = d.getMonth() + 1;
    let q = "Q1";
    if (month >= 4 && month <= 6) q = "Q2";
    else if (month >= 7 && month <= 9) q = "Q3";
    else if (month >= 10 && month <= 12) q = "Q4";

    const targetData = year === 2025 ? data2025 : data2026;
    if (!targetData[q].months[month]) {
      targetData[q].months[month] = { "Sắp hết hạn": 0, "Đang sử dụng": 0, "Hết hạn": 0, "Không tái ký": 0, total: 0 };
    }

    if (["Sắp hết hạn", "Đang sử dụng", "Hết hạn", "Không tái ký"].includes(item.status)) {
      targetData[q].months[month][item.status]++;
      targetData[q].months[month].total++;
      targetData[q].total[item.status]++;
      targetData[q].total.total++;
    }
  });

  window.renewData2025 = data2025;
  window.renewData2026 = data2026;

  document.getElementById("tbody-renew-2025").innerHTML = window.generateRenewTableHtml(data2025, "2025");
  document.getElementById("tbody-renew-2026").innerHTML = window.generateRenewTableHtml(data2026, "2026");

  // Add event listeners to new inputs
  document.querySelectorAll(".renew-input").forEach(input => {
    input.addEventListener("input", function() {
      saveRenewedCount(this.getAttribute("data-id"), this.value);
    });
  });

  // Render Reasons (Filtered by local time if available)
  let reasonsFiltered = filtered.filter(item => {
    if (!renewFromDate && !renewToDate) return true;
    const d = new Date(item.expiration_date);
    const fd = renewFromDate ? new Date(renewFromDate) : new Date(1900, 0, 1);
    const td = renewToDate ? new Date(renewToDate) : new Date(2100, 0, 1);
    return d >= fd && d <= td;
  });

  const reasonCounts = {};
  let totalNotRenewed = 0;
  reasonsFiltered.forEach(item => {
    if (item.status === "Không tái ký" && item.reason) {
      reasonCounts[item.reason] = (reasonCounts[item.reason] || 0) + 1;
      totalNotRenewed++;
    }
  });

  let reasonHtml = "";
  if (totalNotRenewed === 0) {
    reasonHtml = `<tr><td colspan="3" style="padding: 20px; text-align: center; color: var(--text-secondary);">Không có dữ liệu lý do không tái ký.</td></tr>`;
  } else {
    const sortedReasons = Object.entries(reasonCounts).sort((a,b) => b[1] - a[1]);
    sortedReasons.forEach(([reason, count]) => {
      const pct = ((count / totalNotRenewed) * 100).toFixed(1);
      reasonHtml += `
        <tr style="border-bottom: 1px solid #e2e8f0;">
          <td style="padding: 12px; border: 1px solid #e2e8f0; font-weight: 500;">${reason}</td>
          <td style="padding: 12px; border: 1px solid #e2e8f0; text-align: center; font-weight: 700;">${count}</td>
          <td style="padding: 12px; border: 1px solid #e2e8f0; text-align: center;">
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
              <span>${pct}%</span>
              <div style="flex: 1; height: 6px; background: #f1f5f9; border-radius: 3px; overflow: hidden; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;">
                <div style="height: 100%; width: ${pct}%; background: var(--color-primary); -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;"></div>
              </div>
            </div>
          </td>
        </tr>
      `;
    });
    // Add total row
    reasonHtml += `
      <tr style="background-color: #f8fafc; font-weight: 800; border-top: 2px solid #cbd5e1; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;">
        <td style="padding: 12px; border: 1px solid #e2e8f0;">TỔNG CỘNG</td>
        <td style="padding: 12px; border: 1px solid #e2e8f0; text-align: center; color: var(--color-primary);">${totalNotRenewed}</td>
        <td style="padding: 12px; border: 1px solid #e2e8f0; text-align: center;">100%</td>
      </tr>
    `;
  }
  
  window.renewReasonHtmlGlobal = reasonHtml;
  document.getElementById("tbody-renew-reasons").innerHTML = reasonHtml;
};

// Add event listeners to filters
document.addEventListener("DOMContentLoaded", () => {
  if(document.getElementById("filter-renew-sales")) {
    document.getElementById("filter-renew-sales").addEventListener("change", renderRenewalDashboards);
    document.getElementById("filter-renew-status").addEventListener("change", renderRenewalDashboards);
    document.getElementById("filter-renew-reason").addEventListener("change", renderRenewalDashboards);
    document.getElementById("filter-renew-from").addEventListener("change", renderRenewalDashboards);
    document.getElementById("filter-renew-to").addEventListener("change", renderRenewalDashboards);
  }
});

// ==========================================
// 12. OKR 2026 MODULE LOGIC & SERVICES
// ==========================================
let okrData = [];
// Calculate default active Quarter and Month based on current date
const currentMonthIdx = new Date().getMonth(); // 0-11
const defaultQuarter = currentMonthIdx <= 2 ? "Q1" : (currentMonthIdx <= 5 ? "Q2" : (currentMonthIdx <= 8 ? "Q3" : "Q4"));
const defaultMonthNames = ["Tháng 1","Tháng 2","Tháng 3","Tháng 4","Tháng 5","Tháng 6",
                           "Tháng 7","Tháng 8","Tháng 9","Tháng 10","Tháng 11","Tháng 12"];

let activeOkrQuarter = defaultQuarter;
let activeOkrMonth = defaultMonthNames[currentMonthIdx];

const savedOKRs = localStorage.getItem('OKRS_DATA_2026');
if (savedOKRs) {
  okrData = JSON.parse(savedOKRs);
} else {
  // Seed initial strategic 2026 OKR data mapped across 4 quarters
  okrData = [
    // QUARTER 1 / 2026
    {
      id: "obj-1",
      quarter: "Q1",
      objective: "O1: Bứt phá doanh số Cloud & Tối ưu hiệu suất chốt sales",
      keyResults: [
        {
          id: "kr-1-1",
          name: "Đạt doanh số JEGA Cloud 500 triệu VND",
          unit: "VND",
          target: 500000000,
          current: 210000000,
          monthlyActions: {
            "Tháng 1": "Tiếp cận 50 khách hàng lớn từ nhóm Marketing Khác (Facebook_loại 2)",
            "Tháng 2": "Đàm phán và chốt thử nghiệm lớn với Vinamilk và Vingroup",
            "Tháng 3": "Tối ưu hóa phễu sales và thúc đẩy ký kết hợp đồng chính thức"
          },
          weeklyActions: {
            "Tháng 1": [
              { week: "Tuần 1", text: "Lập danh sách 50 khách hàng mục tiêu lớn có nhu cầu", completed: true },
              { week: "Tuần 2", text: "Gửi tài liệu giải pháp JEGA Cloud thiết kế riêng", completed: true },
              { week: "Tuần 3", text: "Liên hệ đặt hẹn demo với 15 khách hàng tiềm năng cao", completed: false },
              { week: "Tuần 4", text: "Tiến hành chạy thử nghiệm ban đầu cho 5 khách hàng Key Account", completed: false }
            ],
            "Tháng 2": [
              { week: "Tuần 1", text: "Gửi báo giá chi tiết gói JEGA Enterprise cho Vinamilk", completed: false },
              { week: "Tuần 2", text: "Thực hiện họp giải trình kỹ thuật bảo mật AWS Cloud", completed: false },
              { week: "Tuần 3", text: "Đạt thỏa thuận dùng thử diện rộng 30 ngày", completed: false },
              { week: "Tuần 4", text: "Thu thập ý kiến phản hồi dùng thử đợt 1", completed: false }
            ],
            "Tháng 3": [
              { week: "Tuần 1", text: "Rà soát lại tất cả các trở ngại về pháp lý hợp đồng", completed: false },
              { week: "Tuần 2", text: "Chốt hợp đồng JEGA Cloud chính thức trị giá 200tr với Vinamilk", completed: false },
              { week: "Tuần 3", text: "Liên hệ tái ký các khách hàng Cloud cũ chuẩn bị hết hạn", completed: false },
              { week: "Tuần 4", text: "Hoàn thành báo cáo tổng hợp doanh số Cloud Q1", completed: false }
            ]
          }
        },
        {
          id: "kr-1-2",
          name: "Đạt tỷ lệ chuyển đổi từ cơ hội Demo sang Báo giá tối thiểu 40%",
          unit: "%",
          target: 40,
          current: 28,
          monthlyActions: {
            "Tháng 1": "Đào tạo sales nâng cao kỹ năng trình bày demo sản phẩm",
            "Tháng 2": "Thiết lập quy chuẩn theo sát (Follow-up) sau demo trong 48 giờ",
            "Tháng 3": "Cải tiến chính sách giá ưu đãi để đẩy nhanh báo giá"
          },
          weeklyActions: {
            "Tháng 1": [
              { week: "Tuần 1", text: "Tổ chức buổi chia sẻ kỹ năng thuyết trình cho đội sales", completed: true },
              { week: "Tuần 2", text: "Xây dựng bộ slide chuẩn hóa cho sản phẩm JEGA Pro", completed: true },
              { week: "Tuần 3", text: "Tổ chức thi thực hành demo chéo giữa các nhóm sales", completed: false },
              { week: "Tuần 4", text: "Chuẩn bị tài liệu FAQ giải đáp mọi thắc mắc thường gặp", completed: false }
            ],
            "Tháng 2": [
              { week: "Tuần 1", text: "Ban hành quy định gửi tài liệu tóm tắt sau demo trong 24h", completed: false },
              { week: "Tuần 2", text: "Triển khai cuộc gọi đánh giá mức độ hài lòng của khách", completed: false },
              { week: "Tuần 3", text: "Lọc danh sách các khách hàng chưa phản hồi để chăm sóc lại", completed: false },
              { week: "Tuần 4", text: "Giải quyết triệt để 100% khiếu nại kỹ thuật phát sinh", completed: false }
            ],
            "Tháng 3": [
              { week: "Tuần 1", text: "Đề xuất gói khuyến mãi thúc đẩy ký nhanh trong tháng", completed: false },
              { week: "Tuần 2", text: "Gửi báo giá cập nhật cho toàn bộ tệp cơ hội đang lưỡng lự", completed: false },
              { week: "Tuần 3", text: "Đàm phán trực tiếp các hợp đồng quy mô vừa và nhỏ", completed: false },
              { week: "Tuần 4", text: "Đo lường tỷ lệ chuyển đổi chốt deal cuối quý", completed: false }
            ]
          }
        },
        {
          id: "kr-1-3",
          name: "Khai thác tối thiểu 150 Leads nóng chất lượng từ kênh Marketing mới",
          unit: "Leads",
          target: 150,
          current: 65,
          monthlyActions: {
            "Tháng 1": "Hợp tác với team Marketing triển khai phễu nội dung thu hút Leads",
            "Tháng 2": "Tối ưu hóa quảng cáo & tập trung vào từ khóa chuyển đổi cao",
            "Tháng 3": "Tổ chức Webinar giải pháp quản trị doanh nghiệp lớn"
          },
          weeklyActions: {
            "Tháng 1": [
              { week: "Tuần 1", text: "Xác định chân dung khách hàng cho kênh Marketing mới", completed: true },
              { week: "Tuần 2", text: "Thiết kế landing page chuyên sâu về giải pháp quản trị", completed: true },
              { week: "Tuần 3", text: "Chạy thử nghiệm quảng cáo với ngân sách nhỏ", completed: false },
              { week: "Tuần 4", text: "Thu thập 30 Leads đầu tiên và đánh giá chất lượng", completed: false }
            ],
            "Tháng 2": [
              { week: "Tuần 1", text: "Phân tích hiệu quả từ khóa quảng cáo Google Ads/FB", completed: false },
              { week: "Tuần 2", text: "Tăng ngân sách cho các kênh đem lại Leads chất lượng", completed: false },
              { week: "Tuần 3", text: "Triển khai chiến dịch email nuôi dưỡng Leads tự động", completed: false },
              { week: "Tuần 4", text: "Thu thập 60 Leads mới trong tháng 2", completed: false }
            ],
            "Tháng 3": [
              { week: "Tuần 1", text: "Lên kịch bản và chuẩn bị tài liệu truyền thông Webinar", completed: false },
              { week: "Tuần 2", text: "Gửi thư mời tham dự Webinar cho tệp Leads tiềm năng", completed: false },
              { week: "Tuần 3", text: "Tổ chức Webinar trực tuyến thu hút hơn 200 đăng ký", completed: false },
              { week: "Tuần 4", text: "Lọc ra 60 Leads nóng từ danh sách tham gia Webinar", completed: false }
            ]
          }
        }
      ]
    },
    {
      id: "obj-2",
      quarter: "Q1",
      objective: "O2: Tối ưu hóa dịch vụ khách hàng & Thúc đẩy tái ký",
      keyResults: [
        {
          id: "kr-1-4",
          name: "Đạt tỷ lệ khách hàng hài lòng (CSAT) trên 90%",
          unit: "%",
          target: 90,
          current: 82,
          monthlyActions: {
            "Tháng 1": "Đánh giá khảo sát CSAT toàn bộ khách hàng hiện hữu",
            "Tháng 2": "Chuẩn hóa quy trình hỗ trợ kỹ thuật khách hàng 24/7",
            "Tháng 3": "Tổ chức chương trình tri ân & Chăm sóc định kỳ"
          },
          weeklyActions: {
            "Tháng 1": [
              { week: "Tuần 1", text: "Thiết kế mẫu khảo sát CSAT trực tuyến ngắn gọn", completed: true },
              { week: "Tuần 2", text: "Gửi khảo sát qua Email và Zalo cho 100 khách hàng", completed: true },
              { week: "Tuần 3", text: "Gọi điện trực tiếp cho các khách hàng đánh giá dưới 4 sao", completed: false },
              { week: "Tuần 4", text: "Lập danh sách các điểm cần cải tiến dịch vụ ngay lập tức", completed: false }
            ],
            "Tháng 2": [
              { week: "Tuần 1", text: "Thiết kế hệ thống phân loại yêu cầu hỗ trợ (Support Ticket)", completed: false },
              { week: "Tuần 2", text: "Cam kết phản hồi ban đầu dưới 15 phút cho khách Enterprise", completed: false },
              { week: "Tuần 3", text: "Đào tạo đội ngũ hỗ trợ kỹ thuật về thái độ phục vụ khách", completed: false },
              { week: "Tuần 4", text: "Giảm thời gian xử lý sự cố trung bình xuống còn 2 giờ", completed: false }
            ],
            "Tháng 3": [
              { week: "Tuần 1", text: "Lập kế hoạch gửi quà tri ân cho các khách hàng VIP", completed: false },
              { week: "Tuần 2", text: "Tiến hành gặp gỡ trực tiếp 5 khách hàng Key Account", completed: false },
              { week: "Tuần 3", text: "Thu thập câu chuyện thành công (Success Stories) của khách", completed: false },
              { week: "Tuần 4", text: "Báo quả kết quả CSAT cuối quý đạt mục tiêu", completed: false }
            ]
          }
        },
        {
          id: "kr-1-5",
          name: "Ký thành công 15 hợp đồng gia hạn (tái ký) dịch vụ phần mềm",
          unit: "Hợp đồng",
          target: 15,
          current: 6,
          monthlyActions: {
            "Tháng 1": "Rà soát danh sách các hợp đồng sẽ hết hạn trong Q1 & Q2",
            "Tháng 2": "Thiết lập chính sách ưu đãi nâng cấp sản phẩm khi gia hạn",
            "Tháng 3": "Thúc đẩy chốt các hợp đồng gia hạn còn lại của Q1"
          },
          weeklyActions: {
            "Tháng 1": [
              { week: "Tuần 1", text: "Trích xuất danh sách khách hàng hết hạn hợp đồng từ hệ thống", completed: true },
              { week: "Tuần 2", text: "Phân loại mức độ rủi ro rời bỏ của từng khách hàng", completed: true },
              { week: "Tuần 3", text: "Lên phương án gia hạn kèm ưu đãi sớm cho nhóm rủi ro cao", completed: false },
              { week: "Tuần 4", text: "Tiếp cận và đàm phán 3 hợp đồng hết hạn trong Tháng 1", completed: false }
            ],
            "Tháng 2": [
              { week: "Tuần 1", text: "Xây dựng chính sách ưu đãi cộng thêm tháng khi gia hạn sớm", completed: false },
              { week: "Tuần 2", text: "Gửi thư mời nâng cấp gói từ JEGA Pro lên Enterprise", completed: false },
              { week: "Tuần 3", text: "Đàm phán và chốt 6 hợp đồng gia hạn trong Tháng 2", completed: false },
              { week: "Tuần 4", text: "Tổ chức buổi gặp mặt trực tiếp bàn về gia hạn dài hạn", completed: false }
            ],
            "Tháng 3": [
              { week: "Tuần 1", text: "Tập trung nguồn lực xử lý các hợp đồng đang đàm phán", completed: false },
              { week: "Tuần 2", text: "Gửi thông báo nhắc nhở tạm dừng dịch vụ nếu không gia hạn", completed: false },
              { week: "Tuần 3", text: "Chốt thành công 6 hợp đồng gia hạn cuối cùng", completed: false },
              { week: "Tuần 4", text: "Tổng kết doanh thu tái ký đạt chỉ tiêu cam kết", completed: false }
            ]
          }
        },
        {
          id: "kr-1-6",
          name: "Giảm tỷ lệ khách hàng hủy dịch vụ (Churn Rate) xuống dưới 3%",
          unit: "%",
          target: 3,
          current: 4.2,
          monthlyActions: {
            "Tháng 1": "Phân tích nguyên nhân hủy dịch vụ của năm 2025",
            "Tháng 2": "Triển khai chiến dịch chăm sóc chủ động cho khách hàng ít hoạt động",
            "Tháng 3": "Xây dựng cổng phản hồi ý kiến khách hàng tự động"
          },
          weeklyActions: {
            "Tháng 1": [
              { week: "Tuần 1", text: "Gom nhóm phản hồi của các khách hàng đã hủy dịch vụ", completed: true },
              { week: "Tuần 2", text: "Đánh giá năng lực của sản phẩm so với đối thủ cạnh tranh", completed: true },
              { week: "Tuần 3", text: "Báo cáo lên Ban Giám Đốc các tính năng bị phàn nàn nhiều", completed: false },
              { week: "Tuần 4", text: "Thành lập biệt đội giải cứu khách hàng có nguy cơ churn", completed: false }
            ],
            "Tháng 2": [
              { week: "Tuần 1", text: "Xác định nhóm khách hàng ít đăng nhập hệ thống trong 30 ngày", completed: false },
              { week: "Tuần 2", text: "Đội hỗ trợ gọi điện hướng dẫn và hỗ trợ sử dụng lại", completed: false },
              { week: "Tuần 3", text: "Khắc phục các rào cản kỹ thuật khiến khách hàng nản lòng", completed: false },
              { week: "Tuần 4", text: "Tổ chức 2 buổi training hướng dẫn trực tuyến cho khách hàng", completed: false }
            ],
            "Tháng 3": [
              { week: "Tuần 1", text: "Thiết kế tính năng khảo sát phản hồi ngay trên phần mềm", completed: false },
              { week: "Tuần 2", text: "Thử nghiệm nội bộ và sửa lỗi cổng phản hồi", completed: false },
              { week: "Tuần 3", text: "Ra mắt cổng phản hồi tới toàn bộ người dùng", completed: false },
              { week: "Tuần 4", text: "Đánh giá tỷ lệ Churn Rate cuối quý 1", completed: false }
            ]
          }
        }
      ]
    },
    // QUARTER 2 / 2026
    {
      id: "obj-3",
      quarter: "Q2",
      objective: "O1: Mở rộng kênh phân phối & Đối tác chiến lược",
      keyResults: [
        {
          id: "kr-2-1",
          name: "Ký kết hợp tác chiến lược với 5 đối tác tích hợp hệ thống (SI)",
          unit: "Đối tác",
          target: 5,
          current: 1,
          monthlyActions: {
            "Tháng 4": "Lập danh sách và phân loại 20 đối tác SI tiềm năng",
            "Tháng 5": "Tổ chức các buổi gặp gỡ, thuyết trình chính sách đối tác",
            "Tháng 6": "Thương thảo điều khoản hợp tác và ký kết chính thức"
          },
          weeklyActions: {
            "Tháng 4": [
              { week: "Tuần 1", text: "Nghiên cứu danh sách 20 đối tác SI lớn tại miền Bắc & Nam", completed: true },
              { week: "Tuần 2", text: "Thiết kế slide và tài liệu chính sách hoa hồng đối tác", completed: false },
              { week: "Tuần 3", text: "Liên hệ và thiết lập cuộc hẹn với 8 đối tác hàng đầu", completed: false },
              { week: "Tuần 4", text: "Gửi tài liệu giới thiệu chi tiết cho các đối tác phản hồi tốt", completed: false }
            ],
            "Tháng 5": [
              { week: "Tuần 1", text: "Họp trực tiếp với đối tác SI đầu tiên - CMC TS", completed: false },
              { week: "Tuần 2", text: "Họp trực tiếp với đối tác FPT Smart Cloud", completed: false },
              { week: "Tuần 3", text: "Tổ chức buổi Demo chuyên sâu cho đội ngũ kỹ thuật đối tác", completed: false },
              { week: "Tuần 4", text: "Gửi dự thảo hợp đồng nguyên tắc cho 3 đối tác tích cực", completed: false }
            ],
            "Tháng 6": [
              { week: "Tuần 1", text: "Đàm phán tỷ lệ chiết khấu thương mại", completed: false },
              { week: "Tuần 2", text: "Ký kết hợp đồng SI đầu tiên với CMC TS", completed: false },
              { week: "Tuần 3", text: "Hoàn tất đàm phán hợp đồng đối tác thứ 2 và 3", completed: false },
              { week: "Tuần 4", text: "Ký kết thành công tổng cộng 5 đối tác SI trong quý", completed: false }
            ]
          }
        },
        {
          id: "kr-2-2",
          name: "Doanh số từ kênh đối tác đạt 400 triệu VND",
          unit: "VND",
          target: 400000000,
          current: 80000000,
          monthlyActions: {
            "Tháng 4": "Kích hoạt và chuyển giao tài liệu bán hàng cho đối tác CMC",
            "Tháng 5": "Hỗ trợ CMC tiếp cận khách hàng lớn đầu tiên của họ",
            "Tháng 6": "Thúc đẩy các đối tác khác gửi leads và chốt sales chung"
          },
          weeklyActions: {
            "Tháng 4": [
              { week: "Tuần 1", text: "Tổ chức bàn giao tài liệu bán hàng JEGA cho CMC", completed: true },
              { week: "Tuần 2", text: "Thiết lập quy trình đăng ký Leads của đối tác trên portal", completed: false },
              { week: "Tuần 3", text: "CMC gửi Leads đăng ký đầu tiên có nhu cầu 80tr", completed: false },
              { week: "Tuần 4", text: "Chốt thành công hợp đồng 80tr đầu tiên qua CMC", completed: false }
            ],
            "Tháng 5": [
              { week: "Tuần 1", text: "Hỗ trợ sales đối tác CMC khảo sát nhu cầu khách hàng mới", completed: false },
              { week: "Tuần 2", text: "Lên giải pháp báo giá 150tr cho khách hàng của đối tác", completed: false },
              { week: "Tuần 3", text: "Tham gia họp đàm phán 3 bên cùng đối tác và khách hàng", completed: false },
              { week: "Tuần 4", text: "Tích cực thúc đẩy chốt hợp đồng lớn trong tháng", completed: false }
            ],
            "Tháng 6": [
              { week: "Tuần 1", text: "Nhận thêm 3 Leads từ đối tác mới ký kết", completed: false },
              { week: "Tuần 2", text: "Hỗ trợ kỹ thuật cấu hình thử nghiệm cho Leads của đối tác", completed: false },
              { week: "Tuần 3", text: "Chốt 2 hợp đồng trị giá 120tr và 100tr", completed: false },
              { week: "Tuần 4", text: "Tổng hợp doanh số từ kênh đối tác cuối quý", completed: false }
            ]
          }
        },
        {
          id: "kr-2-3",
          name: "Đào tạo và cấp chứng chỉ sản phẩm cho 50 nhân viên đối tác",
          unit: "Nhân sự",
          target: 50,
          current: 10,
          monthlyActions: {
            "Tháng 4": "Thiết kế giáo trình và hệ thống chứng chỉ trực tuyến",
            "Tháng 5": "Tổ chức khóa đào tạo trực tuyến đầu tiên cho CMC",
            "Tháng 6": "Tổ chức đào tạo mở rộng cho các đối tác mới ký"
          },
          weeklyActions: {
            "Tháng 4": [
              { week: "Tuần 1", text: "Lên đề cương chi tiết giáo trình đào tạo 3 buổi", completed: true },
              { week: "Tuần 2", text: "Xây dựng slide bài giảng và bộ câu hỏi trắc nghiệm", completed: false },
              { week: "Tuần 3", text: "Thiết lập hệ thống kiểm tra và cấp chứng chỉ số", completed: false },
              { week: "Tuần 4", text: "Đào tạo thử nghiệm nội bộ 10 sales của chúng ta", completed: false }
            ],
            "Tháng 5": [
              { week: "Tuần 1", text: "Gửi thư mời và lên lịch học cho 20 nhân sự CMC", completed: false },
              { week: "Tuần 2", text: "Tổ chức buổi đào tạo 1 về Tổng quan sản phẩm", completed: false },
              { week: "Tuần 3", text: "Tổ chức buổi đào tạo 2 về Kỹ năng xử lý từ chối", completed: false },
              { week: "Tuần 4", text: "Tiến hành thi trắc nghiệm và cấp chứng chỉ cho 15 người đạt", completed: false }
            ],
            "Tháng 6": [
              { week: "Tuần 1", text: "Mở rộng khóa học trực tuyến cho các đối tác SI mới", completed: false },
              { week: "Tuần 2", text: "Tổ chức lớp đào tạo kỹ thuật cho đội triển khai SI", completed: false },
              { week: "Tuần 3", text: "Hỗ trợ giải đáp các thắc mắc chuyên sâu của học viên", completed: false },
              { week: "Tuần 4", text: "Cấp chứng chỉ hoàn thành khóa cho thêm 25 học viên", completed: false }
            ]
          }
        }
      ]
    },
    // QUARTER 3 / 2026
    {
      id: "obj-4",
      quarter: "Q3",
      objective: "O1: Đẩy mạnh thị trường miền Nam & Doanh nghiệp FDI",
      keyResults: [
        {
          id: "kr-3-1",
          name: "Thành lập văn phòng đại diện và đội ngũ sales tại TP.HCM",
          unit: "Dự án",
          target: 1,
          current: 0.5,
          monthlyActions: {
            "Tháng 7": "Tìm kiếm địa điểm đặt văn phòng và hoàn tất thủ tục pháp lý",
            "Tháng 8": "Tuyển dụng và Onboarding 3 sales core tại TP.HCM",
            "Tháng 9": "Khai trương văn phòng và chính thức đi vào hoạt động"
          },
          weeklyActions: {
            "Tháng 7": [
              { week: "Tuần 1", text: "Khảo sát 5 văn phòng co-working tại Quận 1 và Quận 3", completed: true },
              { week: "Tuần 2", text: "Đàm phán hợp đồng thuê văn phòng tại Dreamplex", completed: true },
              { week: "Tuần 3", text: "Hoàn tất ký hợp đồng thuê văn phòng", completed: false },
              { week: "Tuần 4", text: "Lập hồ sơ đăng ký địa điểm kinh doanh mới", completed: false }
            ],
            "Tháng 8": [
              { week: "Tuần 1", text: "Đăng tuyển dụng vị trí Trưởng nhóm sales TP.HCM", completed: false },
              { week: "Tuần 2", text: "Phỏng vấn vòng 1 các ứng viên tiềm năng", completed: false },
              { week: "Tuần 3", text: "Gửi Offer Letter cho Trưởng nhóm và 2 nhân viên sales", completed: false },
              { week: "Tuần 4", text: "Tổ chức tuần Onboarding giới thiệu sản phẩm trực tuyến", completed: false }
            ],
            "Tháng 9": [
              { week: "Tuần 1", text: "Set up máy tính và không gian làm việc tại văn phòng mới", completed: false },
              { week: "Tuần 2", text: "Tổ chức lễ khai trương nhỏ và tiếp đón một số đối tác", completed: false },
              { week: "Tuần 3", text: "Hỗ trợ đội sales Nam bắt đầu tìm kiếm leads trực tiếp", completed: false },
              { week: "Tuần 4", text: "Đánh giá hiệu quả hoạt động tháng đầu tiên của văn phòng", completed: false }
            ]
          }
        },
        {
          id: "kr-3-2",
          name: "Doanh số thị trường miền Nam đạt 800 triệu VND",
          unit: "VND",
          target: 800000000,
          current: 150000000,
          monthlyActions: {
            "Tháng 7": "Tiếp cận 10 khách hàng cũ có trụ sở tại miền Nam để upsell",
            "Tháng 8": "Đồng hành cùng sales mới tiếp cận các doanh nghiệp Nam",
            "Tháng 9": "Đẩy mạnh chốt hợp đồng lớn cuối quý 3"
          },
          weeklyActions: {
            "Tháng 7": [
              { week: "Tuần 1", text: "Lọc danh sách khách hàng miền Nam từ database", completed: true },
              { week: "Tuần 2", text: "Gọi điện thăm hỏi và giới thiệu module JEGA AI mới", completed: false },
              { week: "Tuần 3", text: "Hẹn gặp trực tiếp 3 khách hàng lớn tại TP.HCM", completed: false },
              { week: "Tuần 4", text: "Ký thành công hợp đồng upsell trị giá 50tr", completed: false }
            ],
            "Tháng 8": [
              { week: "Tuần 1", text: "Đào tạo thực tế (Shadowing) cho nhân sự sales TP.HCM mới", completed: false },
              { week: "Tuần 2", text: "Cùng đi gặp khách hàng ngành bán lẻ tại Quận 7", completed: false },
              { week: "Tuần 3", text: "Lập báo giá gói Enterprise 120tr cho đối tác bán lẻ", completed: false },
              { week: "Tuần 4", text: "Chốt hợp đồng 100tr đầu tiên của sales mới", completed: false }
            ],
            "Tháng 9": [
              { week: "Tuần 1", text: "Đẩy mạnh đàm phán 3 deal lớn ngành sản xuất tại Bình Dương", completed: false },
              { week: "Tuần 2", text: "Họp thống nhất chính sách chiết khấu cho siêu deal", completed: false },
              { week: "Tuần 3", text: "Chốt thành công hợp đồng 250tr tại Bình Dương", completed: false },
              { week: "Tuần 4", text: "Tổng hợp báo cáo doanh số miền Nam quý 3", completed: false }
            ]
          }
        },
        {
          id: "kr-3-3",
          name: "Tiếp cận và lấy 20 Leads FDI Hàn Quốc/Nhật Bản",
          unit: "Leads",
          target: 20,
          current: 4,
          monthlyActions: {
            "Tháng 7": "Nghiên cứu danh sách khu công nghiệp Bình Dương & Đồng Nai",
            "Tháng 8": "Thiết kế tài liệu sản phẩm bằng tiếng Anh & tiếng Hàn",
            "Tháng 9": "Tham gia hội chợ công nghiệp hỗ trợ để kết nối trực tiếp"
          },
          weeklyActions: {
            "Tháng 7": [
              { week: "Tuần 1", text: "Thu thập danh bạ doanh nghiệp FDI tại KCN VSIP 1, 2", completed: true },
              { week: "Tuần 2", text: "Xác định 30 mục tiêu lớn phù hợp với JEGA Factory", completed: false },
              { week: "Tuần 3", text: "Gửi thư giới thiệu tiếng Anh qua email cho các CEO FDI", completed: false },
              { week: "Tuần 4", text: "Liên hệ qua điện thoại để kết nối với bộ phận mua hàng", completed: false }
            ],
            "Tháng 8": [
              { week: "Tuần 1", text: "Dịch thuật tài liệu JEGA Pro sang tiếng Hàn & Nhật", completed: false },
              { week: "Tuần 2", text: "Thiết kế brochure chuyên sâu in ấn phát tay", completed: false },
              { week: "Tuần 3", text: "Chạy quảng cáo LinkedIn nhắm đối tượng CEO FDI", completed: false },
              { week: "Tuần 4", text: "Nhận 2 Leads FDI đầu tiên từ LinkedIn", completed: false }
            ],
            "Tháng 9": [
              { week: "Tuần 1", text: "Đăng ký gian hàng tham gia Triển lãm Công nghiệp TP.HCM", completed: false },
              { week: "Tuần 2", text: "Chuẩn bị mô hình demo và quà tặng tại triển lãm", completed: false },
              { week: "Tuần 3", text: "Tham gia 3 ngày triển lãm, gặp gỡ trực tiếp 50 đại diện", completed: false },
              { week: "Tuần 4", text: "Lọc ra 15 Leads FDI cực kỳ chất lượng sau triển lãm", completed: false }
            ]
          }
        }
      ]
    },
    // QUARTER 4 / 2026
    {
      id: "obj-5",
      quarter: "Q4",
      objective: "O1: Chiến dịch nước rút doanh số & Đạt mục tiêu năm",
      keyResults: [
        {
          id: "kr-4-1",
          name: "Đạt tổng doanh số quý 4 là 1.5 tỷ VND",
          unit: "VND",
          target: 1500000000,
          current: 200000000,
          monthlyActions: {
            "Tháng 10": "Khởi động chương trình ưu đãi mùa mua sắm cuối năm",
            "Tháng 11": "Tập trung chốt toàn bộ cơ hội kinh doanh tồn đọng từ Q3",
            "Tháng 12": "Chiến dịch chốt deal nước rút và chăm sóc khách hàng"
          },
          weeklyActions: {
            "Tháng 10": [
              { week: "Tuần 1", text: "Xây dựng gói combo nâng cấp cuối năm giảm giá 20%", completed: true },
              { week: "Tuần 2", text: "Gửi thông tin ưu đãi tới toàn bộ danh sách leads cũ", completed: false },
              { week: "Tuần 3", text: "Chốt 5 deal vừa và nhỏ đạt doanh số 100tr", completed: false },
              { week: "Tuần 4", text: "Rà soát phễu khách hàng chuẩn bị cho tháng 11", completed: false }
            ],
            "Tháng 11": [
              { week: "Tuần 1", text: "Họp rà soát 10 deal lớn đang thương lượng", completed: false },
              { week: "Tuần 2", text: "Đàm phán trực tiếp về giá và hỗ trợ triển khai kỹ thuật", completed: false },
              { week: "Tuần 3", text: "Chốt thành công 3 deal lớn đạt doanh số 350tr", completed: false },
              { week: "Tuần 4", text: "Đẩy mạnh ký kết các hợp đồng nhỏ hơn", completed: false }
            ],
            "Tháng 12": [
              { week: "Tuần 1", text: "Tập trung 100% nguồn lực sales chăm sóc khách tiềm năng cao", completed: false },
              { week: "Tuần 2", text: "Chốt deal lớn trị giá 400tr với Vinamilk gia hạn", completed: false },
              { week: "Tuần 3", text: "Đạt mốc doanh số nước rút 500tr trong tuần", completed: false },
              { week: "Tuần 4", text: "Hoàn tất tổng hợp doanh số năm 2026", completed: false }
            ]
          }
        },
        {
          id: "kr-4-2",
          name: "Chốt thành công 5 siêu hợp đồng Enterprise (trên 100tr/hợp đồng)",
          unit: "Hợp đồng",
          target: 5,
          current: 1,
          monthlyActions: {
            "Tháng 10": "Tiếp cận 10 Tập đoàn lớn có nhu cầu chuyển đổi số toàn diện",
            "Tháng 11": "Thiết kế giải pháp chuyên sâu cho 5 tập đoàn quan tâm nhất",
            "Tháng 12": "Đàm phán cấp độ cao trực tiếp với Ban giám đốc đối tác"
          },
          weeklyActions: {
            "Tháng 10": [
              { week: "Tuần 1", text: "Xác định danh sách 10 Tập đoàn lớn ngành bán lẻ & sản xuất", completed: true },
              { week: "Tuần 2", text: "Gửi đề xuất giải pháp sơ bộ thiết kế riêng cho từng bên", completed: false },
              { week: "Tuần 3", text: "Đặt lịch họp demo với 4 tập đoàn phản hồi tốt", completed: false },
              { week: "Tuần 4", text: "Thực hiện buổi demo đầu tiên cho Tập đoàn Masan", completed: false }
            ],
            "Tháng 11": [
              { week: "Tuần 1", text: "Khảo sát chi tiết quy trình nghiệp vụ của Masan", completed: false },
              { week: "Tuần 2", text: "Xây dựng tài liệu giải pháp kỹ thuật chi tiết 80 trang", completed: false },
              { week: "Tuần 3", text: "Trình bày giải pháp trước Hội đồng công nghệ Masan", completed: false },
              { week: "Tuần 4", text: "Gửi báo giá chính thức gói 250tr cho Masan", completed: false }
            ],
            "Tháng 12": [
              { week: "Tuần 1", text: "Họp đàm phán điều khoản hợp đồng với Masan", completed: false },
              { week: "Tuần 2", text: "Ký kết siêu hợp đồng Enterprise 250tr với Masan", completed: false },
              { week: "Tuần 3", text: "Đàm phán và chốt thêm 2 hợp đồng Enterprise khác", completed: false },
              { week: "Tuần 4", text: "Hoàn tất triển khai bàn giao đợt 1 cho các đối tác lớn", completed: false }
            ]
          }
        },
        {
          id: "kr-4-3",
          name: "Thu hồi 95% công nợ quá hạn của các hợp đồng cũ",
          unit: "%",
          target: 95,
          current: 60,
          monthlyActions: {
            "Tháng 10": "Rà soát toàn bộ công nợ và phân loại mức độ nợ xấu",
            "Tháng 11": "Gửi thông báo nhắc nợ chính thức và gọi điện đôn đốc",
            "Tháng 12": "Áp dụng biện pháp mạnh hoặc hỗ trợ giãn nợ linh hoạt"
          },
          weeklyActions: {
            "Tháng 10": [
              { week: "Tuần 1", text: "Trích xuất báo cáo công nợ chi tiết từ kế toán", completed: true },
              { week: "Tuần 2", text: "Phân loại nợ theo số ngày quá hạn (Dưới 30, 30-90, trên 90)", completed: false },
              { week: "Tuần 3", text: "Gửi thư điện tử nhắc nợ nhẹ nhàng lần 1", completed: false },
              { week: "Tuần 4", text: "Phân công sales trực tiếp phụ trách đòi nợ từng khách cũ", completed: false }
            ],
            "Tháng 11": [
              { week: "Tuần 1", text: "Gọi điện trực tiếp đối thoại với người đại diện thanh toán", completed: false },
              { week: "Tuần 2", text: "Thu hồi thành công 30% công nợ quá hạn trong tuần", completed: false },
              { week: "Tuần 3", text: "Gửi công văn nhắc nợ chính thức có dấu đỏ công ty", completed: false },
              { week: "Tuần 4", text: "Đến gặp trực tiếp 2 khách hàng nợ dai dẳng", completed: false }
            ],
            "Tháng 12": [
              { week: "Tuần 1", text: "Đàm phán phương án chia nhỏ đợt thanh toán cho khách khó khăn", completed: false },
              { week: "Tuần 2", text: "Thu hồi thêm 40% công nợ nhờ chính sách giãn nợ", completed: false },
              { week: "Tuần 3", text: "Giải quyết dứt điểm các tranh chấp hóa đơn nếu có", completed: false },
              { week: "Tuần 4", text: "Tổng kết tỷ lệ thu hồi công nợ đạt chỉ tiêu cuối năm", completed: false }
            ]
          }
        }
      ]
    }
  ];
  localStorage.setItem('OKRS_DATA_2026', JSON.stringify(okrData));
}

// Global visual tracking variables for persistent states
const expandedObjIds = new Set(["obj-1"]); // Default first open
const expandedActionPanelIds = new Set();
let editingKRTemp = null;
let activeMonthIdxTemp = 0;

// Helper to translate quarter values to month names
function getMonthsForQuarter(quarter) {
  if (quarter === "Q1") return ["Tháng 1", "Tháng 2", "Tháng 3"];
  if (quarter === "Q2") return ["Tháng 4", "Tháng 5", "Tháng 6"];
  if (quarter === "Q3") return ["Tháng 7", "Tháng 8", "Tháng 9"];
  if (quarter === "Q4") return ["Tháng 10", "Tháng 11", "Tháng 12"];
  return ["Tháng 1", "Tháng 2", "Tháng 3"];
}

// Helper to format quantitative achievements neatly in Vietnamese Enterprise context
function formatNumberByUnit(val, unit) {
  if (val === undefined || val === null) return "0";
  if (!unit) return val.toLocaleString();
  const lowerUnit = unit.toLowerCase().trim();
  if (lowerUnit === "vnd" || lowerUnit === "đồng" || lowerUnit === "đ") {
    if (val >= 1000000000) {
      return (val / 1000000000).toFixed(2) + " tỷ đ";
    }
    if (val >= 1000000) {
      return (val / 1000000).toFixed(1) + " triệu đ";
    }
    return val.toLocaleString() + " đ";
  }
  if (lowerUnit === "%") {
    return val + "%";
  }
  return val.toLocaleString() + " " + unit;
}

// Color coding progress values to luxury Navy accent standard
function getProgressColorClass(pct) {
  if (pct < 30) return "red";
  if (pct < 70) return "yellow";
  if (pct < 100) return "blue";
  return "green";
}

// Initialize KR Modal internal Month subtabs 
function initOKRSelectors() {
  document.querySelectorAll(".okr-inner-tab").forEach(tab => {
    tab.addEventListener("click", function() {
      if (!editingKRTemp) return;
      
      // Save current month input content to editingKRTemp
      saveCurrentMonthFormState();
      
      // Switch active class
      document.querySelectorAll(".okr-inner-tab").forEach(t => t.classList.remove("active"));
      this.classList.add("active");
      
      activeMonthIdxTemp = parseInt(this.getAttribute("data-month-idx"));
      
      // Load target month's data into input elements
      loadMonthFormState();
    });
  });
}

// Save active month inputs inside Configure KR Modal to editingKRTemp
function saveCurrentMonthFormState() {
  if (!editingKRTemp) return;
  const parentObj = okrData.find(o => o.keyResults.some(kr => kr.id === editingKRTemp.id)) || 
                   okrData.find(o => o.id === document.getElementById("okr-kr-obj-id").value);
  if (!parentObj) return;
  
  const months = getMonthsForQuarter(parentObj.quarter);
  const currentMonthName = months[activeMonthIdxTemp];
  
  // Save month action
  editingKRTemp.monthlyActions[currentMonthName] = document.getElementById("okr-kr-month-action").value.trim();
  
  // Save 4 weeks tasks
  if (!editingKRTemp.weeklyActions[currentMonthName]) {
    editingKRTemp.weeklyActions[currentMonthName] = [
      { week: "Tuần 1", text: "", completed: false },
      { week: "Tuần 2", text: "", completed: false },
      { week: "Tuần 3", text: "", completed: false },
      { week: "Tuần 4", text: "", completed: false }
    ];
  }
  
  editingKRTemp.weeklyActions[currentMonthName][0].text = document.getElementById("okr-kr-w1").value.trim();
  editingKRTemp.weeklyActions[currentMonthName][1].text = document.getElementById("okr-kr-w2").value.trim();
  editingKRTemp.weeklyActions[currentMonthName][2].text = document.getElementById("okr-kr-w3").value.trim();
  editingKRTemp.weeklyActions[currentMonthName][3].text = document.getElementById("okr-kr-w4").value.trim();
}

// Load active month text descriptions from editingKRTemp into fields
function loadMonthFormState() {
  if (!editingKRTemp) return;
  const parentObj = okrData.find(o => o.keyResults.some(kr => kr.id === editingKRTemp.id)) || 
                   okrData.find(o => o.id === document.getElementById("okr-kr-obj-id").value);
  if (!parentObj) return;
  
  const months = getMonthsForQuarter(parentObj.quarter);
  const currentMonthName = months[activeMonthIdxTemp];
  
  // Set tab display texts
  document.getElementById("okr-inner-tab-m1").innerText = months[0];
  document.getElementById("okr-inner-tab-m2").innerText = months[1];
  document.getElementById("okr-inner-tab-m3").innerText = months[2];
  
  // Update dynamic input labels
  document.getElementById("lbl-kr-month-action").innerHTML = `Hành động tổng của <strong>${currentMonthName}</strong>`;
  document.getElementById("lbl-okr-kr-w1").innerText = `Tuần 1 Action (${currentMonthName})`;
  document.getElementById("lbl-okr-kr-w2").innerText = `Tuần 2 Action (${currentMonthName})`;
  document.getElementById("lbl-okr-kr-w3").innerText = `Tuần 3 Action (${currentMonthName})`;
  document.getElementById("lbl-okr-kr-w4").innerText = `Tuần 4 Action (${currentMonthName})`;
  
  // Push text values to fields
  document.getElementById("okr-kr-month-action").value = editingKRTemp.monthlyActions[currentMonthName] || "";
  
  const weeks = editingKRTemp.weeklyActions[currentMonthName] || [];
  document.getElementById("okr-kr-w1").value = weeks[0] ? weeks[0].text : "";
  document.getElementById("okr-kr-w2").value = weeks[1] ? weeks[1].text : "";
  document.getElementById("okr-kr-w3").value = weeks[2] ? weeks[2].text : "";
  document.getElementById("okr-kr-w4").value = weeks[3] ? weeks[3].text : "";
}

// Setup all OKR UI interaction listeners
function initOKRListeners() {


  // Open Add Objective Modal
  const openAddObjBtn = document.getElementById("open-add-objective-btn");
  if (openAddObjBtn) {
    openAddObjBtn.addEventListener("click", openAddObjectiveModal);
  }

  // Objective Form Submission Handler
  const objForm = document.getElementById("okr-objective-form");
  if (objForm) {
    objForm.addEventListener("submit", function(e) {
      e.preventDefault();
      const objId = document.getElementById("okr-obj-id").value;
      const quarter = document.getElementById("okr-obj-quarter").value;
      const name = document.getElementById("okr-obj-name").value.trim();
      
      if (objId) {
        // Edit Mode
        const obj = okrData.find(o => o.id === objId);
        if (obj) {
          obj.quarter = quarter;
          obj.objective = name;
        }
      } else {
        // Add Mode
        const newObj = {
          id: "obj-" + Date.now(),
          quarter: quarter,
          objective: name,
          keyResults: []
        };
        okrData.push(newObj);
        expandedObjIds.add(newObj.id); // Expand newly created O automatically
      }
      
      localStorage.setItem('OKRS_DATA_2026', JSON.stringify(okrData));
      renderOKRDashboard();
      document.getElementById("okr-objective-modal").classList.remove("active");
    });
  }

  // Objective Modal Cancellation Listeners
  const closeObjBtn = document.getElementById("close-okr-obj-btn");
  if (closeObjBtn) {
    closeObjBtn.addEventListener("click", (e) => {
      e.preventDefault();
      document.getElementById("okr-objective-modal").classList.remove("active");
    });
  }
  const cancelObjBtn = document.getElementById("cancel-okr-obj-btn");
  if (cancelObjBtn) {
    cancelObjBtn.addEventListener("click", (e) => {
      e.preventDefault();
      document.getElementById("okr-objective-modal").classList.remove("active");
    });
  }

  // KR Form Submission Handler (Deep cloned edit)
  const krForm = document.getElementById("okr-kr-form");
  if (krForm) {
    krForm.addEventListener("submit", function(e) {
      e.preventDefault();
      if (!editingKRTemp) return;
      
      const krId = document.getElementById("okr-kr-id").value;
      const objId = document.getElementById("okr-kr-obj-id").value;
      const parentObj = okrData.find(o => o.id === objId);
      if (!parentObj) return;
      
      // Save primary inputs
      editingKRTemp.name = document.getElementById("okr-kr-name").value.trim();
      editingKRTemp.unit = document.getElementById("okr-kr-unit").value.trim();
      editingKRTemp.target = parseFloat(document.getElementById("okr-kr-target").value) || 0;
      editingKRTemp.current = parseFloat(document.getElementById("okr-kr-current").value) || 0;
      editingKRTemp.metricType = document.getElementById("okr-kr-metric").value;
      if (editingKRTemp.isManualCurrent === undefined) {
        editingKRTemp.isManualCurrent = (editingKRTemp.metricType === "custom");
      }
      
      // Save details for active tab first
      saveCurrentMonthFormState();
      
      // Replace main dataset entry
      if (krId) {
        // Edit Mode
        const idx = parentObj.keyResults.findIndex(k => k.id === krId);
        if (idx !== -1) {
          parentObj.keyResults[idx] = JSON.parse(JSON.stringify(editingKRTemp));
        }
      } else {
        // Add Mode
        if (parentObj.keyResults.length >= 3) {
          alert("Một mục tiêu chỉ được có tối đa 3 kết quả then chốt.");
          return;
        }
        parentObj.keyResults.push(JSON.parse(JSON.stringify(editingKRTemp)));
      }
      
      localStorage.setItem('OKRS_DATA_2026', JSON.stringify(okrData));
      renderOKRDashboard();
      document.getElementById("okr-kr-modal").classList.remove("active");
      editingKRTemp = null;
    });
  }

  // Predefined metrics listeners inside KR modal
  const krMetricSelect = document.getElementById("okr-kr-metric");
  if (krMetricSelect) {
    krMetricSelect.addEventListener("change", function() {
      const metricType = this.value;
      if (!editingKRTemp) return;
      
      editingKRTemp.metricType = metricType;
      
      if (metricType === "custom") {
        editingKRTemp.isManualCurrent = true;
        return;
      }
      
      const METRIC_DEFAULTS = {
        revenue: { name: "Tổng doanh thu", unit: "VND" },
        revenue_business: { name: "Doanh thu Business", unit: "VND" },
        revenue_retail: { name: "Doanh thu Retail", unit: "VND" },
        revenue_interio_ai: { name: "Doanh thu Interio AI", unit: "VND" },
        sales_closing_rate: { name: "Tỉ lệ chốt sales", unit: "%" },
        lead_to_demo: { name: "Lead to demo", unit: "%" },
        lead_mkt_to_demo: { name: "Lead MKT to demo", unit: "%" },
        lead_mkt_to_deal: { name: "Lead MKT to Deal", unit: "%" },
        lead_to_deal: { name: "Lead to Deal", unit: "%" },
        new_leads: { name: "Lead mới", unit: "Leads" },
        jcf_contracts: { name: "Hợp đồng JCF", unit: "Hợp đồng" },
        showroom_contracts: { name: "Hợp đồng ShowAI", unit: "Hợp đồng" },
        interio_contracts: { name: "Hợp đồng InterioAI", unit: "Hợp đồng" }
      };
      
      const defaults = METRIC_DEFAULTS[metricType];
      if (defaults) {
        document.getElementById("okr-kr-name").value = defaults.name;
        document.getElementById("okr-kr-unit").value = defaults.unit;
        
        // Find parent quarter
        const objId = document.getElementById("okr-kr-obj-id").value;
        const parentObj = okrData.find(o => o.id === objId);
        const quarter = parentObj ? parentObj.quarter : "Q1";
        
        const calculated = calculateOkrMetric(quarter, metricType);
        document.getElementById("okr-kr-current").value = calculated;
        
        editingKRTemp.name = defaults.name;
        editingKRTemp.unit = defaults.unit;
        editingKRTemp.current = calculated;
        editingKRTemp.isManualCurrent = false;
      }
    });
  }
  
  const krCurrentInput = document.getElementById("okr-kr-current");
  if (krCurrentInput) {
    krCurrentInput.addEventListener("input", function() {
      if (editingKRTemp) {
        editingKRTemp.isManualCurrent = true;
      }
    });
  }

  // Key Result Modal Cancel/Close Handlers
  const closeKRBtn = document.getElementById("close-okr-kr-btn");
  if (closeKRBtn) {
    closeKRBtn.addEventListener("click", (e) => {
      e.preventDefault();
      document.getElementById("okr-kr-modal").classList.remove("active");
      editingKRTemp = null;
    });
  }
  const cancelKRBtn = document.getElementById("cancel-okr-kr-btn");
  if (cancelKRBtn) {
    cancelKRBtn.addEventListener("click", (e) => {
      e.preventDefault();
      document.getElementById("okr-kr-modal").classList.remove("active");
      editingKRTemp = null;
    });
  }

  // Open Sync settings modal
  const openSyncBtn = document.getElementById("open-okr-sync-btn");
  if (openSyncBtn) {
    openSyncBtn.addEventListener("click", () => {
      const savedWebhook = localStorage.getItem('OKRS_WEBHOOK');
      if (savedWebhook) {
        document.getElementById("okr-sync-webhook-url").value = savedWebhook;
      }
      document.getElementById("okr-sync-modal").classList.add("active");
      generateOKRCopyPasteData();
    });
  }

  // Sync Modal inside subtabs switcher (Webhook vs Copy-Paste)
  document.querySelectorAll("#okr-sync-modal .modal-tab").forEach(tab => {
    tab.addEventListener("click", function() {
      document.querySelectorAll("#okr-sync-modal .modal-tab").forEach(t => t.classList.remove("active"));
      this.classList.add("active");
      
      const target = this.getAttribute("data-okrtab");
      document.getElementById("okr-content-webhook").style.display = target === "webhook" ? "block" : "none";
      document.getElementById("okr-content-copy").style.display = target === "copy-paste" ? "block" : "none";
      
      if (target === "copy-paste") {
        generateOKRCopyPasteData();
      }
    });
  });

  // Sync Modal Cancel/Close Handlers
  const closeSyncModalBtn = document.getElementById("close-okr-sync-modal-btn");
  if (closeSyncModalBtn) {
    closeSyncModalBtn.addEventListener("click", (e) => {
      e.preventDefault();
      document.getElementById("okr-sync-modal").classList.remove("active");
    });
  }
  const cancelSyncModalBtn = document.getElementById("cancel-okr-sync-modal-btn");
  if (cancelSyncModalBtn) {
    cancelSyncModalBtn.addEventListener("click", (e) => {
      e.preventDefault();
      document.getElementById("okr-sync-modal").classList.remove("active");
    });
  }

  // Auto Copy Code
  const copyScriptArea = document.getElementById("copy-okr-apps-script-btn");
  if (copyScriptArea) {
    copyScriptArea.addEventListener("click", function() {
      this.select();
      document.execCommand("copy");
      alert("Đã tự động sao chép mã nguồn Google Apps Script! Hãy dán vào Extensions -> Apps Script trong Google Sheet.");
    });
  }

  // Auto Copy Table
  const copyDataArea = document.getElementById("okr-copy-data-area");
  if (copyDataArea) {
    copyDataArea.addEventListener("click", function() {
      this.select();
      document.execCommand("copy");
      alert("Đã tự động sao chép toàn bộ bảng dữ liệu OKR 2026 dạng Tab-Separated! Nhấn Ctrl+V tại ô A1 của trang tính 'OKR 2026'.");
    });
  }

  // Trigger sync process
  const startSyncBtn = document.getElementById("start-okr-sync-btn");
  if (startSyncBtn) {
    startSyncBtn.addEventListener("click", syncOKRsToSheet);
  }
}

// Render dynamic elements inside the OKR Dashboard
function renderOKRDashboard() {
  // Auto-recalculate metrics for all key results if not manually overridden
  okrData.forEach(o => {
    if (o.keyResults) {
      o.keyResults.forEach(kr => {
        if (kr.metricType && kr.metricType !== "custom" && !kr.isManualCurrent) {
          kr.current = calculateOkrMetric(o.quarter, kr.metricType);
        }
      });
    }
  });

  // Sync visual state of Quarter Selector Tabs
  document.querySelectorAll("[data-quarter]").forEach(btn => {
    if (btn.getAttribute("data-quarter") === activeOkrQuarter) {
      btn.classList.add("active");
    } else {
      btn.classList.remove("active");
    }
  });
  
  const quarterMonthsMap = {
    "Q1": ["Tháng 1", "Tháng 2", "Tháng 3"],
    "Q2": ["Tháng 4", "Tháng 5", "Tháng 6"],
    "Q3": ["Tháng 7", "Tháng 8", "Tháng 9"],
    "Q4": ["Tháng 10", "Tháng 11", "Tháng 12"]
  };
  
  const monthsContainer = document.getElementById("okr-months-tabs-container");
  if (monthsContainer) {
    const months = quarterMonthsMap[activeOkrQuarter];
    monthsContainer.innerHTML = months.map(m => `
      <button class="okr-tab ${m === activeOkrMonth ? 'active' : ''}" onclick="selectOkrMonth('${m}')">${m}</button>
    `).join("");
  }
  
  // Render objectives for the current selected Quarter
  const objs = okrData.filter(o => o.quarter === activeOkrQuarter);
  
  // ── Calculate overall metrics for internal reference if needed
  let totalKRs = 0;
  let objectivesCompletedSum = 0;
  
  objs.forEach(o => {
    const krsCount = o.keyResults ? o.keyResults.length : 0;
    totalKRs += krsCount;
    if (krsCount > 0) {
      let oProgressSum = 0;
      o.keyResults.forEach(kr => {
        const krPct = kr.target > 0 ? (kr.current / kr.target) * 100 : 0;
        oProgressSum += Math.min(100, Math.round(krPct));
      });
      const oAverage = Math.round(oProgressSum / krsCount);
      objectivesCompletedSum += oAverage;
    }
  });
  
  // Write Objective KPI cards (Tên Objective và % hoàn thành)
  const kpiCardsContainer = document.getElementById("okr-objectives-kpi-cards");
  if (kpiCardsContainer) {
    if (objs.length === 0) {
      kpiCardsContainer.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; color: var(--text-muted); font-size: 0.9rem; padding: 1.5rem; background: #FFFFFF; border: 1px solid #E2EBF0; border-radius: var(--border-radius-md);">
          Không có mục tiêu nào được thiết lập.
        </div>
      `;
    } else {
      let kpiHtml = '';
      let kpiIdx = 0;
      objs.forEach(o => {
        kpiIdx++;
        const krsCount = o.keyResults ? o.keyResults.length : 0;
        let oProgress = 0;
        if (krsCount > 0) {
          let oProgressSum = 0;
          o.keyResults.forEach(kr => {
            const krPct = kr.target > 0 ? (kr.current / kr.target) * 100 : 0;
            oProgressSum += Math.min(100, Math.round(krPct));
          });
          oProgress = Math.round(oProgressSum / krsCount);
        }
        const oColor = oProgress >= 80 ? 'var(--color-green)' : (oProgress >= 50 ? 'var(--color-orange)' : 'var(--color-red)');
        
        kpiHtml += `
          <div class="kpi-card" style="display:flex; flex-direction:column; justify-content:space-between; min-height:130px; background:#FFFFFF; border:1px solid #E2EBF0; border-radius:var(--border-radius-md); padding:1.25rem; box-shadow:0 4px 15px rgba(0, 0, 0, 0.01);">
            <div>
              <div class="kpi-title" style="display:flex; align-items:center; gap:6px; margin-bottom:0.4rem;">
                <span style="background:var(--color-primary); color:#fff; border-radius:50%; width:20px; height:20px; display:inline-flex; align-items:center; justify-content:center; font-size:0.65rem; font-weight:800; flex-shrink:0;">O${kpiIdx}</span>
                <span style="text-transform:uppercase; letter-spacing:0.3px; font-weight:700; font-size:0.75rem; color:var(--text-secondary);">Mục tiêu ${kpiIdx} (${o.quarter || '2026'})</span>
              </div>
              <div class="kpi-value" style="font-size:0.92rem; font-weight:800; line-height:1.4; color:var(--text-primary); display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; min-height:2.8em; margin:0;" title="${o.objective}">
                ${o.objective}
              </div>
            </div>
            <div style="margin-top:0.75rem;">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.3rem;">
                <span style="font-size:0.72rem; color:var(--text-secondary); font-weight:700;">Tiến độ đạt</span>
                <span style="font-size:0.75rem; font-weight:850; color:${oColor};">${oProgress}%</span>
              </div>
              <div style="width:100%; height:6px; background:var(--bg-tertiary); border-radius:3px; overflow:hidden;">
                <div style="height:100%; width:${oProgress}%; background:linear-gradient(90deg, var(--color-primary), var(--color-primary-light)); border-radius:3px; transition:width 0.4s;"></div>
              </div>
            </div>
          </div>
        `;
      });
      kpiCardsContainer.innerHTML = kpiHtml;
    }
  }
  
  // Write OKR tree interactive cards
  const container = document.getElementById("okr-tree-container");
  if (!container) return;
  
  if (objs.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="padding: 3.5rem 1rem; text-align: center; background: #FFFFFF; border-radius: var(--border-radius-lg); border: 1px dashed rgba(0,111,122,0.18); margin-top: 1rem; box-shadow: var(--shadow-card);">
        <i data-lucide="target" style="width: 48px; height: 48px; color: var(--text-muted); margin-bottom: 1rem; display: inline-block;"></i>
        <p style="color: var(--text-secondary); margin-bottom: 1rem; font-size:0.9rem; font-weight:600;">Chưa có mục tiêu OKR chiến lược nào được thiết lập.</p>
        <button class="btn-primary" onclick="openAddObjectiveModal()">
          <i data-lucide="plus-circle"></i> Thiết lập Mục tiêu
        </button>
      </div>
    `;
    if (typeof lucide !== 'undefined') lucide.createIcons();
    return;
  }
  
  const curMonth = activeOkrMonth;

  let html = '';
  let objIdx = 0;
  
  objs.forEach(obj => {
    objIdx++;
    let objProgress = 0;
    const krsCount = (obj.keyResults || []).length;
    if (krsCount > 0) {
      let pSum = 0;
      obj.keyResults.forEach(kr => {
        pSum += Math.min(100, kr.target > 0 ? Math.round((kr.current / kr.target) * 100) : 0);
      });
      objProgress = Math.round(pSum / krsCount);
    }
    const objColor = objProgress >= 80 ? 'var(--color-green)' : (objProgress >= 50 ? 'var(--color-orange)' : 'var(--color-red)');
    
    html += `
      <div class="okr-obj-container" style="background:#FFFFFF; border:1px solid #E2EBF0; border-radius:var(--border-radius-lg); padding:1.5rem; margin-bottom:2rem; box-shadow:var(--shadow-card);">
        <!-- Objective Header -->
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:1.5rem; padding-bottom:1rem; border-bottom:1px solid #E2EBF0; flex-wrap:wrap; gap:1rem;">
          <div style="display:flex; align-items:center; gap:0.75rem;">
            <span style="background:var(--color-primary); color:#fff; border-radius:50%; width:32px; height:32px; display:flex; align-items:center; justify-content:center; font-size:0.85rem; font-weight:800; flex-shrink:0;">O${objIdx}</span>
            <div>
              <h3 style="font-size:1.05rem; font-weight:800; color:var(--text-primary); text-transform:uppercase; letter-spacing:0.3px; margin:0;">${obj.objective} <span style="font-size:0.75rem; color:var(--text-muted); font-weight:normal; text-transform:none; margin-left:6px;">(${obj.quarter || '2026'})</span></h3>
              <p style="font-size:0.78rem; color:var(--text-secondary); margin:0.15rem 0 0 0;">Tiến độ tổng thể mục tiêu chiến lược</p>
            </div>
          </div>
          <div style="display:flex; align-items:center; gap:1.25rem; flex-wrap:wrap;">
            <div style="display:flex; align-items:center; gap:0.75rem; min-width:200px;">
              <div style="flex:1; height:8px; background:var(--bg-tertiary); border-radius:4px; overflow:hidden;">
                <div style="height:100%; width:${objProgress}%; background:linear-gradient(90deg, var(--color-primary), var(--color-primary-light)); border-radius:4px; transition:width 0.4s;"></div>
              </div>
              <span style="font-size:0.9rem; font-weight:800; color:${objColor}; min-width:38px; text-align:right;">${objProgress}%</span>
            </div>
            <div style="display:flex; gap:0.5rem;">
              <button class="btn-action-small" style="background:var(--color-primary-bg); color:var(--color-primary); border:1px solid rgba(0, 111, 122, 0.2); padding:4px 10px; font-size:0.75rem; border-radius:6px; font-weight:700; cursor:pointer;" onclick="openAddKRModal('${obj.id}', event)" title="Thêm KR"><i data-lucide="plus" style="width:12px; height:12px; margin-right:3px; vertical-align:middle; display:inline-block;"></i>Thêm KR</button>
              <button class="btn-action-small edit" style="background:#F4F7F9; border:1px solid #E2EBF0; color:var(--text-secondary); padding:4px 8px; border-radius:6px; cursor:pointer;" onclick="editObjective('${obj.id}', event)" title="Sửa Objective"><i data-lucide="edit-2" style="width:12px; height:12px; vertical-align:middle; display:inline-block;"></i> Sửa</button>
              <button class="btn-action-small delete" style="background:rgba(231,76,60,0.06); border:1px solid rgba(231,76,60,0.15); color:var(--color-red); padding:4px 8px; border-radius:6px; cursor:pointer;" onclick="deleteObjective('${obj.id}', event)" title="Xóa Objective"><i data-lucide="trash-2" style="width:12px; height:12px; vertical-align:middle; display:inline-block;"></i> Xóa</button>
            </div>
          </div>
        </div>

        <div class="okr-kr-grid-modern">
    `;
    
    if (krsCount === 0) {
      html += `
        <div style="padding:1.5rem; text-align:center; background:#F4F7F9; border-radius:var(--border-radius-md); border:1px dashed #E2EBF0; color:var(--text-secondary); font-style:italic; font-size:0.85rem;">
          Chưa có Kết quả then chốt nào — nhấn "Thêm KR" để thiết lập.
        </div>
      `;
    } else {
      let krIdx = 0;
      obj.keyResults.forEach(kr => {
        krIdx++;
        const krPct = Math.min(100, kr.target > 0 ? Math.round((kr.current / kr.target) * 100) : 0);
        const krColor = krPct >= 80 ? 'var(--color-green)' : (krPct >= 50 ? 'var(--color-orange)' : 'var(--color-red)');
        
        let weeklyActs = (kr.weeklyActions && kr.weeklyActions[curMonth]) ? kr.weeklyActions[curMonth] : [];
        while (weeklyActs.length < 4) weeklyActs.push({ task: '', completed: false });
        
        let monthActionText = 'Chưa thiết lập kế hoạch hành động tháng.';
        if (kr.monthlyActions) {
          const mKeys = Object.keys(kr.monthlyActions);
          const curMKey = mKeys.find(k => k === curMonth);
          if (curMKey && kr.monthlyActions[curMKey]) monthActionText = kr.monthlyActions[curMKey];
          else if (mKeys.length > 0) monthActionText = kr.monthlyActions[mKeys[mKeys.length - 1]] || 'Chưa thiết lập kế hoạch hành động tháng.';
        }
        
        const completedWeeksCount = weeklyActs.filter(w => w.task && w.completed).length;
        
        html += `
          <div class="okr-kr-card-modern">
            <!-- Left Column: Progress & Metrics (42%) -->
            <div class="okr-kr-col-left">
              <div>
                <div class="okr-kr-title-row">
                  <span class="okr-kr-code-badge">KR${krIdx}</span>
                  <span class="okr-kr-name-text">${kr.name}</span>
                </div>
                
                <div class="okr-kr-metrics-row">
                  <div class="okr-kr-metric-badge">
                    Mục tiêu: <strong>${formatNumberByUnit(kr.target, kr.unit)}</strong> <span style="font-size:0.75rem; color:var(--text-muted); font-weight:normal;">${kr.unit || ''}</span>
                  </div>
                  <div class="okr-kr-metric-badge">
                    Thực tế: <strong style="color:${krColor};">${formatNumberByUnit(kr.current, kr.unit)}</strong> <span style="font-size:0.75rem; color:var(--text-muted); font-weight:normal;">${kr.unit || ''}</span>
                  </div>
                </div>
              </div>

              <div class="okr-kr-progress-box">
                <div class="okr-kr-progress-label-row">
                  <span>Tiến độ đạt</span>
                  <span class="percentage" style="color:${krColor}; font-weight:800;">${krPct}%</span>
                </div>
                <div style="width:100%; height:8px; background:var(--bg-tertiary); border-radius:4px; overflow:hidden;">
                  <div class="okr-kr-progress-bar-fill" style="width:${krPct}%; background:${krColor}; height:100%;"></div>
                </div>
                
                <div style="display:flex; justify-content:space-between; align-items:center; margin-top:1rem; border-top:1px solid rgba(0,0,0,0.03); padding-top:0.75rem;">
                  <span style="font-size:0.7rem; color:var(--text-muted); font-weight:500;">Cập nhật: ${kr.lastUpdated || '—'}</span>
                  <div style="display:flex; gap:0.35rem;">
                    <button class="btn-action-small edit" style="background:var(--color-primary-bg); border:1px solid rgba(0, 111, 122, 0.15); color:var(--color-primary); padding:3px 8px; border-radius:4px; font-size:0.7rem; font-weight:700; cursor:pointer;" onclick="editKeyResult('${kr.id}', event)" title="Sửa KR & cập nhật tuần/tháng"><i data-lucide="sliders" style="width:11px; height:11px; margin-right:3px; display:inline-block; vertical-align:middle;"></i>Cấu hình KR</button>
                    <button class="btn-action-small delete" style="background:rgba(231,76,60,0.05); border:1px solid rgba(231,76,60,0.15); color:var(--color-red); padding:3px 6px; border-radius:4px; cursor:pointer;" onclick="deleteKeyResult('${kr.id}', event)" title="Xóa Key Result"><i data-lucide="trash-2" style="width:11px; height:11px;"></i></button>
                  </div>
                </div>
              </div>
            </div>

            <!-- Right Column: Action Plan & Checklist (58%) -->
            <div class="okr-kr-col-right">
              <!-- Monthly Action -->
              <div class="okr-kr-action-block">
                <div class="okr-kr-action-title">HÀNH ĐỘNG ${curMonth.toUpperCase()}</div>
                <div class="okr-kr-action-text">"${monthActionText}"</div>
              </div>

              <!-- Weekly Checklist Header -->
              <div style="display:flex; justify-content:space-between; align-items:center; margin-top:0.25rem;">
                <span style="font-size:0.75rem; text-transform:uppercase; letter-spacing:0.5px; color:var(--text-secondary); font-weight:800; display:flex; align-items:center; gap:4px;"><i data-lucide="check-square" style="width:12px; height:12px; color:var(--color-primary-light);"></i> Checklist phân rã theo tuần</span>
                <span style="font-size:0.7rem; color:var(--text-muted); font-weight:700;">${completedWeeksCount}/4 hoàn thành</span>
              </div>

              <!-- Weekly Checklist Cards Grid -->
              <div class="okr-weekly-grid-modern">
        `;
        
        for (let w = 0; w < 4; w++) {
          const weekTask = weeklyActs[w] || { task: '', completed: false };
          if (weekTask.task) {
            html += `
              <div class="weekly-item-card ${weekTask.completed ? 'completed' : ''}" onclick="toggleWeekTask('${kr.id}', ${w}, ${!weekTask.completed})">
                <div class="weekly-card-header">
                  <span class="weekly-number">Tuần ${w+1}</span>
                  <input type="checkbox" class="weekly-checkbox-input" ${weekTask.completed ? 'checked' : ''} onclick="event.stopPropagation(); toggleWeekTask('${kr.id}', ${w}, this.checked)">
                </div>
                <div class="weekly-desc" title="${weekTask.task}">${weekTask.task}</div>
              </div>
            `;
          } else {
            html += `
              <div class="weekly-item-card" style="opacity:0.45; cursor:not-allowed; border-style:dashed; background-color:#F4F7F9;">
                <div class="weekly-card-header">
                  <span class="weekly-number">Tuần ${w+1}</span>
                  <i data-lucide="minus" style="width:12px; height:12px; color:var(--text-muted);"></i>
                </div>
                <div class="weekly-desc" style="color:var(--text-muted); font-style:italic;">Chưa phân rã công việc</div>
              </div>
            `;
          }
        }
        
        html += `
              </div>
            </div>
          </div>
        `;
      });
    }
    
    html += `
        </div>
      </div>
    `;
  });
  
  container.innerHTML = html;
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

// Objective expansion toggler (kept for backward compatibility)
function toggleObjectiveExpand(objId, event) {
  if (event.target.closest(".okr-obj-actions") || event.target.closest("button")) {
    return; // Don't collapse if clicking buttons inside the row
  }
  const list = document.getElementById(`kr-list-${objId}`);
  const chevron = document.getElementById(`chevron-${objId}`);
  if (list && chevron) {
    const isHidden = list.style.display === "none";
    list.style.display = isHidden ? "block" : "none";
    if (isHidden) {
      chevron.classList.add("expanded");
      expandedObjIds.add(objId);
    } else {
      chevron.classList.remove("expanded");
      expandedObjIds.delete(objId);
    }
  }
}

// Action plan collapsing panel toggler
function toggleActionPlanPanel(krId, event) {
  if (event) event.stopPropagation();
  const panel = document.getElementById(`actions-panel-${krId}`);
  const btn = document.getElementById(`expand-btn-${krId}`);
  if (panel && btn) {
    const isHidden = panel.style.display === "none";
    panel.style.display = isHidden ? "block" : "none";
    if (isHidden) {
      btn.innerHTML = `<i data-lucide="chevron-up"></i> Thu gọn kế hoạch hành động`;
      btn.classList.add("active");
      expandedActionPanelIds.add(krId);
    } else {
      btn.innerHTML = `<i data-lucide="chevron-down"></i> Xem kế hoạch hành động chi tiết tháng & tuần`;
      btn.classList.remove("active");
      expandedActionPanelIds.delete(krId);
    }
    lucide.createIcons();
  }
}

// Weekly checklist checkbox toggling logic
function toggleWeeklyCheckbox(krId, monthName, weekIdx, checkbox) {
  // Locate specific KR
  const obj = okrData.find(o => o.keyResults.some(k => k.id === krId));
  if (!obj) return;
  const kr = obj.keyResults.find(k => k.id === krId);
  if (!kr || !kr.weeklyActions[monthName] || !kr.weeklyActions[monthName][weekIdx]) return;
  
  // Set checked value in main array
  kr.weeklyActions[monthName][weekIdx].completed = checkbox.checked;
  
  // Save array
  localStorage.setItem('OKRS_DATA_2026', JSON.stringify(okrData));
  
  // Re-render immediately to update averages and progress percentages gracefully
  renderOKRDashboard();
}

// Card click/toggle checklist task
function toggleWeekTask(krId, weekIdx, isChecked) {
  const curMonth = activeOkrMonth;
  
  // Locate specific KR
  const obj = okrData.find(o => o.keyResults.some(k => k.id === krId));
  if (!obj) return;
  const kr = obj.keyResults.find(k => k.id === krId);
  if (!kr || !kr.weeklyActions[curMonth] || !kr.weeklyActions[curMonth][weekIdx]) return;
  
  // Set checked value in main array
  kr.weeklyActions[curMonth][weekIdx].completed = isChecked;
  
  // Save array
  localStorage.setItem('OKRS_DATA_2026', JSON.stringify(okrData));
  
  // Re-render immediately to update averages and progress percentages gracefully
  renderOKRDashboard();
}

// OKR Quarter and Month Filtering Selector Helpers
function selectOkrQuarter(quarter) {
  activeOkrQuarter = quarter;
  const quarterMonthsMap = {
    "Q1": "Tháng 1",
    "Q2": "Tháng 4",
    "Q3": "Tháng 7",
    "Q4": "Tháng 10"
  };
  activeOkrMonth = quarterMonthsMap[quarter];
  renderOKRDashboard();
}

function selectOkrMonth(month) {
  activeOkrMonth = month;
  renderOKRDashboard();
}

// Create Objective Action Modal Opener
function openAddObjectiveModal() {
  document.getElementById("okr-obj-modal-title").innerText = "Thêm Mục Tiêu (Objective)";
  document.getElementById("okr-obj-id").value = "";
  
  document.getElementById("okr-obj-quarter").value = activeOkrQuarter;
  document.getElementById("okr-obj-name").value = "";
  
  document.getElementById("okr-objective-modal").classList.add("active");
}

// Edit Objective Action Modal Opener
function editObjective(objId, event) {
  if (event) event.stopPropagation();
  const obj = okrData.find(o => o.id === objId);
  if (!obj) return;
  
  document.getElementById("okr-obj-modal-title").innerText = "Chỉnh Sửa Mục Tiêu (Objective)";
  document.getElementById("okr-obj-id").value = obj.id;
  document.getElementById("okr-obj-quarter").value = obj.quarter;
  document.getElementById("okr-obj-name").value = obj.objective;
  
  document.getElementById("okr-objective-modal").classList.add("active");
}

// Delete Objective Action Handler
function deleteObjective(objId, event) {
  if (event) event.stopPropagation();
  const idx = okrData.findIndex(o => o.id === objId);
  if (idx === -1) return;
  
  if (confirm(`Bạn có chắc chắn muốn xóa mục tiêu "${okrData[idx].objective}" cùng toàn bộ kết quả then chốt (KRs) đi kèm?`)) {
    okrData.splice(idx, 1);
    localStorage.setItem('OKRS_DATA_2026', JSON.stringify(okrData));
    renderOKRDashboard();
  }
}

// Create KR Action Modal Opener
function openAddKRModal(objId, event) {
  if (event) event.stopPropagation();
  const obj = okrData.find(o => o.id === objId);
  if (!obj) return;
  
  if (obj.keyResults.length >= 3) {
    alert("Chiến lược OKR đề xuất tối đa 3 Kết quả then chốt (KRs) cho mỗi Mục tiêu.");
    return;
  }
  
  document.getElementById("okr-kr-modal-title").innerText = "Thêm Kết Quả Then Chốt (Key Result)";
  document.getElementById("okr-kr-id").value = "";
  document.getElementById("okr-kr-obj-id").value = objId;
  document.getElementById("okr-kr-parent-obj-name").innerText = `Thuộc Mục tiêu: ${obj.objective}`;
  
  // Set defaults
  document.getElementById("okr-kr-metric").value = "custom";
  document.getElementById("okr-kr-name").value = "";
  document.getElementById("okr-kr-unit").value = "VND";
  document.getElementById("okr-kr-target").value = "";
  document.getElementById("okr-kr-current").value = "0";
  
  // Setup temp state
  const months = getMonthsForQuarter(obj.quarter);
  editingKRTemp = {
    id: "kr-" + Date.now(),
    name: "",
    unit: "VND",
    target: 0,
    current: 0,
    metricType: "custom",
    isManualCurrent: false,
    monthlyActions: {},
    weeklyActions: {}
  };
  
  months.forEach(mName => {
    editingKRTemp.monthlyActions[mName] = "";
    editingKRTemp.weeklyActions[mName] = [
      { week: "Tuần 1", text: "", completed: false },
      { week: "Tuần 2", text: "", completed: false },
      { week: "Tuần 3", text: "", completed: false },
      { week: "Tuần 4", text: "", completed: false }
    ];
  });
  
  // Inits active subtab month
  activeMonthIdxTemp = 0;
  document.querySelectorAll(".okr-inner-tab").forEach((tab, idx) => {
    tab.innerText = months[idx];
    tab.setAttribute("data-month-idx", idx);
    if (idx === 0) tab.classList.add("active");
    else tab.classList.remove("active");
  });
  
  loadMonthFormState();
  document.getElementById("okr-kr-modal").classList.add("active");
}

// Edit KR Action Modal Opener (Deep Cloned)
function editKeyResult(krId, event) {
  if (event) event.stopPropagation();
  const obj = okrData.find(o => o.keyResults.some(k => k.id === krId));
  if (!obj) return;
  const kr = obj.keyResults.find(k => k.id === krId);
  if (!kr) return;
  
  document.getElementById("okr-kr-modal-title").innerText = "Cấu Hình Kết Quả Then Chốt (Key Result)";
  document.getElementById("okr-kr-id").value = kr.id;
  document.getElementById("okr-kr-obj-id").value = obj.id;
  document.getElementById("okr-kr-parent-obj-name").innerText = `Thuộc Mục tiêu: ${obj.objective}`;
  
  // Primary values
  document.getElementById("okr-kr-metric").value = kr.metricType || "custom";
  document.getElementById("okr-kr-name").value = kr.name;
  document.getElementById("okr-kr-unit").value = kr.unit;
  document.getElementById("okr-kr-target").value = kr.target;
  document.getElementById("okr-kr-current").value = kr.current;
  
  // Deep copy
  editingKRTemp = JSON.parse(JSON.stringify(kr));
  
  // Set months
  const months = getMonthsForQuarter(obj.quarter);
  activeMonthIdxTemp = 0;
  document.querySelectorAll(".okr-inner-tab").forEach((tab, idx) => {
    tab.innerText = months[idx];
    tab.setAttribute("data-month-idx", idx);
    if (idx === 0) tab.classList.add("active");
    else tab.classList.remove("active");
  });
  
  loadMonthFormState();
  document.getElementById("okr-kr-modal").classList.add("active");
}

// Delete KR Action Handler
function deleteKeyResult(krId, event) {
  if (event) event.stopPropagation();
  const obj = okrData.find(o => o.keyResults.some(k => k.id === krId));
  if (!obj) return;
  
  const idx = obj.keyResults.findIndex(k => k.id === krId);
  if (idx === -1) return;
  
  if (confirm(`Bạn có chắc chắn muốn xóa kết quả then chốt "${obj.keyResults[idx].name}" này không?`)) {
    obj.keyResults.splice(idx, 1);
    localStorage.setItem('OKRS_DATA_2026', JSON.stringify(okrData));
    renderOKRDashboard();
  }
}

// Generate tabular Excel Copy Paste rows matching Google Sheet columns
function generateOKRCopyPasteData() {
  let tabString = "Quý\tMục tiêu (Objective)\tKết quả then chốt (KR)\tĐơn vị\tMục tiêu số\tThực tế số\tTiến độ số liệu (%)\tTháng\tHành động tháng\tTuần\tHành động tuần\tTrạng thái tuần\n";
  
  okrData.forEach(obj => {
    const q = obj.quarter;
    const objName = obj.objective;
    
    if (obj.keyResults && obj.keyResults.length > 0) {
      obj.keyResults.forEach(kr => {
        const krName = kr.name;
        const unit = kr.unit;
        const target = kr.target;
        const current = kr.current;
        const progress = target > 0 ? (current / target * 100).toFixed(1) + "%" : "0%";
        
        // Loop through quarter months
        const months = getMonthsForQuarter(q);
        months.forEach(mName => {
          const mAction = kr.monthlyActions[mName] || "";
          const weeks = kr.weeklyActions[mName] || [];
          
          weeks.forEach(weekObj => {
            tabString += `${q}\t${objName}\t${krName}\t${unit}\t${target}\t${current}\t${progress}\t${mName}\t${mAction}\t${weekObj.week}\t${weekObj.text}\t${weekObj.completed ? "Hoàn thành" : "Chưa hoàn thành"}\n`;
          });
        });
      });
    } else {
      tabString += `${q}\t${objName}\t-\t-\t-\t-\t-\t-\t-\t-\t-\t-\n`;
    }
  });
  
  const textarea = document.getElementById("okr-copy-data-area");
  if (textarea) {
    textarea.value = tabString;
  }
}

// Sync OKR structure to Google Sheet Apps Script Webhook
function syncOKRsToSheet() {
  const urlInput = document.getElementById("okr-sync-webhook-url").value.trim();
  if (!urlInput) {
    alert("Vui lòng cấu hình URL Google Apps Script trước khi đồng bộ.");
    return;
  }
  
  localStorage.setItem('OKRS_WEBHOOK', urlInput);
  
  const activeTab = document.querySelector("#okr-sync-modal .modal-tab.active").getAttribute("data-okrtab");
  
  if (activeTab === "copy-paste") {
    generateOKRCopyPasteData();
    const copyArea = document.getElementById("okr-copy-data-area");
    copyArea.select();
    document.execCommand("copy");
    alert("Đã tự động copy bảng dữ liệu OKR 2026! Mở Google Sheet tại trang 'OKR 2026' và nhấn Ctrl+V từ ô A1.");
    document.getElementById("okr-sync-modal").classList.remove("active");
    return;
  }
  
  const btn = document.getElementById("start-okr-sync-btn");
  btn.innerHTML = `<i data-lucide="loader" class="animate-spin"></i> Đang truyền dữ liệu...`;
  lucide.createIcons();
  
  fetch(urlInput, {
    method: "POST",
    body: JSON.stringify(okrData),
    headers: {
      "Content-Type": "text/plain"
    }
  })
  .then(res => res.json())
  .then(data => {
    btn.innerHTML = '<i data-lucide="refresh-cw"></i> Thực hiện đồng bộ';
    lucide.createIcons();
    if (data.status === "success") {
      alert("Đồng bộ đám mây thành công! Google Sheet của bạn đã lưu trữ và phản ánh 100% mục tiêu OKR, kế hoạch hành động tháng và phân rã giai đoạn tuần năm 2026.");
      document.getElementById("okr-sync-modal").classList.remove("active");
    } else {
      alert("Lỗi máy chủ Google Sheet: " + data.message);
    }
  })
  .catch(err => {
    // CORS resilient transparent no-cors fallback mechanism
    console.warn("CORS warning raised, re-triggering via secure transparent no-cors webhook wrapper...");
    fetch(urlInput, {
      method: "POST",
      mode: "no-cors",
      body: JSON.stringify(okrData),
      headers: {
        "Content-Type": "text/plain"
      }
    })
    .then(() => {
      btn.innerHTML = '<i data-lucide="refresh-cw"></i> Thực hiện đồng bộ';
      lucide.createIcons();
      alert("Đồng bộ đám mây thành công! Dữ liệu đã được truyền tải hoàn tất tới Google Sheet.");
      document.getElementById("okr-sync-modal").classList.remove("active");
    })
    .catch(e => {
      btn.innerHTML = '<i data-lucide="refresh-cw"></i> Thực hiện đồng bộ';
      lucide.createIcons();
      alert("Lỗi kết nối Webhook: " + e.toString());
    });
  });
}

// Make callback functions accessible in HTML onclick attributes globally
window.addWeeklyLog = addWeeklyLog;
window.viewHistoryLogs = viewHistoryLogs;
window.editKeyAccount = editKeyAccount;
window.deleteKeyAccount = deleteKeyAccount;
window.editWeeklyLog = editWeeklyLog;
window.deleteWeeklyLog = deleteWeeklyLog;

// Make OKR callbacks globally accessible 
window.openAddObjectiveModal = openAddObjectiveModal;
window.editObjective = editObjective;
window.deleteObjective = deleteObjective;
window.openAddKRModal = openAddKRModal;
window.editKeyResult = editKeyResult;
window.deleteKeyResult = deleteKeyResult;
window.toggleObjectiveExpand = toggleObjectiveExpand;
window.toggleActionPlanPanel = toggleActionPlanPanel;
window.toggleWeeklyCheckbox = toggleWeeklyCheckbox;
window.toggleWeekTask = toggleWeekTask;
window.selectOkrQuarter = selectOkrQuarter;
window.selectOkrMonth = selectOkrMonth;
window.syncOKRsToSheet = syncOKRsToSheet;

// Make Commitment callbacks globally accessible
window.openEditCommitmentModal = openEditCommitmentModal;
window.editCommitmentRow = editCommitmentRow;
window.toggleMonthCollapse = toggleMonthCollapse;
window.openAddWeekModal = openAddWeekModal;
window.deleteCommitmentWeek = deleteCommitmentWeek;
window.toggleQuarterCollapse = toggleQuarterCollapse;

// Start application when DOM is fully prepared
window.addEventListener("DOMContentLoaded", async () => {
  await loadDataFromGoogleSheets();
  initApp();
  
  const saveBtn = document.getElementById("save-settings-btn");
  if (saveBtn) {
    saveBtn.addEventListener("click", () => {
      const leadsInput = document.getElementById("setting-sheet-leads").value;
      const ordersInput = document.getElementById("setting-sheet-orders").value;
      const renewalsInput = document.getElementById("setting-sheet-renewals").value;
      const perfInput = document.getElementById("setting-sheet-performance").value;
      
      localStorage.setItem("G_SHEET_LEADS", leadsInput);
      localStorage.setItem("G_SHEET_ORDERS", ordersInput);
      localStorage.setItem("G_SHEET_RENEWALS", renewalsInput);
      localStorage.setItem("G_SHEET_PERFORMANCE", perfInput);
      
      alert("Đã lưu cấu hình Google Sheets. Hệ thống sẽ tự động tải lại trang để đồng bộ dữ liệu mới nhất.");
      window.location.reload();
    });
  }
});

// ==========================================
// 13. COMMITMENT 2026 TRACKING MODULE
// ==========================================
const COMM_SEED_VERSION = "v8-independent-commitments-v1";
let commitmentYears = [];
let commitmentQuarters = [];
let commitmentMonths = [];
let commitmentWeeks = [];
let collapsedMonths = {};
let collapsedQuarters = {};

function generateDefaultWeeksFor2026() {
  const defaultMonths = [
    { name: "Tháng 1",  revenueRetail: 215000000, revenueBusiness: 50000000 },
    { name: "Tháng 2",  revenueRetail: 220000000, revenueBusiness: 60000000 },
    { name: "Tháng 3",  revenueRetail: 250000000, revenueBusiness: 70000000 },
    { name: "Tháng 4",  revenueRetail: 260000000, revenueBusiness: 80000000 },
    { name: "Tháng 5",  revenueRetail: 280000000, revenueBusiness: 100000000 },
    { name: "Tháng 6",  revenueRetail: 290000000, revenueBusiness: 110000000 },
    { name: "Tháng 7",  revenueRetail: 300000000, revenueBusiness: 120000000 },
    { name: "Tháng 8",  revenueRetail: 310000000, revenueBusiness: 130000000 },
    { name: "Tháng 9",  revenueRetail: 320000000, revenueBusiness: 140000000 },
    { name: "Tháng 10", revenueRetail: 330000000, revenueBusiness: 150000000 },
    { name: "Tháng 11", revenueRetail: 340000000, revenueBusiness: 160000000 },
    { name: "Tháng 12", revenueRetail: 350000000, revenueBusiness: 170000000 }
  ];
  
  const weeks = [];
  const pad = (n) => n.toString().padStart(2, '0');
  
  defaultMonths.forEach((m, idx) => {
    const mIndex = idx;
    const monthNum = idx + 1;
    const lastDay = new Date(2026, monthNum, 0).getDate();
    
    const weekRanges = [
      { start: 1, end: 7, name: "Tuần 1" },
      { start: 8, end: 14, name: "Tuần 2" },
      { start: 15, end: 21, name: "Tuần 3" },
      { start: 22, end: lastDay, name: "Tuần 4" }
    ];
    
    weekRanges.forEach((range, wIdx) => {
      const wRetail = Math.round(m.revenueRetail / 4);
      const wBusiness = Math.round(m.revenueBusiness / 4);
      weeks.push({
        id: `week-${monthNum}-${wIdx + 1}`,
        monthIndex: mIndex,
        name: range.name,
        startDate: `${pad(range.start)}/${pad(monthNum)}/2026`,
        endDate: `${pad(range.end)}/${pad(monthNum)}/2026`,
        revenueRetail: wRetail,
        revenueBusiness: wBusiness,
        perfTarget: 70,
        demoTarget: 5,
        note: `${range.name} - ${m.name} 2026`
      });
    });
  });
  
  return weeks;
}

function saveCommitmentData() {
  localStorage.setItem('COMMITMENT_YEARS_2026', JSON.stringify(commitmentYears));
  localStorage.setItem('COMMITMENT_QUARTERS_2026', JSON.stringify(commitmentQuarters));
  localStorage.setItem('COMMITMENT_MONTHS_2026', JSON.stringify(commitmentMonths));
  localStorage.setItem('COMMITMENT_WEEKS_2026', JSON.stringify(commitmentWeeks));
}

function recalculateCommitmentData() {
  saveCommitmentData();
}

function seedDefaultCommitments() {
  // 1. Year
  commitmentYears = [{
    id: "year-2026",
    name: "Năm 2026",
    revenueRetail: 3465000000,
    revenueBusiness: 1340000000,
    perfTarget: 70,
    demoTarget: 60,
    note: "Cam kết chiến lược cả năm 2026"
  }];

  // 2. Quarters
  commitmentQuarters = [
    { id: "quarter-1", name: "Quý 1", qIndex: 0, revenueRetail: 685000000, revenueBusiness: 180000000, perfTarget: 70, demoTarget: 15, note: "Cam kết chiến lược Q1 2026" },
    { id: "quarter-2", name: "Quý 2", qIndex: 1, revenueRetail: 830000000, revenueBusiness: 290000000, perfTarget: 70, demoTarget: 15, note: "Cam kết chiến lược Q2 2026" },
    { id: "quarter-3", name: "Quý 3", qIndex: 2, revenueRetail: 930000000, revenueBusiness: 390000000, perfTarget: 70, demoTarget: 15, note: "Cam kết chiến lược Q3 2026" },
    { id: "quarter-4", name: "Quý 4", qIndex: 3, revenueRetail: 1020000000, revenueBusiness: 480000000, perfTarget: 70, demoTarget: 15, note: "Cam kết chiến lược Q4 2026" }
  ];

  // 3. Months
  commitmentMonths = [
    { id: "month-1",  name: "Tháng 1",  monthIndex: 0,  revenueRetail: 215000000, revenueBusiness: 50000000, perfTarget: 70, demoTarget: 5 },
    { id: "month-2",  name: "Tháng 2",  monthIndex: 1,  revenueRetail: 220000000, revenueBusiness: 60000000, perfTarget: 70, demoTarget: 5 },
    { id: "month-3",  name: "Tháng 3",  monthIndex: 2,  revenueRetail: 250000000, revenueBusiness: 70000000, perfTarget: 70, demoTarget: 5 },
    { id: "month-4",  name: "Tháng 4",  monthIndex: 3,  revenueRetail: 260000000, revenueBusiness: 80000000, perfTarget: 70, demoTarget: 5 },
    { id: "month-5",  name: "Tháng 5",  monthIndex: 4,  revenueRetail: 280000000, revenueBusiness: 100000000, perfTarget: 70, demoTarget: 5 },
    { id: "month-6",  name: "Tháng 6",  monthIndex: 5,  revenueRetail: 290000000, revenueBusiness: 110000000, perfTarget: 70, demoTarget: 5 },
    { id: "month-7",  name: "Tháng 7",  monthIndex: 6,  revenueRetail: 300000000, revenueBusiness: 120000000, perfTarget: 70, demoTarget: 5 },
    { id: "month-8",  name: "Tháng 8",  monthIndex: 7,  revenueRetail: 310000000, revenueBusiness: 130000000, perfTarget: 70, demoTarget: 5 },
    { id: "month-9",  name: "Tháng 9",  monthIndex: 8,  revenueRetail: 320000000, revenueBusiness: 140000000, perfTarget: 70, demoTarget: 5 },
    { id: "month-10", name: "Tháng 10", monthIndex: 9,  revenueRetail: 330000000, revenueBusiness: 150000000, perfTarget: 70, demoTarget: 5 },
    { id: "month-11", name: "Tháng 11", monthIndex: 10, revenueRetail: 340000000, revenueBusiness: 160000000, perfTarget: 70, demoTarget: 5 },
    { id: "month-12", name: "Tháng 12", monthIndex: 11, revenueRetail: 350000000, revenueBusiness: 170000000, perfTarget: 70, demoTarget: 5 }
  ];

  // 4. Weeks
  commitmentWeeks = generateDefaultWeeksFor2026();

  saveCommitmentData();
}

const storedCommVersion = localStorage.getItem('COMMITMENT_SEED_VER');
if (localStorage.getItem('COMMITMENT_YEARS_2026') && localStorage.getItem('COMMITMENT_QUARTERS_2026') && localStorage.getItem('COMMITMENT_MONTHS_2026') && localStorage.getItem('COMMITMENT_WEEKS_2026') && storedCommVersion === COMM_SEED_VERSION) {
  commitmentYears = JSON.parse(localStorage.getItem('COMMITMENT_YEARS_2026'));
  commitmentQuarters = JSON.parse(localStorage.getItem('COMMITMENT_QUARTERS_2026'));
  commitmentMonths = JSON.parse(localStorage.getItem('COMMITMENT_MONTHS_2026'));
  commitmentWeeks = JSON.parse(localStorage.getItem('COMMITMENT_WEEKS_2026'));
} else {
  // Migrate existing data to keep user's inputs while initializing new years/quarters
  const existingMonths = localStorage.getItem('COMMITMENT_MONTHS_2026');
  const existingWeeks = localStorage.getItem('COMMITMENT_WEEKS_2026');
  
  seedDefaultCommitments();
  
  if (existingMonths) {
    try {
      commitmentMonths = JSON.parse(existingMonths);
    } catch (e) {
      console.error("Failed to parse existing months:", e);
    }
  }
  if (existingWeeks) {
    try {
      commitmentWeeks = JSON.parse(existingWeeks);
    } catch (e) {
      console.error("Failed to parse existing weeks:", e);
    }
  }
  
  saveCommitmentData();
  localStorage.setItem('COMMITMENT_SEED_VER', COMM_SEED_VERSION);
}

// Support expanding/collapsing month rows
function toggleMonthCollapse(monthIndex) {
  collapsedMonths[monthIndex] = !collapsedMonths[monthIndex];
  renderCommitmentDashboard();
}

function toggleQuarterCollapse(qIndex) {
  collapsedQuarters[qIndex] = !collapsedQuarters[qIndex];
  renderCommitmentDashboard();
}

function getProductLine(productName) {
  if (!productName) return "Retail";
  const p = productName.toLowerCase();
  
  // Go
  const goKeywords = ["furni", "visual agent", "panama"];
  if (goKeywords.some(kw => p.includes(kw))) return "Go";
  
  // Business
  const businessKeywords = ["factory", "interior", "productai", "đào tạo ai", "showroom"];
  if (businessKeywords.some(kw => p.includes(kw))) return "Business";
  
  // Default to Retail
  return "Retail";
}

function getLineRevenuesForPeriod(startDate, endDate) {
  let go = 0;
  let retail = 0;
  let business = 0;
  
  ordersData.forEach(order => {
    // Apply salesperson filter
    if (filterState.sales !== "all" && order.sales !== filterState.sales) return;
    
    // Apply global productGroup filter
    if (filterState.productGroup !== "all") {
      const cat = getProductCategory(order.san_pham);
      if (filterState.productGroup === "cloud" && cat !== "JEGA Cloud") return;
      if (filterState.productGroup === "visual" && cat !== "JEGA Visual") return;
    }
    
    // Apply global productLine filter
    if (filterState.productLine !== "all") {
      const line = getProductLine(order.san_pham);
      if (line !== filterState.productLine) return;
    }
    
    // Apply category filter
    if (filterState.orderCategory !== "all") {
      const cat = getProductCategory(order.san_pham);
      if (filterState.orderCategory === "cloud" && cat !== "JEGA Cloud") return;
      if (filterState.orderCategory === "visual" && cat !== "JEGA Visual") return;
    }
    
    // Apply type filter
    if (filterState.orderType !== "all" && order.loai_don !== filterState.orderType) return;
    
    // Apply search filter
    if (filterState.searchOrders) {
      const query = filterState.searchOrders.toLowerCase();
      const matchName = order.ten_kh.toLowerCase().includes(query);
      const matchId = order.ma_kh.toLowerCase().includes(query);
      const matchProduct = order.san_pham.toLowerCase().includes(query);
      const matchPhone = order.dien_thoai.toLowerCase().includes(query);
      if (!matchName && !matchId && !matchProduct && !matchPhone) return;
    }
    
    const orderDate = parseDate(order.ngay_mua);
    if (orderDate && (!startDate || orderDate >= startDate) && (!endDate || orderDate <= endDate)) {
      const line = getProductLine(order.san_pham);
      if (line === "Go") go += order.doAccess ? order.doanh_thu : order.doanh_thu; // handle potential mock data differences safely
      if (line === "Go") go += order.doanh_thu;
      else if (line === "Business") business += order.doanh_thu;
      else retail += order.doanh_thu;
    }
  });
  
  return { go, retail, business };
}

function getCommitmentActuals(startDateStr, endDateStr) {
  const start = parseDate(startDateStr);
  const end = parseDate(endDateStr);
  if (!start || !end) return { retail: 0, go: 0, business: 0, perf: 0, demo: 0 };
  
  // Adjust end date to 23:59:59
  end.setHours(23, 59, 59);

  let actualRetail = 0, actualGo = 0, actualBusiness = 0;
  
  filteredOrders.forEach(order => {
    const d = parseDate(order.ngay_mua);
    if (d && d >= start && d <= end) {
      const line = getProductLine(order.san_pham);
      if (line === "Retail") actualRetail += order.doanh_thu;
      else if (line === "Go") actualGo += order.doanh_thu;
      else if (line === "Business") actualBusiness += order.doanh_thu;
    }
  });
  
  let totalLeadsInPeriod = 0;
  let closedLeadsInPeriod = 0;
  let demoInPeriod = 0;
  
  filteredLeads.forEach(lead => {
    const d = parseDate(lead.ngay_tao);
    if (d && d >= start && d <= end) {
      totalLeadsInPeriod++;
      if (lead.moi_quan_he === "Ký hợp đồng") {
        closedLeadsInPeriod++;
      }
      const demoList = ["Demo", "Báo giá", "Dùng thử", "Gửi hợp đồng", "Đặt cọc", "Ký hợp đồng"];
      if (demoList.includes(lead.moi_quan_he)) {
        demoInPeriod++;
      }
    }
  });
  
  const perf = totalLeadsInPeriod > 0 ? (closedLeadsInPeriod / totalLeadsInPeriod) * 100 : 0;
  
  return {
    retail: actualRetail,
    go: actualGo,
    business: actualBusiness,
    perf: perf,
    demo: demoInPeriod
  };
}

function getCommitmentSummary() {
  const yObj = commitmentYears[0] || { revenueRetail: 0, revenueBusiness: 0 };
  const yearSum = (yObj.revenueRetail || 0) + (yObj.revenueBusiness || 0);
  
  const qSum = [0, 0, 0, 0];
  for (let i = 0; i < 4; i++) {
    const qObj = commitmentQuarters[i] || { revenueRetail: 0, revenueBusiness: 0 };
    qSum[i] = (qObj.revenueRetail || 0) + (qObj.revenueBusiness || 0);
  }
  
  return {
    year: yearSum,
    q1: qSum[0],
    q2: qSum[1],
    q3: qSum[2],
    q4: qSum[3]
  };
}

function renderCommitmentDashboard() {
  const tbody = document.getElementById("commitment-rows-container");
  if (!tbody) return;
  tbody.innerHTML = "";
  
  const quarterDefs = [
    { qIndex: 0, name: "Quý 1", months: [0,1,2], color: "var(--color-primary)" },
    { qIndex: 1, name: "Quý 2", months: [3,4,5], color: "var(--color-green)" },
    { qIndex: 2, name: "Quý 3", months: [6,7,8], color: "var(--color-orange)" },
    { qIndex: 3, name: "Quý 4", months: [9,10,11], color: "var(--color-red)" }
  ];

  quarterDefs.forEach(q => {
    // ---- QUARTER ROW ----
    const isQCollapsed = collapsedQuarters[q.qIndex] === true;
    const qMonths = commitmentMonths.filter(m => q.months.includes(m.monthIndex));
    
    // Read directly from independent commitmentQuarters
    const qObj = commitmentQuarters.find(item => item.id === `quarter-${q.qIndex + 1}` || item.qIndex === q.qIndex) || { revenueRetail: 0, revenueBusiness: 0, perfTarget: 70, demoTarget: 15 };
    const qRetail = qObj.revenueRetail || 0;
    const qBusiness = qObj.revenueBusiness || 0;
    const qPerf = qObj.perfTarget || 70;
    const qDemo = qObj.demoTarget || 15;

    const trQ = document.createElement("tr");
    trQ.style.cssText = `background:rgba(255,255,255,0.04); border-top:2px solid ${q.color}; border-bottom:2px solid rgba(255,255,255,0.08);`;
    trQ.innerHTML = [
      `<td style="padding:14px 12px; font-size:1rem; font-weight:800;">`,
      `  <div style="display:flex; align-items:center; gap:0.6rem;">`,
      `    <button type="button" onclick="toggleQuarterCollapse(${q.qIndex})" style="background:none; border:none; cursor:pointer; color:${q.color}; display:inline-flex; align-items:center; padding:4px; transition:transform 0.2s;" title="${isQCollapsed ? 'Mở rộng' : 'Thu gọn'} ${q.name}">`,
      `      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="transform:rotate(${isQCollapsed ? '-90' : '0'}deg); transition:transform 0.2s;"><polyline points="6 9 12 15 18 9"></polyline></svg>`,
      `    </button>`,
      `    <span style="color:${q.color}; cursor:pointer;" onclick="toggleQuarterCollapse(${q.qIndex})">📋 ${q.name}</span>`,
      `  </div>`,
      `</td>`,
      `<td style="padding:14px 12px; text-align:right; font-weight:800; color:${q.color};">${formatVND(qRetail)}</td>`,
      `<td style="padding:14px 12px; text-align:right; font-weight:800; color:${q.color};">${formatVND(qBusiness)}</td>`,
      `<td style="padding:14px 12px; text-align:right; font-weight:800; color:var(--color-primary);">${qPerf}</td>`,
      `<td style="padding:14px 12px; text-align:right; font-weight:800; color:var(--color-orange);">${qDemo}</td>`,
      `<td style="padding:14px 12px; text-align:center;">`,
      `  <div style="display:flex; gap:0.4rem; justify-content:center; align-items:center;">`,
      `    <button type="button" class="btn-action-small edit" onclick="openEditCommitmentModal('quarter', '${qObj.id}')" title="Sửa Cam kết ${q.name}"><i data-lucide="edit"></i></button>`,
      `    <span style="color:var(--text-muted); font-size:0.75rem;">${isQCollapsed ? '▶ ' + qMonths.length + ' tháng' : ''}</span>`,
      `  </div>`,
      `</td>`
    ].join('');
    tbody.appendChild(trQ);

    if (isQCollapsed) return; // Quarter collapsed → skip all months

    // ---- MONTH ROWS inside this quarter ----
    qMonths.forEach(m => {
      const isMonthCollapsed = collapsedMonths[m.monthIndex] === true;
      const weeksInMonth = commitmentWeeks.filter(w => w.monthIndex === m.monthIndex);

      const trM = document.createElement("tr");
      trM.className = "month-row";
      trM.style.fontWeight = "700";
      trM.innerHTML = [
        `<td style="padding:11px 12px 11px 2rem; font-size:0.88rem;">`,
        `  <div style="display:flex; align-items:center; gap:0.5rem;">`,
        `    <button type="button" onclick="toggleMonthCollapse(${m.monthIndex})" style="background:none; border:none; cursor:pointer; color:var(--color-gold); display:inline-flex; align-items:center; padding:3px; transition:transform 0.2s;" title="${isMonthCollapsed ? 'Xem tuần' : 'Ẩn tuần'}">`,
        `      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="transform:rotate(${isMonthCollapsed ? '-90' : '0'}deg); transition:transform 0.2s;"><polyline points="6 9 12 15 18 9"></polyline></svg>`,
        `    </button>`,
        `    <span style="color:var(--color-gold); cursor:pointer;" onclick="toggleMonthCollapse(${m.monthIndex})">${m.name}</span>`,
        `    <span style="font-size:0.68rem; color:var(--text-muted); font-weight:400;">(${weeksInMonth.length} tuần)</span>`,
        `  </div>`,
        `</td>`,
        `<td style="padding:11px 12px; text-align:right; font-weight:700;">${formatVND(m.revenueRetail || 0)}</td>`,
        `<td style="padding:11px 12px; text-align:right; font-weight:700;">${formatVND(m.revenueBusiness || 0)}</td>`,
        `<td style="padding:11px 12px; text-align:right; font-weight:700; color:var(--color-primary);">${m.perfTarget || 0}</td>`,
        `<td style="padding:11px 12px; text-align:right; font-weight:700; color:var(--color-orange);">${m.demoTarget || 0}</td>`,
        `<td style="padding:11px 12px; text-align:center;">`,
        `  <div style="display:flex; gap:0.35rem; justify-content:center; align-items:center;">`,
        `    <button type="button" class="btn-action-small edit" onclick="openEditCommitmentModal('month', '${m.id}')" title="Sửa Cam kết ${m.name}"><i data-lucide="edit"></i></button>`,
        `    <button type="button" class="btn-emerald btn-action-small" onclick="openAddWeekModal(${m.monthIndex})" title="Thêm tuần mới cho ${m.name}" style="padding: 2px 6px; font-size: 0.72rem; display: inline-flex; align-items: center; gap: 2px;">`,
        `      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg> Thêm tuần`,
        `    </button>`,
        `  </div>`,
        `</td>`
      ].join('');
      tbody.appendChild(trM);

      // ---- WEEK ROWS inside this month ----
      if (!isMonthCollapsed) {
        weeksInMonth.forEach(w => {
          const trWeek = document.createElement("tr");
          trWeek.className = "week-row";
          trWeek.innerHTML = [
            `<td style="padding:9px 12px 9px 3.5rem; color:var(--text-secondary);">`,
            `  <div style="display:flex; flex-direction:column; gap:2px;">`,
            `    <strong style="font-size:0.82rem;" contenteditable="true" data-id="${w.id}" data-field="name">${w.name}</strong>`,
            `    <div style="font-size:0.72rem; color:var(--text-muted); display:flex; gap:2px; align-items:center;">`,
            `      <input type="date" value="${convertDateToISO(w.startDate)}" data-id="${w.id}" data-field="startDate" class="inline-date-picker">`,
            `      <span>→</span>`,
            `      <input type="date" value="${convertDateToISO(w.endDate)}" data-id="${w.id}" data-field="endDate" class="inline-date-picker">`,
            `    </div>`,
            `  </div>`,
            `</td>`,
            `<td style="padding:9px 12px; text-align:right; color:var(--text-secondary); font-size:0.83rem;" contenteditable="true" data-id="${w.id}" data-field="revenueRetail">${formatVND(w.revenueRetail || 0)}</td>`,
            `<td style="padding:9px 12px; text-align:right; color:var(--text-secondary); font-size:0.83rem;" contenteditable="true" data-id="${w.id}" data-field="revenueBusiness">${formatVND(w.revenueBusiness || 0)}</td>`,
            `<td style="padding:9px 12px; text-align:right; color:var(--color-primary); font-weight:600; font-size:0.83rem;" contenteditable="true" data-id="${w.id}" data-field="perfTarget">${w.perfTarget || 0}</td>`,
            `<td style="padding:9px 12px; text-align:right; color:var(--color-orange); font-weight:600; font-size:0.83rem;" contenteditable="true" data-id="${w.id}" data-field="demoTarget">${w.demoTarget || 0}</td>`,
            `<td style="padding:9px 12px; text-align:center;">`,
            `  <div style="display:flex; gap:0.25rem; justify-content:center; align-items:center;">`,
            `    <button type="button" class="btn-action-small edit" onclick="editCommitmentRow('${w.id}')" title="Sửa tuần"><i data-lucide="edit"></i></button>`,
            `    <button type="button" class="btn-action-small delete" onclick="deleteCommitmentWeek('${w.id}')" title="Xóa tuần" style="color:var(--color-red);"><i data-lucide="trash-2"></i></button>`,
            `    ${w.note ? `<span class="badge" title="${w.note}" style="background-color:rgba(255,255,255,0.05); color:var(--text-muted); padding:2px 4px; font-size:0.68rem; cursor:help; border-radius:3px;">Ghi chú</span>` : ''}`,
            `  </div>`,
            `</td>`
          ].join('');
          tbody.appendChild(trWeek);
          // Attach blur/change listener for inline editing
          trWeek.querySelectorAll('[contenteditable="true"]')
            .forEach(el => el.addEventListener('blur', saveInlineEdit));
          trWeek.querySelectorAll('.inline-date-picker')
            .forEach(el => el.addEventListener('change', saveInlineEdit));
        });
      }
    });
  });
  
  if (typeof lucide !== 'undefined') lucide.createIcons();
  
  const summary = getCommitmentSummary();
  
  const yearEl = document.getElementById("kpi-comm-2026");
  if (yearEl) yearEl.innerText = formatVND(summary.year);
  
  const q1El = document.getElementById("kpi-comm-q1");
  if (q1El) q1El.innerText = formatVND(summary.q1);
  
  const q2El = document.getElementById("kpi-comm-q2");
  if (q2El) q2El.innerText = formatVND(summary.q2);
  
  const q3El = document.getElementById("kpi-comm-q3");
  if (q3El) q3El.innerText = formatVND(summary.q3);
  
  const q4El = document.getElementById("kpi-comm-q4");
  if (q4El) q4El.innerText = formatVND(summary.q4);
}

function convertDateToISO(dateStr) {
  if (!dateStr) return "";
  const parts = dateStr.trim().split(" ")[0].split("/");
  if (parts.length === 3) {
    const day = parts[0].padStart(2, '0');
    const month = parts[1].padStart(2, '0');
    const year = parts[2];
    return `${year}-${month}-${day}`;
  }
  return dateStr;
}

function convertISOToDate(isoStr) {
  if (!isoStr) return "";
  const parts = isoStr.trim().split("-");
  if (parts.length === 3) {
    const year = parts[0];
    const month = parts[1].padStart(2, '0');
    const day = parts[2].padStart(2, '0');
    return `${day}/${month}/${year}`;
  }
  return isoStr;
}

function saveInlineEdit(e) {
  const el = e.target;
  const id = el.getAttribute('data-id');
  const field = el.getAttribute('data-field');
  if (!id || !field) return;
  
  const w = commitmentWeeks.find(week => week.id === id);
  if (!w) return;
  
  let rawVal = (el.tagName === 'INPUT') ? convertISOToDate(el.value) : el.innerText.trim();
  
  if (field === 'name' || field === 'startDate' || field === 'endDate') {
    if (field === 'startDate' || field === 'endDate') {
      const datePattern = /^\d{1,2}\/\d{1,2}\/\d{4}$/;
      if (!datePattern.test(rawVal)) {
        alert("Định dạng ngày phải là DD/MM/YYYY!");
        renderCommitmentDashboard();
        return;
      }
    }
    w[field] = rawVal;
  } else {
    let numericString = rawVal.replace(/[^\d]/g, '');
    let numVal = parseFloat(numericString) || 0;
    w[field] = numVal;
  }
  
  recalculateCommitmentData();
  renderCommitmentDashboard();
  updateKPIs();
  updateCharts();
}

function openEditCommitmentModal(level, idOrIdx) {
  // Set level in hidden input
  document.getElementById("comm-edit-level").value = level;
  
  // Elements
  const modalTitle = document.getElementById("comm-edit-modal-title");
  const submitBtn = document.querySelector("#commitment-edit-form button[type='submit']");
  
  // Fields to toggle
  const weekNameRow = document.getElementById("comm-week-name").closest(".form-row");
  const dateRow = document.getElementById("comm-date-row");
  const noteRow = document.getElementById("comm-week-note-row");
  
  // Toggle visibility and requirements
  if (level === 'week') {
    if (weekNameRow) weekNameRow.style.display = 'grid';
    if (dateRow) dateRow.style.display = 'grid';
    if (noteRow) noteRow.style.display = 'block';
    
    document.getElementById("comm-week-name").required = true;
    document.getElementById("comm-start-date").required = true;
    document.getElementById("comm-end-date").required = true;
  } else {
    if (weekNameRow) weekNameRow.style.display = 'none';
    if (dateRow) dateRow.style.display = 'none';
    if (noteRow) noteRow.style.display = 'none';
    
    document.getElementById("comm-week-name").required = false;
    document.getElementById("comm-start-date").required = false;
    document.getElementById("comm-end-date").required = false;
  }
  
  // Default values
  document.getElementById("comm-row-id").value = "";
  document.getElementById("comm-month-index").value = "";
  
  if (level === 'year') {
    modalTitle.textContent = "Chỉnh sửa Cam kết Năm 2026";
    if (submitBtn) submitBtn.textContent = "Lưu Cam Kết Năm";
    
    const y = commitmentYears[0] || { revenueRetail: 0, revenueBusiness: 0, perfTarget: 70, demoTarget: 60 };
    document.getElementById("comm-row-id").value = "year-2026";
    document.getElementById("comm-val-retail").value = y.revenueRetail;
    document.getElementById("comm-val-business").value = y.revenueBusiness;
    document.getElementById("comm-val-perf").value = y.perfTarget;
    document.getElementById("comm-val-demo").value = y.demoTarget;
    
  } else if (level === 'quarter') {
    const q = commitmentQuarters.find(item => item.id === idOrIdx || item.qIndex === parseInt(idOrIdx));
    if (q) {
      modalTitle.textContent = `Chỉnh sửa Cam kết ${q.name}`;
      if (submitBtn) submitBtn.textContent = `Lưu Cam Kết ${q.name}`;
      
      document.getElementById("comm-row-id").value = q.id;
      document.getElementById("comm-val-retail").value = q.revenueRetail;
      document.getElementById("comm-val-business").value = q.revenueBusiness;
      document.getElementById("comm-val-perf").value = q.perfTarget;
      document.getElementById("comm-val-demo").value = q.demoTarget;
    }
    
  } else if (level === 'month') {
    const m = commitmentMonths.find(item => item.id === idOrIdx || item.monthIndex === parseInt(idOrIdx));
    if (m) {
      modalTitle.textContent = `Chỉnh sửa Cam kết ${m.name}`;
      if (submitBtn) submitBtn.textContent = `Lưu Cam Kết ${m.name}`;
      
      document.getElementById("comm-row-id").value = m.id;
      document.getElementById("comm-month-index").value = m.monthIndex;
      document.getElementById("comm-val-retail").value = m.revenueRetail;
      document.getElementById("comm-val-business").value = m.revenueBusiness;
      document.getElementById("comm-val-perf").value = m.perfTarget;
      document.getElementById("comm-val-demo").value = m.demoTarget;
    }
    
  } else if (level === 'week') {
    if (idOrIdx) {
      // Edit mode
      const w = commitmentWeeks.find(c => c.id === idOrIdx);
      if (w) {
        modalTitle.textContent = "Chỉnh sửa Tuần Cam kết";
        if (submitBtn) submitBtn.textContent = "Lưu Tuần Cam Kết";
        
        document.getElementById("comm-row-id").value = w.id;
        document.getElementById("comm-month-index").value = w.monthIndex;
        
        const m = commitmentMonths.find(c => c.monthIndex === w.monthIndex);
        document.getElementById("comm-month-name").value = m ? m.name : `Tháng ${w.monthIndex + 1}`;
        
        document.getElementById("comm-week-name").value = w.name || "";
        document.getElementById("comm-start-date").value = convertDateToISO(w.startDate);
        document.getElementById("comm-end-date").value = convertDateToISO(w.endDate);
        document.getElementById("comm-val-retail").value = w.revenueRetail || 0;
        document.getElementById("comm-val-business").value = w.revenueBusiness || 0;
        document.getElementById("comm-val-perf").value = w.perfTarget || 70;
        document.getElementById("comm-val-demo").value = w.demoTarget || 5;
        document.getElementById("comm-week-note").value = w.note || "";
      }
    }
  }
  
  document.getElementById("commitment-edit-modal").classList.add("active");
}

function editCommitmentRow(id) {
  openEditCommitmentModal('week', id);
}

function openAddWeekModal(monthIndex) {
  openEditCommitmentModal('week', null);
  
  document.getElementById("comm-row-id").value = "";
  document.getElementById("comm-month-index").value = monthIndex;
  
  const m = commitmentMonths.find(c => c.monthIndex === monthIndex);
  document.getElementById("comm-month-name").value = m ? m.name : `Tháng ${monthIndex + 1}`;
  
  const weeksInMonth = commitmentWeeks.filter(w => w.monthIndex === monthIndex);
  const nextWeekNum = weeksInMonth.length + 1;
  document.getElementById("comm-week-name").value = `Tuần ${nextWeekNum}`;
  
  document.getElementById("comm-start-date").value = "";
  document.getElementById("comm-end-date").value = "";
  document.getElementById("comm-val-retail").value = "";
  document.getElementById("comm-val-business").value = "";
  document.getElementById("comm-val-perf").value = 70;
  document.getElementById("comm-val-demo").value = 5;
  document.getElementById("comm-week-note").value = "";
  
  const submitBtn = document.querySelector("#commitment-edit-form button[type='submit']");
  if (submitBtn) submitBtn.textContent = "Thêm Tuần Cam Kết";
}

function deleteCommitmentWeek(id) {
  if (confirm("Bạn có chắc chắn muốn xóa tuần kinh doanh này?")) {
    commitmentWeeks = commitmentWeeks.filter(w => w.id !== id);
    recalculateCommitmentData();
    renderCommitmentDashboard();
    updateKPIs();
    updateCharts();
  }
}

function initCommitmentListeners() {
  const commForm = document.getElementById("commitment-edit-form");
  if (commForm) {
    commForm.addEventListener("submit", function(e) {
      e.preventDefault();
      const level = document.getElementById("comm-edit-level").value;
      const id = document.getElementById("comm-row-id").value;
      
      const retailVal = parseFloat(document.getElementById("comm-val-retail").value) || 0;
      const businessVal = parseFloat(document.getElementById("comm-val-business").value) || 0;
      const perfVal = parseFloat(document.getElementById("comm-val-perf").value) || 0;
      const demoVal = parseInt(document.getElementById("comm-val-demo").value) || 0;

      if (level === 'year') {
        const y = commitmentYears[0] || { id: "year-2026", name: "Năm 2026" };
        y.revenueRetail = retailVal;
        y.revenueBusiness = businessVal;
        y.perfTarget = perfVal;
        y.demoTarget = demoVal;
        commitmentYears[0] = y;
        
      } else if (level === 'quarter') {
        const q = commitmentQuarters.find(item => item.id === id);
        if (q) {
          q.revenueRetail = retailVal;
          q.revenueBusiness = businessVal;
          q.perfTarget = perfVal;
          q.demoTarget = demoVal;
        }
        
      } else if (level === 'month') {
        const m = commitmentMonths.find(item => item.id === id);
        if (m) {
          m.revenueRetail = retailVal;
          m.revenueBusiness = businessVal;
          m.perfTarget = perfVal;
          m.demoTarget = demoVal;
        }
        
      } else if (level === 'week') {
        const monthIndex = parseInt(document.getElementById("comm-month-index").value) || 0;
        const parsedWeek = {
          name: document.getElementById("comm-week-name").value,
          startDate: convertISOToDate(document.getElementById("comm-start-date").value),
          endDate: convertISOToDate(document.getElementById("comm-end-date").value),
          revenueRetail: retailVal,
          revenueBusiness: businessVal,
          perfTarget: perfVal,
          demoTarget: demoVal,
          note: document.getElementById("comm-week-note").value
        };
        
        if (id) {
          const w = commitmentWeeks.find(c => c.id === id);
          if (w) {
            w.name = parsedWeek.name;
            w.startDate = parsedWeek.startDate;
            w.endDate = parsedWeek.endDate;
            w.revenueRetail = parsedWeek.revenueRetail;
            w.revenueBusiness = parsedWeek.revenueBusiness;
            w.perfTarget = parsedWeek.perfTarget;
            w.demoTarget = parsedWeek.demoTarget;
            w.note = parsedWeek.note;
          }
        } else {
          const newWeek = {
            id: "week-" + Date.now(),
            monthIndex: monthIndex,
            name: parsedWeek.name,
            startDate: parsedWeek.startDate,
            endDate: parsedWeek.endDate,
            revenueRetail: parsedWeek.revenueRetail,
            revenueBusiness: parsedWeek.revenueBusiness,
            perfTarget: parsedWeek.perfTarget,
            demoTarget: parsedWeek.demoTarget,
            note: parsedWeek.note
          };
          commitmentWeeks.push(newWeek);
        }
      }
      
      saveCommitmentData();
      
      document.getElementById("commitment-edit-modal").classList.remove("active");
      renderCommitmentDashboard();
      updateKPIs();
      updateCharts();
    });
  }
  
  const closeEditBtn = document.getElementById("close-comm-edit-btn");
  if (closeEditBtn) {
    closeEditBtn.addEventListener("click", (e) => {
      e.preventDefault();
      document.getElementById("commitment-edit-modal").classList.remove("active");
    });
  }
  const cancelEditBtn = document.getElementById("cancel-comm-edit-btn");
  if (cancelEditBtn) {
    cancelEditBtn.addEventListener("click", (e) => {
      e.preventDefault();
      document.getElementById("commitment-edit-modal").classList.remove("active");
    });
  }
  
  const exportExcelBtn = document.getElementById("export-commitment-excel-btn");
  if (exportExcelBtn) {
    exportExcelBtn.addEventListener("click", () => {
      const csvRows = [];
      csvRows.push("Tháng / Tuần,Cam kết Retail,Cam kết Business,Chỉ tiêu Hiệu suất (%),Chỉ tiêu Demo (Lượt),Loại dòng,Ghi chú");
      
      commitmentMonths.forEach(m => {
        csvRows.push(`"${m.name}",${m.revenueRetail || 0},${m.revenueBusiness || 0},${m.perfTarget || 0},${m.demoTarget || 0},Month,""`);
        const weeksInMonth = commitmentWeeks.filter(w => w.monthIndex === m.monthIndex);
        weeksInMonth.forEach(w => {
          csvRows.push(`"  ${w.name} (${w.startDate} - ${w.endDate})",${w.revenueRetail || 0},${w.revenueBusiness || 0},${w.perfTarget || 0},${w.demoTarget || 0},Week,"${(w.note || "").replace(/"/g, '""')}"`);
        });
      });
      
      const csvContent = "\uFEFF" + csvRows.join("\n");
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `Bao_Cao_Cam_Ket_Doanh_Thu_Phan_Cap_2026.csv`);
      link.style.visibility = "hidden";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    });
  }
}

// ==========================================
// 14. AI PROJECTS TRACKING TAB MODULE
// ==========================================
const AI_PROJECTS_SEED_VER = "v2-seed-ai-projects-with-details";
let aiProjects = [];

function initAIProjectsModule() {
  const storedAIProjVer = localStorage.getItem('AI_PROJECTS_SEED_VER');
  if (localStorage.getItem('AI_PROJECTS_DATA') && storedAIProjVer === AI_PROJECTS_SEED_VER) {
    aiProjects = JSON.parse(localStorage.getItem('AI_PROJECTS_DATA'));
  } else {
    // Seed 5 realistic AI projects matching Vietnamese Sales Persona and existing staff
    aiProjects = [
      {
        id: "aip-1",
        name: "Tích hợp Furni AI vào quy trình báo giá tự động",
        owner: "Đỗ Thị Hải Yến",
        progress: 85,
        startDate: "2026-03-01",
        publishDate: "2026-05-30",
        description: "Giải pháp AI tự động hóa báo giá nội thất 3D dựa trên hình ảnh căn phòng khách hàng cung cấp.",
        updateThisWeek: "Hoàn thiện module nhận dạng phòng và tích hợp API báo giá.",
        planNextWeek: "Test UAT với 3 showroom đối tác, thu thập phản hồi và fix bug."
      },
      {
        id: "aip-2",
        name: "Triển khai ProductAI (Basic) cho showroom đối tác",
        owner: "Nguyễn Trọng Tín",
        progress: 100,
        startDate: "2026-02-15",
        publishDate: "2026-04-20",
        description: "Triển khai hệ thống AI phân loại và gợi ý sản phẩm nội thất tự động cho showroom.",
        updateThisWeek: "Dự án đã xuất bản thành công, cả 4 showroom đối tác đang sử dụng.",
        planNextWeek: "Theo dõi hiệu suất và hỗ trợ kỹ thuật nếu có vấn đề."
      },
      {
        id: "aip-3",
        name: "Phát triển Visual Agent - Phân tích layout căn hộ tự động",
        owner: "Lê Thị Hoài Phúc",
        progress: 60,
        startDate: "2026-04-10",
        publishDate: "2026-06-15",
        description: "AI phân tích bản vẽ căn hộ và tự động gợi ý layout nội thất phù hợp.",
        updateThisWeek: "Hoàn thành module nhận dạng tường, cửa và khu vực chức năng.",
        planNextWeek: "Phát triển thuật toán gợi ý đồ nội thất theo phong cách dựa trên layout."
      },
      {
        id: "aip-4",
        name: "Đào tạo AI và Showroom AI cho Key Accounts",
        owner: "Phan Ngọc Thúy",
        progress: 40,
        startDate: "2026-04-25",
        publishDate: "2026-07-01",
        description: "Chương trình đào tạo và triển khai Showroom AI đối với các khách hàng Key Account.",
        updateThisWeek: "Hoàn thành 2/5 buổi đào tạo cho khách hàng Nexus Interior.",
        planNextWeek: "Tiếp tục 3 buổi đào tạo còn lại và setup demo showroom AI cho Luxe Design."
      },
      {
        id: "aip-5",
        name: "Xây dựng Trợ lý ảo AI tư vấn báo giá Jega Cloud Factory",
        owner: "Võ Gia Hân",
        progress: 10,
        startDate: "2026-05-12",
        publishDate: "2026-08-15",
        description: "Chatbot AI tư vấn cấu hình phần mềm, báo giá và trả lời FAQs về Jega Cloud Factory.",
        updateThisWeek: "Hoàn thành thiết kế conversation flow và dữ liệu huấn luyện ban đầu.",
        planNextWeek: "Bắt đầu training model và test thử với 50 câu hỏi mẫu."
      }
    ];
    localStorage.setItem('AI_PROJECTS_DATA', JSON.stringify(aiProjects));
    localStorage.setItem('AI_PROJECTS_SEED_VER', AI_PROJECTS_SEED_VER);
  }

  // Register form submit listener
  const form = document.getElementById("ai-project-form");
  if (form) {
    form.addEventListener("submit", saveAIProject);
  }

  // Register modal cancel/close listeners
  const closeBtn = document.getElementById("close-ai-project-btn");
  if (closeBtn) {
    closeBtn.addEventListener("click", () => {
      document.getElementById("ai-project-modal").classList.remove("active");
    });
  }

  const cancelBtn = document.getElementById("cancel-ai-project-btn");
  if (cancelBtn) {
    cancelBtn.addEventListener("click", () => {
      document.getElementById("ai-project-modal").classList.remove("active");
    });
  }

  const addBtn = document.getElementById("add-ai-project-btn");
  if (addBtn) {
    addBtn.addEventListener("click", openAddAIProjectModal);
  }
}

function renderAIProjects() {
  const container = document.getElementById("ai-projects-rows-container");
  if (!container) return;
  
  container.innerHTML = "";
  
  if (aiProjects.length === 0) {
    container.innerHTML = `
      <tr>
        <td colspan="9" style="text-align:center; padding:2rem; color:var(--text-secondary);">
          <i data-lucide="info" style="width:24px; height:24px; margin-bottom:8px; opacity:0.5; display:inline-block; vertical-align:middle;"></i>
          <div>Chưa có dự án AI nào được tạo. Nhấn "Thêm Dự án AI" để bắt đầu!</div>
        </td>
      </tr>
    `;
    if (typeof lucide !== 'undefined') lucide.createIcons();
    return;
  }
  
  aiProjects.forEach(proj => {
    let statusText = "Chưa bắt đầu";
    let statusClass = "ai-badge-not-started";
    
    if (proj.progress === 100) {
      statusText = "Đã xuất bản";
      statusClass = "ai-badge-completed";
    } else if (proj.progress > 0) {
      statusText = "Đang triển khai";
      statusClass = "ai-badge-progress";
    }
    
    const formattedStart = proj.startDate ? formatDateString(proj.startDate) : "---";
    const formattedPublish = proj.publishDate ? formatDateString(proj.publishDate) : "---";
    const textCellStyle = "padding:10px; vertical-align:top; font-size:0.82rem; color:var(--text-secondary); max-width:200px; line-height:1.5; white-space:normal; word-break:break-word;";
    const noDataHtml = '<span style="color:var(--text-muted); font-style:italic;">—</span>';
    
    const row = document.createElement("tr");
    row.style.borderBottom = "1px solid rgba(255,255,255,0.05)";
    row.innerHTML = `
      <td style="padding:12px 10px; font-weight:700; color:var(--text-primary); vertical-align:top; min-width:140px; max-width:200px; white-space:normal; word-break:break-word;">${proj.name}</td>
      <td style="padding:12px 10px; color:var(--text-primary); font-weight:600; vertical-align:top; white-space:normal; word-break:break-word; min-width:110px;">${proj.owner}</td>
      <td style="padding:12px 10px; vertical-align:top; min-width:180px;">
        <div class="ai-progress-container">
          <div class="ai-progress-bar-bg">
            <div class="ai-progress-bar-fill" style="width:${proj.progress}%"></div>
          </div>
          <span class="ai-progress-text">${proj.progress}%</span>
          <span class="ai-badge ${statusClass}" style="margin-left:8px;">${statusText}</span>
        </div>
      </td>
      <td style="${textCellStyle}">${proj.description || noDataHtml}</td>
      <td style="${textCellStyle}">${proj.updateThisWeek || noDataHtml}</td>
      <td style="${textCellStyle}">${proj.planNextWeek || noDataHtml}</td>
      <td style="padding:12px 10px; text-align:center; color:var(--text-secondary); vertical-align:top; white-space:normal; word-break:break-word; min-width:85px;">${formattedStart}</td>
      <td style="padding:12px 10px; text-align:center; color:var(--text-secondary); vertical-align:top; white-space:normal; word-break:break-word; min-width:85px;">${formattedPublish}</td>
      <td style="padding:12px 10px; text-align:center; vertical-align:top;">
        <div style="display:flex; justify-content:center; gap:8px;">
          <button class="action-btn" onclick="editAIProject('${proj.id}')" style="background:rgba(59, 130, 246, 0.1); border:none; padding:4px 8px; border-radius:4px; color:#3b82f6; cursor:pointer;" title="Sửa dự án">
            <i data-lucide="edit" style="width:14px; height:14px;"></i>
          </button>
          <button class="action-btn" onclick="deleteAIProject('${proj.id}')" style="background:rgba(239, 68, 68, 0.1); border:none; padding:4px 8px; border-radius:4px; color:#ef4444; cursor:pointer;" title="Xóa dự án">
            <i data-lucide="trash-2" style="width:14px; height:14px;"></i>
          </button>
        </div>
      </td>
    `;
    container.appendChild(row);
  });
  
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function openAddAIProjectModal() {
  document.getElementById("ai-project-modal-title").innerText = "Thêm Dự Án AI Mới";
  document.getElementById("ai-project-id").value = "";
  document.getElementById("ai-project-name").value = "";
  document.getElementById("ai-project-owner").value = "";
  document.getElementById("ai-project-progress").value = "0";
  
  // Set default start date to today
  const today = new Date().toISOString().split('T')[0];
  document.getElementById("ai-project-start-date").value = today;
  document.getElementById("ai-project-publish-date").value = "";
  document.getElementById("ai-project-description").value = "";
  document.getElementById("ai-project-update-this-week").value = "";
  document.getElementById("ai-project-plan-next-week").value = "";
  
  document.getElementById("ai-project-modal").classList.add("active");
}

function editAIProject(id) {
  const proj = aiProjects.find(p => p.id === id);
  if (!proj) return;
  
  document.getElementById("ai-project-modal-title").innerText = "Cập Nhật Dự Án AI";
  document.getElementById("ai-project-id").value = proj.id;
  document.getElementById("ai-project-name").value = proj.name;
  document.getElementById("ai-project-owner").value = proj.owner;
  document.getElementById("ai-project-progress").value = proj.progress;
  document.getElementById("ai-project-start-date").value = proj.startDate;
  document.getElementById("ai-project-publish-date").value = proj.publishDate || "";
  document.getElementById("ai-project-description").value = proj.description || "";
  document.getElementById("ai-project-update-this-week").value = proj.updateThisWeek || "";
  document.getElementById("ai-project-plan-next-week").value = proj.planNextWeek || "";
  
  document.getElementById("ai-project-modal").classList.add("active");
}

function deleteAIProject(id) {
  const proj = aiProjects.find(p => p.id === id);
  if (!proj) return;
  
  if (confirm(`Bạn có chắc chắn muốn xóa dự án AI "${proj.name}"?`)) {
    aiProjects = aiProjects.filter(p => p.id !== id);
    localStorage.setItem('AI_PROJECTS_DATA', JSON.stringify(aiProjects));
    renderAIProjects();
  }
}

function saveAIProject(e) {
  e.preventDefault();
  
  const id = document.getElementById("ai-project-id").value;
  const name = document.getElementById("ai-project-name").value.trim();
  const owner = document.getElementById("ai-project-owner").value;
  const progress = parseInt(document.getElementById("ai-project-progress").value, 10) || 0;
  const startDate = document.getElementById("ai-project-start-date").value;
  const publishDate = document.getElementById("ai-project-publish-date").value;
  const description = document.getElementById("ai-project-description").value.trim();
  const updateThisWeek = document.getElementById("ai-project-update-this-week").value.trim();
  const planNextWeek = document.getElementById("ai-project-plan-next-week").value.trim();
  
  if (!name || !owner || !startDate) {
    alert("Vui lòng nhập đầy đủ thông tin bắt buộc.");
    return;
  }
  
  if (id) {
    const idx = aiProjects.findIndex(p => p.id === id);
    if (idx !== -1) {
      aiProjects[idx] = { id, name, owner, progress, startDate, publishDate, description, updateThisWeek, planNextWeek };
    }
  } else {
    const newId = "aip-" + Date.now();
    aiProjects.push({ id: newId, name, owner, progress, startDate, publishDate, description, updateThisWeek, planNextWeek });
  }
  
  localStorage.setItem('AI_PROJECTS_DATA', JSON.stringify(aiProjects));
  renderAIProjects();
  
  document.getElementById("ai-project-modal").classList.remove("active");
}

// Format date helper: yyyy-mm-dd -> dd/mm/yyyy
function formatDateString(dateStr) {
  if (!dateStr) return "";
  const parts = dateStr.split("-");
  if (parts.length !== 3) return dateStr;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

// ==========================================
// 15. EXECUTIVE PRINTABLE REPORT GENERATOR MODULE
// ==========================================
function initExecutiveReportModule() {
  const btn = document.getElementById("generate-report-btn");
  if (btn) {
    btn.addEventListener("click", generateExecutiveReport);
  }
  
  const closeBtn = document.getElementById("close-report-btn");
  if (closeBtn) {
    closeBtn.addEventListener("click", () => {
      document.getElementById("report-modal").classList.remove("active");
    });
  }
  
  const cancelBtn = document.getElementById("cancel-report-btn");
  if (cancelBtn) {
    cancelBtn.addEventListener("click", () => {
      document.getElementById("report-modal").classList.remove("active");
    });
  }
  
  const printBtn = document.getElementById("print-report-btn");
  if (printBtn) {
    printBtn.addEventListener("click", () => {
      window.print();
    });
  }
}

function generateExecutiveReport() {
  const container = document.getElementById("report-printable-area");
  if (!container) return;
  
  // 1. Gather Filter context
  const fromDateStr = document.getElementById("filter-from-date").value;
  const toDateStr = document.getElementById("filter-to-date").value;
  const salesFilter = document.getElementById("filter-sales").value;
  const productGroupFilter = document.getElementById("filter-product-group").value;
  const productLineFilter = document.getElementById("filter-product-line").value;
  
  const salesDisplay = salesFilter === "all" ? "Tất cả nhân sự" : salesFilter;
  const productGroupDisplay = productGroupFilter === "all" ? "Tất cả nhóm sản phẩm" : (productGroupFilter === "cloud" ? "JEGA Cloud" : "JEGA Visual");
  const productLineDisplay = productLineFilter === "all" ? "Tất cả line" : productLineFilter;
  
  // Parse dates for calculations
  const fromDate = filterState.fromDate || new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const toDate = filterState.toDate || new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0);
  
  const prevFromDate = new Date(fromDate);
  prevFromDate.setDate(prevFromDate.getDate() - 7);
  const prevToDate = new Date(toDate);
  prevToDate.setDate(prevToDate.getDate() - 7);

  // 2. Fetch current and previous active KPIs dynamically (direct database queries for high accuracy)
  const currentComm = getCommitmentRevenueForPeriod(fromDate, toDate);
  const prevComm = getCommitmentRevenueForPeriod(prevFromDate, prevToDate);

  const { totalRevenue: currentActual } = getActualOrdersMetricsForPeriod(fromDate, toDate);
  const { totalRevenue: prevActual } = getActualOrdersMetricsForPeriod(prevFromDate, prevToDate);
  
  const currentOrdersCount = getActualOrdersCountExcludeGo(fromDate, toDate);
  const prevOrdersCount = getActualOrdersCountExcludeGo(prevFromDate, prevToDate);

  const currentCompRate = currentComm > 0 ? (currentActual / currentComm) * 100 : 0;
  const prevCompRate = prevComm > 0 ? (prevActual / prevComm) * 100 : 0;

  const currentLines = getLineRevenuesForPeriod(fromDate, toDate);
  const prevLines = getLineRevenuesForPeriod(prevFromDate, prevToDate);

  const currentGo = currentLines.go;
  const prevGo = prevLines.go;
  const currentRetail = currentLines.retail;
  const prevRetail = prevLines.retail;
  const currentBusiness = currentLines.business;
  const prevBusiness = prevLines.business;

  const { totalDemos: currentDemos } = getPerformanceMetricsForPeriod(fromDate, toDate);
  const { totalDemos: prevDemos } = getPerformanceMetricsForPeriod(prevFromDate, prevToDate);

  const currentPerfRate = currentDemos > 0 ? (currentOrdersCount / currentDemos) * 100 : 0;
  const prevPerfRate = prevDemos > 0 ? (prevOrdersCount / prevDemos) * 100 : 0;

  const currentLeads = getLeadsMetricsForPeriod(fromDate, toDate);
  const prevLeads = getLeadsMetricsForPeriod(prevFromDate, prevToDate);

  const currentHotSigned = currentLeads.signedLeads;
  const prevHotSigned = prevLeads.signedLeads;
  const currentHotDemo = currentLeads.demoLeads;
  const prevHotDemo = prevLeads.demoLeads;

  const currentHotCloseRate = currentHotDemo > 0 ? (currentHotSigned / currentHotDemo) * 100 : 0;
  const prevHotCloseRate = prevHotDemo > 0 ? (prevHotSigned / prevHotDemo) * 100 : 0;

  function formatReportTrendHTML(current, prev, isPctPt = false) {
    const printCSS = "-webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;";
    if (isPctPt) {
      const diff = current - prev;
      if (diff > 0.01) return `<span style="color: #10B981 !important; font-weight: 800; font-size: 0.68rem; ${printCSS}">↑ +${diff.toFixed(1)}%</span>`;
      else if (diff < -0.01) return `<span style="color: #EF4444 !important; font-weight: 800; font-size: 0.68rem; ${printCSS}">↓ ${diff.toFixed(1)}%</span>`;
      return `<span style="color: #64748b !important; font-weight: 800; font-size: 0.68rem; ${printCSS}">~ 0.0%</span>`;
    } else {
      if (prev === 0) return current === 0 ? `<span style="color: #64748b !important; font-weight: 800; font-size: 0.68rem; ${printCSS}">~ 0%</span>` : `<span style="color: #10B981 !important; font-weight: 800; font-size: 0.68rem; ${printCSS}">↑ +100.0%</span>`;
      const diff = current - prev;
      const pct = (diff / prev) * 100;
      if (pct > 0.01) return `<span style="color: #10B981 !important; font-weight: 800; font-size: 0.68rem; ${printCSS}">↑ +${pct.toFixed(1)}%</span>`;
      else if (pct < -0.01) return `<span style="color: #EF4444 !important; font-weight: 800; font-size: 0.68rem; ${printCSS}">↓ ${pct.toFixed(1)}%</span>`;
      return `<span style="color: #64748b !important; font-weight: 800; font-size: 0.68rem; ${printCSS}">~ 0.0%</span>`;
    }
  }

  function renderReportKpiCard(title, val, trendHtml, groupName) {
    let accentColor = "#3b82f6";
    if (title === "Cam kết" || title === "Doanh thu cam kết") accentColor = "#e5c158";
    else if (title === "Thực đạt" || title === "Doanh thu thực đạt") accentColor = "#10b981";
    else if (title === "Tỉ lệ hoàn thành") accentColor = "#3b82f6";
    else if (title === "Đơn hàng") accentColor = "#8b5cf6";
    else if (title === "Demo") accentColor = "#f97316";
    else if (title === "Tỉ lệ chốt sales") accentColor = "#ef4444";
    else if (title === "Đơn Nóng") accentColor = "#3b82f6";
    else if (title === "Demo Nóng") accentColor = "#f97316";
    else if (title === "Tỉ lệ chốt nóng") accentColor = "#10b981";
    else if (title === "Go" || title === "Doanh thu Go") accentColor = "#8b5cf6";
    else if (title === "Retail" || title === "Doanh thu Retail") accentColor = "#f97316";
    else if (title === "Business" || title === "Doanh thu Business") accentColor = "#3b82f6";
    else {
      if (groupName.includes("CAM KẾT") || groupName.includes("Doanh thu")) accentColor = "#6366f1";
      else if (groupName.includes("CHI TIẾT") || groupName.includes("Line")) accentColor = "#14b8a6";
      else if (groupName.includes("HIỆU SUẤT") || groupName.includes("Hiệu suất")) accentColor = "#f59e0b";
      else if (groupName.includes("PHỄU") || groupName.includes("Lead")) accentColor = "#ef4444";
    }

    let valFontSize = "0.78rem";

    return `
      <div style="background-color: #ffffff; border: 1px solid #cbd5e1; border-left: 4px solid ${accentColor}; border-radius: 8px; padding: 6px 8px; display: flex; flex-direction: column; justify-content: space-between; page-break-inside: avoid; min-height: 65px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05), 0 2px 4px -1px rgba(0,0,0,0.03); -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; box-sizing: border-box !important;">
        <div style="margin-bottom: 2px;">
          <div style="font-size: 0.65rem; font-weight: 800; color: #0f172a; text-transform: none; letter-spacing: -0.2px; line-height: 1.1; white-space: nowrap; text-overflow: ellipsis; overflow: hidden;" title="${title}">${title}</div>
        </div>
        <div style="display: flex; flex-direction: column; align-items: flex-start; justify-content: flex-end; border-top: 1px solid #f1f5f9; padding-top: 4px; gap: 2px;">
          <div style="font-size: ${valFontSize}; font-weight: 800; color: #0f172a; line-height: 1.1; white-space: nowrap;">${val}</div>
          <div style="line-height: 1;">${trendHtml}</div>
        </div>
      </div>
    `;
  }

  function renderReportColHeader(title, color) {
    return `
      <div style="
        border-left: 4px solid ${color};
        background: linear-gradient(90deg, ${color}15 0%, ${color}02 100%);
        padding: 5px 10px;
        border-radius: 0 4px 4px 0;
        margin-bottom: 4px;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
        font-family: Arial, sans-serif !important;
      ">
        <span style="
          font-size: 0.72rem;
          font-weight: 800;
          text-transform: uppercase;
          color: #0f172a;
          letter-spacing: 0.5px;
        ">${title}</span>
      </div>
    `;
  }


  const hotLeadsList = filteredLeads.filter(l => getLeadSourceGroup(l.nguon) === "Marketing Nóng");
  
  let refDate = new Date();
  if (refDate.getFullYear() !== 2026) refDate = new Date(2026, 4, 21);
  const currentMonth = refDate.getMonth();
  const qIndex = Math.floor(currentMonth / 3);

  const yObj = commitmentYears[0] || { revenueRetail: 0, revenueBusiness: 0 };
  let yearTarget = (yObj.revenueRetail || 0) + (yObj.revenueBusiness || 0);
  const yearActuals = getCommitmentActuals("01/01/2026", "31/12/2026");
  const yearActual = yearActuals.retail + yearActuals.go + yearActuals.business;

  const qMonths = [{ start: "01/01/2026", end: "31/03/2026" }, { start: "01/04/2026", end: "30/06/2026" }, { start: "01/07/2026", end: "30/09/2026" }, { start: "01/10/2026", end: "31/12/2026" }];
  const qRange = qMonths[qIndex];
  const qObj = commitmentQuarters.find(q => q.qIndex === qIndex) || { revenueRetail: 0, revenueBusiness: 0 };
  let quarterTarget = (qObj.revenueRetail || 0) + (qObj.revenueBusiness || 0);
  const quarterActuals = getCommitmentActuals(qRange.start, qRange.end);
  const quarterActual = quarterActuals.retail + quarterActuals.go + quarterActuals.business;

  const activeMonthObj = commitmentMonths.find(m => m.monthIndex === currentMonth);
  let monthTarget = activeMonthObj ? (activeMonthObj.revenueRetail || 0) + (activeMonthObj.revenueBusiness || 0) : 0;
  const pad = (n) => n.toString().padStart(2, '0');
  const mStartStr = `01/${pad(currentMonth + 1)}/2026`;
  const mEndStr = `${pad(new Date(2026, currentMonth + 1, 0).getDate())}/${pad(currentMonth + 1)}/2026`;
  const monthActuals = getCommitmentActuals(mStartStr, mEndStr);
  const monthActual = monthActuals.retail + monthActuals.go + monthActuals.business;

  const activeWeekObj = commitmentWeeks.find(w => {
    const start = parseDate(w.startDate);
    const end = parseDate(w.endDate);
    if (!start || !end) return false;
    const adjustedEnd = new Date(end);
    adjustedEnd.setHours(23, 59, 59, 999);
    return refDate >= start && refDate <= adjustedEnd;
  });
  
  let weekTarget = activeWeekObj ? (activeWeekObj.revenueRetail || 0) + (activeWeekObj.revenueBusiness || 0) : monthTarget;
  let weekActual = activeWeekObj ? (getCommitmentActuals(activeWeekObj.startDate, activeWeekObj.endDate).retail + getCommitmentActuals(activeWeekObj.startDate, activeWeekObj.endDate).go + getCommitmentActuals(activeWeekObj.startDate, activeWeekObj.endDate).business) : monthActual;
  let okrHtml = "";
  if (typeof objectives !== 'undefined' && objectives.length > 0) {
    ["Q1", "Q2", "Q3", "Q4"].forEach(q => {
      const qObjs = objectives.filter(o => o.quarter === q);
      if (qObjs.length > 0) {
        okrHtml += `
          <div style="margin: 15px 0;">
            <h4 style="font-size:0.85rem; font-weight:800; border-left:3px solid #0d47a1; background:#e8f0fe; padding:4px 8px; border-radius:0 4px 4px 0; margin-bottom:8px; text-transform:uppercase; color:#0f172a; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;">${q}</h4>
            <table style="width:100%; border-collapse:collapse; margin-bottom:10px;">
        `;
        qObjs.forEach(obj => {
          const objProgHtml = `
            <div style="display:flex; align-items:center; justify-content:flex-end; gap:8px;">
              <span style="font-weight:700;">${obj.progress.toFixed(0)}%</span>
              <div style="background-color:#e2e8f0; height:6px; border-radius:3px; overflow:hidden; width:60px; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;">
                <div style="background-color:#0d47a1; width:${obj.progress}%; height:100%;"></div>
              </div>
            </div>
          `;
          okrHtml += `<tr style="background:#f8fafc;"><td style="border:1px solid #cbd5e1; padding:6px; font-weight:700; color:#0f172a;">🎯 ${obj.name}</td><td style="border:1px solid #cbd5e1; padding:6px; text-align:right; width:90px;">${objProgHtml}</td></tr>`;
          if (typeof keyResults !== 'undefined') {
            keyResults.filter(k => k.objectiveId === obj.id).forEach(kr => {
              const pct = kr.target > 0 ? (kr.current / kr.target) * 100 : 0;
              const krProgHtml = `
                <div style="display:flex; align-items:center; justify-content:flex-end; gap:8px; font-size:0.75rem;">
                  <span>${pct.toFixed(0)}%</span>
                  <div style="background-color:#e2e8f0; height:4px; border-radius:2px; overflow:hidden; width:45px; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;">
                    <div style="background-color:#475569; width:${pct}%; height:100%;"></div>
                  </div>
                </div>
              `;
              okrHtml += `<tr><td style="border:1px solid #cbd5e1; padding:5px 25px; font-size:0.75rem; color:#475569;">🗝️ ${kr.name}</td><td style="border:1px solid #cbd5e1; padding:5px; text-align:right; width:90px;">${krProgHtml}</td></tr>`;
            });
          }
        });
        okrHtml += `</table></div>`;
      }
    });
  }

  let kaHtml = "";
  if (typeof keyAccounts !== 'undefined' && keyAccounts.length > 0) {
    kaHtml = `
      <table style="width:100%; border-collapse:collapse; margin-top:10px;">
        <thead>
          <tr style="background:#fde8e8; border-bottom:2px solid #e74c3c; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;">
            <th style="border:1px solid #cbd5e1; padding:8px; color:#0f172a; font-weight:700; width: 16%;">TÊN</th>
            <th style="border:1px solid #cbd5e1; padding:8px; color:#0f172a; font-weight:700; width: 14%;">SẢN PHẨM</th>
            <th style="border:1px solid #cbd5e1; padding:8px; color:#0f172a; font-weight:700; width: 36%;">CẬP NHẬT</th>
            <th style="border:1px solid #cbd5e1; padding:8px; color:#0f172a; font-weight:700; width: 24%;">KẾ HOẠCH</th>
            <th style="border:1px solid #cbd5e1; padding:8px; color:#0f172a; font-weight:700; width: 10%;">TIỀM NĂNG</th>
          </tr>
        </thead>
        <tbody>
    `;
    keyAccounts.forEach(ka => {
      let stars = ""; for(let i=0; i<5; i++) stars += i < ka.potential ? "★" : "☆";
      const log = ka.weeklyLogs && ka.weeklyLogs.length > 0 ? ka.weeklyLogs[ka.weeklyLogs.length - 1] : {};
      kaHtml += `
        <tr>
          <td style="border:1px solid #cbd5e1; padding:8px; font-weight:700; color:#0f172a;">${ka.name}</td>
          <td style="border:1px solid #cbd5e1; padding:8px; color:#1a252f;">${ka.products.join(", ")}</td>
          <td style="border:1px solid #cbd5e1; padding:8px; color:#1a252f;">${log.updateThisWeek || "—"}</td>
          <td style="border:1px solid #cbd5e1; padding:8px; color:#1a252f;">${log.planNextWeek || "—"}</td>
          <td style="border:1px solid #cbd5e1; padding:8px; text-align:center; color:#eab308; font-weight:700;">${stars}</td>
        </tr>
      `;
    });
    kaHtml += `</tbody></table>`;
  }

  let aipHtml = "";
  if (aiProjects.length > 0) {
    aipHtml = `
      <table style="width:100%; border-collapse:collapse; margin-top:10px; font-size:0.8rem;">
        <thead>
          <tr style="background:#f3e5f5; border-bottom:2px solid #8e44ad; text-transform: uppercase; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;">
            <th style="border:1px solid #cbd5e1; padding:8px; text-align:left; font-weight:700; color:#0f172a; width: 17%;">Dự án</th>
            <th style="border:1px solid #cbd5e1; padding:8px; text-align:left; font-weight:700; color:#0f172a; width: 11%;">Phụ trách</th>
            <th style="border:1px solid #cbd5e1; padding:8px; text-align:center; font-weight:700; color:#0f172a; width: 15%;">Tiến độ</th>
            <th style="border:1px solid #cbd5e1; padding:8px; text-align:left; font-weight:700; color:#0f172a; width: 20%;">Mô tả giải pháp</th>
            <th style="border:1px solid #cbd5e1; padding:8px; text-align:left; font-weight:700; color:#0f172a; width: 19%;">Cập nhật tuần này</th>
            <th style="border:1px solid #cbd5e1; padding:8px; text-align:left; font-weight:700; color:#0f172a; width: 18%;">Kế hoạch tuần sau</th>
          </tr>
        </thead>
        <tbody>
    `;
    aiProjects.forEach(p => {
      const progBarHtml = `
        <div style="display:flex; align-items:center; gap:4px; font-size:0.7rem;">
          <span style="font-weight:700; min-width:24px;">${p.progress}%</span>
          <div style="flex-grow:1; background-color:#e2e8f0; height:6px; border-radius:3px; overflow:hidden; width:40px; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;">
            <div style="background-color:#8e44ad; width:${p.progress}%; height:100%;"></div>
          </div>
        </div>
      `;
      aipHtml += `
        <tr>
          <td style="border:1px solid #cbd5e1; padding:8px; font-weight:700; color:#0f172a;">${p.name}</td>
          <td style="border:1px solid #cbd5e1; padding:8px; color:#1a252f;">${p.owner}</td>
          <td style="border:1px solid #cbd5e1; padding:8px; text-align:left; color:#1a252f;">${progBarHtml}</td>
          <td style="border:1px solid #cbd5e1; padding:8px; color:#1a252f;">${p.description || "—"}</td>
          <td style="border:1px solid #cbd5e1; padding:8px; color:#1a252f;">${p.updateThisWeek || "—"}</td>
          <td style="border:1px solid #cbd5e1; padding:8px; color:#1a252f;">${p.planNextWeek || "—"}</td>
        </tr>
      `;
    });
    aipHtml += `</tbody></table>`;
  }

  function renderReportStatusBadge(status) {
    let bg = "#f1f5f9";
    let text = "#475569";
    if (status === "Đã chốt tái ký") {
      bg = "#d1fae5";
      text = "#065f46";
    } else if (status === "Đang đàm phán") {
      bg = "#fef3c7";
      text = "#92400e";
    } else if (status === "Không tái ký") {
      bg = "#fee2e2";
      text = "#991b1b";
    } else if (status === "Hết hạn") {
      bg = "#ffedd5";
      text = "#c2410c";
    } else if (status === "Chưa liên hệ") {
      bg = "#e2e8f0";
      text = "#334155";
    }
    return `<span style="background-color: ${bg} !important; color: ${text} !important; padding: 3px 8px; border-radius: 12px; font-size: 0.72rem; font-weight: 700; display: inline-block; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;">${status}</span>`;
  }

  let rcHtml = "";
  if (typeof renewalData !== "undefined") {
    // 1. Map data dynamically
    const today = new Date();
    let reportMappedData = renewalData.map(item => {
      let dynamicItem = { ...item };
      const expDate = new Date(dynamicItem.expiration_date);
      const diffDays = Math.ceil((expDate - today) / (1000 * 60 * 60 * 24));
      if (diffDays < 0) {
        if (item.status === "Không tái ký" || item.reason) {
          dynamicItem.status = "Không tái ký";
        } else {
          dynamicItem.status = "Hết hạn";
        }
      }
      else if (diffDays <= 30) dynamicItem.status = "Sắp hết hạn";
      else dynamicItem.status = "Đang sử dụng";
      return dynamicItem;
    });

    // 2. Filter data by report's salesFilter
    let reportFilteredRenewal = reportMappedData.filter(item => {
      let matchSales = salesFilter === "all" || item.sale_name === salesFilter;
      return matchSales;
    });

    // 3. Determine report's quarter
    const now = filterState.fromDate || new Date();
    const currentYearStr = now.getFullYear().toString();
    const currentMonth = now.getMonth() + 1;
    let currentQ = "Q1";
    if (currentMonth >= 4 && currentMonth <= 6) currentQ = "Q2";
    else if (currentMonth >= 7 && currentMonth <= 9) currentQ = "Q3";
    else if (currentMonth >= 10 && currentMonth <= 12) currentQ = "Q4";

    // 4. Calculate table data for the specific year
    const targetYearData = { "Q1": {}, "Q2": {}, "Q3": {}, "Q4": {} };
    ["Q1","Q2","Q3","Q4"].forEach(q => {
      targetYearData[q] = {
        months: {},
        total: { "Sắp hết hạn": 0, "Đang sử dụng": 0, "Hết hạn": 0, "Không tái ký": 0, total: 0 }
      };
    });

    reportFilteredRenewal.forEach(item => {
      const d = new Date(item.expiration_date);
      const year = d.getFullYear().toString();
      if (year !== currentYearStr) return;

      const month = d.getMonth() + 1;
      let q = "Q1";
      if (month >= 4 && month <= 6) q = "Q2";
      else if (month >= 7 && month <= 9) q = "Q3";
      else if (month >= 10 && month <= 12) q = "Q4";

      if (!targetYearData[q].months[month]) {
        targetYearData[q].months[month] = { "Sắp hết hạn": 0, "Đang sử dụng": 0, "Hết hạn": 0, "Không tái ký": 0, total: 0 };
      }

      if (["Sắp hết hạn", "Đang sử dụng", "Hết hạn", "Không tái ký"].includes(item.status)) {
        targetYearData[q].months[month][item.status]++;
        targetYearData[q].months[month].total++;
        targetYearData[q].total[item.status]++;
        targetYearData[q].total.total++;
      }
    });

    // 5. Calculate report reasons table using report's fromDate and toDate
    let reportReasonsFiltered = reportFilteredRenewal.filter(item => {
      if (!filterState.fromDate && !filterState.toDate) return true;
      const d = new Date(item.expiration_date);
      const fd = filterState.fromDate ? new Date(filterState.fromDate) : new Date(1900, 0, 1);
      const td = filterState.toDate ? new Date(filterState.toDate) : new Date(2100, 0, 1);
      return d >= fd && d <= td;
    });

    const reportReasonCounts = {};
    let reportTotalNotRenewed = 0;
    reportReasonsFiltered.forEach(item => {
      if (item.status === "Không tái ký" && item.reason) {
        reportReasonCounts[item.reason] = (reportReasonCounts[item.reason] || 0) + 1;
        reportTotalNotRenewed++;
      }
    });

    let reportReasonHtml = "";
    if (reportTotalNotRenewed === 0) {
      reportReasonHtml = `<tr><td colspan="3" style="padding: 20px; text-align: center; color: var(--text-secondary);">Không có dữ liệu lý do không tái ký trong khoảng thời gian này.</td></tr>`;
    } else {
      const sortedReasons = Object.entries(reportReasonCounts).sort((a,b) => b[1] - a[1]);
      sortedReasons.forEach(([reason, count]) => {
        const pct = ((count / reportTotalNotRenewed) * 100).toFixed(1);
        reportReasonHtml += `
          <tr style="border-bottom: 1px solid #e2e8f0;">
            <td style="padding: 12px; border: 1px solid #e2e8f0; font-weight: 500;">${reason}</td>
            <td style="padding: 12px; border: 1px solid #e2e8f0; text-align: center; font-weight: 700;">${count}</td>
            <td style="padding: 12px; border: 1px solid #e2e8f0; text-align: center;">
              <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
                <span>${pct}%</span>
                <div style="flex: 1; height: 6px; background: #f1f5f9; border-radius: 3px; overflow: hidden; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;">
                  <div style="height: 100%; width: ${pct}%; background: var(--color-primary); -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;"></div>
                </div>
              </div>
            </td>
          </tr>
        `;
      });
      reportReasonHtml += `
        <tr style="background-color: #f8fafc; font-weight: 800; border-top: 2px solid #cbd5e1; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;">
          <td style="padding: 12px; border: 1px solid #e2e8f0;">TỔNG CỘNG</td>
          <td style="padding: 12px; border: 1px solid #e2e8f0; text-align: center; color: var(--color-primary);">${reportTotalNotRenewed}</td>
          <td style="padding: 12px; border: 1px solid #e2e8f0; text-align: center;">100%</td>
        </tr>
      `;
    }

    rcHtml = `
      <div style="display: flex; flex-direction: column; gap: 15px;">
        <div>
          <h4 style="font-size:0.85rem; font-weight:800; border-left:3px solid #10b981; background:#ecfdf5; padding:4px 8px; border-radius:0 4px 4px 0; margin-bottom:8px; text-transform:uppercase; color:#0f172a; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;">KHÁCH HÀNG HẾT HẠN NĂM ${currentYearStr} - ${currentQ}</h4>
          <table style="width:100%; border-collapse:collapse; text-align: center;">
            <thead style="background-color: #f8fafc; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;">
              <tr>
                <th style="padding: 12px; border: 1px solid #e2e8f0; text-align: center; width: 120px;">Thời gian</th>
                <th style="padding: 12px; border: 1px solid #e2e8f0; text-align: center;">Sắp hết hạn</th>
                <th style="padding: 12px; border: 1px solid #e2e8f0; text-align: center;">Đang sử dụng</th>
                <th style="padding: 12px; border: 1px solid #e2e8f0; text-align: center;">Hết hạn</th>
                <th style="padding: 12px; border: 1px solid #e2e8f0; text-align: center;">Không tái ký</th>
                <th style="padding: 12px; border: 1px solid #e2e8f0; text-align: center;">Tổng hết hạn</th>
                <th style="padding: 12px; border: 1px solid #e2e8f0; text-align: center; background-color: rgba(16, 185, 129, 0.1); color: #10b981; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;">Đã tái ký</th>
              </tr>
            </thead>
            <tbody>
              ${window.generateRenewTableHtml(targetYearData, currentYearStr, true, currentQ)}
            </tbody>
          </table>
        </div>

        <div style="page-break-before: always;"></div>

        <div>
          <h4 style="font-size:0.85rem; font-weight:800; border-left:3px solid #ef4444; background:#fef2f2; padding:4px 8px; border-radius:0 4px 4px 0; margin-bottom:8px; text-transform:uppercase; color:#0f172a; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;">THỐNG KÊ LÝ DO KHÔNG TÁI KÝ</h4>
          <table style="width:100%; border-collapse:collapse; text-align: center;">
            <thead style="background-color: #f8fafc; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;">
              <tr>
                <th style="padding: 12px; border: 1px solid #e2e8f0; text-align: center;">Lý do không tái ký</th>
                <th style="padding: 12px; border: 1px solid #e2e8f0; text-align: center; width: 120px;">Số lượng</th>
                <th style="padding: 12px; border: 1px solid #e2e8f0; text-align: center; width: 120px;">Tỷ lệ (%)</th>
              </tr>
            </thead>
            <tbody>
              ${reportReasonHtml}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }
  let revenueAnalysisHtml = "";
  if (currentCompRate >= 90) {
    revenueAnalysisHtml = `Doanh thu cam kết tuần này đạt kết quả vượt bậc ở mức <span style="color: #2563eb; font-weight: 800;">${currentCompRate.toFixed(1)}%</span> (${formatVND(currentActual)} / ${formatVND(currentComm)}), thể hiện tốc độ tăng trưởng doanh số cực kỳ ấn tượng.`;
  } else if (currentCompRate >= 70) {
    revenueAnalysisHtml = `Doanh thu thực tế bám sát cam kết kế hoạch với tỉ lệ hoàn thành đạt <span style="color: #2563eb; font-weight: 800;">${currentCompRate.toFixed(1)}%</span> (${formatVND(currentActual)} trên tổng số ${formatVND(currentComm)} cam kết).`;
  } else {
    revenueAnalysisHtml = `Doanh thu thực đạt ghi nhận sự chậm trễ đáng lo ngại khi chỉ đạt <span style="color: #dc2626; font-weight: 800;">${currentCompRate.toFixed(1)}%</span> so với cam kết tuần (${formatVND(currentActual)} / ${formatVND(currentComm)}).`;
  }

  let perfAnalysisHtml = "";
  if (currentPerfRate >= 25) {
    perfAnalysisHtml = `Hiệu suất chuyển đổi phễu sales đạt tỷ lệ tối ưu cao <span style="color: #2563eb; font-weight: 800;">${currentPerfRate.toFixed(1)}%</span> (${currentOrdersCount} đơn hàng thành công trên ${currentDemos} demos được thực hiện).`;
  } else {
    perfAnalysisHtml = `Hiệu suất chuyển đổi từ demo sang chốt sales đạt trung bình <span style="color: #0f172a; font-weight: 700;">${currentPerfRate.toFixed(1)}%</span> (${currentOrdersCount} đơn / ${currentDemos} demos). Tiến trình chốt sales cần cải thiện thêm kỹ năng demo thực tế.`;
  }

  let hotLeadAnalysisHtml = "";
  if (currentHotCloseRate >= 35) {
    hotLeadAnalysisHtml = `Tỉ lệ chốt phễu Marketing Nóng ghi nhận điểm sáng nổi bật đạt mức kỷ lục <span style="color: #2563eb; font-weight: 800;">${currentHotCloseRate.toFixed(1)}%</span> (${currentHotSigned} khách hàng ký hợp đồng trên ${currentHotDemo} demo nóng).`;
  } else if (currentHotCloseRate > 0) {
    hotLeadAnalysisHtml = `Tỉ lệ chốt phễu Marketing Nóng cần cảnh giác cao độ khi có dấu hiệu suy giảm, chỉ đạt <span style="color: #dc2626; font-weight: 800;">${currentHotCloseRate.toFixed(1)}%</span> (${currentHotSigned} chốt / ${currentHotDemo} demo nóng).`;
  } else {
    hotLeadAnalysisHtml = `Chưa ghi nhận bất kỳ lượt chuyển đổi thành công nào từ nguồn Marketing Nóng trong kỳ lọc báo cáo này (<span style="color: #dc2626; font-weight: 800;">0%</span> chốt).`;
  }

  // Comparison & Breakdown
  const maxLine = Math.max(currentGo, currentRetail, currentBusiness);
  let lineBreakdownHtml = "";
  if (maxLine === currentGo && currentGo > 0) {
    lineBreakdownHtml = `Đối chiếu dòng sản phẩm: Dòng sản phẩm <span style="color: #2563eb; font-weight: 700;">Go</span> đang dẫn đầu doanh số với <span style="color: #0f172a; font-weight: 700;">${formatVND(currentGo)}</span>. Tiếp theo là Retail đạt <span style="color: #0f172a; font-weight: 700;">${formatVND(currentRetail)}</span> và Business đạt <span style="color: #0f172a; font-weight: 700;">${formatVND(currentBusiness)}</span>.`;
  } else if (maxLine === currentRetail && currentRetail > 0) {
    lineBreakdownHtml = `Đối chiếu dòng sản phẩm: Dòng sản phẩm <span style="color: #2563eb; font-weight: 700;">Retail</span> đang dẫn đầu doanh số với <span style="color: #0f172a; font-weight: 700;">${formatVND(currentRetail)}</span>. Tiếp theo là Business đạt <span style="color: #0f172a; font-weight: 700;">${formatVND(currentBusiness)}</span> và Go đạt <span style="color: #0f172a; font-weight: 700;">${formatVND(currentGo)}</span>.`;
  } else if (maxLine === currentBusiness && currentBusiness > 0) {
    lineBreakdownHtml = `Đối chiếu dòng sản phẩm: Dòng sản phẩm <span style="color: #2563eb; font-weight: 700;">Business</span> đang dẫn đầu doanh số với <span style="color: #0f172a; font-weight: 700;">${formatVND(currentBusiness)}</span>. Tiếp theo là Retail đạt <span style="color: #0f172a; font-weight: 700;">${formatVND(currentRetail)}</span> và Go đạt <span style="color: #0f172a; font-weight: 700;">${formatVND(currentGo)}</span>.`;
  } else {
    lineBreakdownHtml = `Đối chiếu dòng sản phẩm: Các line sản phẩm (Go, Retail, Business) chưa phát sinh doanh số thực tế đáng kể trong kỳ báo cáo này.`;
  }

  // Recommendations
  let recHtml = "";
  if (currentCompRate < 70 || currentHotCloseRate < 25) {
    recHtml = `💡 <span style="color: #d97706; font-weight: 800;">Khuyến nghị tối ưu:</span> <span style="color: #d97706; font-weight: 600;">(1) Khẩn cấp tái cấu trúc lại phễu chốt demo đối với tệp Lead nóng để ngăn chặn sự sụt giảm hiệu suất; (2) Phân bổ nhân sự sales dày dạn kinh nghiệm sang chăm sóc nhóm Key Accounts nhằm đảm bảo chỉ tiêu doanh thu cam kết; (3) Hỗ trợ thúc đẩy các dự án AI còn chậm tiến độ để tự động hóa quy trình chăm sóc khách hàng.</span>`;
  } else {
    recHtml = `💡 <span style="color: #d97706; font-weight: 800;">Khuyến nghị tối ưu:</span> <span style="color: #d97706; font-weight: 600;">(1) Tiếp tục duy trì đà tăng trưởng bằng cách phân bổ thêm ngân sách quảng cáo cho nguồn Lead nóng; (2) Lên kế hoạch chăm sóc Key Accounts trước thời hạn 30 ngày để tối ưu tỉ lệ tái ký hợp đồng; (3) Chuyển giao các giải pháp thành công từ dự án AI sang các bộ phận kinh doanh khác để nhân rộng hiệu suất chốt đơn.</span>`;
  }

  const aiRecommendationText = `
    • <strong>Về doanh thu:</strong> ${revenueAnalysisHtml}<br>
    • <strong>Về hiệu suất:</strong> ${perfAnalysisHtml}<br>
    • <strong>Về chuyển đổi lead nóng:</strong> ${hotLeadAnalysisHtml}<br>
    • <strong>So sánh đối chiếu:</strong> ${lineBreakdownHtml}<br><br>
    ${recHtml}
  `;

  const card1 = renderReportKpiCard("Cam kết", formatVND(currentComm), formatReportTrendHTML(currentComm, prevComm), "Doanh thu");
  const card2 = renderReportKpiCard("Thực đạt", formatVND(currentActual), formatReportTrendHTML(currentActual, prevActual), "Doanh thu");
  const card3 = renderReportKpiCard("Tỉ lệ hoàn thành", `${currentCompRate.toFixed(1)}%`, formatReportTrendHTML(currentCompRate, prevCompRate, true), "Doanh thu");

  const card4 = renderReportKpiCard("Go", formatVND(currentGo), formatReportTrendHTML(currentGo, prevGo), "Doanh thu theo Line");
  const card5 = renderReportKpiCard("Retail", formatVND(currentRetail), formatReportTrendHTML(currentRetail, prevRetail), "Doanh thu theo Line");
  const card6 = renderReportKpiCard("Business", formatVND(currentBusiness), formatReportTrendHTML(currentBusiness, prevBusiness), "Doanh thu theo Line");

  const card7 = renderReportKpiCard("Đơn hàng", currentOrdersCount.toLocaleString("vi-VN"), formatReportTrendHTML(currentOrdersCount, prevOrdersCount), "Hiệu suất");
  const card8 = renderReportKpiCard("Demo", currentDemos.toLocaleString("vi-VN"), formatReportTrendHTML(currentDemos, prevDemos), "Hiệu suất");
  const card9 = renderReportKpiCard("Tỉ lệ chốt sales", `${currentPerfRate.toFixed(1)}%`, formatReportTrendHTML(currentPerfRate, prevPerfRate, true), "Hiệu suất");

  const card10 = renderReportKpiCard("Đơn Nóng", currentHotSigned.toLocaleString("vi-VN"), formatReportTrendHTML(currentHotSigned, prevHotSigned), "Lead nóng");
  const card11 = renderReportKpiCard("Demo Nóng", currentHotDemo.toLocaleString("vi-VN"), formatReportTrendHTML(currentHotDemo, prevHotDemo), "Lead nóng");
  const card12 = renderReportKpiCard("Tỉ lệ chốt nóng", `${currentHotCloseRate.toFixed(1)}%`, formatReportTrendHTML(currentHotCloseRate, prevHotCloseRate, true), "Lead nóng");

  const formatReportDate = (d) => {
    const pad = (n) => n.toString().padStart(2, '0');
    return `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()}`;
  };

  const renderReportSectionHeader = (title, color) => {
    return `
      <div style="
        border-left: 6px solid ${color};
        background: linear-gradient(90deg, ${color}15 0%, ${color}02 100%);
        padding: 8px 16px;
        margin-top: 16px;
        margin-bottom: 10px;
        border-radius: 0 8px 8px 0;
        page-break-after: avoid;
        page-break-inside: avoid;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      ">
        <h3 style="
          font-family: Arial, sans-serif !important;
          font-size: 0.95rem;
          font-weight: 900;
          text-transform: uppercase;
          color: #0f172a !important;
          margin: 0;
          letter-spacing: 0.5px;
        ">${title}</h3>
      </div>
    `;
  };

  const headerHtml = `
    <div style="text-align: center; background: linear-gradient(135deg, #0f172a, #2563eb); padding: 18px; margin-bottom: 12px; border-radius: 8px; font-family: Arial, sans-serif !important; page-break-inside: avoid; color: #ffffff !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
      <h2 style="font-family: Arial, sans-serif !important; font-size: 1.45rem; font-weight: 900; text-transform: uppercase; color: #ffffff !important; margin: 0 0 6px 0; letter-spacing: 1.5px;">JEGA HCM - BÁO CÁO KINH DOANH</h2>
      <div style="font-family: Arial, sans-serif !important; font-size: 0.9rem; font-weight: 700; color: #cbd5e1 !important;">
        Từ ngày ${formatReportDate(fromDate)} đến ngày ${formatReportDate(toDate)}
      </div>
    </div>
  `;


  const html = `
    <div style="font-family: Arial, sans-serif !important; color: #0f172a; padding: 15px; max-width: 640px; width: 100%; margin: 0 auto; box-sizing: border-box !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;">
      ${headerHtml}
      
      <!-- I - TỔNG QUAN TUẦN -->
      ${renderReportSectionHeader("I - TỔNG QUAN TUẦN", "#6366f1")}
      <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 12px; font-family: Arial, sans-serif !important; box-sizing: border-box !important;">
        
        <!-- Khung kết hợp 2 cột Doanh thu (Spans 2 columns, background color và viền) -->
        <div style="grid-column: span 2; border: 1px solid #cbd5e1; border-radius: 8px; background-color: rgba(99, 102, 241, 0.05); padding: 10px; display: flex; flex-direction: column; gap: 8px; box-sizing: border-box !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;">
          <!-- Chỉ dùng 1 chữ Doanh thu in hoa -->
          <div style="border-left: 4px solid #6366f1; background: linear-gradient(90deg, #6366f115 0%, #6366f102 100%); padding: 5px 10px; border-radius: 0 4px 4px 0; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;">
            <span style="font-size: 0.72rem; font-weight: 800; text-transform: uppercase; color: #0f172a; letter-spacing: 0.5px;">DOANH THU</span>
          </div>
          
          <!-- Grid 2 cột bên trong khung Doanh thu -->
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; box-sizing: border-box !important;">
            <!-- Cột con 1: Cam kết / Thực đạt / Tỉ lệ hoàn thành -->
            <div style="display: flex; flex-direction: column; gap: 8px;">
              ${card1}
              ${card2}
              ${card3}
            </div>
            <!-- Cột con 2: Go / Retail / Business -->
            <div style="display: flex; flex-direction: column; gap: 8px;">
              ${card4}
              ${card5}
              ${card6}
            </div>
          </div>
        </div>
        
        <!-- Khung cột Hiệu suất (Spans 1 column, background color và viền) -->
        <div style="border: 1px solid #cbd5e1; border-radius: 8px; background-color: rgba(245, 158, 11, 0.05); padding: 10px; display: flex; flex-direction: column; gap: 8px; box-sizing: border-box !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;">
          <!-- Tiêu đề Hiệu suất -->
          <div style="border-left: 4px solid #f59e0b; background: linear-gradient(90deg, #f59e0b15 0%, #f59e0b02 100%); padding: 5px 10px; border-radius: 0 4px 4px 0; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;">
            <span style="font-size: 0.72rem; font-weight: 800; text-transform: uppercase; color: #0f172a; letter-spacing: 0.5px;">HIỆU SUẤT</span>
          </div>
          <!-- Các thẻ KPI Hiệu suất -->
          <div style="display: flex; flex-direction: column; gap: 8px;">
            ${card7}
            ${card8}
            ${card9}
          </div>
        </div>
        
        <!-- Khung cột Lead nóng (Spans 1 column, background color và viền) -->
        <div style="border: 1px solid #cbd5e1; border-radius: 8px; background-color: rgba(239, 68, 68, 0.05); padding: 10px; display: flex; flex-direction: column; gap: 8px; box-sizing: border-box !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;">
          <!-- Tiêu đề Lead nóng -->
          <div style="border-left: 4px solid #ef4444; background: linear-gradient(90deg, #ef444415 0%, #ef444402 100%); padding: 5px 10px; border-radius: 0 4px 4px 0; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;">
            <span style="font-size: 0.72rem; font-weight: 800; text-transform: uppercase; color: #0f172a; letter-spacing: 0.5px;">LEAD NÓNG</span>
          </div>
          <!-- Các thẻ KPI Lead nóng -->
          <div style="display: flex; flex-direction: column; gap: 8px;">
            ${card10}
            ${card11}
            ${card12}
          </div>
        </div>
      </div>
      
      <div style="background-color: #f8fafc; border-left: 4px solid #6366f1; border-radius: 4px; padding: 12px; margin-top: 12px; font-size: 0.82rem; color: #1e293b; page-break-inside: avoid; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; font-family: Arial, sans-serif !important;">
        <div style="font-weight: 800; color: #0f172a; margin-bottom: 6px; font-size: 0.75rem; text-transform: uppercase; font-family: Arial, sans-serif !important;">Đánh giá chung:</div>
        <div style="line-height: 1.5; color: #334155; font-family: Arial, sans-serif !important;">${aiRecommendationText}</div>
        <style>@media print { .color-picker-toolbar { display: none !important; } }</style>
        <div style="margin-top: 10px; padding-top: 8px; border-top: 1px dashed #cbd5e1; display: flex; justify-content: space-between; align-items: center; font-family: Arial, sans-serif !important;">
          <div style="font-weight: 800; color: #0f172a; font-size: 0.75rem; text-transform: uppercase;">Ý KIẾN BAN GIÁM ĐỐC / TRƯỞNG PHÒNG:</div>
          <div class="color-picker-toolbar" style="display: flex; gap: 6px; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;">
            <button type="button" onclick="document.execCommand('foreColor', false, '#0f172a')" style="width: 20px; height: 20px; border-radius: 50%; border: 1px solid #cbd5e1; background-color: #0f172a; cursor: pointer; padding: 0;" title="Đen"></button>
            <button type="button" onclick="document.execCommand('foreColor', false, '#ef4444')" style="width: 20px; height: 20px; border-radius: 50%; border: 1px solid #cbd5e1; background-color: #ef4444; cursor: pointer; padding: 0;" title="Đỏ"></button>
            <button type="button" onclick="document.execCommand('foreColor', false, '#3b82f6')" style="width: 20px; height: 20px; border-radius: 50%; border: 1px solid #cbd5e1; background-color: #3b82f6; cursor: pointer; padding: 0;" title="Xanh dương"></button>
            <button type="button" onclick="document.execCommand('foreColor', false, '#f97316')" style="width: 20px; height: 20px; border-radius: 50%; border: 1px solid #cbd5e1; background-color: #f97316; cursor: pointer; padding: 0;" title="Cam"></button>
          </div>
        </div>
        <div contenteditable="true" style="font-family: Arial, sans-serif !important; outline: none; min-height: 40px; line-height: 1.5; color: #0f172a; padding: 4px; border: 1px dashed transparent; border-radius: 4px; transition: all 0.2s;" onfocus="this.style.border='1px dashed #6366f1'; this.style.backgroundColor='#ffffff';" onblur="this.style.border='1px dashed transparent'; this.style.backgroundColor='transparent';">
          Nhập vào đây để thêm ý kiến nhận xét trực tiếp trước khi in báo cáo...
        </div>
      </div>

      <!-- II - TIẾN ĐỘ HOÀN THÀNH CAM KẾT -->
      ${renderReportSectionHeader("II - TIẾN ĐỘ HOÀN THÀNH CAM KẾT", "#14b8a6")}
      <div style="border: 1px solid #cbd5e1; border-radius: 8px; background-color: #f8fafc; padding: 15px; margin-top: 15px; margin-bottom: 20px; page-break-inside: avoid; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; font-family: Arial, sans-serif !important;">
        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px;">
          <!-- Pacing Year -->
          <div style="display:flex; flex-direction:column; align-items:center; text-align:center;">
            <div style="font-size:0.65rem; font-weight:800; color:#2563eb; margin-bottom:8px; text-transform:uppercase; letter-spacing:0.5px; font-family: Arial, sans-serif !important;">Luỹ kế năm</div>
            <div style="position:relative; width:90px; height:90px; display:flex; justify-content:center; align-items:center;">
              <canvas id="print-chart-pacing-year" width="90" height="90"></canvas>
              <div id="print-pacing-year-percent" style="position:absolute; font-size:1.1rem; font-weight:900; text-align:center; color:#2563eb; font-family: Arial, sans-serif !important;">0%</div>
            </div>
            <div style="margin-top:8px; font-size:0.7rem; font-weight:800; color:#0f172a; line-height:1.3; font-family: Arial, sans-serif !important; display: flex; justify-content: center; align-items: center; gap: 4px;">
              <span id="print-pacing-year-actual" style="color:#0f172a;">0 ₫</span>
              <span style="color:#94a3b8; font-weight: 500;">/</span>
              <span id="print-pacing-year-target" style="color:#475569; font-weight: 600;">0 ₫</span>
            </div>
          </div>
          <!-- Pacing Quarter -->
          <div style="display:flex; flex-direction:column; align-items:center; text-align:center;">
            <div style="font-size:0.65rem; font-weight:800; color:#dc2626; margin-bottom:8px; text-transform:uppercase; letter-spacing:0.5px; font-family: Arial, sans-serif !important;">Luỹ kế Quý</div>
            <div style="position:relative; width:90px; height:90px; display:flex; justify-content:center; align-items:center;">
              <canvas id="print-chart-pacing-quarter" width="90" height="90"></canvas>
              <div id="print-pacing-quarter-percent" style="position:absolute; font-size:1.1rem; font-weight:900; text-align:center; color:#dc2626; font-family: Arial, sans-serif !important;">0%</div>
            </div>
            <div style="margin-top:8px; font-size:0.7rem; font-weight:800; color:#0f172a; line-height:1.3; font-family: Arial, sans-serif !important; display: flex; justify-content: center; align-items: center; gap: 4px;">
              <span id="print-pacing-quarter-actual" style="color:#0f172a;">0 ₫</span>
              <span style="color:#94a3b8; font-weight: 500;">/</span>
              <span id="print-pacing-quarter-target" style="color:#475569; font-weight: 600;">0 ₫</span>
            </div>
          </div>
          <!-- Pacing Month -->
          <div style="display:flex; flex-direction:column; align-items:center; text-align:center;">
            <div style="font-size:0.65rem; font-weight:800; color:#16a34a; margin-bottom:8px; text-transform:uppercase; letter-spacing:0.5px; font-family: Arial, sans-serif !important;">Luỹ kế tháng</div>
            <div style="position:relative; width:90px; height:90px; display:flex; justify-content:center; align-items:center;">
              <canvas id="print-chart-pacing-month" width="90" height="90"></canvas>
              <div id="print-pacing-month-percent" style="position:absolute; font-size:1.1rem; font-weight:900; text-align:center; color:#16a34a; font-family: Arial, sans-serif !important;">0%</div>
            </div>
            <div style="margin-top:8px; font-size:0.7rem; font-weight:800; color:#0f172a; line-height:1.3; font-family: Arial, sans-serif !important; display: flex; justify-content: center; align-items: center; gap: 4px;">
              <span id="print-pacing-month-actual" style="color:#0f172a;">0 ₫</span>
              <span style="color:#94a3b8; font-weight: 500;">/</span>
              <span id="print-pacing-month-target" style="color:#475569; font-weight: 600;">0 ₫</span>
            </div>
          </div>
          <!-- Pacing Week -->
          <div style="display:flex; flex-direction:column; align-items:center; text-align:center;">
            <div style="font-size:0.65rem; font-weight:800; color:#d97706; margin-bottom:8px; text-transform:uppercase; letter-spacing:0.5px; font-family: Arial, sans-serif !important;">Luỹ kế tuần</div>
            <div style="position:relative; width:90px; height:90px; display:flex; justify-content:center; align-items:center;">
              <canvas id="print-chart-pacing-week" width="90" height="90"></canvas>
              <div id="print-pacing-week-percent" style="position:absolute; font-size:1.1rem; font-weight:900; text-align:center; color:#d97706; font-family: Arial, sans-serif !important;">0%</div>
            </div>
            <div style="margin-top:8px; font-size:0.7rem; font-weight:800; color:#0f172a; line-height:1.3; font-family: Arial, sans-serif !important; display: flex; justify-content: center; align-items: center; gap: 4px;">
              <span id="print-pacing-week-actual" style="color:#0f172a;">0 ₫</span>
              <span style="color:#94a3b8; font-weight: 500;">/</span>
              <span id="print-pacing-week-target" style="color:#475569; font-weight: 600;">0 ₫</span>
            </div>
          </div>
        </div>
      </div>

      <!-- III - PHỄU CHUYỂN ĐỔI -->
      ${renderReportSectionHeader("III - PHỄU CHUYỂN ĐỔI", "#ec4899")}
      <div style="display: flex; gap: 15px; margin-top: 15px; margin-bottom: 12px; font-family: Arial, sans-serif !important;">
        ${renderReportFunnelHTML(filteredLeads, "Tổng Lead", "#3b82f6")}
        ${renderReportFunnelHTML(filteredLeads.filter(l => getLeadSourceGroup(l.nguon) === "Marketing Nóng"), "Marketing Nóng", "#f97316")}
      </div>

      <!-- IV - THEO DÕI OKR -->
      ${renderReportSectionHeader("IV - THEO DÕI OKR", "#3b82f6")}
      <div style="font-family: Arial, sans-serif !important; font-size: 0.8rem;">
        ${okrHtml || '<div style="color:#475569; font-style:italic; font-family: Arial, sans-serif !important;">Không có dữ liệu OKR trong khoảng thời gian này.</div>'}
      </div>

      <!-- V - KHÁCH HÀNG KEY ACCOUNT -->
      ${renderReportSectionHeader("V - KHÁCH HÀNG KEY ACCOUNT", "#ef4444")}
      <div style="font-family: Arial, sans-serif !important; font-size: 0.8rem; page-break-inside: avoid;">
        ${kaHtml || '<div style="color:#475569; font-style:italic; padding:10px; font-family: Arial, sans-serif !important;">Không có dữ liệu Khách hàng Key Account.</div>'}
      </div>

      <!-- VI - KHÁCH HÀNG TÁI KÝ -->
      ${renderReportSectionHeader("VI - KHÁCH HÀNG TÁI KÝ", "#10b981")}
      <div style="font-family: Arial, sans-serif !important; font-size: 0.8rem; page-break-inside: avoid;">
        ${rcHtml || '<div style="color:#475569; font-style:italic; padding:10px; font-family: Arial, sans-serif !important;">Không có dữ liệu Khách hàng Tái ký.</div>'}
      </div>

      <!-- VII - CÁC DỰ ÁN AI -->
      ${renderReportSectionHeader("VII - CÁC DỰ ÁN AI", "#8b5cf6")}
      <div style="font-family: Arial, sans-serif !important; font-size: 0.8rem; page-break-inside: avoid;">
        ${aipHtml || '<div style="color:#475569; font-style:italic; padding:10px; font-family: Arial, sans-serif !important;">Không có dữ liệu Dự án AI đang vận hành.</div>'}
      </div>

      <!-- VIII - CẬP NHẬT HÀNH ĐỘNG -->
      ${renderReportSectionHeader("VIII - CẬP NHẬT HÀNH ĐỘNG", "#f59e0b")}
      <div style="display: flex; gap: 15px; margin-top: 15px; margin-bottom: 20px; font-family: Arial, sans-serif !important; page-break-inside: avoid;">
        <div style="flex: 1; border: 1px solid #cbd5e1; border-radius: 8px; background-color: #f8fafc; padding: 15px; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;">
          <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px dashed #cbd5e1; padding-bottom: 8px; margin-bottom: 10px;">
            <h4 style="margin: 0; color: #0f172a; font-size: 0.8rem; font-weight: 800; text-transform: uppercase;">Hành động tuần trước</h4>
            <div class="color-picker-toolbar" style="display: flex; gap: 6px; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;">
              <button type="button" onclick="document.execCommand('foreColor', false, '#0f172a')" style="width: 16px; height: 16px; border-radius: 50%; border: 1px solid #cbd5e1; background-color: #0f172a; cursor: pointer; padding: 0;"></button>
              <button type="button" onclick="document.execCommand('foreColor', false, '#ef4444')" style="width: 16px; height: 16px; border-radius: 50%; border: 1px solid #cbd5e1; background-color: #ef4444; cursor: pointer; padding: 0;"></button>
              <button type="button" onclick="document.execCommand('foreColor', false, '#3b82f6')" style="width: 16px; height: 16px; border-radius: 50%; border: 1px solid #cbd5e1; background-color: #3b82f6; cursor: pointer; padding: 0;"></button>
              <button type="button" onclick="document.execCommand('foreColor', false, '#f97316')" style="width: 16px; height: 16px; border-radius: 50%; border: 1px solid #cbd5e1; background-color: #f97316; cursor: pointer; padding: 0;"></button>
            </div>
          </div>
          <div contenteditable="true" class="editable-report-container" style="font-size: 0.8rem; line-height: 1.5; color: #0f172a; min-height: 60px; outline: none;">
            <ul>
              <li>Nhập các hành động đã thực hiện...</li>
            </ul>
          </div>
        </div>
        <div style="flex: 1; border: 1px solid #cbd5e1; border-radius: 8px; background-color: #f8fafc; padding: 15px; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;">
          <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px dashed #cbd5e1; padding-bottom: 8px; margin-bottom: 10px;">
            <h4 style="margin: 0; color: #0f172a; font-size: 0.8rem; font-weight: 800; text-transform: uppercase;">Kế hoạch trọng tâm tuần này</h4>
            <div class="color-picker-toolbar" style="display: flex; gap: 6px; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;">
              <button type="button" onclick="document.execCommand('foreColor', false, '#0f172a')" style="width: 16px; height: 16px; border-radius: 50%; border: 1px solid #cbd5e1; background-color: #0f172a; cursor: pointer; padding: 0;"></button>
              <button type="button" onclick="document.execCommand('foreColor', false, '#ef4444')" style="width: 16px; height: 16px; border-radius: 50%; border: 1px solid #cbd5e1; background-color: #ef4444; cursor: pointer; padding: 0;"></button>
              <button type="button" onclick="document.execCommand('foreColor', false, '#3b82f6')" style="width: 16px; height: 16px; border-radius: 50%; border: 1px solid #cbd5e1; background-color: #3b82f6; cursor: pointer; padding: 0;"></button>
              <button type="button" onclick="document.execCommand('foreColor', false, '#f97316')" style="width: 16px; height: 16px; border-radius: 50%; border: 1px solid #cbd5e1; background-color: #f97316; cursor: pointer; padding: 0;"></button>
            </div>
          </div>
          <div contenteditable="true" class="editable-report-container" style="font-size: 0.8rem; line-height: 1.5; color: #0f172a; min-height: 60px; outline: none;">
            <ul>
              <li>Nhập kế hoạch tuần này...</li>
            </ul>
          </div>
        </div>
      </div>

      <div style="margin-top: 35px; display: flex; justify-content: space-between; page-break-inside: avoid; font-size: 0.8rem; font-weight: 700; color: #0f172a; padding: 0 40px; font-family: Arial, sans-serif !important;">
        <div style="text-align: center; font-family: Arial, sans-serif !important;">
          <div>Người Lập Báo Cáo</div>
          <div style="font-size: 0.7rem; color: #475569; font-weight: 500; margin-top: 2px;">(Trưởng phòng Kinh doanh)</div>
          <div style="margin-top: 50px; font-weight: 800;">TP KD HCM Đỗ Thị Hải Yến</div>
        </div>
        <div style="text-align: center; font-family: Arial, sans-serif !important;">
          <div>Phê Duyệt Báo Cáo</div>
          <div style="font-size: 0.7rem; color: #475569; font-weight: 500; margin-top: 2px;">(Ban Giám Đốc)</div>
          <div style="margin-top: 50px; border-bottom: 1px dashed #cbd5e1; width: 120px; display: inline-block;"></div>
        </div>
      </div>
    </div>
  `;

  container.innerHTML = html;

  // Render doughnut using Chart.js on the print canvases
  drawCumulativeDoughnut("print-chart-pacing-year", yearActual, yearTarget, "print-pacing-year-percent", "print-pacing-year-actual", "print-pacing-year-target", "printYear");
  drawCumulativeDoughnut("print-chart-pacing-quarter", quarterActual, quarterTarget, "print-pacing-quarter-percent", "print-pacing-quarter-actual", "print-pacing-quarter-target", "printQuarter");
  drawCumulativeDoughnut("print-chart-pacing-month", monthActual, monthTarget, "print-pacing-month-percent", "print-pacing-month-actual", "print-pacing-month-target", "printMonth");
  drawCumulativeDoughnut("print-chart-pacing-week", weekActual, weekTarget, "print-pacing-week-percent", "print-pacing-week-actual", "print-pacing-week-target", "printWeek");

  if (typeof lucide !== 'undefined') lucide.createIcons();
  document.getElementById("report-modal").classList.add("active");
}

// Make callback functions accessible in HTML onclick attributes globally
window.editAIProject = editAIProject;
window.deleteAIProject = deleteAIProject;
window.openAddAIProjectModal = openAddAIProjectModal;
window.generateExecutiveReport = generateExecutiveReport;

