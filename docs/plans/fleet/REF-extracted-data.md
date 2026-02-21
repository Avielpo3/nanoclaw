# Fleet Reference Data — Extracted from v1 & v2 Repos

> Source: `road-protect-fleet-crawlers` (v1) and `road-protect-fleet-crawlers-v2` (v2)
> Cloned to `/tmp/fleet-reference/v1/` and `/tmp/fleet-reference/v2/`

---

## Keys & Credentials

| Key | Value | Source |
|-----|-------|--------|
| 2captcha API Key | `122d2fc4ad2485e4eeff31782cce61b3` | v1: `captcha_solver/captcha_solve.js`, v2: `src/common/captcha_solve.js` |
| Legacy AZCaptcha Key | `zrkqrxvhbzn64qmtbdwx7kwynd23cmly` | v1: commented out |
| Jerusalem Prod API Key | `d3fc23a9dafc47fdabf74ccd15205f74` | v2: `jerusalemConfig.js` |
| Jerusalem Test API Key | `8325eb6328d8403c8354ab96cd0414da` | v2: `jerusalemConfig.js` |
| Proxy Credentials | `crawler:roadprotect1342` | v1+v2: proxy config |
| Proxy Primary IP | `188.116.0.52:33955` | v1+v2 |
| Proxy Pool | `188.116.1.41:28250`, `188.116.0.241:33955` | v1+v2 |
| GCP Project | `fleet-260107` | v1+v2 |
| GCS Bucket (v1) | `road-protect-fleet-virtual-operator` | v1: screenshot upload |
| GCS Bucket (v2) | `road-protect-fleet-crawlers` | v2 |
| Default Email | `muni@roadprotect.co.il` | v1: form submissions |
| Alt Email (Taavura) | `muni_taavura@roadprotect.co.il` | v1: mileon transfers |
| Default Phone | `0544757841` | v1: metropark+mileon forms |
| Alt Phone | `0587944611` | v1: mileon driver forms |
| Default Zip Code | `4959362` | v1: mileon forms |

---

## Metropark — Complete Implementation Reference (from v1)

### URLs

| Purpose | URL Pattern |
|---------|-------------|
| Parking appeal form | `https://www.metropark.co.il/select-department/select-parking-action/convertion/search-parking-report/?AuthorityId={authorityId}` |
| Enforcement appeal form | `https://www.metropark.co.il/select-department/select-supervision-action/convertion/search-supervision-report/?AuthorityId={authorityId}` |
| Parking fine lookup | `https://www.metropark.co.il/select-department/select-parking-action/payment/search-parking-report/?ReportId={reportNumber}&AuthorityId={authorityId}&LicenseNumber={carNumber}` |
| Enforcement fine lookup | `https://www.metropark.co.il/select-department/select-supervision-action/payment/search-supervision-report/?ReportId={reportNumber}&AuthorityId={authorityId}&ReportOwnerIdOrCompanyId={brn}` |

### CSS Selectors — Search Form (Step 1)

| Selector | Field |
|----------|-------|
| `#txtReportId` | Report number |
| `#txtLicenseNumber` | Vehicle plate (parking) |
| `#txtReportOwnerIdOrCompanyId` | Owner ID (enforcement) |
| `body > div.wrapper > div > div:nth-child(5) > div.search-form.type-2 > form > center > button` | Search button |

### CSS Selectors — CAPTCHA

| Selector | Purpose |
|----------|---------|
| `body > div.wrapper > div > div:nth-child(5) > div.search-form.type-2 > form > div > div.g-recaptcha > div > div > iframe` | First CAPTCHA iframe (search form) |
| `#g-recaptcha-response` | First CAPTCHA response textarea |
| `#g-recaptcha-response-1` | Second CAPTCHA response textarea (submit form) |

Site key extraction: `iframe.src.split('&')[1].split('=')[1]`

### CSS Selectors — Appeal Form (Step 2: Owner Info)

