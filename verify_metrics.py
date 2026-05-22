import json
import re

DATA_PATH = "/Users/a123/.gemini/antigravity/scratch/sales_ai_report/data.js"

def parse_js_data(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Simple regex parsing to extract the JSON structures from the JS file
    leads_match = re.search(r'const RAW_LEADS_DATA = (\[.*?\]);', content, re.DOTALL)
    orders_match = re.search(r'const RAW_ORDERS_DATA = (\[.*?\]);', content, re.DOTALL)
    
    leads = json.loads(leads_match.group(1)) if leads_match else []
    orders = json.loads(orders_match.group(1)) if orders_match else []
    
    return leads, orders

def get_lead_source_group(source):
    if not source: return "Marketing khác"
    s = source.strip().lower()
    
    sales_sources = [
        "sale tự kiếm", "đi thị trường", "mã số thuế + thông tin doanh nghiệp", 
        "sales chạy ads face, gg, tiktok", "google map", "chatgpt", "mst", 
        "sale tự tìm", "chạy ads face"
    ]
    if any(src in s for src in sales_sources): return "Sales"
    
    mkt_hot_sources = [
        "facebook_loại 1", "website", "hotline", "zalo", "zalo - zns", "zalo oa"
    ]
    if any(src in s for src in mkt_hot_sources): return "Marketing Nóng"
    
    referral_sources = [
        "affiliate - jega", "aff-sales", "đối tác", "affiliate"
    ]
    if any(src in s for src in referral_sources): return "Giới thiệu"
    
    return "Marketing khác"

def get_product_category(product):
    if not product: return "JEGA Cloud"
    p = product.strip().lower()
    cloud_keywords = [
        "jega cloud", "jega pro", "license enterprise", "đào tạo online", 
        "đào tạo trực tiếp", "nhận diện thương hiệu", "jega lite", "jega factory", 
        "triển khai phần mềm", "tickets", "jega cloud design"
    ]
    if any(keyword in p for keyword in cloud_keywords): return "JEGA Cloud"
    return "JEGA Visual"

def main():
    leads, orders = parse_js_data(DATA_PATH)
    
    total_leads = len(leads)
    signed_leads = sum(1 for l in leads if l["moi_quan_he"] == "Ký hợp đồng")
    conversion_rate = (signed_leads / total_leads * 100) if total_leads > 0 else 0
    
    total_revenue = sum(o["doanh_thu"] for o in orders)
    aov = (total_revenue / len(orders)) if len(orders) > 0 else 0
    
    # Top Salesperson
    sales_perf = {}
    for o in orders:
        sales_perf[o["sales"]] = sales_perf.get(o["sales"], 0) + o["doanh_thu"]
    
    # Category Revenue
    cat_perf = {"JEGA Cloud": 0, "JEGA Visual": 0}
    for o in orders:
        cat = get_product_category(o["san_pham"])
        cat_perf[cat] += o["doanh_thu"]
        
    # Source Group Revenue
    src_perf = {"Sales": 0, "Marketing Nóng": 0, "Giới thiệu": 0, "Marketing khác": 0}
    for o in orders:
        grp = get_lead_source_group(o["nguon"])
        src_perf[grp] += o["doanh_thu"]
        
    print("=== BACKEND CALCULATED METRICS ===")
    print(f"Total Leads: {total_leads}")
    print(f"Signed Leads: {signed_leads}")
    print(f"Pipeline Conversion Rate: {conversion_rate:.2f}%")
    print(f"Total Revenue: {total_revenue:,} VND")
    print(f"Average Order Value: {aov:,.2f} VND")
    
    print("\n--- Sales Performance ---")
    for s, rev in sorted(sales_perf.items(), key=lambda x: x[1], reverse=True):
        print(f"  {s}: {rev:,} VND")
        
    print("\n--- Product Categories Revenue ---")
    for cat, rev in cat_perf.items():
        print(f"  {cat}: {rev:,} VND")
        
    print("\n--- Source Group Revenue ---")
    for src, rev in src_perf.items():
        print(f"  {src}: {rev:,} VND")

if __name__ == "__main__":
    main()
