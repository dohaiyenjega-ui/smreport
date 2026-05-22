import urllib.request
import csv
import io
import json

# URLs for exporting specific sheets as CSV
LEAD_REPORT_URL = "https://docs.google.com/spreadsheets/d/1peLiU9RkmA34lIQCer4X6Uc95sP6PKgblr6BnSo80H8/gviz/tq?tqx=out:csv&sheet=LEAD_REPORT"
ORDER_REPORT_URL = "https://docs.google.com/spreadsheets/d/1peLiU9RkmA34lIQCer4X6Uc95sP6PKgblr6BnSo80H8/gviz/tq?tqx=out:csv&sheet=ORDER_REPORT"
PERFORMANCE_URL = "https://docs.google.com/spreadsheets/d/1peLiU9RkmA34lIQCer4X6Uc95sP6PKgblr6BnSo80H8/gviz/tq?tqx=out:csv&sheet=Performance"

def download_sheet_as_json(url, output_path):
    print(f"Downloading from {url}...")
    req = urllib.request.Request(
        url, 
        headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
    )
    with urllib.request.urlopen(req) as response:
        html = response.read().decode('utf-8')
        
    reader = csv.DictReader(io.StringIO(html))
    rows = list(reader)
    
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(rows, f, ensure_ascii=False, indent=2)
        
    print(f"Saved {len(rows)} rows to {output_path}")
    return rows

def download_sheet_as_rows(url, output_path):
    print(f"Downloading rows from {url}...")
    req = urllib.request.Request(
        url, 
        headers={'User-Agent': 'Mozilla/5.0'}
    )
    with urllib.request.urlopen(req) as response:
        html = response.read().decode('utf-8')
        
    reader = csv.reader(io.StringIO(html))
    rows = list(reader)
    
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(rows, f, ensure_ascii=False, indent=2)
        
    print(f"Saved {len(rows)} raw rows to {output_path}")
    return rows

try:
    leads = download_sheet_as_json(LEAD_REPORT_URL, "leads_raw.json")
    orders = download_sheet_as_json(ORDER_REPORT_URL, "orders_raw.json")
    perf = download_sheet_as_rows(PERFORMANCE_URL, "performance_raw.json")
    
    print("\nLeads fields:", list(leads[0].keys()) if leads else "No leads")
    print("Orders fields:", list(orders[0].keys()) if orders else "No orders")
    print("Performance row sample:", perf[1] if len(perf) > 1 else "No performance rows")
except Exception as e:
    print(f"Error fetching sheet: {e}")

