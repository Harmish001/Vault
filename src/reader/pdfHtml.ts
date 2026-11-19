import { PDFJS_B64, PDF_WORKER_B64 } from "./assets/pdfBundle";
import { ReaderTheme } from "../types";
import { THEME_PALETTES } from "./readerHtml";

export function getPdfReaderHtml(
  pdfUriOrBase64: string,
  isBase64: boolean,
  initialPage: number,
  themeName: ReaderTheme,
  initialHighlights?: Array<{
    page: number;
    color: string;
    rx: number;
    ry: number;
    rw: number;
    rh: number;
  }>
): string {
  const theme = THEME_PALETTES[themeName] || THEME_PALETTES.light;
  const isDark = themeName === "dark" || themeName === "black";
  const isBlack = themeName === "black";
  const isSepia = themeName === "sepia";

  let initialFilter = "none";
  if (isDark) {
    initialFilter = isBlack
      ? "invert(1) hue-rotate(180deg) contrast(1.1)"
      : "invert(0.88) hue-rotate(180deg) contrast(1.05)";
  } else if (isSepia) {
    initialFilter = "sepia(0.38) contrast(0.95) brightness(0.96)";
  }

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=3.0, user-scalable=yes" />
  <style>
    * {
      -webkit-tap-highlight-color: transparent;
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    html, body {
      width: 100%;
      height: 100%;
      overflow: hidden;
      background-color: ${theme.bg};
      color: ${theme.text};
      user-select: none;
      -webkit-user-select: none;
      transition: background-color 0.25s ease, color 0.25s ease;
    }
    #container {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
      overflow: hidden;
      perspective: 1400px;
      background-color: ${theme.bg};
      transition: background-color 0.25s ease;
    }
    #page-wrapper {
      position: relative;
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .page-layer {
      position: absolute;
      top: 0; left: 0; right: 0; bottom: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      will-change: transform, opacity;
      pointer-events: none;
    }
    .page-layer.active {
      z-index: 2;
      opacity: 1;
      pointer-events: auto;
    }
    .page-layer.idle {
      z-index: 1;
      opacity: 0;
      pointer-events: none;
    }
    canvas {
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
      border-radius: 2px;
      box-shadow: 0 4px 18px rgba(0,0,0,0.18);
      filter: ${initialFilter};
      transition: filter 0.25s ease;
    }
    .page-shadow {
      position: absolute;
      top: 0; bottom: 0;
      width: 32px;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.2s ease;
      z-index: 5;
    }
    .shadow-left {
      left: 0;
      background: linear-gradient(to right, rgba(0,0,0,0.28), rgba(0,0,0,0.08) 60%, transparent);
    }
    .shadow-right {
      right: 0;
      background: linear-gradient(to left, rgba(0,0,0,0.28), rgba(0,0,0,0.08) 60%, transparent);
    }
    #highlight-surface {
      position: absolute;
      top: 0; left: 0; right: 0; bottom: 0;
      z-index: 15;
      pointer-events: none;
      touch-action: none;
    }
    #highlight-surface.enabled {
      pointer-events: auto;
      cursor: crosshair;
    }
    .highlight-rect {
      position: absolute;
      pointer-events: none;
      border-radius: 3px;
      z-index: 18;
      transition: opacity 0.2s ease;
    }
    .hl-box {
      position: absolute;
      touch-action: none;
      z-index: 25;
      pointer-events: auto;
    }
    .hl-bg {
      position: absolute;
      top: 0; left: 0; right: 0; bottom: 0;
      border-radius: 3px;
      pointer-events: none;
    }
    .hl-handle {
      position: absolute;
      width: 26px;
      height: 26px;
      border-radius: 13px;
      background: #FFFFFF;
      border: 2.5px solid #2678D0;
      box-shadow: 0 2px 8px rgba(0,0,0,0.35);
      touch-action: none;
      z-index: 30;
    }
    .handle-tl { top: -13px; left: -13px; }
    .handle-tr { top: -13px; right: -13px; }
    .handle-bl { bottom: -13px; left: -13px; }
    .handle-br { bottom: -13px; right: -13px; }
    .handle-t  { top: -13px; left: calc(50% - 15px); width: 30px; border-radius: 6px; }
    .handle-b  { bottom: -13px; left: calc(50% - 15px); width: 30px; border-radius: 6px; }

    .hl-action-bar {
      position: absolute;
      background: #1C1917;
      color: #FFFFFF;
      padding: 10px 14px;
      border-radius: 12px;
      box-shadow: 0 6px 22px rgba(0,0,0,0.45);
      display: flex;
      flex-direction: column;
      gap: 8px;
      z-index: 40;
      pointer-events: auto;
      touch-action: auto;
    }
    .hl-preview-text {
      font-family: system-ui, -apple-system, sans-serif;
      font-size: 12px;
      line-height: 16px;
      color: #E7E5E4;
      max-height: 48px;
      overflow: hidden;
      text-overflow: ellipsis;
      display: -webkit-box;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
    }
    .hl-btn-row {
      display: flex;
      flex-direction: row;
      gap: 8px;
    }
    .hl-action-btn {
      border: none;
      border-radius: 8px;
      padding: 7px 12px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .hl-btn-save {
      background: #7A1F35;
      color: #FFFFFF;
      flex: 1;
    }
    .hl-btn-clear {
      background: #44403C;
      color: #D6D3D1;
    }
    #loading {
      position: absolute;
      top: 0; left: 0; right: 0; bottom: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      background-color: ${theme.bg};
      color: ${theme.text};
      font-family: system-ui, -apple-system, Roboto, sans-serif;
      font-size: 15px;
      z-index: 20;
      transition: opacity 0.25s ease-out;
    }
  </style>
  <script>
    try {
      (0, eval)(atob("${PDFJS_B64}"));
      var workerBin = atob("${PDF_WORKER_B64}");
      var workerBytes = new Uint8Array(workerBin.length);
      for (var i = 0; i < workerBin.length; i++) workerBytes[i] = workerBin.charCodeAt(i);
      var workerBlob = new Blob([workerBytes], { type: "application/javascript" });
      pdfjsLib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(workerBlob);
    } catch (e) {
      console.error("PDF init error", e);
    }
  </script>
