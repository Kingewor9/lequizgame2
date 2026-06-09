import urllib.request, re
try:
    html = urllib.request.urlopen("https://ibb.co/21NQg7js").read().decode("utf-8")
    m = re.search(r'property="og:image"\s+content="([^"]+)"', html)
    if m:
        print(m.group(1))
    else:
        print("NOT FOUND")
except Exception as e:
    print(e)
