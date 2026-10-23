import { DOC_LABEL, detectDetails, mrzCheck, verhoeffCheckDigit, verhoeffValid } from "../src/ocr/parse";

const assert = (ok: boolean, msg: string) => {
  if (!ok) {
    throw new Error("FAIL: " + msg);
  }
  console.log("ok  -", msg);
};
const val = (d: ReturnType<typeof detectDetails>, id: string) => d?.fields.find((f) => f.id === id)?.value;

// ---- checksums
assert(verhoeffValid("2363") && !verhoeffValid("2364"), "Verhoeff known vector (236 -> 3)");
const base = "23456789012";
const aadhaarDigits = base + verhoeffCheckDigit(base);
assert(verhoeffValid(aadhaarDigits), "generated Aadhaar-shaped number validates");
assert(mrzCheck("L898902C3") === 6, "MRZ check digit known vector (ICAO example L898902C3 -> 6)");

// ---- Aadhaar
const grouped = `${aadhaarDigits.slice(0, 4)} ${aadhaarDigits.slice(4, 8)} ${aadhaarDigits.slice(8)}`;
const aadhaarText = `Government of India\nRahul Sharma\nDOB: 12/05/1990\nMALE\n${grouped}\nVID : 9123 4567 8901 2345\nआधार – आम आदमी का अधिकार`;
let d = detectDetails(aadhaarText);
assert(d?.docType === "aadhaar" && val(d, "aadhaar") === grouped, "Aadhaar number found and formatted");
assert(d?.fields.find((f) => f.id === "aadhaar")?.check === false, "valid checksum is not flagged");
assert(val(d, "dob") === "12/05/1990" && d?.fields.find((f) => f.id === "dob")?.on === false, "date of birth found but off by default");
assert(d?.expiresOn === undefined, "no expiry on Aadhaar");
const wrong = aadhaarDigits.slice(0, 11) + String((Number(aadhaarDigits[11]) + 1) % 10);
d = detectDetails(`UIDAI Aadhaar\n${wrong.slice(0, 4)} ${wrong.slice(4, 8)} ${wrong.slice(8)}`);
assert(d?.docType === "aadhaar" && d.fields[0].check === true, "bad checksum with Aadhaar keyword is flagged to check");
assert(detectDetails("Phone 9876 5432 1098 call us") === null, "random 12 digits without checksum or keyword are ignored");

// ---- PAN
d = detectDetails("INCOME TAX DEPARTMENT\nGOVT. OF INDIA\nPermanent Account Number\nABCPS1234F\nName RAHUL SHARMA\n12/05/1990");
assert(d?.docType === "pan" && val(d, "pan") === "ABCPS1234F" && !d.fields[0].check, "PAN found");
d = detectDetails("INCOME TAX DEPARTMENT\nPermanent Account Number\nABCPL1Z34F");
assert(val(d, "pan") === "ABCPL1234F" && d?.fields[0].check === true, "OCR-confused PAN (Z for 2) is corrected and flagged");
assert(detectDetails("Order ABCPE12345 shipped") === null, "ten-character order code is not mistaken for PAN");

// ---- Passport (printed + MRZ with real check digits)
const no = "J8369854<";
const dob = "900512";
const exp = "300512";
const line2 = `${no}${mrzCheck(no)}IND${dob}${mrzCheck(dob)}M${exp}${mrzCheck(exp)}<<<<<<<<<<<<<<<0`.padEnd(44, "<").slice(0, 44);
const mrz = `P<INDSHARMA<<RAHUL<<<<<<<<<<<<<<<<<<<<<<<<<<<\n${line2}`;
d = detectDetails(`REPUBLIC OF INDIA\nPassport\nDate of Expiry 12/05/2030\n${mrz}`);
assert(d?.docType === "passport" && val(d, "passport") === "J8369854", "passport number read from MRZ");
assert(d?.expiresOn === "2030-05-12", "passport expiry from MRZ");
assert(val(d, "dob") === "12/05/1990", "passport date of birth from MRZ");
d = detectDetails("REPUBLIC OF INDIA\nPassport No.\nK1234567\nDate of Expiry\n03/11/2032");
assert(val(d, "passport") === "K1234567" && d?.fields[0].check === true && d.expiresOn === "2032-11-03", "printed passport number flagged, expiry on next line");

// ---- Licence, voter, vehicle
d = detectDetails("DRIVING LICENCE\nMH12 20110012345\nDate of Issue 04-03-2011\nValidity (NT) 03-03-2031\nValidity (TR) 03-03-2029");
assert(d?.docType === "licence" && val(d, "licence") === "MH12 20110012345", "driving licence number");
assert(d?.expiresOn === "2031-03-03" && val(d, "issue") === "04/03/2011", "licence: latest validity is the expiry, issue date kept");
d = detectDetails("ELECTION COMMISSION OF INDIA\nElector's Photo Identity Card\nXYZ1234567");
assert(d?.docType === "voter" && val(d, "voter") === "XYZ1234567", "voter ID");
d = detectDetails("CERTIFICATE OF REGISTRATION\nRegn. No. GJ05 AB 1234\nValid upto 15 Jun 2036");
assert(d?.docType === "vehicle" && val(d, "vehicle") === "GJ05 AB 1234" && d.expiresOn === "2036-06-15", "vehicle registration and valid-upto with a month name");

// ---- Generic documents
d = detectDetails("HDFC ERGO General Insurance\nPolicy No: 2319 4000 12345\nPolicy Period: 01/04/2026 to 31/03/2027\nPremium Rs. 8,499");
assert(d?.docType === "other" && (d.fields.find((f) => f.label === "Policy number")?.value ?? "").startsWith("2319"), "policy number from a label");
assert(d?.expiresOn === "2027-03-31", "end of the policy period is the expiry");
assert(detectDetails("Dear customer, thank you for shopping with us.") === null, "plain text finds nothing");
assert(detectDetails("") === null, "empty text finds nothing");
assert(DOC_LABEL.aadhaar === "Aadhaar", "labels available for the review form");
console.log("all OCR parsing tests passed");