</head>
<body>
  <div id="loading">Opening PDF…</div>
  <div id="container">
    <div id="page-wrapper">
      <div id="layer-a" class="page-layer active">
        <canvas id="canvas-a"></canvas>
        <div class="page-shadow shadow-left"></div>
        <div class="page-shadow shadow-right"></div>
      </div>
      <div id="layer-b" class="page-layer idle">
        <canvas id="canvas-b"></canvas>
        <div class="page-shadow shadow-left"></div>
        <div class="page-shadow shadow-right"></div>
      </div>
      <div id="highlight-surface"></div>
    </div>
  </div>

  <script>
    (function() {
      var post = function(msg) {
        try {
          if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
            window.ReactNativeWebView.postMessage(JSON.stringify(msg));
          }
        } catch (e) {}
      };

      var pdfSource = ${JSON.stringify(pdfUriOrBase64)};
      var isB64 = ${isBase64 ? "true" : "false"};
      var curPage = ${Math.max(1, initialPage || 1)};
      var currentTheme = ${JSON.stringify(themeName)};
      var pdfDoc = null;
      var totalPages = 0;
      var rendering = false;
      var isAnimating = false;
      var pendingPage = null;
      var pendingDirection = "none";

      var currentViewport = null;
      var currentCssViewport = null;
      var currentUnscaledVp = null;
      var currentScale = 1.0;
      var currentTextContent = null;

      function transformMatrix(m1, m2) {
        return [
          m1[0] * m2[0] + m1[2] * m2[1],
          m1[1] * m2[0] + m1[3] * m2[1],
          m1[0] * m2[2] + m1[2] * m2[3],
          m1[1] * m2[2] + m1[3] * m2[3],
          m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
          m1[1] * m2[4] + m1[3] * m2[5] + m1[5]
        ];
      }

      var isHighlightMode = false;
      var currentHighlightColor = "yellow";
      var highlightColors = {
        yellow: { hex: "#E5A800", rgba: "rgba(229, 168, 0, 0.40)" },
        green: { hex: "#1EA755", rgba: "rgba(30, 167, 85, 0.40)" },
        blue: { hex: "#2678D0", rgba: "rgba(38, 120, 208, 0.40)" },
        pink: { hex: "#D83E7F", rgba: "rgba(216, 62, 127, 0.40)" }
      };

      var savedHighlights = ${JSON.stringify(initialHighlights || [])}; // { page, rx, ry, rw, rh, color }

      var layerA = document.getElementById("layer-a");
      var layerB = document.getElementById("layer-b");
      var canvasA = document.getElementById("canvas-a");
      var canvasB = document.getElementById("canvas-b");
      var ctxA = canvasA.getContext("2d");
      var ctxB = canvasB.getContext("2d");
      var loadingEl = document.getElementById("loading");
      var container = document.getElementById("container");
      var hlSurface = document.getElementById("highlight-surface");

      var activeLayer = layerA;
      var idleLayer = layerB;
      var activeCanvas = canvasA;
      var idleCanvas = canvasB;
      var activeCtx = ctxA;
      var idleCtx = ctxB;

      function getFilterForTheme(t) {
        if (t === "black") return "invert(1) hue-rotate(180deg) contrast(1.1)";
        if (t === "dark") return "invert(0.88) hue-rotate(180deg) contrast(1.05)";
        if (t === "sepia") return "sepia(0.38) contrast(0.95) brightness(0.96)";
        return "none";
      }

      function getBgForTheme(t) {
        if (t === "dark") return "#1E1E1E";
        if (t === "black") return "#000000";
        if (t === "sepia") return "#F4EBD9";
        return "#F6F5F2";
      }

      function getColorForTheme(t) {
        if (t === "dark") return "#E0E0E0";
        if (t === "black") return "#B8B8B8";
        if (t === "sepia") return "#433422";
        return "#1C1917";
      }

      function applyTheme(t) {
        currentTheme = t;
        var bg = getBgForTheme(t);
        var col = getColorForTheme(t);
        var flt = getFilterForTheme(t);

        document.body.style.backgroundColor = bg;
        document.body.style.color = col;
        if (container) container.style.backgroundColor = bg;
        if (canvasA) canvasA.style.filter = flt;
        if (canvasB) canvasB.style.filter = flt;
      }

      function hideLoading() {
        if (loadingEl) {
          loadingEl.style.opacity = "0";
          setTimeout(function() {
            if (loadingEl && loadingEl.parentNode) {
              loadingEl.parentNode.removeChild(loadingEl);
              loadingEl = null;
            }
          }, 250);
        }
      }

      function onPdfLoaded(pdf) {
        pdfDoc = pdf;
        totalPages = pdf.numPages;
        post({ type: "loaded", pages: totalPages });
        renderPage(curPage, "none");

        // If resuming a book past page 1, still generate page 1 cover thumbnail in the background
        if (curPage !== 1) {
          try {
            pdf.getPage(1).then(function(page1) {
              var unscaledVp = page1.getViewport({ scale: 1 });
              var scale = 220 / unscaledVp.width;
              var vp = page1.getViewport({ scale: scale });
              var c = document.createElement("canvas");
              c.width = Math.floor(vp.width);
              c.height = Math.floor(vp.height);
              var ctx = c.getContext("2d");
              page1.render({ canvasContext: ctx, viewport: vp }).promise.then(function() {
                var thumb = c.toDataURL("image/jpeg", 0.7);
                post({
                  type: "page_thumbnail",
                  page: 1,
                  dataUrl: thumb
                });
              }).catch(function(){});
            }).catch(function(){});
          } catch(e) {}
        }
      }

      function onPdfError(err) {
        if (loadingEl) loadingEl.textContent = "Could not parse PDF: " + (err && err.message ? err.message : "");
        post({ type: "error", message: (err && err.message) || "Could not parse PDF" });
      }

      function redrawSavedHighlights() {
        hlSurface.querySelectorAll(".saved-hl").forEach(function(el) {
          el.remove();
        });
        var pageHls = savedHighlights.filter(function(h) { return h.page === curPage; });
        var activeRect = activeCanvas.getBoundingClientRect();
        var surfRect = hlSurface.getBoundingClientRect();

        pageHls.forEach(function(h) {
          var el = document.createElement("div");
          el.className = "highlight-rect saved-hl";
          var pal = highlightColors[h.color] || highlightColors.yellow;
          el.style.backgroundColor = pal.rgba;
          el.style.borderBottom = "2.5px solid " + pal.hex;
          el.style.left = (activeRect.left - surfRect.left + (h.rx * activeRect.width)) + "px";
          el.style.top = (activeRect.top - surfRect.top + (h.ry * activeRect.height)) + "px";
          el.style.width = (h.rw * activeRect.width) + "px";
          el.style.height = (h.rh * activeRect.height) + "px";
          hlSurface.appendChild(el);
        });
      }

      function extractCurrentPageText() {
        if (!pdfDoc) {
          post({ type: "page_text_extracted", page: curPage, text: "", imageData: null });
          return;
        }
        pdfDoc.getPage(curPage).then(function(page) {
          page.getTextContent().then(function(tc) {
            var items = (tc && tc.items) || [];
            var text = items.map(function(it) { return it.str; }).filter(Boolean).join(" ").replace(/\s+/g, " ").trim();

            var canvas = activeCanvas;
            var imgData = null;
            try {
              imgData = canvas ? canvas.toDataURL("image/jpeg", 0.8) : null;
            } catch (e) {}

            post({
              type: "page_text_extracted",
              page: curPage,
              text: text,
              imageData: imgData
            });
          }).catch(function() {
            var canvas = activeCanvas;
            var imgData = null;
            try {
              imgData = canvas ? canvas.toDataURL("image/jpeg", 0.8) : null;
            } catch (e) {}
            post({
              type: "page_text_extracted",
              page: curPage,
              text: "",
              imageData: imgData
            });
          });
        }).catch(function() {
          post({
            type: "page_text_extracted",
            page: curPage,
            text: "",
            imageData: null
          });
        });
      }

      function extractTextFromRect(box) {
        if (!currentTextContent || !currentTextContent.items || !currentCssViewport) return "";
        var items = currentTextContent.items;
        var vpTransform = currentCssViewport.transform;
        var scale = currentScale;

        var boxX1 = box.x;
        var boxX2 = box.x + box.w;
        var boxY1 = box.y;
        var boxY2 = box.y + box.h;

        var hTol = 8;
        var vTol = 8;
        var matched = [];

        for (var i = 0; i < items.length; i++) {
          var it = items[i];
          if (!it.str || !it.str.trim()) continue;

          var tx = transformMatrix(vpTransform, it.transform);
          var fontH = Math.max(9, Math.hypot(tx[2], tx[3]));
          var itW = it.width ? (it.width * scale) : (it.str.length * fontH * 0.55);

          var itemX1 = Math.min(tx[4], tx[4] + itW);
          var itemX2 = Math.max(tx[4], tx[4] + itW);
          var itemY1 = tx[5] - fontH;
          var itemY2 = tx[5] + (fontH * 0.25);

          var overlapX = (itemX2 >= boxX1 - hTol && itemX1 <= boxX2 + hTol);
          var overlapY = (itemY2 >= boxY1 - vTol && itemY1 <= boxY2 + vTol);

          if (overlapX && overlapY) {
            matched.push({
              str: it.str,
              screenX: itemX1,
              screenY: itemY1,
              fontH: fontH
            });
          }
        }

        if (matched.length === 0) return "";

        matched.sort(function(a, b) {
          var diffY = a.screenY - b.screenY;
          if (Math.abs(diffY) > Math.min(a.fontH, b.fontH) * 0.5) return diffY;
          return a.screenX - b.screenX;
        });

        return matched.map(function(m) { return m.str; }).join(" ").replace(/\s+/g, " ").trim();
      }

      function extractImageSlice(box) {
        try {
          var dpr = Math.min(window.devicePixelRatio || 1, 2.5);
          var sliceCanvas = document.createElement("canvas");
          var sw = Math.max(10, Math.floor(box.w * dpr));
          var sh = Math.max(10, Math.floor(box.h * dpr));
          sliceCanvas.width = sw;
          sliceCanvas.height = sh;
          var sCtx = sliceCanvas.getContext("2d");
          sCtx.drawImage(
            activeCanvas,
            Math.max(0, Math.floor(box.x * dpr)),
            Math.max(0, Math.floor(box.y * dpr)),
            sw,
            sh,
            0,
            0,
            sw,
            sh
          );
          return sliceCanvas.toDataURL("image/jpeg", 0.85);
        } catch (e) {
          return null;
        }
      }

      function renderPage(num, direction) {
        if (!pdfDoc) return;
        if (num < 1) num = 1;
        if (num > totalPages) num = totalPages;

        if (direction === undefined) {
          if (num > curPage) direction = "next";
          else if (num < curPage) direction = "prev";
          else direction = "none";
        }

        if (rendering || isAnimating) {
          pendingPage = num;
          pendingDirection = direction;
          return;
        }

        clearActiveAdjustableBox();

        rendering = true;
        var targetPageNum = num;

        pdfDoc.getPage(targetPageNum).then(function(page) {
          var cWidth = container.clientWidth || window.innerWidth;
          var cHeight = container.clientHeight || window.innerHeight;

          var unscaledVp = page.getViewport({ scale: 1.0 });
          var scale = Math.min(cWidth / unscaledVp.width, cHeight / unscaledVp.height);
          var dpr = Math.min(window.devicePixelRatio || 1, 2.5);

          var viewport = page.getViewport({ scale: scale * dpr });
          var cssViewport = page.getViewport({ scale: scale });
          currentViewport = viewport;
          currentCssViewport = cssViewport;
          currentUnscaledVp = unscaledVp;
          currentScale = scale;

          page.getTextContent().then(function(tc) {
            currentTextContent = tc;
          }).catch(function() {
            currentTextContent = null;
          });

          var renderCanvas = direction === "none" ? activeCanvas : idleCanvas;
          var renderCtx = direction === "none" ? activeCtx : idleCtx;

          renderCanvas.width = Math.floor(viewport.width);
          renderCanvas.height = Math.floor(viewport.height);
          renderCanvas.style.width = Math.floor(viewport.width / dpr) + "px";
          renderCanvas.style.height = Math.floor(viewport.height / dpr) + "px";

          var renderContext = {
            canvasContext: renderCtx,
            viewport: viewport
          };

          page.render(renderContext).promise.then(function() {
            rendering = false;
            curPage = targetPageNum;

            if (curPage === 1) {
              try {
                var thumb = renderCanvas.toDataURL("image/jpeg", 0.7);
                post({
                  type: "page_thumbnail",
                  page: 1,
                  dataUrl: thumb
                });
              } catch(e) {}
            }

            if (direction === "none" || loadingEl) {
              hideLoading();
              redrawSavedHighlights();
              post({
                type: "page_changed",
                page: curPage,
                total: totalPages,
                percentage: curPage / totalPages
              });
              if (pendingPage !== null) {
                var nextP = pendingPage;
                var nextD = pendingDirection;
                pendingPage = null;
                renderPage(nextP, nextD);
              }
              return;
            }

            // Book page-turn animation (300ms smooth slide with paper depth & shadow)
            isAnimating = true;
            var duration = 300;

            if (direction === "next") {
              idleLayer.style.transition = "none";
              idleLayer.style.transform = "translate3d(100%, 0, 0)";
              idleLayer.style.opacity = "1";
              idleLayer.style.zIndex = "3";
              idleLayer.className = "page-layer active";

              var shadow = idleLayer.querySelector(".shadow-left");
              if (shadow) shadow.style.opacity = "1";

              void idleLayer.offsetWidth; // force reflow

              idleLayer.style.transition = "transform " + duration + "ms cubic-bezier(0.2, 0, 0.25, 1), box-shadow " + duration + "ms ease";
              idleLayer.style.transform = "translate3d(0, 0, 0)";
              idleLayer.style.boxShadow = "-12px 0 28px rgba(0,0,0,0.32)";

              activeLayer.style.transition = "transform " + duration + "ms cubic-bezier(0.2, 0, 0.25, 1), filter " + duration + "ms ease";
              activeLayer.style.transform = "translate3d(-20%, 0, 0) scale(0.98)";
              activeLayer.style.filter = "brightness(0.85)";

              setTimeout(function() {
                if (shadow) shadow.style.opacity = "0";
                idleLayer.style.boxShadow = "";
                idleLayer.style.zIndex = "2";

                activeLayer.className = "page-layer idle";
                activeLayer.style.transition = "none";
                activeLayer.style.transform = "";
                activeLayer.style.filter = getFilterForTheme(currentTheme);
                activeLayer.style.zIndex = "1";
                activeLayer.style.opacity = "0";

                var tempL = activeLayer; activeLayer = idleLayer; idleLayer = tempL;
                var tempC = activeCanvas; activeCanvas = idleCanvas; idleCanvas = tempC;
                var tempCtx = activeCtx; activeCtx = idleCtx; idleCtx = tempCtx;

                isAnimating = false;
                redrawSavedHighlights();
                post({
                  type: "page_changed",
                  page: curPage,
                  total: totalPages,
                  percentage: curPage / totalPages
                });

                if (pendingPage !== null) {
                  var p = pendingPage;
                  var d = pendingDirection;
                  pendingPage = null;
                  renderPage(p, d);
                }
              }, duration);

            } else {
              idleLayer.style.transition = "none";
              idleLayer.style.transform = "translate3d(-20%, 0, 0) scale(0.98)";
              idleLayer.style.filter = "brightness(0.85)";
              idleLayer.style.opacity = "1";
              idleLayer.style.zIndex = "1";
              idleLayer.className = "page-layer active";

              activeLayer.style.zIndex = "3";
              activeLayer.style.boxShadow = "-12px 0 28px rgba(0,0,0,0.32)";

              void idleLayer.offsetWidth; // force reflow

              activeLayer.style.transition = "transform " + duration + "ms cubic-bezier(0.2, 0, 0.25, 1)";
              activeLayer.style.transform = "translate3d(100%, 0, 0)";

              idleLayer.style.transition = "transform " + duration + "ms cubic-bezier(0.2, 0, 0.25, 1), filter " + duration + "ms ease";
              idleLayer.style.transform = "translate3d(0, 0, 0) scale(1)";
              idleLayer.style.filter = getFilterForTheme(currentTheme);

              setTimeout(function() {
                activeLayer.className = "page-layer idle";
                activeLayer.style.transition = "none";
                activeLayer.style.transform = "";
                activeLayer.style.boxShadow = "";
                activeLayer.style.filter = getFilterForTheme(currentTheme);
                activeLayer.style.zIndex = "1";
                activeLayer.style.opacity = "0";

                idleLayer.style.zIndex = "2";

                var tempL = activeLayer; activeLayer = idleLayer; idleLayer = tempL;
                var tempC = activeCanvas; activeCanvas = idleCanvas; idleCanvas = tempC;
                var tempCtx = activeCtx; activeCtx = idleCtx; idleCtx = tempCtx;

                isAnimating = false;
                redrawSavedHighlights();
                post({
                  type: "page_changed",
                  page: curPage,
                  total: totalPages,
                  percentage: curPage / totalPages
                });

                if (pendingPage !== null) {
                  var p = pendingPage;
                  var d = pendingDirection;
                  pendingPage = null;
                  renderPage(p, d);
                }
              }, duration);
            }
          });
        }).catch(function(err) {
          rendering = false;
          isAnimating = false;
          onPdfError(err);
        });
      }

      try {
        if (isB64) {
          var raw = atob(pdfSource);
          var buf = new Uint8Array(raw.length);
          for (var i = 0; i < raw.length; i++) buf[i] = raw.charCodeAt(i);
          pdfjsLib.getDocument({ data: buf }).promise.then(onPdfLoaded).catch(onPdfError);
        } else {
          var urlParam = {
            url: pdfSource,
            cMapPacked: true,
            disableAutoFetch: false,
            disableStream: false
          };
          pdfjsLib.getDocument(urlParam).promise.then(onPdfLoaded).catch(function(urlErr) {
            console.warn("Direct URL load failed, trying XHR ArrayBuffer fallback:", urlErr);
            try {
              var xhr = new XMLHttpRequest();
              xhr.open("GET", pdfSource, true);
              xhr.responseType = "arraybuffer";
              xhr.onload = function() {
                if ((xhr.status === 200 || xhr.status === 0) && xhr.response) {
                  pdfjsLib.getDocument({ data: new Uint8Array(xhr.response) }).promise.then(onPdfLoaded).catch(onPdfError);
                } else {
                  onPdfError(urlErr);
                }
              };
              xhr.onerror = function() {
                onPdfError(urlErr);
              };
              xhr.send();
            } catch (xhrEx) {
              onPdfError(urlErr);
            }
          });
        }
      } catch (e) {
        onPdfError(e);
      }

      // Gesture handling: ONLY deliberate horizontal swipe flips page (duration < 650ms, dist > 75px, not zoomed in)
      var touchStartX = 0;
      var touchStartY = 0;
      var touchStartTime = 0;

      container.addEventListener("touchstart", function(e) {
        if (isHighlightMode) return;
        if (e.touches && e.touches[0]) {
          touchStartX = e.touches[0].clientX;
          touchStartY = e.touches[0].clientY;
          touchStartTime = Date.now();
        }
      }, { passive: true });

      container.addEventListener("touchend", function(e) {
        if (isHighlightMode) return;
        if (!e.changedTouches || !e.changedTouches[0]) return;
        var diffX = e.changedTouches[0].clientX - touchStartX;
        var diffY = e.changedTouches[0].clientY - touchStartY;
        var duration = Date.now() - touchStartTime;

        var zoomScale = (window.visualViewport && window.visualViewport.scale) || 1.0;
        if (zoomScale > 1.05) return;

        if (duration < 650 && Math.abs(diffX) > 75 && Math.abs(diffX) > Math.abs(diffY) * 2) {
          if (diffX < 0) {
            renderPage(curPage + 1, "next");
          } else {
            renderPage(curPage - 1, "prev");
          }
        }
      }, { passive: true });

      // Click only toggles UI - NEVER flips pages
      container.addEventListener("click", function(e) {
        if (isHighlightMode) return;
        post({ type: "toggle_ui" });
      });

      // ─── Interactive & Resizable Highlighter Architecture ────────────────────
      var activeAdjustableBox = null;
      var activeActionBar = null;
      var currentBoxCoords = null; // { x, y, w, h }
      var currentPreviewText = "";
      var isDraggingHandle = false;
      var dragHandleType = null;
      var dragHandleStart = null;
      var initialBoxOnDrag = null;

      function clearActiveAdjustableBox() {
        if (activeActionBar) {
          activeActionBar.remove();
          activeActionBar = null;
        }
        if (activeAdjustableBox) {
          activeAdjustableBox.remove();
          activeAdjustableBox = null;
        }
        currentBoxCoords = null;
        currentPreviewText = "";
      }

      function repositionActionBar() {
        if (!activeActionBar || !activeAdjustableBox) return;
        var bLeft = parseFloat(activeAdjustableBox.style.left) || 0;
        var bTop = parseFloat(activeAdjustableBox.style.top) || 0;
        var bWidth = parseFloat(activeAdjustableBox.style.width) || 0;
        var bHeight = parseFloat(activeAdjustableBox.style.height) || 0;
        var sWidth = hlSurface.clientWidth || window.innerWidth;

        var barWidth = Math.min(300, sWidth - 28);
        var centerX = bLeft + (bWidth / 2);
        var targetLeft = centerX - (barWidth / 2);
        targetLeft = Math.max(14, Math.min(sWidth - barWidth - 14, targetLeft));

        activeActionBar.style.width = barWidth + "px";
        activeActionBar.style.left = targetLeft + "px";

        // Place above if room, else below
        if (bTop > 88) {
          activeActionBar.style.top = (bTop - 80) + "px";
        } else {
          activeActionBar.style.top = (bTop + bHeight + 14) + "px";
        }
      }

      function createAdjustableBox(surfX, surfY, surfW, surfH) {
        clearActiveAdjustableBox();

        var sRect = hlSurface.getBoundingClientRect();
        var cRect = activeCanvas.getBoundingClientRect();
        var relX = surfX - (cRect.left - sRect.left);
        var relY = surfY - (cRect.top - sRect.top);
        currentBoxCoords = { x: relX, y: relY, w: surfW, h: surfH };

        var boxEl = document.createElement("div");
        boxEl.className = "hl-box";
        boxEl.style.left = surfX + "px";
        boxEl.style.top = surfY + "px";
        boxEl.style.width = surfW + "px";
        boxEl.style.height = surfH + "px";

        var pal = highlightColors[currentHighlightColor] || highlightColors.yellow;

        var bg = document.createElement("div");
        bg.className = "hl-bg";
        bg.style.backgroundColor = pal.rgba;
        bg.style.border = "1.5px solid " + pal.hex;
        boxEl.appendChild(bg);

        // Resize handles: 4 corners + top & bottom edge
        var handles = ["tl", "tr", "bl", "br", "t", "b"];
        handles.forEach(function(h) {
          var hEl = document.createElement("div");
          hEl.className = "hl-handle handle-" + h;
          hEl.setAttribute("data-handle", h);
          hEl.style.borderColor = pal.hex;

          hEl.addEventListener("touchstart", function(ev) {
            ev.stopPropagation();
            if (!ev.touches || !ev.touches[0]) return;
            isDraggingHandle = true;
            dragHandleType = h;
            dragHandleStart = { x: ev.touches[0].clientX, y: ev.touches[0].clientY };
            initialBoxOnDrag = {
              surfX: parseFloat(boxEl.style.left) || 0,
              surfY: parseFloat(boxEl.style.top) || 0,
              surfW: parseFloat(boxEl.style.width) || 0,
              surfH: parseFloat(boxEl.style.height) || 0
            };
          }, { passive: false });

          boxEl.appendChild(hEl);
        });

        hlSurface.appendChild(boxEl);
        activeAdjustableBox = boxEl;

        // Floating action toolbar directly attached to hlSurface
        var actionEl = document.createElement("div");
        actionEl.className = "hl-action-bar";

        // Prevent touch bubbling to drawing surface
        actionEl.addEventListener("touchstart", function(ev) {
          ev.stopPropagation();
        }, { passive: false });
        actionEl.addEventListener("touchmove", function(ev) {
          ev.stopPropagation();
        }, { passive: false });
        actionEl.addEventListener("touchend", function(ev) {
          ev.stopPropagation();
        }, { passive: false });

        var preview = document.createElement("div");
        preview.className = "hl-preview-text";
        actionEl.appendChild(preview);

        var btnRow = document.createElement("div");
        btnRow.className = "hl-btn-row";

        var saveBtn = document.createElement("button");
        saveBtn.className = "hl-action-btn hl-btn-save";
        saveBtn.textContent = "✓ Save Highlight";

        var isCommitted = false;
        function handleCommit(ev) {
          if (ev) {
            ev.stopPropagation();
            if (ev.preventDefault) ev.preventDefault();
          }
          if (isCommitted) return;
          isCommitted = true;
          onCommitHighlight();
        }

        saveBtn.addEventListener("touchstart", function(ev) {
          ev.stopPropagation();
        }, { passive: false });
        saveBtn.addEventListener("touchend", handleCommit, { passive: false });
        saveBtn.addEventListener("click", handleCommit);

        var clearBtn = document.createElement("button");
        clearBtn.className = "hl-action-btn hl-btn-clear";
        clearBtn.textContent = "✕ Clear";

        function handleClear(ev) {
          if (ev) {
            ev.stopPropagation();
            if (ev.preventDefault) ev.preventDefault();
          }
          clearActiveAdjustableBox();
        }

        clearBtn.addEventListener("touchstart", function(ev) {
          ev.stopPropagation();
        }, { passive: false });
        clearBtn.addEventListener("touchend", handleClear, { passive: false });
        clearBtn.addEventListener("click", handleClear);

        btnRow.appendChild(saveBtn);
        btnRow.appendChild(clearBtn);
        actionEl.appendChild(btnRow);

        hlSurface.appendChild(actionEl);
        activeActionBar = actionEl;

        updateBoxPreview();
        repositionActionBar();
      }

      function updateBoxPreview() {
        if (!activeAdjustableBox || !currentBoxCoords) return;
        var text = extractTextFromRect(currentBoxCoords);
        currentPreviewText = text;
        if (activeActionBar) {
          var prevEl = activeActionBar.querySelector(".hl-preview-text");
          if (prevEl) {
            if (text && text.trim()) {
              prevEl.textContent = "“" + text.slice(0, 120) + (text.length > 120 ? "…”" : "”");
            } else {
              prevEl.textContent = "Section selected (tap Save to run OCR)";
            }
          }
        }
      }

      function onCommitHighlight() {
        if (!currentBoxCoords) return;
        var cRect = activeCanvas.getBoundingClientRect();

        var highlightItem = {
          page: curPage,
          color: currentHighlightColor,
          rx: currentBoxCoords.x / cRect.width,
          ry: currentBoxCoords.y / cRect.height,
          rw: currentBoxCoords.w / cRect.width,
          rh: currentBoxCoords.h / cRect.height
        };

        savedHighlights.push(highlightItem);

        var extractedText = extractTextFromRect(currentBoxCoords);
        var imageSlice = extractedText ? null : extractImageSlice(currentBoxCoords);

        clearActiveAdjustableBox();
        redrawSavedHighlights();

        post({
          type: "highlight_captured",
          page: curPage,
          text: extractedText,
          color: currentHighlightColor,
          imageData: imageSlice,
          rect: highlightItem
        });
      }

      // Handle touch interaction for drawing & resizing
      var hlDrawStartX = 0;
      var hlDrawStartY = 0;
      var liveDrawBox = null;

      hlSurface.addEventListener("touchstart", function(e) {
        if (!isHighlightMode || !e.touches || !e.touches[0]) return;
        if (isDraggingHandle) return;

        // If touched inside action bar or handle, ignore completely
        if (e.target && (e.target.closest(".hl-action-bar") || e.target.closest(".hl-handle"))) {
          return;
        }

        // If user tapped on/near active box or action bar, keep it active
        if (activeAdjustableBox) {
          var aRect = activeAdjustableBox.getBoundingClientRect();
          var actRect = activeActionBar ? activeActionBar.getBoundingClientRect() : null;
          var tX = e.touches[0].clientX;
          var tY = e.touches[0].clientY;
          var inBox = (tX >= aRect.left - 5 && tX <= aRect.right + 5 && tY >= aRect.top - 5 && tY <= aRect.bottom + 5);
          var inAct = actRect && (tX >= actRect.left - 10 && tX <= actRect.right + 10 && tY >= actRect.top - 10 && tY <= actRect.bottom + 10);
          if (inBox || inAct) {
            return;
          }
          clearActiveAdjustableBox();
        }

        var t = e.touches[0];
        var sRect = hlSurface.getBoundingClientRect();
        hlDrawStartX = t.clientX - sRect.left;
        hlDrawStartY = t.clientY - sRect.top;

        liveDrawBox = document.createElement("div");
        liveDrawBox.className = "highlight-rect";
        var pal = highlightColors[currentHighlightColor] || highlightColors.yellow;
        liveDrawBox.style.backgroundColor = pal.rgba;
        liveDrawBox.style.border = "1.5px dashed " + pal.hex;
        liveDrawBox.style.left = hlDrawStartX + "px";
        liveDrawBox.style.top = hlDrawStartY + "px";
        liveDrawBox.style.width = "0px";
        liveDrawBox.style.height = "0px";
        hlSurface.appendChild(liveDrawBox);
      }, { passive: false });

      hlSurface.addEventListener("touchmove", function(e) {
        if (!isHighlightMode || !e.touches || !e.touches[0]) return;
        e.preventDefault();

        if (isDraggingHandle && activeAdjustableBox && dragHandleStart && initialBoxOnDrag) {
          var curTouch = e.touches[0];
          var deltaX = curTouch.clientX - dragHandleStart.x;
          var deltaY = curTouch.clientY - dragHandleStart.y;

          var newX = initialBoxOnDrag.surfX;
          var newY = initialBoxOnDrag.surfY;
          var newW = initialBoxOnDrag.surfW;
          var newH = initialBoxOnDrag.surfH;

          switch (dragHandleType) {
            case "br":
              newW = Math.max(20, initialBoxOnDrag.surfW + deltaX);
              newH = Math.max(16, initialBoxOnDrag.surfH + deltaY);
              break;
            case "bl":
              var rightEdge = initialBoxOnDrag.surfX + initialBoxOnDrag.surfW;
              newX = Math.min(rightEdge - 20, initialBoxOnDrag.surfX + deltaX);
              newW = rightEdge - newX;
              newH = Math.max(16, initialBoxOnDrag.surfH + deltaY);
              break;
            case "tr":
              var bottomEdge = initialBoxOnDrag.surfY + initialBoxOnDrag.surfH;
              newY = Math.min(bottomEdge - 16, initialBoxOnDrag.surfY + deltaY);
              newH = bottomEdge - newY;
              newW = Math.max(20, initialBoxOnDrag.surfW + deltaX);
              break;
            case "tl":
              var rE = initialBoxOnDrag.surfX + initialBoxOnDrag.surfW;
              var bE = initialBoxOnDrag.surfY + initialBoxOnDrag.surfH;
              newX = Math.min(rE - 20, initialBoxOnDrag.surfX + deltaX);
              newY = Math.min(bE - 16, initialBoxOnDrag.surfY + deltaY);
              newW = rE - newX;
              newH = bE - newY;
              break;
            case "t":
              var bEdge = initialBoxOnDrag.surfY + initialBoxOnDrag.surfH;
              newY = Math.min(bEdge - 16, initialBoxOnDrag.surfY + deltaY);
              newH = bEdge - newY;
              break;
            case "b":
              newH = Math.max(16, initialBoxOnDrag.surfH + deltaY);
              break;
          }

          activeAdjustableBox.style.left = newX + "px";
          activeAdjustableBox.style.top = newY + "px";
          activeAdjustableBox.style.width = newW + "px";
          activeAdjustableBox.style.height = newH + "px";

          var sRect = hlSurface.getBoundingClientRect();
          var cRect = activeCanvas.getBoundingClientRect();
          currentBoxCoords = {
            x: newX - (cRect.left - sRect.left),
            y: newY - (cRect.top - sRect.top),
            w: newW,
            h: newH
          };

          updateBoxPreview();
          repositionActionBar();
          return;
        }

        if (liveDrawBox) {
          var t = e.touches[0];
          var sRect = hlSurface.getBoundingClientRect();
          var curX = t.clientX - sRect.left;
          var curY = t.clientY - sRect.top;

          var boxLeft = Math.min(hlDrawStartX, curX);
          var boxTop = Math.min(hlDrawStartY, curY);
          var boxWidth = Math.abs(curX - hlDrawStartX);
          var boxHeight = Math.abs(curY - hlDrawStartY);

          liveDrawBox.style.left = boxLeft + "px";
          liveDrawBox.style.top = boxTop + "px";
          liveDrawBox.style.width = boxWidth + "px";
          liveDrawBox.style.height = boxHeight + "px";
        }
      }, { passive: false });

      hlSurface.addEventListener("touchend", function(e) {
        if (!isHighlightMode) return;

        if (isDraggingHandle) {
          isDraggingHandle = false;
          dragHandleType = null;
          dragHandleStart = null;
          initialBoxOnDrag = null;
          updateBoxPreview();
          repositionActionBar();
          return;
        }

        if (!liveDrawBox) return;

        var boxLeft = parseFloat(liveDrawBox.style.left) || 0;
        var boxTop = parseFloat(liveDrawBox.style.top) || 0;
        var boxW = parseFloat(liveDrawBox.style.width) || 0;
        var boxH = parseFloat(liveDrawBox.style.height) || 0;

        liveDrawBox.remove();
        liveDrawBox = null;

        if (boxW < 20 || boxH < 14) {
          return;
        }

        // Create the adjustable box with resize handles and action toolbar
        createAdjustableBox(boxLeft, boxTop, boxW, boxH);
      }, { passive: false });

      // Handle native commands
      window.handleNativeMessage = function(data) {
        if (!data) return;
        switch (data.action) {
          case "next":
            renderPage(curPage + 1, "next");
            break;
          case "prev":
            renderPage(curPage - 1, "prev");
            break;
          case "jump_page":
            if (typeof data.page === "number") renderPage(data.page);
            break;
          case "extract_page_text":
            extractCurrentPageText();
            break;
          case "update_settings":
            if (data.theme) applyTheme(data.theme);
            break;
          case "set_highlight_mode":
            isHighlightMode = !!data.enabled;
            if (data.color) currentHighlightColor = data.color;
            if (isHighlightMode) {
              hlSurface.classList.add("enabled");
            } else {
              hlSurface.classList.remove("enabled");
              clearActiveAdjustableBox();
            }
            break;
          case "set_highlight_color":
            if (data.color) currentHighlightColor = data.color;
            break;
          case "cancel_last_highlight":
            if (savedHighlights.length > 0) {
              savedHighlights.pop();
              redrawSavedHighlights();
            }
            break;
          case "add_highlight":
            if (data.highlight) {
              savedHighlights.push(data.highlight);
              redrawSavedHighlights();
            }
            break;
        }
      };

      document.addEventListener("message", function(e) {
        try { window.handleNativeMessage(JSON.parse(e.data)); } catch (err) {}
      });
      window.addEventListener("message", function(e) {
        try { window.handleNativeMessage(JSON.parse(e.data)); } catch (err) {}
      });

    })();
  </script>
</body>
</html>`;
}
