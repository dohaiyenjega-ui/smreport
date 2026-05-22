const fs = require('fs');
const jsdom = require("jsdom");
const { JSDOM } = jsdom;
const html = fs.readFileSync('index.html', 'utf8');
const dom = new JSDOM(html);
global.window = dom.window;
global.document = dom.window.document;
global.navigator = { userAgent: 'node.js' };
global.localStorage = { getItem: () => null, setItem: () => {} };

// Define data
eval(fs.readFileSync('data.js', 'utf8'));
// Run app.js
eval(fs.readFileSync('app.js', 'utf8'));

// Try generating report
try {
  generateExecutiveReport();
  console.log("SUCCESS!");
} catch (e) {
  console.log("ERROR:", e);
}
