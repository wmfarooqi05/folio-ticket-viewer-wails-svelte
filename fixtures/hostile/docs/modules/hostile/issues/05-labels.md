---
type: build
status: open
---

# 05 — Labels that lie

- RTL override in a label: [invoice‮fdp.exe](https://evil.example/rtl)
- RTL override in the URL: [x](https://evil.example/‮moc.doog)
- Homoglyph host (Cyrillic а): [https://pаypal.com](https://pаypal.com/login)
- Punycode: [https://paypal.com](https://xn--pypal-4ve.com/)
- A label that shows another URL: [https://good.example/docs](https://evil.example/phish)
- Zero-width characters: [good​.example](https://evil.example/zw) and https://evil​.example/zw-bare
- Bidi isolate: [⁦https://good.example⁩](https://evil.example/isolate)
- Combining marks: [g̷o̷o̷d̷](https://evil.example/combining)
- A label made of a reference: [01](https://evil.example/ref-label) and [modules/hostile/issues/01-html-svg.md](https://evil.example/path-label)
- Fullwidth: [ｈｔｔｐｓ://good.example](https://evil.example/fullwidth)

## ‮A heading with an RTL override

<a id="‮rtl"></a>

### Q1 — ‮an item with an RTL override