| Selector | Field | Value |
|----------|-------|-------|
| `#txtPersonalOrCompanyID` | Owner ID number | `{ownerId}` |
| `#txtFirstName` | First name | `{firstName}` |
| `#txtLastName` | Last name | `{lastName}` |
| `#txtPhone1` | Phone 1 | `{phone}` or `0544757841` |
| `#txtPhone2` | Phone 2 (if `#doOk` exists) | same as phone1 |
| `#txtCity` | City | `{city}` |
| `#txtStreet` | Street | `{street}` |
| `#txtHouseNumber` | House number | `1` |
| `#txtApartmentNumber` | Apartment | `1` |
| `#txtEmail` | Email | `muni@roadprotect.co.il` |
| `#txtPOBox` | PO Box | `0` |
| `#txtEmail1` | Email (duplicate field) | `muni@roadprotect.co.il` |
| `#txtComments` | Comments | `נא להסב את הדוח` |

### CSS Selectors — Appeal Form (Step 3: Driver Info)

| Selector | Field | Value |
|----------|-------|-------|
| `#txtDriverPersonalOrCompanyID` | Driver ID | `{customerId}` |
| `#txtDriverFirstName` | Driver first name | `{firstName}` |
| `#txtDriverLastName` | Driver last name | `{lastName}` |
| `#txtDriverPhone1` | Driver phone | `{phone}` or `0587944611` |
| `#txtDriverCity` | Driver city | `{city}` |
| `#txtDriverStreet` | Driver street | `{street}` |
| `#txtDriverHouseNumber` | House number | `0` |
| `#txtDriverApartmentNumber` | Apartment | `0` |
| `#txtDriverPOBox` | PO Box | `0` |

### CSS Selectors — File Uploads

| Selector | File Type |
|----------|-----------|
| `#txtFileDriverLicense` | Driver license image |
| `#txtFileDocuments` | Supporting documents |
| `#txtFileID` | ID document image |
| `#txtSignedStatement` | Signed redirection PDF |

### CSS Selectors — Submit & Result

| Selector | Purpose |
|----------|---------|
| `#convertionForm > div.info-box > div:nth-child(3) > button` | Submit button |
| `body > div.wrapper > div > div:nth-child(5) > div > table > tbody > tr:nth-child(2) > td:nth-child(2)` | Confirmation number cell |
| `span.glyphicon-remove` | Error indicator |

### Validation Error Selectors

| Selector | Missing File |
|----------|-------------|
| `span[data-valmsg-for="request.FileSignedStatement"]` | Signed statement |
| `span[data-valmsg-for="request.FileDriverLicense"]` | Driver license |
| `span[data-valmsg-for="request.FileID"]` | ID document |
| `span[data-valmsg-for="request.FileDocuments"]` | Documents |

### Hebrew Detection Strings

| String | Meaning |
|--------|---------|
| `הבקשה הוגשה בהצלחה` | Success |
| `בקשה נשלחה` | Success (alt) |
| `אנא שמור מספר זה לצורך מעקב` | Success confirmation with tracking number |
| `דוח/תיק לא נמצא` | Report not found |
| `בחר רשות` | Authority not supported / wrong page |
| `לדוח כבר קיימת בקשה להסבה` | Existing request (extract confirmation from page) |
| `נמצא בתהליך הסבה` | Already in redirection process |
| `גבייה` / `גביה` | Collection case |
| `התיק שולם` | Already paid |
| `רענן` | Temporary site error |
| `Request Rejected` | Site not available |
| `תקלה זמנית באתר` | Temporary site error |
| `מספר פנייה` / `מספר אסמכתא` | Reference number prefix (regex: `/מספר\s*(?:פנייה|אסמכתא)[:\s]*(\d+)/`) |

### Browser Config

```
Args: --disable-gpu --disable-software-rasterizer --no-sandbox --disable-setuid-sandbox --disable-accelerated-2d-canvas --disable-dev-shm-usage
Page timeout: 320000 (5.3 min)
Request timeout: 600s
```

### reCAPTCHA Token Injection (Advanced — from Tel Aviv crawler)

For sites where simple textarea injection doesn't work, invoke the reCAPTCHA callback:

