# Heavy Bazar — Schema Design Notes

Ye file un decisions ko explain karti hai jo models me liye gaye hain, aur
jo aage aane wale models ke liye rasta banati hai.

---

## Folder structure

```
heavy-bazar-backend/
├── src/
│   ├── constants/
│   │   └── enums.js              ← saare status strings ek jagah
│   ├── models/
│   │   ├── user.model.js         ← buyer + seller (ek hi collection)
│   │   ├── kyc.model.js
│   │   ├── category.model.js
│   │   ├── listing.model.js
│   │   ├── admin.model.js        ← User se BILKUL alag
│   │   └── auditLog.model.js
│   ├── services/                 ← saara business logic yahan
│   ├── controllers/              ← sirf HTTP handling
│   ├── routes/
│   ├── middlewares/
│   ├── validators/               ← Zod/Joi schemas
│   ├── utils/
│   ├── jobs/                     ← BullMQ workers (auction phase me)
│   └── config/
├── tests/
└── SCHEMA_NOTES.md
```

**Sabse zaroori rule:** business logic hamesha `services/` me. Controller ka
kaam sirf itna — request se data nikaalo, service ko do, response bhejo.

Agar auction ki logic controller me likh di, to usko test karna namumkin ho
jaayega aur baad me reuse bhi nahi kar paayenge.

---

## 6 bade design decisions

### 1. Buyer aur Seller ek hi collection me

Doc me role switcher hai — ek hi aadmi dono kaam karta hai. Do collections
banate to data duplicate hota aur switch karne pe copy karna padta.

`roles: ['buyer', 'seller']` — bas.

### 2. Admin bilkul alag collection me

Admin kabhi buyer/seller nahi banega. Alag rakhne se ek pura class of bugs
khatam ho jaata hai — koi galti se `role = 'admin'` set nahi kar sakta.

### 3. Har amount PAISE me, integer

`₹12,00,000` → `120000000`

JavaScript me `0.1 + 0.2 !== 0.3` hota hai. Financial system me ye galti
har transaction me thoda-thoda error jama karti hai, aur 6 mahine baad
books match nahi karti.

Field naam me bhi `Paise` suffix hai taaki galti se koi rupaye na daal de.

### 4. Percentage bhi integer — basis points me

`1%` → `100 bps`
`2%` → `200 bps`

Wahi wajah — float se bachna.

Calculation: `amount * bps / 10000`

### 5. Auction alag collection me hoga

Listing document bhaari hai (specs, media, sab). Auction me har second bid
update hoti hai. Agar dono ek hi document me hote, to har bid pe pura bhaari
document rewrite hota.

Alag rakhne se auction document chhota aur tez rahega — jo real-time bidding
ke liye zaroori hai.

### 6. Wallet balance sirf cache hai

`user.walletBalancePaise` sach nahi hai. Sach hamesha WalletLedger ki saari
entries ka jod hoga.

Ye field sirf speed ke liye hai. Roz raat ko reconciliation cron dono
match karega.

---

## Denormalization — kahan aur kyun

Kuch data jaan boojh kar duplicate rakha hai. Ye galti nahi, decision hai:

| Field | Kahan duplicate | Kyun |
|---|---|---|
| `user.kycStatus` | KycVerification me bhi hai | Har bid pe check karna hai, join mehnga padta |
| `auditLog.adminEmail` | AdminUser me bhi hai | Admin delete ho jaaye to purana log padhne layak rahe |
| `category.listingCount` | count query se aa sakta tha | Har category page pe count chalana mehnga |

**Rule:** jo bhi duplicate hai, wo ek hi service call me dono jagah update
hoga. Kabhi alag-alag nahi. Aur reconciliation cron check karta rahega.

---

## Delete kabhi nahi — sirf soft delete

Har model me `isDeleted` flag hai.

Physical delete isliye nahi karte kyunki listing se orders jude hain, orders
se ledger entries judi hain. Ek row delete karne se poori chain toot jaati hai.

---

## Agla phase — jo models abhi banane baaki hain

Ye Phase A (Auth + Listings + Admin) ke models the. Aage ye aayenge:

**Auction phase:**
- `Auction` — starting bid, current highest, increment, reserve, timing, extensions
- `Bid` — append-only, kabhi update nahi
- `AutoBid` — proxy bidding ke max limits
- `AuctionParticipant` — kisne EMD diya, kaun bid kar sakta hai

**Payment phase:**
- `WalletLedger` — append-only, har rupaye ka record
- `PaymentTransaction` — gateway ke saath har lenden
- `WithdrawalRequest` — coins nikalne ki request + admin approval

