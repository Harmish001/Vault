import { commonShareMime } from "../src/sharing/multiShare";

const assert = (ok: boolean, msg: string) => {
  if (!ok) throw new Error("FAIL: " + msg);
  console.log("ok  -", msg);
};

assert(commonShareMime([]) === "*/*", "empty list returns */*");
assert(
  commonShareMime([
    { name: "a.pdf", mime: "application/pdf" },
    { name: "b.pdf", mime: "application/pdf" },
  ]) === "application/pdf",
  "identical PDF mimes keep application/pdf"
);
assert(
  commonShareMime([
    { name: "a.jpg", mime: "image/jpeg" },
    { name: "b.png", mime: "image/png" },
  ]) === "image/*",
  "different image subtypes collapse to image/*"
);
assert(
  commonShareMime([
    { name: "a.pdf", mime: "application/pdf" },
    { name: "b.jpg", mime: "image/jpeg" },
  ]) === "*/*",
  "mixed PDF and image return */*"
);
assert(
  commonShareMime([
    { name: "a.pdf", mime: "application/octet-stream" },
    { name: "b.pdf", mime: "application/pdf" },
  ]) === "application/pdf",
  "generic octet-stream falls back to filename extension mime"
);

console.log("all multi-share tests passed");
