const fs = require('fs');
const jsdom = require("jsdom");
const { JSDOM } = jsdom;

const html = fs.readFileSync('index.html', 'utf8');
const dom = new JSDOM(html);
global.window = dom.window;
global.document = dom.window.document;
global.navigator = { userAgent: 'node.js' };

// Mock localStorage
const store = {};
global.localStorage = {
  getItem: (key) => store[key] || null,
  setItem: (key, val) => { store[key] = String(val); },
  removeItem: (key) => { delete store[key]; }
};

// Mock PapaParse
global.Papa = {
  parse: (url, config) => {
    console.log("Mocked Papa.parse called for:", url);
    if (config && typeof config.complete === 'function') {
      config.complete({ data: [] });
    }
  }
};

// Mock Lucide
global.lucide = {
  createIcons: () => {}
};

// Track chart configurations created during initial load
const createdCharts = {};

// Mock Chart class
global.Chart = class MockChart {
  constructor(canvas, config) {
    const canvasId = canvas ? (canvas.id || canvas) : 'unknown';
    createdCharts[canvasId] = config;
    this.canvas = canvas;
    this.config = config;
  }
  destroy() {
    // No-op
  }
};

// Mock renderRenewalDashboards and window methods
global.renderRenewalDashboards = () => {};
global.window.renderRenewalDashboards = global.renderRenewalDashboards;

// Load data.js and app.js combined to share local declarations perfectly
const dataCode = fs.readFileSync('data.js', 'utf8');
const appCode = fs.readFileSync('app.js', 'utf8') + "\nglobal.getFilteredOrders = () => filteredOrders;\n";

console.log("Evaluating combined data.js and app.js...");
try {
  eval(dataCode + "\n" + appCode);
  console.log("SUCCESS: Combined code evaluated successfully!");
} catch (e) {
  console.error("FAILURE: Evaluating combined code crashed:", e);
  process.exit(1);
}

// Directly invoke loadDataFromGoogleSheets and initApp
console.log("\n--- Triggering Application Initialization ---");
loadDataFromGoogleSheets()
  .then(() => {
    console.log("loadDataFromGoogleSheets() complete. Initializing app...");
    initApp();
    console.log("initApp() complete!");
    
    // Assert Daily Revenue Trend Chart was created
    console.log("\n--- Verifying Daily Revenue Trend Chart Creation ---");
    const dailyTrendChartConfig = createdCharts["chart-daily-revenue-trend"];
    if (!dailyTrendChartConfig) {
      console.error("FAILURE: chart-daily-revenue-trend was not initialized!");
      process.exit(1);
    }
    console.log("SUCCESS: Daily Revenue Trend Chart was initialized!");

    // Verify Chart configurations
    const data = dailyTrendChartConfig.data;
    const datasets = data.datasets;

    console.log("Chart configuration properties:");
    console.log("- Chart Type:", dailyTrendChartConfig.type); // should be 'line'
    console.log("- Number of datasets:", datasets.length);
    console.log("- Number of labels (days):", data.labels.length);

    if (dailyTrendChartConfig.type !== 'line') {
      console.error(`FAILURE: Expected chart type 'line', got '${dailyTrendChartConfig.type}'`);
      process.exit(1);
    }

    if (datasets.length !== 1) {
      console.error("FAILURE: Dataset count is not 1!");
      process.exit(1);
    }

    const mainDataset = datasets[0];
    console.log("- Label:", mainDataset.label);
    console.log("- Border color:", mainDataset.borderColor); // should be '#006F7A'
    console.log("- Background color (gradient/fill):", mainDataset.backgroundColor ? 'Valid' : 'Invalid');
    console.log("- Fill:", mainDataset.fill); // should be true
    console.log("- Tension:", mainDataset.tension); // should be 0.35

    if (mainDataset.borderColor !== '#006F7A') {
      console.error(`FAILURE: Expected border color '#006F7A', got '${mainDataset.borderColor}'`);
      process.exit(1);
    }

    if (mainDataset.fill !== true) {
      console.error("FAILURE: Expected fill to be true!");
      process.exit(1);
    }

    if (mainDataset.tension !== 0.35) {
      console.error(`FAILURE: Expected tension 0.35, got '${mainDataset.tension}'`);
      process.exit(1);
    }

    // Retrieve filteredOrders from the evaluated scope
    const filteredOrders = global.getFilteredOrders();

    // Verify date aggregation logic with default dates (May 2026)
    console.log("\n--- Verifying Data Points ---");
    const labelIndexMap = {};
    data.labels.forEach((lbl, idx) => {
      labelIndexMap[lbl] = idx;
    });

    // Let's dynamically find a date in May 2026 that has positive revenue to ensure we check non-zero aggregation
    let targetDayLabel = null;
    let expectedRevenue = 0;
    
    // Scan all labels to find one with positive revenue
    for (const lbl of data.labels) {
      const parts = lbl.split("/");
      const day = parts[0];
      const month = parts[1];
      const matchPrefix = `${day}/${month}/2026`;
      
      let sum = 0;
      filteredOrders.forEach(o => {
        if (o.ngay_mua && o.ngay_mua.startsWith(matchPrefix)) {
          sum += o.doanh_thu;
        }
      });
      
      if (sum > 0) {
        targetDayLabel = lbl;
        expectedRevenue = sum;
        break;
      }
    }

    if (!targetDayLabel) {
      console.warn("WARNING: Could not find any day with positive revenue in filteredOrders. Falling back to static '20/05' check.");
      targetDayLabel = "20/05";
      filteredOrders.forEach(o => {
        if (o.ngay_mua && o.ngay_mua.startsWith("20/05/2026")) {
          expectedRevenue += o.doanh_thu;
        }
      });
    }

    const targetDayIndex = labelIndexMap[targetDayLabel];
    if (targetDayIndex === undefined) {
      console.error(`FAILURE: Expected date label '${targetDayLabel}' not found in daily chart!`);
      process.exit(1);
    }

    const actualRevenue = mainDataset.data[targetDayIndex];
    console.log(`For date ${targetDayLabel}/2026:`);
    console.log(`- Expected sum from filteredOrders: ${expectedRevenue} VND`);
    console.log(`- Actual sum in chart dataset:     ${actualRevenue} VND`);

    if (actualRevenue !== expectedRevenue) {
      console.error(`FAILURE: Revenue mismatch for date ${targetDayLabel}/2026! Expected ${expectedRevenue}, got ${actualRevenue}`);
      process.exit(1);
    }
    console.log("SUCCESS: Calculated revenue matches filteredOrders perfectly!");

    console.log("\nALL VERIFICATION TESTS FOR DAILY REVENUE TREND PASSED SUCCESSFULLY!");
    process.exit(0);
  })
  .catch(e => {
    console.error("FAILURE: Initialization crashed:", e);
    process.exit(1);
  });