**Order phase:**
- `Order` — address snapshot ke saath
- `Invoice` — GST fields, sequential numbering
- `LegalAgreement` — e-sign record

**Support:**
- `Notification`
- `SupportTicket`
- `CmsPage`
- `Wishlist`

---

---

## Phase 2 — Auth & OTP (ban chuka hai)

Naye files:
- `models/otp.model.js` — alag collection, TTL index se auto-cleanup
- `utils/jwt.js`, `utils/otpHelper.js`, `utils/password.js`
- `services/sms.service.js` — adapter pattern, provider baad me plug hoga
- `services/auth.service.js` — poora business logic (signup, OTP, login, role switch)
- `validators/auth.validator.js` — Zod schemas (PAN, GST, phone, pincode regex)
- `middlewares/validate.js`, `authenticate.js`, `rateLimiter.js`
- `controllers/auth.controller.js`, `routes/auth.routes.js`

**Test kiya gaya:** `tests/utils.unit.test.js` — JWT, OTP hashing, password
hashing, saare validators. Chalane ke liye: `npm test`

**Test NAHI ho paaya yahan:** poora DB flow (signup→OTP→login end-to-end)
kyunki sandbox environment se real MongoDB Atlas ya MongoDB binary download
nahi ho sakta (network restriction). Neeche "Khud Test Kaise Karein" section
dekhiye — apne system pe 5 minute me confirm kar sakte hain.

**Design decisions jo yahan liye:**
- Refresh token **httpOnly cookie** me, access token response body me
  (frontend memory me rakhega, localStorage me nahi — XSS se safe)
- OTP verify pe max 5 attempts, phir naya OTP maangna padega
- Seller banne ke liye KYC verified check — `switchRole()` me hardcoded
  hai kyunki abhi tak client se confirm nahi hua "mandatory ya optional"
- Login/signup dono par email aur phone dono allowed, ek generic
  `identifier` field se handle hota hai

---

## Khud Test Kaise Karein (apne system pe)

```bash
npm install
npm run dev
```

Phir Postman ya curl se:

```bash
# 1. Signup
curl -X POST http://localhost:5000/api/v1/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Test1234","fullName":"Test User"}'

# Terminal me OTP print hoga (dev mode): "📧 [DEV MODE] OTP for test@example.com: 123456"

# 2. OTP verify (upar wala OTP daaliye)
curl -X POST http://localhost:5000/api/v1/auth/verify-signup-otp \
  -H "Content-Type: application/json" \
  -d '{"identifier":"test@example.com","otp":"123456","purpose":"signup"}'

# accessToken response me milega — usko save kar lijiye

# 3. Login
curl -X POST http://localhost:5000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"identifier":"test@example.com","password":"Test1234"}'

# 4. Protected route (token replace kijiye)
curl http://localhost:5000/api/v1/auth/me \
  -H "Authorization: Bearer <accessToken>"
```

Agar step 4 pe aapka data wapas aaye — **poora auth module kaam kar raha hai.**

---

---

## Phase 3 — KYC (ban chuka hai)

**Bada decision:** third-party KYC vendor client ne abhi finalize nahi kiya
(SCHEMA_NOTES ke open sawalon me se ek). Isliye ye phase **manual admin
review** ke roop me bana hai — user documents upload karta hai, admin
panel se dekh ke verify/reject karta hai. Ye khud production me chal sakta
hai. Jab vendor mile, `kyc.service.js` ke `submitDocuments()` me ek step
add hoga jo third-party API ko call karega — baaki poora flow same rahega.

Naye files:
- `services/upload.service.js` — Cloudinary upload, KYC docs **private**
  (`type: authenticated`) rakhe jaate hain, kabhi public URL nahi
- `middlewares/upload.js` — Multer memory storage, 10MB limit, JPG/PNG/PDF only
- `middlewares/authenticateAdmin.js` — admin ka **alag** JWT secret
  (`JWT_ADMIN_SECRET`), permission-check bhi yahi
- `services/auditLog.service.js` — reusable helper, aage har admin action
  isi se log hoga
- `services/kyc.service.js` — submit, admin list/get/review
- `validators/kyc.validator.js` — reject karte waqt reason zaroori
- `scripts/seedSuperAdmin.js` — pehla admin banane ka one-time script
  (public admin signup jaan-boojh kar nahi hai)

**Test kiya gaya:** `npm test` — 24 tests (14 purane + 10 naye). Isme
module-load tests bhi hain jo poora `app.js` (sab routes ke saath) require
karke dekhte hain — taaki koi typo ya missing export turant pakड़ jaaye.

