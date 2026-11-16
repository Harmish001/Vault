import { PDFJS_B64, PDF_WORKER_B64 } from "./assets/pdfBundle";
import { ReaderTheme } from "../types";
import { THEME_PALETTES } from "./readerHtml";

export function getPdfReaderHtml(
  pdfBase64: string,
  initialPage: number,
  themeName: ReaderTheme
): string {
  const theme = THEME_PALETTES[themeName] || THEME_PALETTES.light;
  const isDark = themeName === "dark" || themeName === "black";

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
    }
    #container {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
      overflow: hidden;
    }
    canvas {
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
      box-shadow: 0 4px 12px rgba(0,0,0,0.25);
      ${isDark ? "filter: invert(0.88) hue-rotate(180deg);" : ""}
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
      z-index: 10;
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
    <canvas id="pdf-canvas"></canvas>
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

      var rawB64 = ${JSON.stringify(pdfBase64)};
      var curPage = ${Math.max(1, initialPage || 1)};
      var pdfDoc = null;
      var totalPages = 0;
      var rendering = false;
      var pendingPage = null;

      var canvas = document.getElementById("pdf-canvas");
      var ctx = canvas.getContext("2d");
      var loadingEl = document.getElementById("loading");

      function renderPage(num) {
        if (!pdfDoc) return;
        if (num < 1) num = 1;
        if (num > totalPages) num = totalPages;
        curPage = num;

        if (rendering) {
          pendingPage = num;
          return;
        }

        rendering = true;
        pdfDoc.getPage(num).then(function(page) {
          var container = document.getElementById("container");
          var cWidth = container.clientWidth || window.innerWidth;
          var cHeight = container.clientHeight || window.innerHeight;

          var unscaledVp = page.getViewport({ scale: 1.0 });
          var scale = Math.min(cWidth / unscaledVp.width, cHeight / unscaledVp.height);
          var dpr = Math.min(window.devicePixelRatio || 1, 2.5);

          var viewport = page.getViewport({ scale: scale * dpr });
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          canvas.style.width = Math.floor(viewport.width / dpr) + "px";
          canvas.style.height = Math.floor(viewport.height / dpr) + "px";

          var renderContext = {
            canvasContext: ctx,
            viewport: viewport
          };

          page.render(renderContext).promise.then(function() {
            rendering = false;
            if (loadingEl && loadingEl.parentNode) {
              loadingEl.parentNode.removeChild(loadingEl);
            }
            post({
              type: "page_changed",
              page: curPage,
              total: totalPages,
              percentage: curPage / totalPages
            });

            if (pendingPage !== null) {
              var nextP = pendingPage;
              pendingPage = null;
              renderPage(nextP);
            }
          });
        }).catch(function(err) {
          rendering = false;
          post({ type: "error", message: err.message || "Failed to render page" });
        });
      }

      try {
        var raw = atob(rawB64);
        var buf = new Uint8Array(raw.length);
        for (var i = 0; i < raw.length; i++) buf[i] = raw.charCodeAt(i);

        pdfjsLib.getDocument({ data: buf }).promise.then(function(pdf) {
          pdfDoc = pdf;
          totalPages = pdf.numPages;
          post({ type: "loaded", pages: totalPages });
          renderPage(curPage);
        }).catch(function(err) {
          if (loadingEl) loadingEl.textContent = "Could not parse PDF.";
          post({ type: "error", message: err.message || "Could not parse PDF" });
        });
      } catch (e) {
        post({ type: "error", message: e.message || "Init failed" });
      }

      // Tap zones: left 30% prev, right 30% next, center 40% toggle UI
      var container = document.getElementById("container");
      var touchStartX = 0;
      var touchStartY = 0;

      container.addEventListener("touchstart", function(e) {
        if (e.touches && e.touches[0]) {
          touchStartX = e.touches[0].clientX;
          touchStartY = e.touches[0].clientY;
        }
      }, { passive: true });

      container.addEventListener("touchend", function(e) {
        if (!e.changedTouches || !e.changedTouches[0]) return;
        var diffX = e.changedTouches[0].clientX - touchStartX;
        var diffY = e.changedTouches[0].clientY - touchStartY;

        // Horizontal swipe gesture
        if (Math.abs(diffX) > 40 && Math.abs(diffX) > Math.abs(diffY) * 1.5) {
          if (diffX < 0) {
            renderPage(curPage + 1);
          } else {
            renderPage(curPage - 1);
          }
        }
      }, { passive: true });

      container.addEventListener("click", function(e) {
        var width = window.innerWidth;
        var x = e.clientX;
        if (x < width * 0.3) {
          renderPage(curPage - 1);
        } else if (x > width * 0.7) {
          renderPage(curPage + 1);
        } else {
          post({ type: "toggle_ui" });
        }
      });

      // Handle native commands
      window.handleNativeMessage = function(data) {
        if (!data) return;
        switch (data.action) {
          case "next":
            renderPage(curPage + 1);
            break;
          case "prev":
            renderPage(curPage - 1);
            break;
          case "jump_page":
            if (typeof data.page === "number") renderPage(data.page);
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
