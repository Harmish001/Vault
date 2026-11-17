import { PDFJS_B64, PDF_WORKER_B64 } from "./assets/pdfBundle";
import { ReaderTheme } from "../types";
import { THEME_PALETTES } from "./readerHtml";

export function getPdfReaderHtml(
  pdfUriOrBase64: string,
  isBase64: boolean,
  initialPage: number,
  themeName: ReaderTheme
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
      z-index: 10;
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
      mix-blend-mode: multiply;
      transition: opacity 0.2s ease;
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
      var currentTextContent = null;
      var isHighlightMode = false;
      var currentHighlightColor = "yellow";
      var highlightColors = {
        yellow: { hex: "#E5A800", rgba: "rgba(254, 218, 54, 0.42)" },
        green: { hex: "#1EA755", rgba: "rgba(30, 167, 85, 0.38)" },
        blue: { hex: "#2678D0", rgba: "rgba(38, 120, 208, 0.38)" },
        pink: { hex: "#D83E7F", rgba: "rgba(216, 62, 127, 0.38)" }
      };

      var savedHighlights = []; // { page, x, y, w, h, color }

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
        if (!currentTextContent || !currentTextContent.items || !currentViewport) return "";
        var items = currentTextContent.items;
        var matched = [];
        var dpr = Math.min(window.devicePixelRatio || 1, 2.5);

        for (var i = 0; i < items.length; i++) {
          var it = items[i];
          if (!it.str || !it.str.trim()) continue;
          var tx = it.transform[4];
          var ty = it.transform[5];
          var vpPoint = currentViewport.convertToViewportPoint(tx, ty);
          var itemX = vpPoint[0] / dpr;
          var itemY = vpPoint[1] / dpr;
          var itemW = (it.width || 12) * (currentViewport.scale / (dpr * Math.abs(it.transform[0] || 1)));
          var itemH = Math.abs(it.height || it.transform[3] || 12) * (currentViewport.scale / dpr);

          var inX = (itemX + itemW >= box.x && itemX <= box.x + box.w);
          var inY = (itemY >= box.y - 10 && itemY - itemH <= box.y + box.h + 10);

          if (inX && inY) {
            matched.push({
              str: it.str,
              x: itemX,
              y: itemY
            });
          }
        }

        if (matched.length === 0) return "";

        matched.sort(function(a, b) {
          var diffY = a.y - b.y;
          if (Math.abs(diffY) > 8) return diffY;
          return a.x - b.x;
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
            Math.floor(box.x * dpr),
            Math.floor(box.y * dpr),
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

        rendering = true;
        var targetPageNum = num;

        pdfDoc.getPage(targetPageNum).then(function(page) {
          var cWidth = container.clientWidth || window.innerWidth;
          var cHeight = container.clientHeight || window.innerHeight;

          var unscaledVp = page.getViewport({ scale: 1.0 });
          var scale = Math.min(cWidth / unscaledVp.width, cHeight / unscaledVp.height);
          var dpr = Math.min(window.devicePixelRatio || 1, 2.5);

          var viewport = page.getViewport({ scale: scale * dpr });
          currentViewport = viewport;

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

        // If zoomed in, NEVER flip page (prevents accidental flip when reading/panning zoomed text)
        var zoomScale = (window.visualViewport && window.visualViewport.scale) || 1.0;
        if (zoomScale > 1.05) return;

        // Flip on swipe only: must be distinct horizontal movement
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

      // Highlighter drag gesture over active canvas
      var hlStartX = 0;
      var hlStartY = 0;
      var liveHighlightEl = null;

      hlSurface.addEventListener("touchstart", function(e) {
        if (!isHighlightMode || !e.touches || !e.touches[0]) return;
        var t = e.touches[0];
        var sRect = hlSurface.getBoundingClientRect();
        hlStartX = t.clientX - sRect.left;
        hlStartY = t.clientY - sRect.top;

        liveHighlightEl = document.createElement("div");
        liveHighlightEl.className = "highlight-rect";
        var pal = highlightColors[currentHighlightColor] || highlightColors.yellow;
        liveHighlightEl.style.backgroundColor = pal.rgba;
        liveHighlightEl.style.border = "1.5px dashed " + pal.hex;
        liveHighlightEl.style.left = hlStartX + "px";
        liveHighlightEl.style.top = hlStartY + "px";
        liveHighlightEl.style.width = "0px";
        liveHighlightEl.style.height = "0px";
        hlSurface.appendChild(liveHighlightEl);
      }, { passive: false });

      hlSurface.addEventListener("touchmove", function(e) {
        if (!isHighlightMode || !liveHighlightEl || !e.touches || !e.touches[0]) return;
        e.preventDefault();
        var t = e.touches[0];
        var sRect = hlSurface.getBoundingClientRect();
        var curX = t.clientX - sRect.left;
        var curY = t.clientY - sRect.top;

        var boxLeft = Math.min(hlStartX, curX);
        var boxTop = Math.min(hlStartY, curY);
        var boxWidth = Math.abs(curX - hlStartX);
        var boxHeight = Math.abs(curY - hlStartY);

        liveHighlightEl.style.left = boxLeft + "px";
        liveHighlightEl.style.top = boxTop + "px";
        liveHighlightEl.style.width = boxWidth + "px";
        liveHighlightEl.style.height = boxHeight + "px";
      }, { passive: false });

      hlSurface.addEventListener("touchend", function(e) {
        if (!isHighlightMode || !liveHighlightEl) return;
        var sRect = hlSurface.getBoundingClientRect();
        var cRect = activeCanvas.getBoundingClientRect();

        var boxLeft = parseFloat(liveHighlightEl.style.left) || 0;
        var boxTop = parseFloat(liveHighlightEl.style.top) || 0;
        var boxW = parseFloat(liveHighlightEl.style.width) || 0;
        var boxH = parseFloat(liveHighlightEl.style.height) || 0;

        if (boxW < 18 || boxH < 14) {
          // Tap or too small: remove
          liveHighlightEl.remove();
          liveHighlightEl = null;
          return;
        }

        // Relative to canvas CSS coordinates
        var relX = boxLeft - (cRect.left - sRect.left);
        var relY = boxTop - (cRect.top - sRect.top);
        var canvasBox = { x: relX, y: relY, w: boxW, h: boxH };

        // Save relative coordinates for redraw
        savedHighlights.push({
          page: curPage,
          color: currentHighlightColor,
          rx: relX / cRect.width,
          ry: relY / cRect.height,
          rw: boxW / cRect.width,
          rh: boxH / cRect.height
        });

        // Make live highlight solid
        liveHighlightEl.style.border = "none";
        liveHighlightEl.classList.add("saved-hl");
        liveHighlightEl = null;

        // Extract text in this rectangle
        var extractedText = extractTextFromRect(canvasBox);
        var imageSlice = extractedText ? null : extractImageSlice(canvasBox);

        post({
          type: "highlight_captured",
          page: curPage,
          text: extractedText,
          color: currentHighlightColor,
          imageData: imageSlice,
          rect: canvasBox
        });
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
            }
            break;
          case "set_highlight_color":
            if (data.color) currentHighlightColor = data.color;
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