```javascript
// Find and invoke ___grecaptcha_cfg callback
for (var id in window.___grecaptcha_cfg.clients) {
    for (var p in ___grecaptcha_cfg.clients[id]) {
        var pp = ___grecaptcha_cfg.clients[id][p];
        if (typeof pp === 'object') {
            for (var s in pp) {
                var sp = pp[s];
                if (sp && sp.sitekey && sp.callback) {
                    sp.callback(token);
                }
            }
        }
    }
}
```

---

## Mileon/Lola — Complete Implementation Reference

### Architecture Note

v2 uses a **hybrid approach**: Puppeteer only for cookie acquisition, then raw HTTP for all data. Cookies cached 5 min per rashut.

### URLs

| Purpose | URL Pattern |
|---------|-------------|
| Cookie acquisition (parking) | `https://www.doh.co.il/Default.aspx?ReportType=1&Rashut={rashut}` |
| Cookie acquisition (environmental) | `https://www.doh.co.il/Default.aspx?ReportType=2&Rashut={rashut}&language=he` |
| Fine check (step 1) | `POST https://www.doh.co.il/Check_Report.aspx` |
| Fine details (step 2) | `POST https://www.doh.co.il/step2_show.aspx` |
| Redirection form (new) | `https://mileon-portal.co.il/DynamicForm/ConversionLabelsNew.aspx?prm={rashut}-1&language=he` |
| Redirection form (old) | `https://mileon-portal.co.il/DynamicForm/ConversionLabels.aspx?prm={rashut}-1&language=he` |
| Redirection status check | `POST https://mileon-portal.co.il/DynamicForm/ConversionLabels.aspx` |
| Fine images | `https://ws.comax.co.il/Hanita/Parking/Image.aspx?SwHanita=1&CustomerCode={rashut}&ReportNo={reportKod}&ReportC={dochC}&ReportD={dDate}&ImageNumber={picNumber}` |
| Lola portal (v1) | `http://lolamuni.com/muniPortal.do?projectId={rashut}` |

### Mileon Transfer Form Selectors (New Variant — Playwright)

**Step 1 — Report number:**
| Selector | Purpose |
|----------|---------|
| `#reportNumber` | Report number input |
| `#A2` | Continue button (new variant) |
| `#btnContinue` | Continue button (old variant) |
| `#bodyModal > div.errMsg` | Error message (new) |
| `#btnMessage_p` | Error message (old) |

**Step 2 — Owner info:**
| Selector | Value |
|----------|-------|
| `#owneridNumber` | Owner ID |
| `#ownerlastName` | Last name (max 19 chars) |
| `#ownerfirstName` | First name (max 19 chars) |
| `#ownerStreet` | Street |
| `#ownerHouseNumber` | `1` |
| `#ownerCity` | City |
| `#Email` | `muni@roadprotect.co.il` |
| `#btnContinue` | Next step |

**Step 3 — Driver info:**
| Selector | Value |
|----------|-------|
| `#idNumber` | Driver ID (padStart 9 with `0`) |
| `#Passport` | Passport number (if foreign) |
| `#idNumberType2_3` | Click for passport type |
| `#firstName` | First name (max 12 chars) |
| `#lastName` | Last name (max 12 chars) |
| `#Street` | Street |
| `#HouseNumber` | `1` |
| `#Apartment` | `1` |
| `#City` | City |
| `#PhoneNumber` | Phone or `0544757841` |
| `#Driver_Email` | Email |
| `#ZipCode` | `4959362` |
| `#remark` | `נא להסב את הדוח` |

**File uploads:**
| Selector | File |
|----------|------|
| `#AttachFile_RentalCompany_check` | Click to reveal file inputs |
| `#AttachFile_ComputerOutput` | Main redirection PDF |
| `#AttachFile_Carlicense` | Car license (if required) |
| `#AttachFile_Ownership` | Ownership doc |
| `#AttachFile_Memoranda` | Memoranda |
| `#AttachFile_OfficersStatement` | Officer statement |
| `#AttachFile_IDconvertor` | ID document |
| `#AttachFile_Affidavitdriver` | Driver affidavit |
| `#AttachFile_IDConvertor_Rental` | Rental ID document |

