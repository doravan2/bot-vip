#!/usr/bin/env python3
"""
Headless URL Resolver Engine
Emulates a modern headless browser environment with realistic browser headers,
redirect tracking, cookie handling, and DOM/metadata extraction for e-commerce
short-links (Mercado Livre meli.la, Amazon amzn.to/a.co, Shopee shope.ee/s.shopee.com, Magalu magalu.me).
"""

import sys
import json
import re
import urllib.request
import urllib.error
import urllib.parse
import http.cookiejar

DEFAULT_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
    'Accept-Encoding': 'identity',
    'Sec-Ch-Ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"Windows"',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1',
}

class HeadlessBrowserSession:
    def __init__(self, timeout=12):
        self.timeout = timeout
        self.cookie_jar = http.cookiejar.CookieJar()
        self.opener = urllib.request.build_opener(
            urllib.request.HTTPCookieProcessor(self.cookie_jar),
            urllib.request.HTTPRedirectHandler()
        )

    def fetch(self, url):
        req = urllib.request.Request(url, headers=DEFAULT_HEADERS)
        with self.opener.open(req, timeout=self.timeout) as response:
            final_url = response.geturl()
            raw_content = response.read()
            charset = response.headers.get_content_charset() or 'utf-8'
            try:
                html = raw_content.decode(charset, errors='ignore')
            except Exception:
                html = raw_content.decode('utf-8', errors='ignore')
            return final_url, html

def clean_url(url):
    if not url:
        return ""
    # Strip any trailing tracking fragments or queries
    return url.split('#')[0].strip()

def extract_mercadolivre_canonical(final_url, html, original_url=""):
    # If final_url contains a 'go=' parameter (e.g. login/verification gateway), unpack target URL
    if 'go=' in final_url:
        try:
            parsed = urllib.parse.urlparse(final_url)
            qs = urllib.parse.parse_qs(parsed.query)
            if 'go' in qs and qs['go']:
                go_url = urllib.parse.unquote(qs['go'][0])
                if 'mercadolivre.com.br' in go_url and ('/p/MLB' in go_url or 'MLB-' in go_url):
                    return clean_url(go_url.split('?')[0])
        except Exception:
            pass

    # 1. Direct product page already reached in redirect (not verification/social hub)
    if ('/p/MLB' in final_url or 'produto.mercadolivre.com.br/MLB' in final_url) and not any(skip in final_url for skip in ['/gz/', '/social/', '/addresses/', '/login/']):
        return clean_url(final_url.split('?')[0])

    # 2. Check canonical link tag in DOM
    canonical_match = re.search(r'<link\s+rel=["\']canonical["\']\s+href=["\']([^"\']+)["\']', html, re.I)
    if not canonical_match:
        canonical_match = re.search(r'<link\s+href=["\']([^"\']+)["\']\s+rel=["\']canonical["\']', html, re.I)
    if canonical_match:
        href = canonical_match.group(1).strip()
        if 'mercadolivre.com.br' in href and ('/p/MLB' in href or 'MLB-' in href) and not any(skip in href for skip in ['/gz/', '/social/', '/addresses/']):
            return clean_url(href.split('?')[0])

    # 3. Check OpenGraph url tag in DOM
    og_match = re.search(r'<meta\s+(?:property|name)=["\']og:url["\']\s+content=["\']([^"\']+)["\']', html, re.I)
    if og_match:
        og_url = og_match.group(1).strip()
        if 'mercadolivre.com.br' in og_url and ('/p/MLB' in og_url or 'MLB-' in og_url) and not any(skip in og_url for skip in ['/gz/', '/social/', '/addresses/']):
            return clean_url(og_url.split('?')[0])

    # 4. Search in embedded JSON metadata: "url":"produto.mercadolivre.com.br\u002FMLB-...-produto_JM"
    json_url_match = re.search(r'\"url\":\s*\"([^\"]*mercadolivre\.com\.br[^\"]*MLB[^\"]*)\"', html)
    if json_url_match:
        raw_u = json_url_match.group(1).encode('utf-8').decode('unicode_escape').replace(r'\/', '/').replace(r'\u002F', '/')
        if not raw_u.startswith('http'):
            raw_u = 'https://' + raw_u
        if not any(skip in raw_u for skip in ['/social/', '/gz/', '/addresses/']):
            return clean_url(raw_u.split('?')[0])

    # 5. Search for canonical catalog product link: https://www.mercadolivre.com.br/.../p/MLB12345
    catalog_match = re.search(r'https?://(?:www\.)?mercadolivre\.com\.br/[a-zA-Z0-9\-_/]+/p/(MLB\d+)', html)
    if catalog_match:
        return clean_url(catalog_match.group(0))

    # 6. Search for direct item link: https://produto.mercadolivre.com.br/MLB-12345-nome-do-produto
    item_match = re.search(r'https?://(?:www\.|produto\.)?mercadolivre\.com\.br/(MLB-?\d+[a-zA-Z0-9\-_]*)', html)
    if item_match:
        matched_str = item_match.group(0)
        # Ensure it's not a generic asset or static path
        if not any(skip in matched_str for skip in ['/social/', '/addresses/', '/categorias', '/jms/', '/gz/']):
            return clean_url(matched_str)

    # If original_url was already an MLB product URL, preserve its clean path
    if original_url and ('/p/MLB' in original_url or 'produto.mercadolivre.com.br/MLB' in original_url):
        return clean_url(original_url.split('?')[0])

    # Fallback to final redirected URL without query parameters
    return clean_url(final_url.split('?')[0])

