import { EPUBJS_B64, JSZIP_B64 } from "./assets/bundle";
import { ReaderSettings, ReaderTheme } from "../types";

export const THEME_PALETTES: Record<
  ReaderTheme,
  { bg: string; text: string; headerBg: string; border: string; activeIcon: string }
> = {
  light: {
    bg: "#FFFFFF",
    text: "#1A1A1A",
    headerBg: "#F6F5F2",
    border: "#E2E0DA",
    activeIcon: "#7A1F35",
  },
  sepia: {
    bg: "#F8F1E3",
    text: "#433422",
    headerBg: "#EFE5CE",
    border: "#E0D3B8",
    activeIcon: "#8A5A2B",
  },
  dark: {
    bg: "#222222",
    text: "#D8D8D8",
    headerBg: "#1C1C1C",
    border: "#333333",
    activeIcon: "#E89CAE",
  },
  black: {
    bg: "#000000",
    text: "#B0B0B0",
    headerBg: "#0A0A0A",
    border: "#222222",
    activeIcon: "#FFFFFF",
  },
};

export function getReaderHtml(
  bookDataUriOrB64: string,
  isBase64: boolean,
  initialCfi: string | null,
  settings: ReaderSettings,
  cachedLocationsJson: string | null
): string {
  const initialTheme = THEME_PALETTES[settings.theme] || THEME_PALETTES.light;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <style>
    * {
      -webkit-tap-highlight-color: transparent;
      box-sizing: border-box;
    }
    html, body {
      margin: 0;
      padding: 0;
      width: 100%;
      height: 100%;
      overflow: hidden;
      background-color: ${initialTheme.bg};
      color: ${initialTheme.text};
      user-select: none;
      -webkit-user-select: none;
    }
    #viewer {
      width: 100%;
      height: 100%;
      overflow: hidden;
    }
    #loading {
      position: absolute;
      top: 0; left: 0; right: 0; bottom: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      background-color: ${initialTheme.bg};
      color: ${initialTheme.text};
      font-family: system-ui, -apple-system, Roboto, sans-serif;
      font-size: 15px;
      z-index: 10;
      transition: opacity 0.25s ease-out;
    }
    #loading.hidden {
      opacity: 0;
      pointer-events: none;
    }
  </style>
  <script>
    try {
      (0, eval)(atob("${JSZIP_B64}"));
      (0, eval)(atob("${EPUBJS_B64}"));
    } catch (e) {
      console.error("Reader bundle eval error:", e);
    }
  </script>
