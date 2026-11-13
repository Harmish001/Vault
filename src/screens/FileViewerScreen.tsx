import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  ToastAndroid,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Feather from "@expo/vector-icons/Feather";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import * as FileSystem from "expo-file-system/legacy";
import * as Clipboard from "expo-clipboard";
import { WebView } from "react-native-webview";
import { RootStackParamList } from "../navigation";
import { useVault } from "../storage/vault";
import { colors, fonts, radius } from "../theme";
import { extOf, kindOf } from "../utils";
import { IconButton, ScreenHeader } from "../components/ui";
import { openFile as openWithSystem } from "../openFile";

const RNWebView = WebView as unknown as React.ComponentType<any>;

type Props = NativeStackScreenProps<RootStackParamList, "FileViewer">;

// ─── File categorization ─────────────────────────────────────────────────────

export const CODE_EXTENSIONS = new Set([
  // Web / Scripting
  ".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".html", ".htm", ".css", ".scss", ".sass", ".less", ".vue", ".svelte",
  // Common programming languages
  ".py", ".pyw", ".java", ".c", ".cpp", ".cc", ".cxx", ".h", ".hpp", ".cs", ".go", ".rs", ".rb", ".php", ".swift", ".kt", ".kts", ".scala", ".sh", ".bash", ".zsh", ".sql", ".dart", ".r", ".lua",
  // Structured data & configuration
  ".json", ".json5", ".xml", ".yaml", ".yml", ".toml", ".ini", ".env", ".conf", ".config", ".properties", ".gradle", ".dockerfile", ".graphql", ".gql", ".proto",
]);

export const MD_EXTENSIONS = new Set([
  ".md", ".markdown", ".mdown", ".mkdn", ".mdwn",
]);

export const SHEET_EXTENSIONS = new Set([
  ".csv", ".tsv",
]);

export const IMAGE_EXTENSIONS = new Set([
  ".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".svg", ".heic",
]);

export const TEXT_EXTENSIONS = new Set([
  ".txt", ".text", ".log", ".rtf",
]);

/** Returns true for the file types we can render in-app. */
export function canViewInApp(mime: string, name: string): boolean {
  const ext = extOf(name).toLowerCase();
  if (mime.startsWith("image/") || IMAGE_EXTENSIONS.has(ext)) return true;
  if (mime === "application/pdf" || ext === ".pdf") return true;
  if (
    mime.startsWith("text/") ||
    mime.includes("json") ||
    mime.includes("javascript") ||
    mime.includes("typescript") ||
    mime.includes("xml") ||
    mime.includes("yaml") ||
    MD_EXTENSIONS.has(ext) ||
    CODE_EXTENSIONS.has(ext) ||
    SHEET_EXTENSIONS.has(ext) ||
    TEXT_EXTENSIONS.has(ext)
  ) {
    return true;
  }
  return false;
}

function copyToClipboard(text: string, label = "Code") {
  Clipboard.setStringAsync(text)
    .then(() => {
      if (Platform.OS === "android") {
        ToastAndroid.show(`${label} copied to clipboard`, ToastAndroid.SHORT);
      } else {
        Alert.alert("Copied", `${label} copied to clipboard`);
      }
    })
    .catch(() => undefined);
}

// ─── CSV Parser ──────────────────────────────────────────────────────────────

function parseCSV(raw: string): string[][] {
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  return lines.map((line) => {
    const cells: string[] = [];
    let cur = "";
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
        else inQ = !inQ;
      } else if ((ch === "," || ch === "\t") && !inQ) {
        cells.push(cur); cur = "";
      } else {
        cur += ch;
      }
    }
    cells.push(cur);
    return cells;
  });
}

// ─── Sub-viewers ─────────────────────────────────────────────────────────────

function ImageViewer({ uri }: { uri: string }) {
  const { width, height } = Dimensions.get("window");
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: "#111" }}
      contentContainerStyle={{ flexGrow: 1, alignItems: "center", justifyContent: "center" }}
      maximumZoomScale={6}
      minimumZoomScale={1}
      showsHorizontalScrollIndicator={false}
      showsVerticalScrollIndicator={false}
      bouncesZoom
    >
      <Image
        source={{ uri }}
        style={{ width, height: height * 0.85 }}
        resizeMode="contain"
        accessibilityLabel="File image"
      />
    </ScrollView>
  );
}