**Test NAHI ho paaya:** real file upload Cloudinary pe, aur admin ka poora
login (kyunki admin LOGIN endpoint khud Phase 5 me banega — abhi sirf
verify-token middleware hai). Neeche test steps dekhiye.

---

## Phase 3 Khud Test Kaise Karein

```bash
npm install
npm run dev
```

**1. Pehle Super Admin banaiye** (ek hi baar):
```bash
node scripts/seedSuperAdmin.js
```

**2. Ab Phase 5 se real login hai** — token manually banane ki zaroorat nahi:
```bash
curl -X POST http://localhost:5000/api/v1/admin/login \
  -H "Content-Type: application/json" \
  -d '{"email":"<jo email seed script me diya>","password":"<wo password>"}'
```
Response me `accessToken` milega, isko `<admin_token>` ki jagah use kijiye.

**3. User se KYC submit kariye** (pehle Phase 2 se signup/login karke
`accessToken` le lijiye):
```bash
curl -X POST http://localhost:5000/api/v1/kyc/submit \
  -H "Authorization: Bearer <user_accessToken>" \
  -F "documents=@/path/to/pan-card.jpg" \
  -F 'docTypes=["government_id"]'
```

**4. Admin se pending list dekhiye:**
```bash
curl http://localhost:5000/api/v1/kyc/admin/pending \
  -H "Authorization: Bearer <admin_token>"
```

**5. Admin verify kare:**
```bash
curl -X POST http://localhost:5000/api/v1/kyc/admin/<kycId>/review \
  -H "Authorization: Bearer <admin_token>" \
  -H "Content-Type: application/json" \
  -d '{"action":"verify"}'
```

Agar user ab `GET /api/v1/kyc/me` kare aur status `"verified"` dikhe —
**poora KYC module kaam kar raha hai.**

---

---

## Phase 4 — Categories + Listings (ban chuka hai)

Naye files:
- `services/category.service.js` — admin CRUD (2-level nesting enforce
  hota hai), public tree listing, `syncListingCount()` helper
- `services/listing.service.js` — seller draft/media/submit, buyer
  browse/search/detail, admin approve/reject
- `validators/listing.validator.js` — **business rules yahan enforce
  hote hain**: 5 saal se purana equipment reject, hour meter 15000 se
  zyada reject, future production year reject
- `middlewares/uploadListingMedia.js` — photos/videos (KYC se alag limits)
- `utils/slugify.js` — unique URL-friendly slugs

**Bada decision — auction EMD abhi connect nahi hai:**
Doc ka rule hai auction listing publish karne se pehle seller EMD dega.
Payment integration Phase 7 me banega. Isliye abhi:
- Fixed-price listing submit karo → seedha `under_review`
- Auction listing submit karo → `pending_payment` pe ruk jaayegi

`listing.service.js` me ek stub function `markSellerEmdPaid()` already
likha hai — Phase 7 ka payment webhook isko call karega taaki listing
`pending_payment -> under_review` aage badhe. Abhi ye kahin route se
call nahi hoti, bas state machine ka agla step pehle se ready hai.

**Design decisions:**
- Listing photos **public** Cloudinary pe (KYC docs se ulta — wo private
  the), kyunki website pe seedha `<img>` me dikhni hain
- `vehicleRegistrationNumber` aur `serialNumber` schema me hi `select:
  false` hain — API response me kabhi apne aap nahi aayenge (doc ka rule)
- View count **atomic $inc** se badhta hai, read-modify-write se nahi
  (SCHEMA_NOTES ka purana rule yahan follow kiya)
- Category delete karne pe agar listings judi hain to sirf **deactivate**
  hota hai, hard delete nahi
- Pagination offset-based (page/limit) — KYC admin list ke saath
  consistency ke liye. Bahut bade scale pe cursor-based better hoga.

**Test kiya gaya:** `npm test` — 40 tests (24 purane + 16 naye). Business
rules ke edge cases explicitly test kiye — 5 saal se purana reject,
hour meter limit, future year, auction bina config ke reject.

**Test NAHI ho paaya:** real Cloudinary media upload, aur poora
seller→admin→buyer flow database ke saath (sandbox network restriction,
jaisa Phase 2/3 me bataya). Neeche test steps.

Model comments me pehle "S3" likha tha (purani assumption) — Phase 4 me
fix karke "Cloudinary" kar diya, kyunki aapke credentials Cloudinary ke
hain, S3 ke nahi.

---

## Phase 4 Khud Test Kaise Karein

Category pehle banaiye (admin token chahiye, Phase 3 ke steps se lijiye):
```bash
curl -X POST http://localhost:5000/api/v1/categories/admin \
  -H "Authorization: Bearer <admin_token>" \
  -H "Content-Type: application/json" \
  -d '{"name":{"en":"Excavators","hi":"खुदाई करने वाला"}}'
```