</head>
<body>
  <div id="loading">Opening book…</div>
  <div id="viewer"></div>

  <script>
    (function() {
      var post = function(msg) {
        try {
          if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
            window.ReactNativeWebView.postMessage(JSON.stringify(msg));
          }
        } catch (e) {
          console.warn("postMessage failed", e);
        }
      };

      var THEMES = {
        light: { bg: "#FFFFFF", text: "#1A1A1A" },
        sepia: { bg: "#F8F1E3", text: "#433422" },
        dark: { bg: "#222222", text: "#D8D8D8" },
        black: { bg: "#000000", text: "#B0B0B0" }
      };

      var currentSettings = ${JSON.stringify(settings)};
      var bookSource = ${JSON.stringify(bookDataUriOrB64)};
      var isB64 = ${isBase64 ? "true" : "false"};
      var initialCfi = ${JSON.stringify(initialCfi)};
      var cachedLocations = ${cachedLocationsJson ? JSON.stringify(cachedLocationsJson) : "null"};

      var book = null;
      var rendition = null;
      var loadingEl = document.getElementById("loading");

      function hideLoading() {
        if (loadingEl) {
          loadingEl.classList.add("hidden");
          setTimeout(function() {
            if (loadingEl.parentNode) loadingEl.parentNode.removeChild(loadingEl);
          }, 300);
        }
      }

      function applyStyles(s) {
        if (!rendition) return;
        var theme = THEMES[s.theme] || THEMES.light;
        document.body.style.backgroundColor = theme.bg;
        document.body.style.color = theme.text;

        var font = s.fontFamily === "system"
          ? "system-ui, -apple-system, Roboto, sans-serif"
          : (s.fontFamily || "serif");

        var marginPx = s.margin === "small" ? "12px" : (s.margin === "large" ? "28px" : "20px");

        rendition.themes.fontSize(s.fontSize + "px");
        rendition.themes.override("font-family", font);
        rendition.themes.override("color", theme.text);
        rendition.themes.override("background", theme.bg);
        rendition.themes.override("line-height", String(s.lineHeight || 1.5));
        rendition.themes.override("text-align", s.textAlign || "left");
        rendition.themes.override("padding-left", marginPx);
        rendition.themes.override("padding-right", marginPx);
      }

      try {
        var bookOptions = isB64 ? { encoding: "base64" } : { openAs: "epub" };
        book = ePub(bookSource, bookOptions);

        rendition = book.renderTo("viewer", {
          width: "100%",
          height: "100%",
          spread: "none",
          flow: "paginated"
        });

        applyStyles(currentSettings);

        // Register gestures and click handlers in the iframe
        rendition.hooks.content.register(function(contents) {
          var doc = contents.document;
          var touchStartX = 0;
          var touchStartY = 0;

          doc.addEventListener("touchstart", function(e) {
            if (e.touches && e.touches[0]) {
              touchStartX = e.touches[0].clientX;
              touchStartY = e.touches[0].clientY;
            }
          }, { passive: true });

          doc.addEventListener("touchend", function(e) {
            if (!e.changedTouches || !e.changedTouches[0]) return;
            var diffX = e.changedTouches[0].clientX - touchStartX;
            var diffY = e.changedTouches[0].clientY - touchStartY;

            // Horizontal swipe with minimum 40px delta
            if (Math.abs(diffX) > 40 && Math.abs(diffX) > Math.abs(diffY) * 1.5) {
              if (diffX < 0) {
                rendition.next();
              } else {
                rendition.prev();
              }
            }
          }, { passive: true });

          doc.addEventListener("click", function(e) {
            // Check if user selected text
            var sel = doc.getSelection ? doc.getSelection().toString() : "";
            if (sel && sel.trim().length > 0) return;

            // Check if clicking an anchor link
            var target = e.target;
            while (target && target.tagName !== "A") {
              target = target.parentElement;
            }
            if (target && target.href) return; // let link handle it

            // Tap zones: left 30% prev, right 30% next, center 40% toggle UI
            var width = doc.documentElement.clientWidth || window.innerWidth;
            var x = e.clientX;
            if (currentSettings.tapZonesEnabled !== false) {
              if (x < width * 0.3) {
                rendition.prev();
                return;
              } else if (x > width * 0.7) {
                rendition.next();
                return;
              }
            }
            post({ type: "toggle_ui" });
          });
        });

        // Display at initial CFI or start
        var displayPromise = initialCfi ? rendition.display(initialCfi) : rendition.display();
        displayPromise
          .then(function() {
            hideLoading();
            post({ type: "ready" });
          })
          .catch(function() {
            // If saved CFI failed (e.g. modified book), fall back to beginning
            rendition.display().then(hideLoading).catch(hideLoading);
          });

        // Text selection event for quoting / highlighting
        rendition.on("selected", function(cfiRange, contents) {
          try {
            var text = rendition.getRange(cfiRange).toString();
            if (text && text.trim().length > 0) {
              post({
                type: "text_selected",
                cfiRange: cfiRange,
                text: text.trim()
              });
            }
          } catch (e) {}
        });

        // Relocated event
        rendition.on("relocated", function(location) {
          if (!location || !location.start) return;
          var cfi = location.start.cfi;
          var percentage = 0;
          var page = null;
          var total = null;

          if (book.locations && book.locations.length() > 0) {
            percentage = book.locations.percentageFromCfi(cfi) || 0;
            page = book.locations.locationFromCfi(cfi);
            total = book.locations.total;
          } else if (location.start.percentage) {
            percentage = location.start.percentage;
          }

          var chapterLabel = "";
          try {
            if (location.start.href && book.navigation && book.navigation.toc) {
              var found = book.navigation.get(location.start.href);
              if (found && found.label) chapterLabel = found.label.trim();
            }
          } catch (e) {}

          post({
            type: "relocated",
            cfi: cfi,
            percentage: percentage,
            chapterLabel: chapterLabel,
            page: page,
            total: total
          });
        });

        // Navigation / TOC
        book.loaded.navigation.then(function(nav) {
          post({ type: "toc", toc: nav.toc });
        });

        // Cached or background locations generation (Section 5.5)
        if (cachedLocations) {
          try {
            book.locations.load(cachedLocations);
          } catch (e) {
            console.warn("Failed loading cached locations", e);
          }
        } else {
          book.ready.then(function() {
            return book.locations.generate(1000);
          }).then(function() {
            post({
              type: "locations_ready",
              locations: book.locations.save(),
              total: book.locations.total
            });
          }).catch(function(e) {
            console.warn("Locations generation failed", e);
          });
        }

      } catch (err) {
        hideLoading();
        post({ type: "error", message: err.message || "Failed to initialize reader" });
      }

      // Handle messages from React Native
      window.handleNativeMessage = function(data) {
        if (!data || !rendition) return;
        switch (data.action) {
          case "next":
            rendition.next();
            break;
          case "prev":
            rendition.prev();
            break;
          case "jump_cfi":
            if (data.cfi) rendition.display(data.cfi);
            break;
          case "jump_percentage":
            if (book && book.locations && book.locations.length() > 0 && typeof data.percentage === "number") {
              var targetCfi = book.locations.cfiFromPercentage(data.percentage);
              if (targetCfi) rendition.display(targetCfi);
            }
            break;
          case "jump_href":
            if (data.href) rendition.display(data.href);
            break;
          case "update_settings":
            if (data.settings) {
              currentSettings = data.settings;
              applyStyles(currentSettings);
            }
            break;
          case "load_locations":
            if (data.locations && book) {
              book.locations.load(data.locations);
            }
            break;
          case "extract_page_text":
            try {
              var contents = rendition.getContents();
              var text = "";
              if (contents && contents[0] && contents[0].document) {
                text = contents[0].document.body ? contents[0].document.body.innerText || "" : "";
              }
              post({
                type: "page_text_extracted",
                page: null,
                text: text.slice(0, 2000).trim(),
                imageData: null
              });
            } catch (e) {
              post({ type: "page_text_extracted", page: null, text: "", imageData: null });
            }
            break;
          case "highlight":
            if (data.cfiRange) {
              try {
                rendition.annotations.highlight(data.cfiRange, {}, function(e) {}, "", { fill: data.color || "#F9E076" });
              } catch (e) {}
            }
            break;
        }
      };

      document.addEventListener("message", function(e) {
        try {
          var data = JSON.parse(e.data);
          window.handleNativeMessage(data);
        } catch (err) {}
      });
      window.addEventListener("message", function(e) {
        try {
          var data = JSON.parse(e.data);
          window.handleNativeMessage(data);
        } catch (err) {}
      });

    })();
  </script>
</body>
</html>`;
}