function CsvViewer({ content }: { content: string }) {
  const rows = parseCSV(content);
  if (rows.length === 0) return <CentreMessage icon="file-text" text="Empty file." />;
  const colWidths = rows[0].map((_, ci) =>
    Math.min(220, Math.max(80, ...rows.map((r) => (r[ci] ?? "").length * 8 + 18)))
  );
  const totalWidth = colWidths.reduce((a, b) => a + b, 0);
  const headerRow = rows[0];
  const dataRows = rows.slice(1);

  return (
    <ScrollView style={{ flex: 1 }} horizontal showsHorizontalScrollIndicator>
      <View style={{ minWidth: totalWidth }}>
        {/* Header */}
        <View style={[csvStyles.row, csvStyles.headerRow]}>
          {headerRow.map((cell, ci) => (
            <View key={ci} style={[csvStyles.cell, { width: colWidths[ci] }]}>
              <Text style={csvStyles.headerCell} numberOfLines={2}>{cell}</Text>
            </View>
          ))}
        </View>
        {/* Data rows */}
        <FlatList
          data={dataRows}
          keyExtractor={(_, i) => String(i)}
          renderItem={({ item, index }) => (
            <View style={[csvStyles.row, index % 2 === 1 && csvStyles.altRow]}>
              {item.map((cell, ci) => (
                <View key={ci} style={[csvStyles.cell, { width: colWidths[ci] }]}>
                  <Text style={csvStyles.dataCell} numberOfLines={3}>{cell}</Text>
                </View>
              ))}
            </View>
          )}
          initialNumToRender={25}
          windowSize={7}
        />
      </View>
    </ScrollView>
  );
}

function CodeViewer({ content, ext }: { content: string; ext: string }) {
  const [wrap, setWrap] = useState(false);
  const lines = content.split(/\r?\n/);
  const lineCount = lines.length;
  const langLabel = ext.toUpperCase().replace(".", "") || "CODE";

  return (
    <View style={codeStyles.container}>
      {/* Code Toolbar */}
      <View style={codeStyles.toolbar}>
        <View style={codeStyles.badge}>
          <Text style={codeStyles.badgeText}>{langLabel}</Text>
        </View>
        <Text style={codeStyles.metaText}>{lineCount} {lineCount === 1 ? "line" : "lines"}</Text>
        <View style={{ flex: 1 }} />
        <Pressable
          onPress={() => setWrap((w) => !w)}
          style={[codeStyles.btn, wrap && codeStyles.btnActive]}
          accessibilityRole="button"
        >
          <Feather name="align-left" size={13} color={wrap ? colors.primary : "#999"} />
          <Text style={[codeStyles.btnText, wrap && codeStyles.btnTextActive]}>Wrap</Text>
        </Pressable>
        <Pressable
          onPress={() => copyToClipboard(content, "Code")}
          style={codeStyles.btn}
          accessibilityRole="button"
        >
          <Feather name="copy" size={13} color="#999" />
          <Text style={codeStyles.btnText}>Copy</Text>
        </Pressable>
      </View>

      {/* Code Body */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ flexGrow: 1 }}
        showsVerticalScrollIndicator
      >
        <ScrollView
          horizontal={!wrap}
          showsHorizontalScrollIndicator={!wrap}
          contentContainerStyle={{ minWidth: "100%" }}
        >
          <View style={codeStyles.editor}>
            {/* Gutter */}
            <View style={codeStyles.gutter}>
              {lines.map((_, i) => (
                <Text key={i} style={codeStyles.lineNum}>{i + 1}</Text>
              ))}
            </View>
            {/* Code Lines */}
            <View style={[codeStyles.codeBody, wrap && { flexShrink: 1 }]}>
              {lines.map((line, i) => (
                <Text key={i} style={codeStyles.codeLine} selectable numberOfLines={wrap ? undefined : 1}>
                  {line || " "}
                </Text>
              ))}
            </View>
          </View>
        </ScrollView>
      </ScrollView>
    </View>
  );
}

