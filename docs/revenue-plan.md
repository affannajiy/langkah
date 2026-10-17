# Revenue plan and Phases 10 to 13

Decided on 2026-10-17 and revised the same day (one coin, mock top-up, demo account, parody ads). The rules the code follows are in Section 15 of `Langkah Tech Stack.md`. Phase 10 is built; Phases 11 to 13 are planned.

## Why not a monthly fee

Google Maps is free, so a fee to use Langkah gives nobody a reason to switch. Charging for safety information also looks bad. Civic reporting apps such as FixMyStreet and SeeClickFix are free for residents, and the **councils** pay for the dashboard. Langkah follows the same idea:

- Walking, reporting, hazard votes and upvotes stay free.
- The money comes from:
  - the council dashboard
  - Ipoh shops (vouchers and sponsored pins)
  - rewarded ads
  - points top-ups (mock in the MVP), spent on cosmetics and Langkah Plus

## One coin: Langkah Points

Like Grab points. You earn them in the app, or top them up with money (mock).

| | |
|---|---|
| Scale | 100 points = about RM1 |
| Earn | walks, reports, votes, ratings, check-ins, ads (table below) |
| Top up | mock online banking or e-wallet, Google or demo account only |
| Spend | shop vouchers, cosmetics, Langkah Plus |
| Cash out | never |
| Transfers between users | never |
| Expiry | none in the MVP |

**Points never touch safety data or the council ranking.** Reports, hazard votes and upvotes are free and cost nothing. An upvote earns nothing either, so nobody can buy or farm their way up the council list. That ranking is what the council pays for.

**Bank Negara.** Points are closed-loop: spent only inside Langkah, no transfers, no cash-out. If bought points can later pay for other shops' vouchers, that may count as e-money. Check the BNM e-money policy document before any real sale. Real top-ups on Android must go through Google Play Billing, which takes a 15% fee. The plan caps top-ups at RM500 a month for that check.

## Points table

### Earn

| Action | Points | Cap |
|---|---|---|
| New account welcome | +1000 | once |
| Walk finished in the app, GPS-checked | +10 per km | 50 a day |
| Hazard report that another user confirms (Still there) | +20 | none |
| Improvement report with a photo | +10 | 5 a day |
| Hazard vote, Still there or Gone | +2 | 20 a day |
| Rate a walk | +5 | 1 per walk |
| Daily check-in | +5, +50 on day 7 | daily |
| Watch a 30 s ad (mock) | +20 | 5 a day |
| Top up (mock) | see packs | Google or demo account only |

### Spend

| Item | Cost | Note |
|---|---|---|
| Report a hazard or improvement | free | Safety is never paid |
| Hazard vote | free | Earns points instead |
| Upvote an improvement | free | 1 per user per item, earns nothing |
| Shop voucher, e.g. RM2 off a kopi (mock) | 300 points | The shop pays for the real voucher |
| Cosmetic: avatar frame or badge | 200 to 800 points | Roblox and Discord style |
| Langkah Plus for 1 month | 690 points | Close to foodpanda pandapro (RM6.90) |

### Why the ad pays only +20

In Malaysia, one rewarded ad view earns roughly RM0.01 to RM0.02. A payout of 500 points (about RM5 in vouchers) would lose money on every view. With +20 and 5 a day, ads give at most 100 points a day.

## Top-up flow (mock)

Every top-up screen shows a strip: **"DEMO · no real money"**. Nothing is typed, saved or sent to a bank. No card option.

1. **Me → Wallet → Top up.** A guest gets the sign-in sheet first, reason "Sign in to keep your points safe".
2. **Amount sheet:**

   | Pack | Points |
   |---|---|
   | RM5 | 500 |
   | RM10 | 1,100 |
   | RM20 | 2,300 |
   | RM50 | 6,000 |
   | Custom, RM1 to RM100 | 100 per RM, no bonus |

3. **Method sheet:** Online banking or E-wallet.
4. **Bank or wallet list** (parody names, our own simple logos, colours close to but not the same as the real ones):

   | Online banking | Points to | E-wallet | Points to |
   |---|---|---|---|
   | TigerBank | Maybank | GnG eWallet | Touch 'n Go |
   | BICC Bank | CIMB | Bump | Boost |
   | PeopleBank | Public Bank | GrabbyPay | GrabPay |
   | RBH Bank | RHB | ShopiPay | ShopeePay |
   | Long Hong Bank | Hong Leong | | |
   | BankRakyatku | Bank Rakyat | | |
   | Afnan Bank | Affin Bank | | |