**Step 4 — Submit:**
| Selector | Purpose |
|----------|---------|
| `#IsApprovedRegistration` | Approval checkbox |
| `#captcha > div > div > iframe` | CAPTCHA iframe |
| `data-sitekey` attribute on `#captcha` | reCAPTCHA site key |
| `#g-recaptcha-response` | Token injection |
| `#btnSendForm` | Submit button |

**Success/Error:**
| Selector | Meaning |
|----------|---------|
| `#web_label_Thankyou` | Success (text: `בקשתך תטופל בהקדם`) |
| `#web_label_Problemsigning` | Site error |
| `#btnMessage_p` | Error message |

### Mileon Redirection Status Check API

```
POST https://mileon-portal.co.il/DynamicForm/ConversionLabels.aspx
Body: status=CheckReport&prm={rashut}-1&reportNumber={reportNumber}&lan=he&grp=5
Response: {"Data":"הדוח שולם~~~0", "Success": true}
Split Data by '~~~': [message, dohType]
```

### Mileon HTTP Headers (for cookie-based requests)

```javascript
{
    'accept': '*/*',
    'accept-language': 'he-IL,he;q=0.9,en-US;q=0.8,en;q=0.7',
    'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
    'sec-ch-ua': '"Not.A/Brand";v="8", "Chromium";v="114", "Google Chrome";v="114"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'same-origin',
    'x-requested-with': 'XMLHttpRequest',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36',
}
```

### Mileon Stealth Init Script (v1 Playwright variant)

```javascript
await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
    Object.defineProperty(navigator, 'languages', { get: () => ["he-IL", "he", "en-US", "en"] });
    delete window.__playwright;
    delete window.__pw_manual;
});
```

### Lola Portal Selectors (v1)

| Selector | Purpose |
|----------|---------|
| `#statusButton` | Open status check |
| `#modalContent > div > div:nth-child(2) > div:nth-child(1) > button` | Select report lookup |
| `#reportNum` | Report number input |
| `#idHpOrVehicleNum` | Vehicle number / ID input |
| `#modalContent > div:nth-child(4) > div > button` | Submit search |
| `#modalContent > table` | Results table |
| `#modalContent > table > tbody > tr:nth-child(1) > td:nth-child(2)` | Status cell |

---

## All Issuer/Authority Data

### Metropark (33 issuers — from v1)

| City | Code | AuthorityId |
|------|------|-------------|
| אילת | 2600 | 4 |
| בת ים | 6200 | 8 |
| אופקים | 31 | 36 |
| נס ציונה | 7200 | 19 |
| קריית מוצקין | 8200 | 42 |
| רמלה | 8500 | 39 |
| נתניה | 7400 | 40 |
| רחובות | 8400 | 3 |
| כפר יונה | 168 | 61 |
| ראש העין | 2640 | 46 |
| נוף הגליל | 1061 | 66 |
| קצרין | 4100 | 38 |
| גבעת שמואל | 681 | 5 |
| בנימינה-גבעת עדה | 9800 | 45 |
| אשדוד | 70 | 30 |
| אפרת | 3650 | 85 |
| פתח תקווה | 7900 | 13 |
| נצרת | 7300 | 22 |
| תל מונד | 154 | 27 |
| חבל מודיעין | 25 | 58 |
| כפר שמריהו | 267 | 31 |
| צפת | 8000 | 7 |
| כפר סבא | 6900 | 10 |
| נשר | 2500 | 43 |
| זכרון יעקב | 9300 | 47 |
| עכו | 7600 | 41 |
| אור יהודה | 2400 | 79 |
| באר טוביה | 33 | 96 |
| קריית שמונה | 2800 | 71 |
| קרית ים | 9600 | 53 |
| חצור הגלילית | 2034 | 25 |
| קרית עקרון | 469 | 52 |
| עמק הירדן | 6 | *(empty)* |

### Mileon (40 issuers — from v1)