Seller listing banaye (seller role chahiye — Phase 2 se KYC verified
karke `switch-role` call kar lijiye):
```bash
curl -X POST http://localhost:5000/api/v1/listings \
  -H "Authorization: Bearer <seller_accessToken>" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Hitachi ZX19-6 CR",
    "categoryId": "<category_id_upar_wale_se>",
    "location": {"state": "Assam"},
    "listingType": "fixed_price",
    "fixedPrice": 1200000,
    "specifications": {"general": {"productionYear": 2023, "hoursOnMeter": 274}}
  }'
```

Photo add kariye, submit kariye, admin approve kare, phir buyer dekhe:
```bash
# Media add
curl -X POST http://localhost:5000/api/v1/listings/<listingId>/media \
  -H "Authorization: Bearer <seller_accessToken>" \
  -F "media=@/path/to/photo.jpg"

# Submit for review
curl -X POST http://localhost:5000/api/v1/listings/<listingId>/submit \
  -H "Authorization: Bearer <seller_accessToken>"

# Admin approve
curl -X POST http://localhost:5000/api/v1/listings/admin/<listingId>/review \
  -H "Authorization: Bearer <admin_token>" \
  -H "Content-Type: application/json" \
  -d '{"action":"approve"}'

# Buyer browse (login zaroori nahi)
curl http://localhost:5000/api/v1/listings/browse?state=Assam&sort=newest
```

Agar aakhri wale `browse` call me aapki listing dikhe — **poora
listings module kaam kar raha hai.**

---

## Phase 5 — Admin Panel Core (ban chuka hai)

Naye files:
- `services/adminAuth.service.js` — admin **login** (signup jaan-boojh kar
  nahi hai — pehla Super Admin seed script se, uske baad sirf Super Admin
  hi sub-admin bana sakta hai)
- `services/subAdmin.service.js` — sub-admin create/permissions/activate,
  **sirf Super Admin** (`requireSuperAdmin` middleware — permission se bhi
  bypass nahi hota, warna sub-admin khud ko sab permissions de sakta tha)
- `services/userManagement.service.js` — list/view/suspend/activate/CSV export
- `services/dashboard.service.js` — stats + recent activity feed
- `services/cms.service.js` + `models/cmsPage.model.js` — Privacy Policy,
  Terms, FAQ, Contact Support (localized, doc ka rule)
- `routes/admin.routes.js`, `routes/cms.routes.js`

**Purana temporary hack hataya:** Phase 3/4 me admin token manually
Node script se banate the (kyunki login endpoint nahi tha). Ab asli
`POST /api/v1/admin/login` hai — us hack ki zaroorat khatam.

**Design decisions:**
- Admin login me **brute-force lockout** hai (5 galat attempts = 30 min
  lock) — user login se extra strict, kyunki admin ke paas paisa release
  karne ki power hai
- Sub-admin actions **sirf Super Admin** kar sakta hai, permission array
  ke through bhi nahi — privilege escalation rokne ke liye
  (`requireSuperAdmin` alag hi check hai `requirePermission` se)
- Dashboard revenue/auction stats abhi **0/placeholder** hain — WalletLedger
  (Phase 7) aur Auction (Phase 6) collections banne ke baad live honge.
  Response shape abhi se fix hai taaki frontend abhi se kaam shuru kar sake
- User CSV export me **PAN number kabhi nahi jaata** — sensitive data
- CMS page upsert hai (create ya update, ek hi endpoint) — admin ko
  alag se pata nahi karna padta page pehle se hai ya nahi

**Test kiya gaya:** `npm test` — 52 tests (40 purane + 12 naye).

**Test NAHI ho paaya:** poora DB flow (login → dashboard → sub-admin banao
→ uske permissions se test karo). Neeche steps.

---

## Phase 5 Khud Test Kaise Karein

