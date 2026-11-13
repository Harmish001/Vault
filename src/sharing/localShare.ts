/**
 * Local Direct Share: Creates a self-contained encrypted package for device-to-device transfer.
 * No relay, no size limit. Transfer via USB, Bluetooth, or any Share intent.
 * 
 * Package format: ZIP containing:
 *   - manifest.json (encrypted) - file list and metadata
 *   - files/ - encrypted file blobs
 *   - viewer.html - self-contained decryption viewer
 */
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { VaultFile, Note, Folder } from "../types";
import { encryptBlob, toUrlBase64 } from "./sharingCrypto";
import { pickShareCode, pickShareWords, deriveShareKey } from "./shareCode";
import { base64ToBytes, bytesToBase64 } from "../scan/base64";
import { uid } from "../utils";

// Using react-native-zip-archive for creating ZIP
const ZipArchive = require("react-native-zip-archive");

const PACKAGE_DIR = FileSystem.cacheDirectory + "local-share/";

function getCryptoRandomBytes(count: number): Uint8Array {
  if (typeof globalThis.crypto?.getRandomValues === "function") {
    return globalThis.crypto.getRandomValues(new Uint8Array(count));
  }
  const Crypto = require("expo-crypto");
  return Crypto.getRandomBytes(count);
}

export type LocalShareItem =
  | { kind: "file"; file: VaultFile; bytes: Uint8Array }
  | { kind: "note"; note: Note };

export type LocalShareResult = {
  packagePath: string;
  code: string;
  words: string[];
  itemCount: number;
};

/**
 * Create a local share package (ZIP) that can be transferred to any device.
 * Returns the path to the ZIP file and the code/words needed to decrypt.
 */
export async function createLocalSharePackage(
  items: LocalShareItem[],
  onProgress?: (msg: string) => void
): Promise<LocalShareResult> {
  const sessionId = uid();
  const workDir = PACKAGE_DIR + sessionId + "/";
  const filesDir = workDir + "files/";
  
  await FileSystem.makeDirectoryAsync(filesDir, { intermediates: true });

  onProgress?.("Generating encryption key...");
  
  // Generate code + words + key
  const words = pickShareWords(getCryptoRandomBytes(8));
  const code = pickShareCode(getCryptoRandomBytes(4));
  const key = await deriveShareKey(code, words.join(" "));

  onProgress?.("Encrypting files...");

  // Build manifest
  const manifest: {
    v: 1;
    createdAt: string;
    items: { id: string; name: string; mime: string; encrypted: string; size: number }[];
  } = {
    v: 1,
    createdAt: new Date().toISOString(),
    items: [],
  };

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    onProgress?.(`Encrypting ${i + 1} of ${items.length}...`);

    if (item.kind === "file") {
      const f = item.file;
      const encryptedB64 = encryptBlob(key, item.bytes);
      const filename = `${f.id}.enc`;
      await FileSystem.writeAsStringAsync(filesDir + filename, encryptedB64, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      manifest.items.push({
        id: f.id,
        name: f.name,
        mime: f.mime,
        encrypted: filename,
        size: item.bytes.length,
      });
    } else {
      const n = item.note;
      const text = JSON.stringify({ title: n.title, content: n.content });
      const bytes = new TextEncoder().encode(text);
      const encryptedB64 = encryptBlob(key, bytes);
      const filename = `${n.id}.enc`;
      await FileSystem.writeAsStringAsync(filesDir + filename, encryptedB64, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      manifest.items.push({
        id: n.id,
        name: n.title || "Untitled Note",
        mime: "application/x-docvault-note",
        encrypted: filename,
        size: bytes.length,
      });
    }
  }

  // Encrypt and save manifest
  const manifestBytes = new TextEncoder().encode(JSON.stringify(manifest));
  const encryptedManifest = encryptBlob(key, manifestBytes);
  await FileSystem.writeAsStringAsync(workDir + "manifest.enc", encryptedManifest);

  // Create the HTML viewer
  const viewerHtml = buildViewerHtml();
  await FileSystem.writeAsStringAsync(workDir + "open-with-browser.html", viewerHtml);

  // Create instructions
  const instructions = `DocVault Secure Share
======================

Files: ${items.length}
Created: ${new Date().toLocaleString()}

To open these files:
1. Open "open-with-browser.html" in any web browser
2. Enter the code: ${code.slice(0, 3)} ${code.slice(3)}
3. Enter the words: ${words.join(" ")}

The files are encrypted. Without the code and words, they cannot be opened.
`;
  await FileSystem.writeAsStringAsync(workDir + "README.txt", instructions);

  onProgress?.("Creating package...");

  // Create ZIP
  const zipPath = PACKAGE_DIR + `docvault-share-${sessionId}.zip`;
  await ZipArchive.zip(workDir, zipPath);

  // Cleanup work directory
  await FileSystem.deleteAsync(workDir, { idempotent: true });

  return {
    packagePath: zipPath,
    code,
    words,
    itemCount: items.length,
  };
}

/**
 * Share the package using the system share sheet.
 */
export async function shareLocalPackage(packagePath: string): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error("Sharing is not available on this device");
  }
  await Sharing.shareAsync(packagePath, {
    mimeType: "application/zip",
    dialogTitle: "Share encrypted files",
  });
}

/**
 * Cleanup old share packages.
 */
export async function cleanupLocalShares(): Promise<void> {
  try {
    const info = await FileSystem.getInfoAsync(PACKAGE_DIR);
    if (info.exists) {
      await FileSystem.deleteAsync(PACKAGE_DIR, { idempotent: true });
    }
  } catch {
    // ignore
  }
}

/**
 * Build the self-contained HTML viewer that decrypts files in the browser.
 */
function buildViewerHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>DocVault Secure Share</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#f5f5f2;min-height:100vh;padding:20px}
.container{max-width:500px;margin:0 auto}
h1{color:#7A1F35;font-size:24px;margin-bottom:8px}
.subtitle{color:#666;margin-bottom:24px}
.card{background:#fff;border-radius:16px;padding:24px;margin-bottom:16px;box-shadow:0 2px 8px rgba(0,0,0,0.08)}
label{display:block;font-weight:600;margin-bottom:8px;color:#333}
input{width:100%;padding:12px 16px;border:1.5px solid #ddd;border-radius:10px;font-size:16px;margin-bottom:16px}
input:focus{outline:none;border-color:#7A1F35}
button{width:100%;padding:14px;background:#7A1F35;color:#fff;border:none;border-radius:10px;font-size:16px;font-weight:600;cursor:pointer}
button:hover{background:#6a1a2d}
button:disabled{opacity:0.5;cursor:not-allowed}
.error{color:#d32f2f;background:#ffebee;padding:12px;border-radius:8px;margin-bottom:16px}
.files{margin-top:16px}
.file{display:flex;align-items:center;padding:12px;border-bottom:1px solid #eee;gap:12px}
.file:last-child{border-bottom:none}
.file-icon{width:40px;height:40px;background:#f7eef0;border-radius:10px;display:flex;align-items:center;justify-content:center}
.file-name{flex:1;font-weight:500}
.file-size{color:#888;font-size:14px}
.download{background:#2F5D4A;color:#fff;padding:8px 16px;border-radius:8px;text-decoration:none;font-size:14px}
.hidden{display:none}
.loading{text-align:center;padding:40px;color:#666}
</style>
</head>
<body>
<div class="container">
<h1>🔒 DocVault Share</h1>
<p class="subtitle">Enter the code and words to decrypt your files</p>

<div id="unlock-form" class="card">
<label>6-digit code</label>
<input type="text" id="code" placeholder="123 456" maxlength="7" autocomplete="off">
<label>4 words</label>
<input type="text" id="words" placeholder="apple banana cherry date" autocomplete="off">
<div id="error" class="error hidden"></div>
<button id="unlock-btn" onclick="unlock()">Unlock Files</button>
</div>

<div id="files-list" class="card hidden">
<h2 style="margin-bottom:16px">Your Files</h2>
<div id="files" class="files"></div>
</div>

<div id="loading" class="loading hidden">Decrypting...</div>
</div>

<script>
// Minimal AES-GCM decryption using Web Crypto
const b64u=s=>{let p=s.replace(/-/g,'+').replace(/_/g,'/');while(p.length%4)p+='=';return Uint8Array.from(atob(p),c=>c.charCodeAt(0))};
const b64e=b=>btoa(String.fromCharCode(...b)).replace(/\\+/g,'-').replace(/\\//g,'_').replace(/=/g,'');

async function pbkdf2(code,words){
const enc=new TextEncoder();
const salt=enc.encode('docvault-share-v1-'+code);
const pw=enc.encode(words);
const key=await crypto.subtle.importKey('raw',pw,'PBKDF2',false,['deriveBits']);
const bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt,iterations:100000,hash:'SHA-256'},key,256);
return new Uint8Array(bits);
}

async function decrypt(key,b64){
const data=b64u(b64);
const iv=data.slice(0,12);
const ct=data.slice(12);
const ck=await crypto.subtle.importKey('raw',key,{name:'AES-GCM'},false,['decrypt']);
const pt=await crypto.subtle.decrypt({name:'AES-GCM',iv},ck,ct);
return new Uint8Array(pt);
}

let manifest=null,keyBytes=null;

async function unlock(){
const code=document.getElementById('code').value.replace(/\\s/g,'');
const words=document.getElementById('words').value.trim();
const errEl=document.getElementById('error');
errEl.classList.add('hidden');

if(code.length!==6){errEl.textContent='Code must be 6 digits';errEl.classList.remove('hidden');return}
if(words.split(/\\s+/).length<4){errEl.textContent='Enter all 4 words';errEl.classList.remove('hidden');return}

document.getElementById('loading').classList.remove('hidden');
document.getElementById('unlock-btn').disabled=true;

try{
keyBytes=await pbkdf2(code,words);
const manifestEnc=await fetch('manifest.enc').then(r=>r.text());
const manifestBytes=await decrypt(keyBytes,manifestEnc);
manifest=JSON.parse(new TextDecoder().decode(manifestBytes));
showFiles();
}catch(e){
errEl.textContent='Wrong code or words. Check and try again.';
errEl.classList.remove('hidden');
}finally{
document.getElementById('loading').classList.add('hidden');
document.getElementById('unlock-btn').disabled=false;
}
}

function showFiles(){
document.getElementById('unlock-form').classList.add('hidden');
document.getElementById('files-list').classList.remove('hidden');
const container=document.getElementById('files');
container.innerHTML='';
for(const item of manifest.items){
const div=document.createElement('div');
div.className='file';
div.innerHTML=\`
<div class="file-icon">📄</div>
<div class="file-name">\${item.name}</div>
<div class="file-size">\${(item.size/1024).toFixed(1)} KB</div>
<a href="#" class="download" onclick="downloadFile('\${item.encrypted}','\${item.name}','\${item.mime}');return false">Download</a>
\`;
container.appendChild(div);
}
}

async function downloadFile(filename,name,mime){
const enc=await fetch('files/'+filename).then(r=>r.text());
const bytes=await decrypt(keyBytes,enc);
const blob=new Blob([bytes],{type:mime});
const url=URL.createObjectURL(blob);
const a=document.createElement('a');
a.href=url;a.download=name;a.click();
URL.revokeObjectURL(url);
}
</script>
</body>
</html>`;
}