def extract_amazon_canonical(final_url, html):
    # Search for ASIN in final URL: /dp/B0..., /gp/product/B0...
    asin_match = re.search(r'/(?:dp|gp/product|product)/([A-Z0-9]{10})', final_url, re.I)
    if asin_match:
        asin = asin_match.group(1).upper()
        return f"https://www.amazon.com.br/dp/{asin}"

    # Search in HTML canonical or og:url
    canon = re.search(r'https?://(?:www\.)?amazon\.com(?:\.br)?/(?:dp|gp/product)/([A-Z0-9]{10})', html, re.I)
    if canon:
        asin = canon.group(1).upper()
        return f"https://www.amazon.com.br/dp/{asin}"

    return clean_url(final_url.split('?')[0])

def extract_shopee_canonical(final_url, html):
    # Shopee product links typically have: shopee.com.br/product-title-i.SHOPID.ITEMID
    prod_match = re.search(r'https?://(?:www\.)?shopee\.com\.br/[^\s"?#]+-i\.\d+\.\d+', final_url)
    if prod_match:
        return clean_url(prod_match.group(0))

    # Check html
    html_match = re.search(r'https?://(?:www\.)?shopee\.com\.br/[^\s"\'?#]+-i\.\d+\.\d+', html)
    if html_match:
        return clean_url(html_match.group(0))

    return clean_url(final_url.split('?')[0])

def extract_magalu_canonical(final_url, html):
    p_match = re.search(r'https?://(?:www\.)?magazineluiza\.com\.br/[^\s"?#]+/p/[^\s"?#]+', final_url)
    if p_match:
        return clean_url(p_match.group(0))
    return clean_url(final_url.split('?')[0])

def is_invalid_or_error_url(url):
    if not url:
        return True
    u_lower = url.lower()
    return any(p in u_lower for p in [
        '/s/error/404',
        '/error/404',
        '/s/error',
        'coin-index',
        '/p/coin',
        'error.mercadolivre',
        'aliexpress.com/s/error'
    ])

def extract_aliexpress_canonical(final_url, html, original_url=""):
    # 1. Check if original_url or final_url contains targetUrl or dl_target_url
    for candidate in [original_url, final_url]:
        if 'targetUrl=' in candidate or 'dl_target_url=' in candidate or 'target_url=' in candidate:
            try:
                parsed = urllib.parse.urlparse(candidate)
                qs = urllib.parse.parse_qs(parsed.query)
                for key in ['targetUrl', 'dl_target_url', 'target_url']:
                    if key in qs and qs[key]:
                        unquoted = urllib.parse.unquote(qs[key][0])
                        item_m = re.search(r'item/(\d+)\.html', unquoted) or re.search(r'/i/(\d+)\.html', unquoted)
                        if item_m:
                            return f"https://pt.aliexpress.com/item/{item_m.group(1)}.html"
            except Exception:
                pass

    # 2. Check if final_url contains an item ID
    final_item = re.search(r'item/(\d+)\.html', final_url) or re.search(r'/i/(\d+)\.html', final_url)
    if final_item:
        return f"https://pt.aliexpress.com/item/{final_item.group(1)}.html"

    # 3. Check HTML for canonical link or og:url with item ID
    html_item = re.search(r'<meta\s+(?:property|name)=["\']og:url["\']\s+content=["\']([^"\']*item/\d+\.html[^"\']*)["\']', html, re.I)
    if not html_item:
        html_item = re.search(r'<link\s+rel=["\']canonical["\']\s+href=["\']([^"\']*item/\d+\.html[^"\']*)["\']', html, re.I)
    if html_item:
        og_url = html_item.group(1).strip()
        m = re.search(r'item/(\d+)\.html', og_url)
        if m:
            return f"https://pt.aliexpress.com/item/{m.group(1)}.html"

    # 4. Check HTML for embedded productId or itemId
    id_match = re.search(r'["\']productId["\']\s*:\s*["\']?(\d{10,20})["\']?', html) or re.search(r'["\']itemId["\']\s*:\s*["\']?(\d{10,20})["\']?', html)
    if id_match:
        return f"https://pt.aliexpress.com/item/{id_match.group(1)}.html"

    # 5. Check if original_url had an item ID
    orig_item = re.search(r'item/(\d+)\.html', original_url) or re.search(r'/i/(\d+)\.html', original_url)
    if orig_item:
        return f"https://pt.aliexpress.com/item/{orig_item.group(1)}.html"

    # If the URL is an error, 404, or coin-index page, NEVER return it as canonical!
    if is_invalid_or_error_url(final_url):
        return ""

    return clean_url(final_url.split('?')[0])