```bash
node scripts/seedSuperAdmin.js   # agar Phase 3 me nahi kiya

# 1. Login
curl -X POST http://localhost:5000/api/v1/admin/login \
  -H "Content-Type: application/json" \
  -d '{"email":"<seed_email>","password":"<seed_password>"}'
# accessToken save kar lijiye

# 2. Dashboard stats
curl http://localhost:5000/api/v1/admin/dashboard/stats \
  -H "Authorization: Bearer <super_admin_token>"

# 3. Sub-admin banaiye (sirf KYC verify permission ke saath)
curl -X POST http://localhost:5000/api/v1/admin/sub-admins \
  -H "Authorization: Bearer <super_admin_token>" \
  -H "Content-Type: application/json" \
  -d '{"email":"kyc-reviewer@heavybazar.com","password":"Test1234","fullName":"KYC Reviewer","permissions":["kyc:view","kyc:verify"]}'

# 4. Us sub-admin se login karke listing approve karne ki koshish kariye —
# 403 aana chahiye, kyunki usko sirf KYC permission di thi
curl -X POST http://localhost:5000/api/v1/admin/login \
  -H "Content-Type: application/json" \
  -d '{"email":"kyc-reviewer@heavybazar.com","password":"Test1234"}'

curl -X POST http://localhost:5000/api/v1/listings/admin/<listingId>/review \
  -H "Authorization: Bearer <sub_admin_token>" \
  -H "Content-Type: application/json" \
  -d '{"action":"approve"}'
```

Agar step 4 ka aakhri call **403 "permission nahi hai"** de — permission
system sahi kaam kar raha hai.

---

## Phase 6 — Auction Engine (ban chuka hai) ⚠️ sabse critical phase

Naye files:
- `utils/auctionMath.js` — **saari calculation pure functions me** (EMD
  calc, bid validation, auto-bid resolution, anti-sniping). Isi wajah se
  DB ke bina bhi poori tarah test ho paaya
- `models/auction.model.js`, `bid.model.js` (append-only), `autoBid.model.js`,
  `auctionParticipant.model.js` (EMD tracking)
- `services/auction.service.js` — join (EMD stub), **placeBid (MongoDB
  transaction — atomic)**, setAutoBid, startAuction, closeAuction
- `sockets/index.js` — Socket.io, room-based (`auction:<id>`)
- `jobs/auctionQueue.js`, `auctionWorker.js`, `auctionReconciliationCron.js` —
  BullMQ se start/close schedule, safety-net cron

**BUG PAKड़A AUR FIX KIYA (development ke dauran hi):** pehla auto-bid
resolution design step-by-step increment karta tha — agar do bidders ke
max ka farak bada ho (jaise ₹5 lakh) aur increment chhota (₹1000), to
resolution ke sainkdon steps lagte, matlab sainkdon Bid documents ban
jaate ek hi resolution ke liye. Fix: `resolveAuctionState()` ab EK hi
call me poora final answer deta hai (classic eBay-style proxy bidding —
winner sirf doosre-sabse-zyada max se ek increment upar dega, apne poore
max tak nahi). Test suite ismein exactly ye case cover karta hai.

**BID ATOMICITY:** `placeBid()` MongoDB **transaction (session)** use
karta hai — poora read-compute-write ek atomic unit hai. Clash hone pe
MongoDB khud fail karta hai (TransientTransactionError), aur code 3 baar
retry karta hai. **Transactions sirf replica set pe chalte hain** —
MongoDB Atlas (jo aap use kar rahe hain) default replica set hai, isliye
production me kaam karega. Agar koi local standalone MongoDB pe test
kare to transactions fail honge — Atlas se hi test karein.

**Auction listing ka gap fix hua:** Phase 4 me `auctionConfig` (starting
bid, increment, timing) receive hota tha par kahin persist nahi hota
tha — comment kehta tha "Phase 6 me use hoga" par code missing tha. Ab
`listing.service.js` ke `createDraft()` me fix ho gaya — auction listing
banate hi Auction document bhi ban jaata hai.

**EMD amount ka assumption:** buyer ka EMD = `startingBidPaise` ka 2%
(BUSINESS_RULES.EMD_BPS_BUYER), seller ka = 1%. Ye SCHEMA_NOTES.md ka
wahi khula sawal hai — defensible default ke saath. Client confirm kare
(starting bid / reserve / final bid me se kya sahi hai) to sirf
`listing.service.js` ke `createDraft()` me EK line badlegi.

**Anti-sniping (auto-extend) implement kiya:** doc me sirf itna tha
"3-3 days, max 15 days, 5 extensions" — manual ya auto trigger, likha
nahi tha. Maine AUTO-EXTEND choose kiya (industry-standard, warna log
last-second bid daal ke doosron ko react karne ka time nahi dete). Agar
client manual extension chahta hai, `placeBid()` me ek check hataana
padega — baaki system same rahega.

**PHASE 7 STUBS (jaan-boojh kar):**
- `joinAuction()` — real Razorpay order/webhook ke bina seedha "EMD paid"
  maan leta hai (jaisa Phase 4 ka `markSellerEmdPaid()` bhi stub tha)
- HB Coins wallet credit abhi nahi hota (`AuctionParticipant.emdStatus`
  sirf `released`/`adjusted`/`forfeited` set karta hai — asli coin
  credit Phase 7 ka WalletLedger banega)

