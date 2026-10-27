# DocVault

Keep your family's important documents (Aadhaar, PAN, passports, certificates, photos, any file type) in folders on your Android phone, instead of hunting for them across gallery, WhatsApp and downloads.

- Folders and subfolders, each with its own color (one per family member works well)
- Add files from inside the app, or **share straight from the gallery / any app → DocVault → pick a folder**
- Files are *copied* into the app's private storage; originals stay where they are
- **Built-in scanner:** capture with the camera or import photos from the gallery; pages are auto-detected, cropped and straightened, then saved as one PDF (or separate images) into a folder
- **Per-file details:** tags, notes, and copyable fields (document number, issue date, policy number...). Saved numbers are masked on screen (last 4 visible) with a reveal and copy button
- **Expiry reminders:** set an expiry date on any file and get notifications 60, 30 and 7 days before and on the day (configurable). Expired and soon-to-expire files appear in a "Needs attention" card on the home screen
- **Read details from scans (OCR):** after a scan, DocVault reads the pages on the phone, finds Aadhaar, PAN, passport, driving licence, voter ID and vehicle registration numbers plus expiry dates (and policy/account numbers on bills), and shows a review form so you confirm what gets saved
- **Reminders for anything:** subscriptions, bills, premiums, rent. One-time, monthly or yearly; amount and note; notify on the day and/or days before; **Snooze** and **Done** buttons on the notification
- **Encrypted details:** folder and file names, tags, notes, saved numbers and reminders are stored encrypted (AES-256-GCM) with a key kept in the phone's secure storage
- **Capture to Reminder (v1.4.0):** share an SMS, WhatsApp message, email body, or screenshot of a bill directly into DocVault. On-device OCR reads the biller, amount, due date, category and reference number, pre-filling a reminder to confirm in one tap. Optionally keeps the bill in your `Bills` folder.
- **Smart document naming:** after a scan (in the review form) or after importing photos (a "Suggested names" sheet), DocVault proposes a name from the text it read, like "Passport - Dad", "Car Insurance - 2027" or "Airtel Bill - Nov 2026". The person comes from the family-member folder (or the passport's machine-readable lines); nothing is renamed until you approve. Imported PDFs aren't read: on-phone text recognition only handles images
- **Favorites:** star any file or folder (passport, licence, policies...). They appear in a Favorites strip at the top of the home screen with one-tap open and share; reorder them by dragging (Home → Favorites → Edit)
- **Home-screen widget:** "DocVault favorite" (one compact card) or "DocVault favorites" (wider carousel). Arrows page through favorite documents; tap a card to open it or the share button to share it, both after unlock. Choose which favorites appear (Favorites screen → Widget) and whether photo previews are shown (Settings → Home-screen widget, off by default)
- **Autofill from the vault:** when another app or website asks for an Aadhaar, PAN, passport, driving licence, voter ID or vehicle number, date of birth, name, mobile, email, address or PIN code, Android offers "Fill from DocVault". After your fingerprint or PIN it lists one suggestion per family member (each top-level folder, plus your own details from My card). Settings → Autofill and My card
- **Emergency card on the lock screen (My card, heart icon on Home):** your name, up to three emergency contacts, blood group, allergies, conditions, medicines and a message for whoever finds the phone. Drawn onto the lock-screen wallpaper (optionally over your own photo) and/or kept as a lock-screen notification, so a stranger or paramedic can call your family without unlocking. Document numbers never appear there; the address only if you turn it on. A shortcut opens Android's own emergency information to fill that in too
- Search across folder names, file names, tags, notes and saved details
- **Batch actions:** in a folder, press and hold a file to start selecting, tap more (or Select all), then move, tag, delete or export them together. Export saves real-named copies into a phone folder you pick, or shares them as one zip
- **Sort files** in a folder by name, date added, file size, expiry date or last opened (tap the sort label above the list; the choice is remembered)
- Fingerprint / face / phone-PIN lock, screenshots blocked, no internet permission
- Backup file export and restore (optional AES-256 password)

Built with Expo SDK 54 (React Native, TypeScript, new architecture). Android only.

## Get an APK from GitHub (no local Android setup)

1. Create a GitHub repo and push this folder to the `main` branch.
2. Open the **Actions** tab → **Build Android APK**. It runs on every push, or press **Run workflow**.
3. When it finishes (about 10-15 minutes the first time), open the repo's **Releases** section: every build of `main` is published there as **DocVault &lt;version&gt; (build N)** with the `.apk` attached, and marked Latest. Download it on your phone and install it (allow "install unknown apps" when asked). Pull-request builds only upload the **DocVault-apk** artifact on the run page.
4. For a named version: bump `version` in `app.json`, then `git tag v1.5.0 && git push --tags`. That build is released under the `v1.5.0` tag.

### Sign with your own key (recommended)

Without secrets, CI signs with the standard Android debug key. That installs fine and keeps the same signature between builds, but it is not suitable for Google Play. To use your own key:

```bash
keytool -genkeypair -v -storetype PKCS12 -keystore docvault-release.jks \
  -alias docvault -keyalg RSA -keysize 2048 -validity 10000
base64 -w0 docvault-release.jks      # macOS: base64 -i docvault-release.jks
```

Add four repository secrets (Settings → Secrets and variables → Actions):

| Secret | Value |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | output of the `base64` command |
| `ANDROID_KEYSTORE_PASSWORD` | the keystore password |
| `ANDROID_KEY_ALIAS` | `docvault` |
| `ANDROID_KEY_PASSWORD` | the key password |

**Back up the `.jks` file and its passwords somewhere safe.** If you lose them you can never ship an update that installs over the old app. Never commit the `.jks` to git.

If you switch from the debug key to your own key, uninstall the old build once first (Android refuses updates signed with a different key).

## Build locally

Needs Node 20+, JDK 17 and the Android SDK.

```bash
npm install
npm run build:apk      # APK: android/app/build/outputs/apk/release/app-release.apk
```

The `android/` folder is generated by `expo prebuild` and is git-ignored.

## Make it yours

| Change | Where |
| --- | --- |
| App name, package id (`com.docvault.app`), version | `app.json` (`name`, `android.package`, `version`) |
| Logo shape | edit `scripts/make_icons.py`, run `npm run icons` (needs `pip install pillow`) |
| Colors and fonts | `src/theme.ts` (see below) |

All colors live in `src/theme.ts`: screens, lock screen, widget, folder colors, file-type badges, and through `app.config.ts` the splash screen, launcher icon background and notification color. After changing `primaryDark`, `primary` or `primaryLight`, run `npm run icons` so the logo artwork matches. Keep colors as 6-digit hex (`#RRGGBB`).

Change the package id **before** your first real release; it can't change later on Google Play.

## Encryption

What is encrypted: the vault index (`vault.enc`): folder and file names, tags, notes, saved fields, expiry dates and reminders. Algorithm: AES-256-GCM (`@noble/ciphers`, checked against Node's own implementation in `npm test`). The 256-bit key is random, generated on first run and kept in Android's Keystore-backed secure storage (`expo-secure-store`). It is not derived from a password and never leaves the phone.

What is **not** encrypted yet: the files themselves (PDFs, photos). They sit in the app's private storage behind the app lock. Encrypting them is the planned next step (it needs decrypt-on-open to a temporary copy, so it is a separate release).

What this protects against: someone reading the index out of a phone image, a leaked backup of the app data, or another app. It does not protect against someone who can unlock your phone and open DocVault. That is what the app lock is for.

Upgrading from an older version: the old plain `index.json` is encrypted automatically at first start and the plain copy deleted. If the encrypted data can't be read (for example the phone's secure storage was reset), DocVault shows a recovery screen and **never overwrites anything**; restoring a backup brings you back.

Backups: a backup contains a readable copy of the index so it can be restored on any phone. **Always set a backup password** (AES-256 zip) when sharing or manually exporting.
- **Weekly auto backup:** DocVault automatically creates a full backup every Sunday at 3:00 AM, containing all documents, notes, reminders, favorites, profile and folder structure. It overwrites the previous backup file so only a single latest backup is retained under the standard Android backups folder: `/storage/emulated/0/Backups/DocVault/DocVault-backup.zip` (with fallback to app-specific external storage `Android/data/com.docvault.app/files/Backups/DocVault-backup.zip`). Can be triggered on demand or toggled in Settings → Backup.

## Reading details from scans

`expo-text-extractor` runs Google ML Kit text recognition on the phone (Latin script, through Google Play services; the recognition model is downloaded by Google the first time). `src/ocr/parse.ts` turns the text into fields:

- Aadhaar: 12 digits validated with the Verhoeff checksum
- PAN: pattern plus the holder-type letter, with common OCR mix-ups (O/0, I/1, S/5, B/8, Z/2) corrected and flagged
- Passport: machine-readable zone with ICAO check digits (also gives expiry and date of birth), else the printed number
- Driving licence, voter ID, vehicle registration: pattern plus state-code checks
- Expiry dates from "valid upto / validity / expiry / policy period" wording; policy, account and consumer numbers from labels

Everything is shown in a review form; low-confidence values say "Please check this one". Date of birth is detected but off by default. Turn the feature off in Settings → Scanner. `npm test` checks the detector with realistic OCR text (it cannot test the camera or recognition quality itself).

## Standalone reminders

Home → bell icon. Each reminder has a title, optional amount and note, a date and time, repeat (once/monthly/yearly) and when to notify (on the day, 1, 3, 7 days before). Repeating reminders are scheduled a year ahead (monthly) or three years (yearly) and topped up whenever the app opens. Monthly reminders on the 29th-31st fall on the last day of shorter months.

The **Snooze 1 day** and **Done** buttons on a notification open DocVault (behind the unlock) and apply the action, instead of changing saved data silently in the background. Notification text can be reduced to "A reminder is due" in Settings.

## Details and reminders (documents)

Open a file's menu → **Details & reminders**. Tags, notes, expiry date and fields live in `index.json` next to the file record, so they travel with backups and restores.

Reminders are local notifications scheduled with `expo-notifications` for 9:00 AM on each reminder day (`src/reminders-plan.ts` decides what to schedule, `src/reminders.ts` schedules it). They are rebuilt whenever a file changes, the settings change, or the app returns to the foreground, and the soonest 100 are scheduled. The app asks for notification permission the first time you set an expiry date. Tapping a reminder opens that file's details after unlock. Notification text can hide document names (Settings → Reminders), and the channel asks Android to hide text on the lock screen.

Some phone brands (Xiaomi, Oppo, Vivo, OnePlus, Samsung with aggressive battery saving) stop apps from running scheduled alarms. If reminders don't arrive, set DocVault's battery usage to "Unrestricted" and allow auto-start.

## Scanner

The scanner is Google's ML Kit Document Scanner (via `react-native-document-scanner-plugin`), which does edge detection, crop, perspective correction and the camera/gallery UI. It needs **Google Play services** on the phone (almost all phones have it). The plugin ships with gallery import switched off, so `patches/` contains a one-line patch (`setGalleryImportAllowed(true)`) that `npm install` applies automatically through `patch-package`.

DocVault turns the returned page images into a PDF itself (`src/scan/pdf.ts`). JPEGs are embedded without recompression, so quality is unchanged and files stay small. `npm test` checks the writer.

## How it works

```
App.tsx                    providers, navigation, "files were shared to us" handling
src/storage/vault.tsx      folders/files index (JSON, written atomically), copy-in, backup/restore
src/storage/settings.tsx   lock + screenshot settings
src/lock/LockProvider.tsx  biometric / device-PIN lock, re-lock after time away
src/screens/               Home, Folder, Save (share target), Scan (review + save), Settings
src/reminders*.ts          reminder planning (pure, tested) and scheduling for expiry dates and standalone reminders
src/security/              AES-GCM helpers (tested) and Keystore-backed key
src/ocr/                   text reading and the document number/date detector (tested)
src/scan/                  PDF writer (pdf.ts), base64 helpers, temp paths
patches/                   patch-package patch enabling gallery import in the scanner
```

Everything lives in the app's private storage under `vault/`: `index.json` plus `files/<id>.<ext>`. A backup is a zip of that folder.

## Known limits (v1)

- Documents are protected by the app lock and Android's private app storage, **not** encrypted at rest. Someone with root access or a forensic tool could read them. Encrypted storage is the natural next step.
- A backup made without a password is a plain zip of every document. Use a password.
- The index is encrypted but the files are not (see Encryption). Don't save full card or bank account numbers as details.
- Notification text is handled by Android, outside the app's encryption. Turn off "Show document names" if others can see your lock screen.
- The home-screen widget is drawn by the launcher, outside the app lock and encryption: anyone who sees the home screen sees favorite document names (and previews, if turned on). Opening or sharing from it still needs unlock. Untick "Widget" on a favorite to keep it off.
- Android widgets can't scroll sideways, so the widget pages with arrows instead of a swipe.
- Android allows one autofill service at a time. Choosing DocVault can replace Google or a password manager for filling other apps' forms (newer Android versions may keep the password manager as an additional service). Autofill keeps its own copy of the saved numbers, encrypted with an Android Keystore key and decrypted only after the fingerprint / PIN prompt. Apps and sites that hide their field names won't get suggestions. Chrome only uses it when "Autofill using another service" is chosen in Chrome's settings.
- The emergency card is deliberately readable without unlocking. The lock-screen wallpaper replaces any separate lock-screen picture you had (DocVault can't read the old one); turning the card off shows the home-screen wallpaper on the lock screen. The lock-screen notification disappears after a restart until DocVault is opened again, and newer Android versions let it be swiped away.
- OCR is only as good as the photo. Glare, blur and angled shots lead to missed or wrong digits, which is why every value is reviewed before saving.
- Reminders depend on Android keeping the app's alarms alive (see the battery note above).
- No cloud sync. Lost phone + no backup = lost documents.
- The scanner and text recognition need Google Play services, and Google may download their models the first time they are used.
- Scanned pages are capped at 30 per scan, and the PDF is built in memory, so very large scans on low-RAM phones may fail. Split them into two scans.
- Files open in whichever app on the phone handles the type; there is no built-in PDF viewer.
- Folders can't be moved or merged yet (files can be moved).

## Manual test checklist

1. Install, open, unlock. Create a folder, add a PDF and a photo, open both.
2. In Gallery, share a photo → DocVault → choose folder → Save. Repeat with the app fully closed.
3. Search for part of a file name.
4. Settings → Export backup (with a password) → save to Drive. Uninstall, reinstall, Restore.
5. Leave the app for over a minute and return: it should ask to unlock.
6. Scan: from a folder tap **Scan**, capture 2 pages, tap the gallery button inside the scanner and import 2 photos, adjust corners, finish. Reorder/rotate/delete pages, then **Save as PDF** and open the PDF.
7. Open a file's Details, set an expiry date a few days away, add a detail (Document number), copy it and paste it elsewhere. In Settings → Reminders, pick "On the day" and set the expiry to today plus one day to see a notification the next morning; or set your phone clock forward a day to test.
8. Scan an Aadhaar or PAN card (or any bill with a policy number and a date). The review form should offer the number and expiry; correct one value, save, then open Details and copy the number.
9. Settings → Scanner off: scanning should skip the review form.
10. Reminders (bell icon): add "Netflix", ₹499, monthly, notify 1 day before and on the day. Add one for tomorrow, wait for the notification, press **Snooze** and then **Done** on the next one.
11. Update an older install from the previous APK: all folders and files should still be there (the index is migrated to encrypted storage).
12. Scan for longer than a minute: you should *not* be asked to unlock when you come back from the scanner.
13. **Share text to reminder:** Share an SMS/WhatsApp text with bill details to DocVault. Share Chooser opens → tap **Create a reminder** → pre-filled details appear with confidence indicators → confirm and save.
14. **Share screenshot / photo of bill:** Share an image of an electricity or broadband bill → Share Chooser shows image preview → tap **Create a reminder** → OCR reads the bill with a non-blocking shimmer → confirms title, amount and due date → **Keep the bill** saves it to `Bills/` and links to the reminder (shows paperclip).
15. **Smart match duplicate:** Share the same monthly bill again: a duplicate sheet appears offering to **Update it with this bill**.
16. **Scan a bill:** From Reminders screen tap **Scan a bill** → capture up to 3 pages → pre-filled review form appears.
17. **Paste from clipboard:** In New Reminder tap **Paste from clipboard** → pre-fills fields in place.
18. **Favorites:** star a file in a folder and a folder from its header. Both appear on Home under Favorites; tap the share button on the file card. Home → Favorites → Edit: drag to reorder, unstar one. Delete a starred file: it disappears from Favorites.
19. **Widget:** long-press the home screen → Widgets → add "DocVault favorites" and "DocVault favorite". Page with the arrows. Leave DocVault for over a minute, tap a card: unlock is asked, then the document opens. Tap share: unlock, then the share sheet. Untick "Widget" on a favorite and turn on "Show image previews": the widget updates.
20. **Smart naming:** in folder "Dad", scan a passport or Aadhaar: the review form's Name card shows "Passport - Dad"; tap it to edit, or save to approve. Change the document type chip: the suggestion follows. Add a photo of a car insurance policy with Add files: a "Suggested names" sheet offers "Car Insurance - 2027"; untick it or tap Keep original to leave the name alone.
21. **Autofill:** scan a PAN card into folder "Dad". Settings → Autofill and My card → turn on "Fill forms from DocVault" → Choose DocVault. In another app with a "PAN number" field (or a KYC form in a browser set to use another autofill service), tap the field → "Fill from DocVault" → fingerprint → pick "Dad · PAN". Turn the switch off: the suggestion disappears and Android's autofill choice is released.
22. **Emergency card:** Home → heart icon. Add your name, one contact and a blood group; the preview updates. Turn on "Card as lock-screen wallpaper", lock the phone: the card shows. Pick a photo; turn on "Show my address" and check it appears; turn it off again. Turn on the lock-screen notification, restart the phone, open DocVault once: the notification is back. Tap it from the lock screen: unlock is asked, then My card opens.

