import csv
import json
import re
import os

LEADS_RAW_PATH = "/Users/a123/.gemini/antigravity/brain/0dfc12d0-fa03-43dc-8bb4-9c9a9876ec64/.system_generated/steps/48/content.md"
ORDERS_RAW_PATH = "/Users/a123/.gemini/antigravity/brain/0dfc12d0-fa03-43dc-8bb4-9c9a9876ec64/.system_generated/steps/52/content.md"
OUTPUT_PATH = "/Users/a123/.gemini/antigravity/scratch/sales_ai_report/data.js"

EMAIL_MAP = {
    "tinnt@jega.asia": "Nguyễn Trọng Tín",
    "yendth@jega.asia": "Đỗ Thị Hải Yến",
    "phuclth@jega.asia": "Lê Thị Hoài Phúc",
    "thuypn@jega.asia": "Phan Ngọc Thúy",
    "hanvg@jega.asia": "Võ Gia Hân"
}

def clean_salesperson(val):
    if not val:
        return "Chưa phân phối"
    val = val.strip()
    if val.lower() in EMAIL_MAP:
        return EMAIL_MAP[val.lower()]
    if "@" in val:
        email_part = val.split("@")[0]
        return email_part.replace(".", " ").title()
    return val

def extract_csv_content(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    
    csv_start_index = 0
    for idx, line in enumerate(lines):
        if line.strip() == "---":
            csv_start_index = idx + 1
            break
            
    csv_lines = lines[csv_start_index:]
    return "".join(csv_lines)

def process_leads():
    json_path = "leads_raw.json"
    if os.path.exists(json_path):
        print(f"Loading leads from local {json_path}...")
        with open(json_path, 'r', encoding='utf-8') as f:
            reader = json.load(f)
    else:
        content = extract_csv_content(LEADS_RAW_PATH)
        reader = csv.DictReader(content.strip().splitlines())
        
    leads = []
    for row in reader:
        cleaned_row = {
            "ma_kh": row.get("Mã KH", "").strip(),
            "ten_kh": row.get("Tên khách hàng", "").strip(),
            "ngay_tao": row.get("Ngày tạo khách hàng", "").strip(),
            "lien_he_cuoi": row.get("Liên hệ lần cuối", "").strip(),
            "dien_thoai": row.get("Điện thoại", "").strip(),
            "nguon": row.get("Nguồn khách hàng", "").strip(),
            "sales": clean_salesperson(row.get("Nhân viên kinh doanh", "")),
            "moi_quan_he": row.get("Mối quan hệ", "").strip()
        }
        if cleaned_row["ma_kh"]:
            leads.append(cleaned_row)
    return leads

def process_orders():
    json_path = "orders_raw.json"
    if os.path.exists(json_path):
        print(f"Loading orders from local {json_path}...")
        with open(json_path, 'r', encoding='utf-8') as f:
            reader = json.load(f)
    else:
        content = extract_csv_content(ORDERS_RAW_PATH)
        reader = csv.DictReader(content.strip().splitlines())
        
    orders = []
    seen_orders = set()
    for row in reader:
        revenue_str = row.get("Doanh thu", "0").strip()
        revenue_clean = re.sub(r'[^\d]', '', revenue_str)
        revenue = int(revenue_clean) if revenue_clean else 0
        
        ma_kh = row.get("Mã KH", "").strip()
        san_pham = row.get("Tên sản phẩm", "").strip()
        
        order_key = (ma_kh, san_pham)
        
        cleaned_row = {
            "ngay_mua": row.get("Ngày mua hàng", "").strip(),
            "sales": clean_salesperson(row.get("Nhân viên kinh doanh", "")),
            "ma_kh": ma_kh,
            "ten_kh": row.get("Tên KH", "").strip(),
            "dien_thoai": row.get("Số ĐT", "").strip(),
            "nguon": row.get("Nguồn khách hàng", "").strip(),
            "san_pham": san_pham,
            "doanh_thu": revenue,
            "loai_don": row.get("Loại đơn hàng", "").strip()
        }
        if ma_kh or cleaned_row["ten_kh"]:
            if order_key not in seen_orders or not ma_kh:
                orders.append(cleaned_row)
                if ma_kh:
                    seen_orders.add(order_key)
    return orders

def process_performance():
    perf_path = "performance_raw.json"
    if not os.path.exists(perf_path):
        return []
    with open(perf_path, 'r', encoding='utf-8') as f:
        rows = json.load(f)
    
    perf_data = []
    for row in rows[1:]:
        if len(row) < 9:
            continue
        start_date = row[1].strip()
        end_date = row[2].strip()
        metric = row[3].strip()
        
        if not start_date or not end_date or not metric:
            continue
            
        def safe_int(val):
            val = val.strip() if val else ""
            if not val:
                return 0
            val = re.sub(r'[^\d]', '', val)
            return int(val) if val else 0
            
        values = {
            "Lê Thị Hoài Phúc": safe_int(row[4]),
            "Nguyễn Trọng Tín": safe_int(row[5]),
            "Phan Ngọc Thúy": safe_int(row[6]),
            "Đỗ Thị Hải Yến": safe_int(row[7]),
            "Võ Gia Hân": safe_int(row[8])
        }
        
        perf_data.append({
            "startDate": start_date,
            "endDate": end_date,
            "metric": metric,
            "values": values
        })
    return perf_data

def main():
    print("Processing Leads...")
    leads = process_leads()
    print(f"Processed {len(leads)} leads.")
    
    print("Processing Orders...")
    orders = process_orders()
    print(f"Processed {len(orders)} orders.")
    
    print("Processing Performance...")
    perf = process_performance()
    print(f"Processed {len(perf)} performance rows.")
    
    # Output to data.js
    with open(OUTPUT_PATH, 'w', encoding='utf-8') as f:
        f.write("// Google Sheet Pre-processed Seed Data\n")
        f.write(f"const RAW_LEADS_DATA = {json.dumps(leads, ensure_ascii=False, indent=2)};\n\n")
        f.write(f"const RAW_ORDERS_DATA = {json.dumps(orders, ensure_ascii=False, indent=2)};\n\n")
        f.write(f"const RAW_PERFORMANCE_DATA = {json.dumps(perf, ensure_ascii=False, indent=2)};\n")
        
    print(f"Successfully generated JS data file at: {OUTPUT_PATH}")

if __name__ == "__main__":
    main()