5. **Mock bank login**, styled per bank: user ID `demo.langkah` and a hidden password, both filled in and locked. One **Log in** button. E-wallets show a 6-dot PIN pad that fills itself.
6. **TAC screen:** a fake notification banner drops in with "TAC 428 193". It fills in by itself; the user taps **Approve**.
7. **Processing** for 2 s.
8. **Receipt:** "+1,100 points · Top up via TigerBank · RM10.00 · Ref LGK-0042 · date". **Done** goes back to the wallet with the new ledger line.

Back at any step cancels with no points added. A failed step (the user goes offline) shows "Top up not completed, no money taken" and adds nothing.

## Mock ads

A 30 s full-screen ad with a countdown and a close button that unlocks at 0. +20 points when it ends. Offered only from the wallet, **never during a walk**, 5 a day. Parody brands with our own art, no real logos. Each brand uses a different ad format, so the demo shows the range Malaysian apps use:

| Brand | Points to | Format |
|---|---|---|
| GFC | KFC | Full-screen food photo, big price, "Order now" button |
| McG | McDonald's | Swipe carousel of 3 menu items |
| Tealove | Tealive | Vertical story style with progress bars and a new-flavour reveal |
| ZAS Kopi | ZUS Coffee | Tap to reveal a scratch-card style promo code |
| Secret Resipi | Secret Recipe | Split poster: cake photo on top, voucher coupon below |
| New Town Kopitiam | OldTown White Coffee | Mini quiz ("Kopi O or Kopi C?"), then the offer |

The ad picks the next brand in turn, so a demo of 5 ads shows 5 formats.

## Accounts and the demo

### Welcome screen (first launch)

Three choices:
- **Continue as guest:** the silent anonymous account, as now. Can earn points; cannot top up or write reports.
- **Sign in with Google:** links Google to the guest account, so points and history carry over.
- **Try the demo:** shown only while the server's demo switch is on.

The sign-in sheet (report, vote, top up) shows the same three choices.

### Demo account

No password ships in the app. "Try the demo" makes a guest account, and a server RPC fills it with a demo profile:
- name **Demo Walker**, user ID `LGK-DEMO-01`
- 1,500 points and a wallet history
- 3 past reports, a few ratings and votes

**Afrina (demo)** is a second account that the seed script makes on the server. She confirms the demo user's hazard ("+20 · Afrina confirmed your report") and votes on reports, so points can be shown arriving with one phone.

**Reset demo** (Me tab, demo account only, with a dialog because it cannot be undone) puts both accounts back to the start: points, ledger, reports, votes, ratings, Afrina's actions, recent searches, and the map back to Ipoh Railway Station. It keeps the language.

The "Try the demo" account replaces the old Settings demo toggle and the "New guest" button.

## Phases

Every phase follows the usual rules: RLS in the same migration, every string in English and Bahasa Melayu, nothing blocking the screen during a walk, no new dependency without asking, and the stop-and-test step at the end.

**Before Phase 10:** design mocks for every new screen and all 6 ads, checked against `docs/screens/`.

### Phase 10: Accounts, demo and points ledger
1. **Guide:** add the money section to `Langkah Tech Stack.md` (one coin, earn and spend tables, top-up rules, BNM note). Everything after this step cites it.
2. **Welcome screen** and the three-choice sign-in sheet.
3. **Migration:**
   - a `point_ledger` table (user, amount, reason, ref, created_at) and a `points_balance` per user
   - RLS on; users read only their own rows; the app cannot insert
   - points move only through `security definer` RPCs, so the app cannot give itself points
   - daily caps enforced in SQL
4. **Earn rules** hooked into arrival, rating, report, vote, hazard confirm, plus the daily check-in. The walk km comes from the walk's GPS track; jumps faster than running speed are ignored.
5. **Demo account:** the fill RPC, Afrina in the seed script, Reset demo. Remove the old demo toggle and "New guest".
6. **Me tab:** wallet card (points, last 10 ledger lines, Top up button that shows "coming soon" until Phase 11).

