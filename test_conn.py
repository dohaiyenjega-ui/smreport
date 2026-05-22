import urllib.request
import sys

url = "https://www.google.com"
print("Attempting to connect to Google...")
try:
    with urllib.request.urlopen(url, timeout=3) as response:
        print("Success! Status code:", response.getcode())
except Exception as e:
    print("Error connecting:", e)
    sys.exit(1)