**Test kiya gaya:**
- `npm test` — **82 tests** (61 purane + 21 auction math)
- **Real Redis install karke BullMQ ka genuine integration test** —
  MongoDB jaisa yahan blocked nahi tha. Job scheduling, delay-based
  ordering, aur reschedule pattern (extension use-case) sab real Redis
  se verify hua, mock nahi

**Test NAHI ho paaya:** poora bid-placement flow real MongoDB transaction
ke saath (Atlas ka replica-set feature yahan simulate nahi ho sakta),
aur real-time Socket.io broadcast end-to-end. Neeche test steps.

---

## Phase 6 Khud Test Kaise Karein

**Zaroori:** Redis chalta hona chahiye (`redis-server` ya Docker), aur
`.env` me `REDIS_URL=redis://localhost:6379` set hona chahiye — warna
auction jobs skip ho jaayenge (server chalega, par auto start/close
nahi hoga).

```bash
npm install
npm run dev
```

1. **Seller ek auction listing banaye** (Phase 4 wale steps se, bas
   `listingType: "auction"` aur `auctionConfig` bhejiye):
```bash
curl -X POST http://localhost:5000/api/v1/listings \
  -H "Authorization: Bearer <seller_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "JCB 3DX",
    "categoryId": "<category_id>",
    "location": {"state": "Assam"},
    "listingType": "auction",
    "auctionConfig": {
      "startingBid": 800000,
      "minBidIncrement": 10000,
      "startTime": "2026-08-08T10:00:00Z",
      "endTime": "2026-08-08T10:05:00Z"
    }
  }'
```
(Testing ke liye `endTime` 5 minute baad rakhiye — jaldi close hote
dekhne ke liye)

2. Media add + submit kariye (Phase 4 jaisa), phir **admin approve kare**
   — isi step pe BullMQ jobs schedule hoti hain.

3. **Do alag buyer accounts se** (Postman me do collections) auction
   join kariye aur bid kariye:
```bash
curl -X POST http://localhost:5000/api/v1/auctions/<auctionId>/join \
  -H "Authorization: Bearer <buyer_token>"

curl -X POST http://localhost:5000/api/v1/auctions/<auctionId>/bid \
  -H "Authorization: Bearer <buyer_token>" \
  -H "Content-Type: application/json" \
  -d '{"amount": 810000}'
```

4. `endTime` ke baad (worker terminal me dekhiye) auction khud close
   ho jaayega. Check kariye:
```bash
curl http://localhost:5000/api/v1/auctions/<auctionId>
```
`status: "closed"`, `winnerId`, `winningBidPaise` dikhne chahiye.

Agar ye poora chain chal jaaye — **auction engine kaam kar raha hai.**

---

## Phase 7 — Payments, Wallet, Orders (ban chuka hai)

Naye files:
- `models/walletTransaction.model.js` — **append-only ledger**, balance
  kabhi field me store nahi hoti, hamesha SUM se derive hoti hai
- `models/paymentOrder.model.js` — Razorpay order tracking, idempotency
  ke liye `razorpayPaymentId` unique+sparse index
- `models/order.model.js`, `withdrawal.model.js`
- `services/wallet.service.js` — credit/debit/balance, sab semantic
  wrappers (`creditFromEmdRelease`, `creditSaleProceeds`, `debitForWithdrawal`)
- `services/razorpay.service.js` — order create, signature verify (client
  aur webhook dono)
- `services/order.service.js` — order number/invoice generation,
  **commission split calculation**
- `services/payment.service.js` — poora orchestration, 4 purposes ek
  pattern se (initiate → verify/webhook → idempotent confirm)
- `services/withdrawal.service.js` — request (coins turant lock),
  admin approve/reject (reject pe coins wapas — reversal entry)

**BUG PAKड़A AUR FIX KIYA (isi phase me):** `config/razorpay.js` module
load hote hi turant Razorpay instance banata tha — agar `.env` me keys
missing hon (jaise fresh clone pe), to **poora server crash** ho jaata,
sirf payment routes nahi. Module-load test se turant pakड़a gaya. Fix:
lazy initialization, jaisa `jobs/auctionQueue.js` me Redis connection
ke saath pehle se kiya tha — pattern consistent rakha.

**Commission math verify hua:** ₹12,00,000 ke example pe (jo maine chat
me pehle explain kiya tha) — seller ko ₹11,76,000, admin ko ₹24,000.
Test me exact yehi numbers check kiye.