### Phase 11: Top up, ads, shop, Plus (mock)
1. **Top up:** amount, method, bank or wallet list, mock login or PIN, TAC, processing, receipt. A `topup_mock` RPC adds the points with a ledger line and checks the RM500 a month cap.
2. **Mock ads:** the 6 brands and formats above.
3. **Points shop:** vouchers from made-up Ipoh shops, with a redeem code screen.
4. **Cosmetics** (avatar frame, badges) and the **Plus** page. Plus perks: live walk share with family, 20 saved places instead of 3, a Plus badge and gold frame. No extra points, so Plus never becomes a faster way to buy points.
5. With too few points, a bottom sheet (not a dialog) shows how to earn or top up.

### Phase 12: Shops on the map
- **Migration:** a `partners` table (shop, location, voucher, active dates).
- **Sponsored pins:**
  - a separate pin shape with the word "Sponsored", at most 3 on screen (the Waze rule)
  - shown on the browse map only, never as a popup during navigation
- Shop vouchers in the Phase 11 shop come from `partners`.
- A partner report script in `data-scripts/` (views and redeems per shop), for the sales pitch.

### Phase 13: Council dashboard
- A read-only web page for MBI, the FixMyStreet Pro idea:
  - ranked improvement requests
  - a hazard heatmap
  - trends over time
  - CSV and GeoJSON export (already in the app)
- No names or user ids, the same as the app export.
- **Hosting:** a static page on GitHub Pages (RM0) that reads a Supabase view with no user ids.
- **Staff sign-in:** email magic link, with an `mbi_staff` role checked by RLS. You set up GitHub Pages and the Supabase email settings; the steps will be in that phase's notes.

## Not in code: grants and partners
- **Cradle CIP Spark:** a conditional grant of up to RM150,000 over 18 months for pre-commercial tech. Teams of at least 2 can apply as individuals before setting up a company. Apply through the MYStartup portal.
- **MBI:** the "Walkable Ipoh 2030" plan and the RM1.7M smart city grant (2025) make the council the first dashboard customer to pitch.
- **Later:** insurers and takaful companies paying for walk points (as with Sweatcoin), and anonymous walking heatmaps for planners (PDPA 2010 rules apply).

## Sources
- [FixMyStreet Pro on G-Cloud](https://www.applytosupply.digitalmarketplace.service.gov.uk/g-cloud/services/437525671679682), [pricing 2026](https://assets.applytosupply.digitalmarketplace.service.gov.uk/g-cloud-15/documents/586634/617647349179126-pricing-document-2026-01-27-1603.pdf)
- [Waze Local branded pins (TechCrunch)](https://techcrunch.com/2018/03/28/waze-local/)
- [Sweatcoin business model (ProductMint)](https://productmint.com/sweatcoin-business-model-how-does-sweatcoin-make-money/), [Sweatcoin blog](https://blog.sweatco.in/how-does-sweatcoin-make-money/)
- [Shopee Coins (Shopee MY blog)](https://shopee.com.my/blog/how-to-use-shopee-coins/)
- [TNG GOrewards (RinggitPlus)](https://ringgitplus.com/en/blog/e-wallet/tng-ewallet-introduces-new-gorewards-loyalty-programme-with-points-collection.html)
- [Grab merchant-funded offers](https://www.grab.com/sg/merchant/offerzonedeals/)
- [foodpanda pandapro (SAYS)](https://says.com/my/lifestyle/foodpanda-pandapro-monthly-subscription-programme-2021)
- [Discord revenue (Revenue Memo)](https://www.revenuememo.com/p/how-does-discord-make-money)
- [Robux prices in Malaysia (Lapakgaming)](https://www.lapakgaming.com/ms-my/roblox)
- [BNM e-money policy](https://www.bnm.gov.my/-/pd-emoney)
- [Cradle CIP Spark](https://cradle.com.my/cip-spark/)
- [MBI smart city grant (Ipoh Echo)](https://www.ipohecho.com.my/2025/08/14/mbi-receives-rm1-7-million-grant-for-5g-and-ai-smart-city-development/)