function buildMarkdownHTML(mdContent: string): string {
  const jsonString = JSON.stringify(mdContent);
  return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=2"/>
<style>
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: #1f2937;
    background-color: #fafafa;
    line-height: 1.6;
    padding: 16px 18px 40px;
    margin: 0;
    word-wrap: break-word;
  }
  h1, h2, h3, h4, h5, h6 { color: #111827; margin-top: 1.3em; margin-bottom: 0.5em; line-height: 1.25; font-weight: 700; }
  h1 { font-size: 1.65em; border-bottom: 1px solid #e5e7eb; padding-bottom: 0.25em; }
  h2 { font-size: 1.35em; border-bottom: 1px solid #e5e7eb; padding-bottom: 0.2em; }
  h3 { font-size: 1.15em; }
  p { margin: 0.75em 0; }
  a { color: #0284c7; text-decoration: none; }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; background-color: #f3f4f6; padding: 2px 5px; border-radius: 4px; font-size: 0.88em; color: #b91c1c; }
  pre { background-color: #1e1e2e; color: #cdd6f4; padding: 12px 14px; border-radius: 8px; overflow-x: auto; font-size: 0.85em; }
  pre code { background: none; color: inherit; padding: 0; }
  blockquote { border-left: 4px solid #cbd5e1; margin: 1em 0; padding-left: 14px; color: #64748b; }
  ul, ol { padding-left: 24px; margin: 0.75em 0; }
  li { margin-bottom: 0.35em; }
  table { border-collapse: collapse; width: 100%; margin: 1em 0; font-size: 0.9em; }
  th, td { border: 1px solid #e5e7eb; padding: 7px 10px; text-align: left; }
  th { background-color: #f1f5f9; font-weight: 600; }
  hr { height: 1px; border: none; background-color: #e5e7eb; margin: 1.8em 0; }
  input[type="checkbox"] { margin-right: 6px; }
</style>
</head>
<body>
<div id="content"></div>
<script>
(function() {
  var raw = ${jsonString};
  var codeBlocks = [];
  raw = raw.replace(/\`\`\`([a-zA-Z0-9_-]*)\\r?\\n([\\s\\S]*?)\`\`\`/g, function(match, lang, code) {
    codeBlocks.push(code);
    return '%%CODEBLOCK_' + (codeBlocks.length - 1) + '%%';
  });
  raw = raw.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  raw = raw.replace(/%%CODEBLOCK_(\\d+)%%/g, function(m, idx) {
    var c = codeBlocks[Number(idx)].replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return '<pre><code>' + c + '</code></pre>';
  });
  raw = raw.replace(/\`([^\`]+)\`/g, '<code>$1</code>');
  raw = raw.replace(/^###### (.*$)/gim, '<h6>$1</h6>');
  raw = raw.replace(/^##### (.*$)/gim, '<h5>$1</h5>');
  raw = raw.replace(/^#### (.*$)/gim, '<h4>$1</h4>');
  raw = raw.replace(/^### (.*$)/gim, '<h3>$1</h3>');
  raw = raw.replace(/^## (.*$)/gim, '<h2>$1</h2>');
  raw = raw.replace(/^# (.*$)/gim, '<h1>$1</h1>');
  raw = raw.replace(/^\\> (.*$)/gim, '<blockquote>$1</blockquote>');
  raw = raw.replace(/^(?:---|\\*\\*\\*|___)\\s*$/gim, '<hr/>');
  raw = raw.replace(/\\*\\*([^\\*]+)\\*\\*/g, '<strong>$1</strong>');
  raw = raw.replace(/__([^_]+)__/g, '<strong>$1</strong>');
  raw = raw.replace(/\\*([^\\*]+)\\*/g, '<em>$1</em>');
  raw = raw.replace(/_([^_]+)_/g, '<em>$1</em>');
  raw = raw.replace(/~~([^~]+)~~/g, '<del>$1</del>');
  raw = raw.replace(/^- \\[x\\] (.*$)/gim, '<li style="list-style:none"><input type="checkbox" checked disabled/> $1</li>');
  raw = raw.replace(/^- \\[ \\] (.*$)/gim, '<li style="list-style:none"><input type="checkbox" disabled/> $1</li>');
  raw = raw.replace(/^\\s*[-*+]\\s+(.*$)/gim, '<li>$1</li>');
  raw = raw.replace(/(<li>(?:(?!<\\/li>).)*<\\/li>)/gis, '<ul>$1</ul>');
  raw = raw.replace(/<\\/ul>\\s*<ul>/g, '');
  raw = raw.replace(/!\\[(.*?)\\]\\((.*?)\\)/g, '<img alt="$1" src="$2" style="max-width:100%"/>');
  raw = raw.replace(/\\[(.*?)\\]\\((.*?)\\)/g, '<a href="$2">$1</a>');
  var paragraphs = raw.split(/\\r?\\n\\r?\\n/);
  var formatted = paragraphs.map(function(p) {
    p = p.trim();
    if (!p) return '';
    if (/^<(h[1-6]|ul|ol|pre|blockquote|hr|table)/i.test(p)) return p;
    return '<p>' + p.replace(/\\r?\\n/g, '<br/>') + '</p>';
  }).join('');
  document.getElementById('content').innerHTML = formatted;
})();
</script>
</body>
</html>`;
}

function MarkdownViewer({ content }: { content: string }) {
  const [tab, setTab] = useState<"preview" | "raw">("preview");

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* Markdown tabs */}
      <View style={mdStyles.tabBar}>
        <View style={mdStyles.segmented}>
          <Pressable
            onPress={() => setTab("preview")}
            style={[mdStyles.tabBtn, tab === "preview" && mdStyles.tabBtnActive]}
          >
            <Feather name="eye" size={13} color={tab === "preview" ? colors.primaryDark : colors.muted} />
            <Text style={[mdStyles.tabBtnText, tab === "preview" && mdStyles.tabBtnTextActive]}>Preview</Text>
          </Pressable>
          <Pressable
            onPress={() => setTab("raw")}
            style={[mdStyles.tabBtn, tab === "raw" && mdStyles.tabBtnActive]}
          >
            <Feather name="code" size={13} color={tab === "raw" ? colors.primaryDark : colors.muted} />
            <Text style={[mdStyles.tabBtnText, tab === "raw" && mdStyles.tabBtnTextActive]}>Raw</Text>
          </Pressable>
        </View>
        <Pressable
          onPress={() => copyToClipboard(content, "Markdown")}
          style={codeStyles.btn}
          accessibilityRole="button"
        >
          <Feather name="copy" size={13} color="#666" />
          <Text style={[codeStyles.btnText, { color: colors.ink }]}>Copy</Text>
        </Pressable>
      </View>

      {tab === "preview" ? (
        <RNWebView
          source={{ html: buildMarkdownHTML(content) }}
          style={{ flex: 1, backgroundColor: "#fafafa" }}
          originWhitelist={["*"]}
          javaScriptEnabled
          domStorageEnabled
        />
      ) : (
        <CodeViewer content={content} ext=".md" />
      )}
    </View>
  );
}

function PlainTextViewer({ content }: { content: string }) {
  const lineCount = content.split(/\r?\n/).length;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={txtStyles.toolbar}>
        <Text style={txtStyles.metaText}>{lineCount} lines</Text>
        <View style={{ flex: 1 }} />
        <Pressable
          onPress={() => copyToClipboard(content, "Text")}
          style={codeStyles.btn}
          accessibilityRole="button"
        >
          <Feather name="copy" size={13} color="#666" />
          <Text style={[codeStyles.btnText, { color: colors.ink }]}>Copy</Text>
        </Pressable>
      </View>
      <ScrollView style={txtStyles.scroll} contentContainerStyle={txtStyles.content}>
        <Text style={txtStyles.text} selectable>{content}</Text>
      </ScrollView>
    </View>
  );
}

// ─── PDF Viewer ──────────────────────────────────────────────────────────────

const PDF_HTML = `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1,minimum-scale=1"/>
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{background:#1a1a1a;width:100%;min-height:100%;overflow-x:hidden}
#st{color:#bbb;padding:48px 20px;font-family:sans-serif;font-size:14px;text-align:center}
.pw{background:#fff;margin:6px 0;box-shadow:0 2px 6px rgba(0,0,0,0.4)}
canvas{display:block}
</style>
</head>
<body>
<div id="st">Loading PDF viewer\u2026</div>
<div id="pg"></div>
<script
  src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"
  onerror="document.getElementById('st').textContent='Could not load PDF engine. Tap below to open with system viewer.';try{window.ReactNativeWebView.postMessage(JSON.stringify({type:'no_internet'}))}catch(e){}"
></script>
<script>
function pm(o){
  try {
    if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
      window.ReactNativeWebView.postMessage(JSON.stringify(o));
      return true;
    }
  } catch(e) {}
  return false;
}
function notifyReady(){
  if (pm({type:'ready'})) return;
  setTimeout(notifyReady, 60);
}
if(typeof pdfjsLib!=='undefined'){
  pdfjsLib.GlobalWorkerOptions.workerSrc=
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  notifyReady();
  function onMsg(e){
    var d = e.data;
    if (d === '__ping__') {
      pm({type:'ready'});
      return;
    }
    if (typeof d === 'string' && d.length > 20) {
      render(d);
    }
  }
  document.addEventListener('message', onMsg);
  window.addEventListener('message', onMsg);
  function render(b64){
    var st=document.getElementById('st');
    st.textContent='Rendering PDF\u2026';
    try {
      var raw=atob(b64),buf=new Uint8Array(raw.length);
      for(var i=0;i<raw.length;i++)buf[i]=raw.charCodeAt(i);
      pdfjsLib.getDocument({data:buf}).promise.then(function(pdf){
        st.style.display='none';
        pm({type:'loaded',pages:pdf.numPages});
        var dpr=Math.min(window.devicePixelRatio||1,3);
        function rp(n){
          if(n>pdf.numPages)return;
          pdf.getPage(n).then(function(page){
            var nat=page.getViewport({scale:1});
            var cssW=document.documentElement.clientWidth||window.innerWidth;
            var vp=page.getViewport({scale:cssW/nat.width});
            var wrap=document.createElement('div');
            wrap.className='pw';
            var c=document.createElement('canvas');
            c.width=Math.floor(vp.width*dpr);
            c.height=Math.floor(vp.height*dpr);
            c.style.width=Math.floor(vp.width)+'px';
            c.style.height=Math.floor(vp.height)+'px';
            wrap.appendChild(c);
            document.getElementById('pg').appendChild(wrap);
            var ctx=c.getContext('2d',{alpha:false});
            page.render({canvasContext:ctx,viewport:vp,transform:dpr===1?null:[dpr,0,0,dpr,0,0]}).promise.then(function(){
              rp(n+1);
            });
          });
        }
        rp(1);
      }).catch(function(err){
        st.textContent='Could not render PDF.';
        pm({type:'error',message:err.message||'unknown'});
      });
    } catch(err) {
      st.textContent='Error parsing PDF data.';
      pm({type:'error',message:err.message||'parse_error'});
    }
  }
}
</script>
</body>
</html>`;

function PdfViewer({ uri, onFallback }: { uri: string; onFallback: () => void }) {
  const webviewRef = useRef<any>(null);
  const [b64, setB64] = useState<string | null>(null);
  const [fileError, setFileError] = useState(false);
  const [webReady, setWebReady] = useState(false);
  const [pdfStatus, setPdfStatus] = useState<"idle" | "rendering" | "done" | "error" | "no_internet" | "slow">("idle");

  useEffect(() => {
    FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 })
      .then(setB64)
      .catch(() => setFileError(true));
  }, [uri]);

  // If loading takes more than 7 seconds, give user an explicit one-tap escape hatch
  useEffect(() => {
    const timer = setTimeout(() => {
      setPdfStatus((prev) => (prev === "idle" || prev === "rendering" ? "slow" : prev));
    }, 7000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (webReady && b64 && webviewRef.current) {
      try {
        webviewRef.current.postMessage(b64);
        setPdfStatus("rendering");
      } catch {}
    }
  }, [webReady, b64]);

  const onMessage = useCallback((event: { nativeEvent: { data: string } }) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      if (msg.type === "ready") setWebReady(true);
      else if (msg.type === "loaded") setPdfStatus("done");
      else if (msg.type === "no_internet") setPdfStatus("no_internet");
      else if (msg.type === "error") setPdfStatus("error");
    } catch {}
  }, []);

  if (fileError) return <CentreMessage icon="alert-circle" text="Could not load this PDF." />;

  const showSpinner = !webReady && pdfStatus !== "error" && pdfStatus !== "no_internet";
  const showError = pdfStatus === "error" || pdfStatus === "no_internet";

  return (
    <View style={{ flex: 1, backgroundColor: "#1a1a1a" }}>
      <RNWebView
        ref={webviewRef}
        source={{ html: PDF_HTML }}
        onMessage={onMessage}
        onLoadEnd={() => {
          // Send ping to webview to notify it's loaded
          if (webviewRef.current) {
            try {
              webviewRef.current.postMessage("__ping__");
            } catch {}
          }
        }}
        originWhitelist={["*", "https://*"]}
        javaScriptEnabled
        domStorageEnabled
        allowFileAccess
        scalesPageToFit={false}
        style={{ flex: 1 }}
      />

      {/* Spinner overlay while pdf.js is fetching and initializing */}
      {showSpinner && (
        <View style={[StyleSheet.absoluteFill, pdfOverlay.bg]}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={pdfOverlay.label}>Loading PDF viewer…</Text>
          {pdfStatus === "slow" && (
            <Pressable
              onPress={onFallback}
              style={[pdfOverlay.btn, { marginTop: 14 }]}
              accessibilityRole="button"
            >
              <Feather name="external-link" size={15} color={colors.primary} style={{ marginRight: 6 }} />
              <Text style={pdfOverlay.btnText}>Open with default viewer</Text>
            </Pressable>
          )}
        </View>
      )}

      {/* Error or offline overlay */}
      {showError && (
        <View style={[StyleSheet.absoluteFill, pdfOverlay.bg]}>
          <Feather name="alert-circle" size={40} color="#888" />
          <Text style={pdfOverlay.errorText}>
            {pdfStatus === "no_internet"
              ? "First-time PDF viewer requires internet connection."
              : "Could not render this PDF internally."}
          </Text>
          <Pressable
            onPress={onFallback}
            style={pdfOverlay.btn}
            accessibilityRole="button"
          >
            <Feather name="external-link" size={15} color={colors.primary} style={{ marginRight: 6 }} />
            <Text style={pdfOverlay.btnText}>Open with another app</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

// ─── Shared small components ─────────────────────────────────────────────────

function LoadingSpinner() {
  return (
    <View style={shared.centre}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}

function CentreMessage({ icon, text }: { icon: React.ComponentProps<typeof Feather>["name"]; text: string }) {
  return (
    <View style={shared.centre}>
      <Feather name={icon} size={40} color={colors.muted} />
      <Text style={shared.centreText}>{text}</Text>
    </View>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function FileViewerScreen({ navigation, route }: Props) {
  const { files, getDecryptedUri, shareFile } = useVault();
  const file = files.find((f) => f.id === route.params.fileId);

  const [decUri, setDecUri] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (!file) { navigation.goBack(); return; }
    getDecryptedUri(file)
      .then((uri) => {
        setDecUri(uri);
        const ext = extOf(file.name).toLowerCase();
        // If it's a text-based format, read content upfront for Code / Markdown / CSV / Text viewers
        const isBinary = file.mime.startsWith("image/") || file.mime === "application/pdf" || ext === ".pdf" || IMAGE_EXTENSIONS.has(ext);
        if (!isBinary) {
          FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.UTF8 })
            .then(setFileContent)
            .catch(() => setLoadError(true));
        }
      })
      .catch(() => setLoadError(true));
  }, [file, getDecryptedUri, navigation]);

  if (!file) return null;

  const ext = extOf(file.name).toLowerCase();
  const isImage = file.mime.startsWith("image/") || IMAGE_EXTENSIONS.has(ext);
  const isPdf = file.mime === "application/pdf" || ext === ".pdf";
  const isSheet = SHEET_EXTENSIONS.has(ext);
  const isMarkdown = MD_EXTENSIONS.has(ext);
  const isCode = CODE_EXTENSIONS.has(ext);

  return (
    <View style={{ flex: 1, backgroundColor: isImage ? "#111" : colors.bg }}>
      <ScreenHeader
        title={file.name}
        subtitle={ext.replace(".", "").toUpperCase()}
        onBack={() => navigation.goBack()}
        right={
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <IconButton
              icon="external-link"
              label="Open with another app"
              color={isImage ? colors.onPrimary : colors.ink}
              onPress={() => {
                if (decUri) {
                  openWithSystem(decUri, file.mime).catch(() => undefined);
                }
              }}
            />
            <IconButton
              icon="share-2"
              label="Share file"
              color={isImage ? colors.onPrimary : colors.ink}
              onPress={() => shareFile(file).catch(() => undefined)}
            />
          </View>
        }
      />

      {loadError ? (
        <CentreMessage icon="alert-circle" text="Could not decrypt this file." />
      ) : decUri === null ? (
        <LoadingSpinner />
      ) : isImage ? (
        <ImageViewer uri={decUri} />
      ) : isPdf ? (
        <PdfViewer
          uri={decUri}
          onFallback={() => decUri && openWithSystem(decUri, file.mime)}
        />
      ) : fileContent === null ? (
        <LoadingSpinner />
      ) : isSheet ? (
        <CsvViewer content={fileContent} />
      ) : isMarkdown ? (
        <MarkdownViewer content={fileContent} />
      ) : isCode ? (
        <CodeViewer content={fileContent} ext={ext} />
      ) : (
        <PlainTextViewer content={fileContent} />
      )}
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const shared = StyleSheet.create({
  centre: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    padding: 32,
  },
  centreText: {
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.muted,
    textAlign: "center",
  },
});

const codeStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#18181b",
  },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: "#131316",
    borderBottomWidth: 1,
    borderBottomColor: "#27272a",
    gap: 10,
  },
  badge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    backgroundColor: "#27272a",
    borderRadius: 6,
  },
  badgeText: {
    fontFamily: fonts.semibold,
    fontSize: 11,
    color: "#e4e4e7",
  },
  metaText: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: "#71717a",
  },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: "#27272a",
  },
  btnActive: {
    backgroundColor: colors.primary + "33",
  },
  btnText: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    color: "#a1a1aa",
  },
  btnTextActive: {
    color: colors.primary,
  },
  editor: {
    flexDirection: "row",
    minHeight: "100%",
    paddingVertical: 12,
  },
  gutter: {
    paddingLeft: 12,
    paddingRight: 10,
    borderRightWidth: 1,
    borderRightColor: "#27272a",
    alignItems: "flex-end",
  },
  lineNum: {
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    fontSize: 12,
    lineHeight: 20,
    color: "#52525b",
  },
  codeBody: {
    paddingHorizontal: 12,
    flexGrow: 1,
  },
  codeLine: {
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    fontSize: 12,
    lineHeight: 20,
    color: "#f4f4f5",
  },
});

const mdStyles = StyleSheet.create({
  tabBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    justifyContent: "space-between",
  },
  segmented: {
    flexDirection: "row",
    backgroundColor: colors.bg,
    borderRadius: 999,
    padding: 3,
    borderWidth: 1,
    borderColor: colors.line,
  },
  tabBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
  },
  tabBtnActive: {
    backgroundColor: colors.surface,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 2,
    elevation: 1,
  },
  tabBtnText: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.muted,
  },
  tabBtnTextActive: {
    fontFamily: fonts.semibold,
    color: colors.ink,
  },
});

const txtStyles = StyleSheet.create({
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  metaText: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.muted,
  },
  scroll: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 40 },
  text: {
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    fontSize: 13,
    lineHeight: 21,
    color: colors.ink,
  },
});

const csvStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  altRow: { backgroundColor: colors.surfaceAlt },
  headerRow: { backgroundColor: colors.primarySoft },
  cell: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRightWidth: 1,
    borderRightColor: colors.line,
  },
  headerCell: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: colors.primaryDark,
  },
  dataCell: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.ink,
  },
});

const pdfOverlay = StyleSheet.create({
  bg: {
    backgroundColor: "#1a1a1a",
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    padding: 32,
  },
  label: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: "#888",
  },
  errorText: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: "#aaa",
    textAlign: "center",
    lineHeight: 22,
  },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 6,
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: colors.primary + "22",
    borderRadius: 12,
  },
  btnText: {
    fontFamily: fonts.semibold,
    fontSize: 15,
    color: colors.primary,
  },
});