**PHASE 6 → PHASE 7 REAL CONNECTION:** Auction ka stub `joinAuction`
ab do functions me split hua — `checkCanJoinAuction` (payment initiate
se pehle eligibility check) aur `confirmBuyerEmdPaid` (payment verify
hone ke BAAD, ab public route se nahi, sirf `payment.service.js` se call
hota hai). `closeAuction` ab haarne walon ko **real wallet credit** deta
hai — pehle sirf status field set hoti thi.

**Design decisions:**
- Buyer poora **displayed price hi deta hai** — koi surprise addition
  nahi. Dono 1% commissions usi total se kaate jaate hain seller credit
  se pehle (BUSINESS_RULES.COMMISSION_BPS_BUYER/SELLER)
- **Seller ka sale-proceeds bhi HB Coins wale hi wallet me aata hai**
  (SALE_CREDIT type se) — kyunki Razorpay Route (split settlement) client
  se abhi confirm nahi hua. Jab confirm ho, seedha bank split alag se
  implement karna padega
- Withdrawal request banate hi coins **turant lock** ho jaate hain
  (debit entry), taaki same coins kahin aur use na ho sakein
- Real Razorpay Payout API is phase ke scope se bahar hai — abhi admin
  manually bank transfer karke "approved" mark karega

**Test kiya gaya:** `npm test` — **94 tests** (82 purane + 10 payment +
2 module-load). Commission math, wallet validators, sab pure functions
verify hue.

**Test NAHI ho paaya:** real Razorpay checkout flow, webhook end-to-end
(real Razorpay account chahiye), aur poora DB flow (jaisa Phase 2 se
consistent hai). Neeche test steps.

---

## Phase 7 Khud Test Kaise Karein