def resolve_url_headless(url):
    original_url = url.strip()
    lower_orig = original_url.lower()

    # Fast-path for already full product URLs (avoids unnecessary redirects/captchas on full URLs)
    if ('/p/mlb' in lower_orig or 'produto.mercadolivre.com.br/mlb' in lower_orig) and 'meli.la' not in lower_orig:
        clean_mlb = clean_url(original_url.split('?')[0])
        return {
            'success': True,
            'originalUrl': original_url,
            'finalUrl': clean_mlb,
            'canonicalLongUrl': clean_mlb,
            'marketplace': 'mercadolivre'
        }

    # If already a direct AliExpress item URL, fast-path it
    if ('aliexpress.com/item/' in lower_orig or 'aliexpress.com/i/' in lower_orig) and 's.click' not in lower_orig and 'a.aliexpress' not in lower_orig:
        clean_ali = clean_url(original_url.split('?')[0])
        item_m = re.search(r'item/(\d+)\.html', clean_ali)
        if item_m:
            canon = f"https://pt.aliexpress.com/item/{item_m.group(1)}.html"
            return {
                'success': True,
                'originalUrl': original_url,
                'finalUrl': canon,
                'canonicalLongUrl': canon,
                'marketplace': 'aliexpress'
            }

    session = HeadlessBrowserSession()

    try:
        final_url, html = session.fetch(original_url)
    except Exception as e:
        return {
            'success': False,
            'originalUrl': original_url,
            'finalUrl': original_url,
            'canonicalLongUrl': original_url,
            'marketplace': 'unknown',
            'error': str(e)
        }

    lower_url = (final_url + " " + original_url).lower()
    canonical = ""
    marketplace = "unknown"

    if 'mercadolivre.com' in lower_url or 'mercadolibre.com' in lower_url or 'meli.la' in lower_url:
        marketplace = 'mercadolivre'
        canonical = extract_mercadolivre_canonical(final_url, html, original_url)
    elif 'amazon.com' in lower_url or 'amzn.to' in lower_url or 'a.co' in lower_url:
        marketplace = 'amazon'
        canonical = extract_amazon_canonical(final_url, html)
    elif 'shopee.com' in lower_url or 'shope.ee' in lower_url or 's.shopee.com' in lower_url:
        marketplace = 'shopee'
        canonical = extract_shopee_canonical(final_url, html)
    elif 'aliexpress.com' in lower_url or 's.click.aliexpress' in lower_url or 'a.aliexpress.com' in lower_url or 'ali.ski' in lower_url:
        marketplace = 'aliexpress'
        canonical = extract_aliexpress_canonical(final_url, html, original_url)
    elif 'magazineluiza.com' in lower_url or 'magazinevoce.com' in lower_url or 'magalu.me' in lower_url:
        marketplace = 'magalu'
        canonical = extract_magalu_canonical(final_url, html)
    else:
        marketplace = 'generic'
        canonical = clean_url(final_url.split('?')[0])

    # Safety check: if canonical or final_url is an error page or 404, reject as invalid
    effective_canonical = canonical or final_url
    if is_invalid_or_error_url(effective_canonical):
        # Check if original_url had any product ID
        item_m = re.search(r'item/(\d+)\.html', original_url) or re.search(r'/p/MLB[-]?\d+', original_url)
        if item_m and 'aliexpress' in lower_url:
            effective_canonical = f"https://pt.aliexpress.com/item/{item_m.group(1)}.html"
        else:
            return {
                'success': False,
                'originalUrl': original_url,
                'finalUrl': final_url,
                'canonicalLongUrl': "",
                'marketplace': marketplace,
                'error': f'URL resolvida para página de erro/404 ({final_url})'
            }

    return {
        'success': True,
        'originalUrl': original_url,
        'finalUrl': final_url,
        'canonicalLongUrl': effective_canonical,
        'marketplace': marketplace
    }

def main():
    if len(sys.argv) < 2:
        print(json.dumps({'success': False, 'error': 'No URL provided'}))
        sys.exit(1)

    url_to_resolve = sys.argv[1]
    result = resolve_url_headless(url_to_resolve)
    print(json.dumps(result))

if __name__ == '__main__':
    main()
