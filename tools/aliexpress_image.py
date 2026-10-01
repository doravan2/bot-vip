#!/usr/bin/env python3
import urllib.request
import http.cookiejar
import re
import sys
import json

if len(sys.argv) < 2:
    print(json.dumps({"success": False, "error": "URL required"}))
    sys.exit(0)

url = sys.argv[1].strip()

# Extract item ID if available
match = (
    re.search(r'/item/(\d+)\.html', url, re.I)
    or re.search(r'/item/(\d+)', url, re.I)
    or re.search(r'item[_\-/](\d+)', url, re.I)
    or re.search(r'goodsId=(\d+)', url, re.I)
)

target_url = f"https://www.aliexpress.com/item/{match.group(1)}.html" if match else url.split('?')[0]

cj = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
opener.addheaders = [
    ('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'),
    ('Accept', 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8'),
]

try:
    resp = opener.open(target_url, timeout=9)
    html = resp.read().decode('utf-8', errors='ignore')

    # 1. OpenGraph
    og = re.search(r'<meta[^>]+property=[\'"]og:image[\'"][^>]+content=[\'"]([^\'"]+)[\'"]', html, re.I)
    if not og:
        og = re.search(r'<meta[^>]+content=[\'"]([^\'"]+)[\'"][^>]+property=[\'"]og:image[\'"]', html, re.I)

    # 2. CDN Media Regex
    if not og:
        cdn_matches = re.findall(r'https?://[^\s"\'<>]+\.(?:alicdn|aliexpress-media)\.com/kf/[^\s"\'<>]+\.(?:jpg|png|webp|jpeg)', html, re.I)
        if cdn_matches:
            img_url = cdn_matches[0]
            print(json.dumps({"success": True, "imageUrl": img_url}))
            sys.exit(0)

    # 3. Twitter Image
    if not og:
        og = re.search(r'<meta[^>]+name=[\'"]twitter:image[\'"][^>]+content=[\'"]([^\'"]+)[\'"]', html, re.I)

    if og:
        img_url = og.group(1)
        img_url = img_url.replace('&amp;', '&').replace('\\u002F', '/').replace('\\/', '/')
        if img_url.startswith('//'):
            img_url = 'https:' + img_url
        print(json.dumps({"success": True, "imageUrl": img_url}))
        sys.exit(0)
except Exception as e:
    pass

print(json.dumps({"success": False}))