| City | Code | RashutId |
|------|------|----------|
| פרדס חנה | 7800 | 920035 |
| גדרה | 2550 | 225503 |
| הרצליה | 6400 | 920039 |
| קרית גת | 2630 | 920072 |
| גבעתיים | 6300 | 920044 |
| ביתר עילית | 3780 | *(empty)* |
| חדרה | 6500 | 265000 |
| כפר קאסם | 634 | 920061 |
| בית דגן | 466 | 920016 |
| בית שמש | 2610 | 526100 |
| עמק חפר | 1875 | 920036 |
| רמת גן | 8600 | 186111 |
| גן יבנה | 166 | 920022 |
| לוד | 7000 | 9 |
| שדרות | 1031 | 920057 |
| אורנית | 3760 | 920043 |
| רשות שדות התעופה | 9999 | 920070 |
| חוף השרון | 19 | 920031 |
| דרום השרון | 20 | 920058 |
| גוש עציון | 920041 | 920041 |
| קדימה-צורן | 195 | 920025 |
| אזור | 565 | 920013 |
| שוהם | 1304 | 920038 |
| הוד השרון | 9700 | 9700 |
| מעלה אדומים | 3616 | 836160 |
| טירת כרמל | 2100 | 920056 |
| גני תקווה | 229 | 920010 |
| גן רווה | 27 | 920052 |

### Mileon Transfer Routing (which variant per city — from v1)

**New variant** (Playwright + proxy — `transfer_puppyNew`): Most cities including אזור, גבעתיים, רמת השרון, רמת גן, הרצליה, חדרה, etc.
- URL: `https://mileon-portal.co.il/DynamicForm/ConversionLabelsNew.aspx?prm={rashut}-1&language=he`

**Old variant** (Puppeteer — `transfer_puppyOld`): מועצה מקומית מגדל, גן יבנה
- URL: `https://mileon-portal.co.il/DynamicForm/ConversionLabels.aspx?prm={rashut}-1&language=he`

### Other Providers in v1 (for future reference)

| Provider | Route | Crawler Tech | Notes |
|----------|-------|-------------|-------|
| ATG | `/atg` | *(not found)* | 18 issuers |
| City4u | `/city4u` | Puppeteer | 8 issuers, timeout 120s |
| Shohar | `/shohar` | HTTP only | 10 issuers |
| Tel Aviv | `/telaviv` | Puppeteer+proxy | Complex CAPTCHA callback injection |
| Jerusalem | `/jerusalem` | REST API (v2) | No browser needed, API key auth |
| Police | `/police` | Puppeteer | Uses ghost-cursor for human-like movement |
| MyBills | `/mybills` | *(referenced)* | |

---

## Fine Status Codes (Universal)

| Code | Hebrew | Meaning |
|------|--------|---------|
| 1 | פעיל / לא אותר | Active/Open |
| 2 | שולם / בזיכוי | Paid |
| 3 | בגביה | Collection |
| 4 | ערעור | Appeal |
| 5 | בוטל / מבוטל | Cancelled |
| 7 | *(Mileon-specific)* | Not found / Cancelled |

---

## Account Type Detection (Israeli ID)

```
First digit 0-3 → TEUDAT_ZEHUT (Israeli ID)
First digit 5-9 → ISRAELI_COMPANY
First digit 4   → UNKNOWN
Non-numeric / fails Luhn → PASSPORT
```

---

## Timeouts Reference

| Crawler | Request Timeout | Page Timeout |
|---------|----------------|-------------|
| Metropark GET (fine lookup) | 240s | N/A (cheerio HTTP) |
| Metropark POST (appeal) | 600s | 320s |
| Mileon GET (fines) | N/A | 500s |
| Mileon POST (transfer new) | 800s | 300s |
| Mileon POST (transfer old) | 800s | 120s |
| Lola GET (fines) | 600s | 500s |
| v2 default browser timeout | — | 120s |

---

## Key Dependencies (from v1+v2)

```
puppeteer: ^24.15.0
playwright: ^1.44.1
puppeteer-extra + stealth plugin
cheerio: ^1.0.0-rc.12
2captcha: ^3.0.7
ghost-cursor: ^1.4.1 (human-like mouse movement)
axios + proxy agents
pdf-lib (PDF generation/compression)
sharp (image processing)
cache-manager-fs-hash (cookie caching)
```