Real Razorpay test mode credentials `.env` me hone chahiye (jo aapne
diye the — `rzp_test_...`). Razorpay dashboard me **webhook URL** set
kariye (test ke liye [ngrok](https://ngrok.com) se local server expose
kar sakte hain): `https://<your-url>/api/v1/payments/webhook`, event
`payment.captured` select kariye, jo secret milega wo `.env` ke
`RAZORPAY_WEBHOOK_SECRET` me daaliye.

```bash
# 1. Buyer EMD payment initiate
curl -X POST http://localhost:5000/api/v1/payments/emd/buyer/<auctionId>/initiate \
  -H "Authorization: Bearer <buyer_token>"
# response me razorpayOrderId milega, isse Razorpay checkout kholiye
# (frontend banne ke baad ye automatic hoga)

# 2. Checkout complete karne ke baad frontend teen values dega,
# unhe manually verify endpoint pe bhejiye:
curl -X POST http://localhost:5000/api/v1/payments/verify \
  -H "Authorization: Bearer <buyer_token>" \
  -H "Content-Type: application/json" \
  -d '{"razorpayOrderId":"...","razorpayPaymentId":"...","razorpaySignature":"..."}'

# 3. Confirm kijiye ki AuctionParticipant ban gaya — ab bid kar sakte hain
curl -X POST http://localhost:5000/api/v1/auctions/<auctionId>/bid \
  -H "Authorization: Bearer <buyer_token>" \
  -H "Content-Type: application/json" \
  -d '{"amount": 810000}'

# 4. Wallet balance check kariye (auction haarne ke baad)
curl http://localhost:5000/api/v1/wallet/balance \
  -H "Authorization: Bearer <buyer_token>"
```

Agar step 4 me haarne ke baad balance me EMD amount dikhe — **poora
payment loop kaam kar raha hai.**

---

## Phase 8 — Notifications, Reports, Wishlist, Support, Hardening (ban chuka hai — backend core complete)

Naye files:
- `models/notification.model.js`, `supportTicket.model.js`
- `services/notification.service.js` — **`notify()` ek hi jagah se in-app
  + WhatsApp + email teeno bhejta hai**, teeno independent (ek fail ho to
  baaki nahi rukte)
- `services/whatsapp.service.js`, `email.service.js` — adapter pattern,
  `sms.service.js` jaisa hi (dev mode me console pe print)
- `services/supportTicket.service.js` — user create/reply, admin reply/status
- `services/report.service.js` — admin + seller sales/auction summary
  (MongoDB aggregation)
- Wishlist, Related Equipment, Equipment Comparison — `listing.service.js`
  me add hue

**Notification hooks lagaye in flows me:** KYC verify/reject, listing
approve/reject, auction outbid (naya leader bante hi purane leader ko),
auction won/lost (close hone pe), withdrawal approve/reject, order status
change. Sab **transaction commit hone ke BAAD** call hote hain (taaki
retry pe duplicate notification na jaaye) aur fire-and-forget hain
(notification fail ho to main operation nahi rukta).

**Legal Agreement (e-sign) — DESIGN DECISION:** doc me "Legality API"
integrate karne ka rule hai, par vendor abhi tak client se confirm nahi
hua (KYC jaisa hi gap). Isliye abhi ye **simple acceptance record** hai —
checkout ke waqt buyer `acceptTerms: true` bhejta hai, `Order.termsAcceptedAt`
me timestamp store hota hai. Poori chain se connect kiya: payment
initiate → PaymentOrder me store → order creation tak pass hota hai.
Real e-sign vendor mile to ye field replace nahi hoga, uske bagal me
naya document-signing flow add hoga.

**Security hardening:**
- `express-mongo-sanitize` — NoSQL injection se bachaata hai
- `hpp` — HTTP parameter pollution se bachaata hai
- Naye rate limiters — bid placement (20/min), payment initiate (10/10min)

**BUG PAKड़A:** `npm install` ke waqt `multer@1.4.5-lts.2` ke liye
deprecation warning aayi — ismein known vulnerabilities hain, 2.x me fix
hain. **Maine upgrade NAHI kiya** — 1.x se 2.x me API breaking changes
hain aur bina proper testing environment (jo yahan MongoDB restriction
ki wajah se available nahi) ke risky hai. **Aapko production deploy se
pehle `multer` 2.x pe upgrade karna chahiye** aur file upload (KYC +
listing media) dobara test karna chahiye.

**Test kiya gaya:** `npm test` — **96 tests**, sab pass. Module-load
tests ne is phase me bhi wiring confirm ki.

**Test NAHI ho paaya:** WhatsApp/email real delivery (providers abhi
stub hain), real notification end-to-end flow database ke saath.

---

---

## Post-Backend Fix — Frontend Integration ke dauran mila bug

Jab admin panel ka frontend banaya (Phase 3), ek real bug pakड़ा:
`GET /admin/me` seedha `req.admin` ko JSON response bana deta hai —
`authenticateAdmin.js` middleware me `req.admin.hasPermission` ek
**function** thi, jo `JSON.stringify` me apne aap drop ho jaati hai, aur
`permissions` array field wahan tha hi nahi. Matlab: login response me
permissions milte the, par **page refresh hone pe** (`/admin/me` se
session verify hote waqt) permissions ghayab ho jaate — sub-admin ke
liye nav items chhup jaate, chahe unke paas asli permission ho.

**Fix:** `req.admin` me `permissions: admin.permissions` explicitly add
kiya, `hasPermission` function ke saath-saath. Backend ke 96 tests dobara
chalaye, sab pass. Ye ek achha example hai ki **frontend banate waqt bhi
backend ke real bugs milte hain** — sirf backend ke apne tests kaafi
nahi, end-to-end contract bhi zaroori hai.

---

## 🎉 Backend Core Complete (Phase 0-8)

Poora backend ban chuka hai — Auth, KYC, Listings, Admin Panel, Auction
Engine, Payments/Wallet/Orders, Notifications/Reports/Support — sab kuch.
**96 automated tests**, sab pass. Kaafi jagah pure functions se real bugs
pehle hi pakड़e gaye (auto-bid oscillation, Razorpay eager-init crash).

**Jo abhi bhi khula hai** (upar wale 6 sawal + ye 2):
7. **Multer 2.x upgrade** — security fix, deploy se pehle karna hai
8. **Load testing** — concurrent bidding, peak traffic — sirf real
   traffic ya proper load-testing tool se pata chalega, code review se nahi

---

## Client se ye 6 sawal poochne hain (models isi pe atke hain)

1. **Hour meter ki exact limit?** Doc me "10-15k" likha hai — ye range hai,
   number nahi. Abhi `enums.js` me 15000 rakha hai.

2. **EMD kis amount pe calculate hoga?** Starting bid, reserve price, ya
   final winning bid? Teeno alag calculation hain.

3. **KYC mandatory hai ya optional?** Doc ka title "Optional" kehta hai,
   description "mandatory" kehta hai.

4. **Reserve price aur minimum auction price ek hi cheez hai ya alag?**

5. **Auction extension kaun trigger karega** — seller manually, ya last
   minute me bid aane pe auto?

6. **Razorpay Route (split settlement) activate hai ya nahi?** Isके
   bina seller ka paisa seedha unke bank me nahi ja sakta — abhi
   Phase 7 me maine seller proceeds ko in-platform wallet me daala hai
   (Withdrawal flow se nikalna padega), jo ek working par temporary
   solution hai. Route confirm hote hi seedha split-settlement banega.

Sawal 2 aur 5 ke bina auction engine ka code likhna galat hoga. Ye pehle
clear karwaiye.
