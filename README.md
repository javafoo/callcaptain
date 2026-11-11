# Call Captain

**The AI after-hours dispatcher for plumbing and HVAC companies. Ava answers the 2 AM emergency, keeps the caller safe, secures the visit with a PayPal hold before the truck rolls, phones the on-call technician, and the customer approves the final bill on their own phone.**

- **Live app:** https://callcaptain.vercel.app (no sign-up; you get your own workspace)
- **Call the after-hours line from any phone:** (276) 331-0388
- **Demo video:** _coming soon_
- Built for the [PayPal AI Hackathon](https://paypalaihackathon.devpost.com). Runs on PayPal's **sandbox**: no real money moves.

---

## Try it in 3 minutes (judges)

Everything below runs on PayPal's sandbox. Logins:

| What | Value |
|---|---|
| PayPal sandbox buyer | `sb-45io452985664@personal.example.com` / `sa3LG/gi` |
| Test card (PayPal card form and phone keypad) | `4111 1111 1111 1111`, exp `12/29`, CVV `123`, ZIP `95131` |

**1. Call the line from your browser** (Chrome on a laptop, headphones help)
1. Open https://callcaptain.vercel.app and click **Try a call with Ava**. Allow the microphone.
2. Say *"My water heater just burst."* Give any name and a San Jose address with ZIP **95125**.
3. Ava tells you how soon Marcus can be there, then explains the $149 after-hours hold. Say yes.
4. Approve the hold in the PayPal box that appears (PayPal sandbox buyer, Venmo, or **Debit or Credit Card** with the test card). Ava confirms on her own and dispatches Marcus.

**2. No microphone?** Open **Jobs** and click **Load a sample night**: seven fictional calls from last night, each run through real PayPal sandbox holds, captures, a trip fee, a balance due and a refund. Explore the Jobs grid, the **Payments** ledger and the AI's overnight briefing.

**3. Finish a job and get paid**
1. In **Jobs**, open a dispatched job (yours from step 1, or Sam Patel from the sample night).
2. Enter the final bill, e.g. **1840**, and click **Get customer approval**.
3. Open the customer's link (or scan the QR code with your phone). It shows the bill, applies the $149 hold, and offers the $1,691 balance with PayPal, Venmo, card or **Pay Later**. Pay with the sandbox buyer. The job flips to *Paid in full* and the receipt is itemized.
4. Try **Refund**, or on another job, **Customer cancelled** (after dispatch only the $79 trip fee is kept).

**4. Optional: the real phone line, dispatch by phone, alerts**
- **Real phone line:** call **(276) 331-0388** from any phone. To see the call in your own Jobs, first add your number under **Go live → Test from your phone**. On a phone call Ava hands you to a secure keypad for the card (`4111111111111111#`, `1229#`, `123#`, `95131#`); the AI never hears it.
- **Ava phones the technician:** put your own cell in **Agent setup → Technician's cell**, then make a call. After the hold, your phone rings: Ava briefs "Marcus" on the job; say *"Yes, I'm 20 minutes out"* and the caller hears *"Marcus just confirmed"* live.
- **Alerts on your phone:** **Go live** → scan the QR code → add Call Captain to your Home Screen → turn on alerts → **Send a test alert**.
- **Set up from a website:** **Agent setup → Read my website**, try our demo contractor site (`/site`). Map a service area in plain words ("Northern Virginia and DC").

Each visitor gets a private workspace (business settings, jobs, payments). Calls use real phone minutes, so there are gentle rate limits.

---

## The problem

It's 2:07 AM and a water heater just burst. The homeowner calls a plumber, gets voicemail, and calls the next company.

- Shops with **10 or fewer technicians book 30% of their calls**; shops with more than 50 book 58% ([ServiceTitan, Call Trends in the Trades](https://www.servicetitan.com/guides/call-trends-in-the-trades)).
- **About 1 in 8 calls** to trades businesses arrives outside business hours (same source), and only **52%** of inbound home-services calls reach a person ([Invoca, 2026](https://invoca.com/reports/the-invoca-home-services-lead-conversion-benchmarks-report-2026)).
- **82%** of consumers say they'd call a competitor after an unanswered call ([CallRail, 2025](https://www.callrail.com/blog/missed-calls-cost-businesses-more-than-ever)).
- **77%** prefer not to read card details to a phone agent ([Eckoh, 2025](https://www.eckoh.com/hubfs/Downloads/Guides/eckoh-payment-security-report-oct25-v2.pdf)).
- There are **107,004** US plumbing and HVAC companies with employees; **78.3%** have fewer than 10 ([US Census SUSB 2022](https://www.census.gov/data/tables/2022/econ/susb/2022-susb-annual.html)).

When someone does answer, the owner faces a bad choice: roll a truck at 2 AM to someone who might cancel, not be home or not pay, or lose the job. AI receptionists book appointments; nobody secures the visit before the truck rolls.

## What Call Captain does

**On the call (homeowner)**
1. **Safety first.** Ava walks the caller to the water shutoff and keeps them away from water near outlets. A gas smell means leave the house and call 911, and no dispatch.
2. **Triage and service area.** Name, address and ZIP, the problem, a callback number. The ZIP is checked against the owner's service area (counties) in code.
3. **An arrival time first.** "Marcus can be there in 20 to 30 minutes. Does that work?", estimated from the technician's starting ZIP to the caller's.
4. **Secured with PayPal while they're still on the line.** A PayPal **hold** for the after-hours service call appears on the caller's screen (PayPal, Venmo or a card). $0 moves. Or the owner chooses **card on file** (PayPal Vault, $0 tonight). On a real phone call the caller types the card on the keypad and PayPal holds it. **The AI never hears or sees a card number.**
5. **Live confirmation.** The moment PayPal approves, the server injects a notice into the live conversation and Ava says "You're all set" on her own.
6. **Dispatch by phone.** Ava phones the on-call technician with a short brief; he accepts by voice and the caller hears "Marcus just confirmed" live. If he can't make it, the visit goes back to secured (no trip fee) and the owner is alerted.

**On site (technician and customer)**
- The tech's phone shows the job: address with directions, the AI's ticket, tap-to-call.
- He enters the final bill; **the customer approves it on their own screen** (QR code or the tech's phone). PayPal captures it from the hold and releases the rest, or applies the hold and takes the balance with PayPal, Venmo or Pay Later, or charges the card on file. The approval (amount, time, device) is recorded.
- Fair cancellations: before dispatch the hold is released; after the truck rolls only the trip fee is kept.

**For the owner**
- **Jobs** (AG Grid): live tabs (needs action, on a call, follow up, paid), flashing status and money cells during calls, totals, CSV export, an **AI overnight briefing** with who to call back.
- **Payments** (AG Grid): every PayPal movement (holds, captures, releases, cards saved or charged, balances, refunds) with PayPal ids, filters and a bookkeeper export. One-click refunds.
- **Alerts on your phone:** installable app with push notifications (new emergency, hold placed, tech accepted, paid, needs a callback). No texting registration needed.
- **Setup in minutes:** paste your website and the AI fills in services, service area, fees, policies and FAQs; describe your area in plain words and it's mapped to counties; pick a voice and languages (English, Spanish, French, Portuguese, German, Hindi; Ava switches mid-call).
- **Go live:** forward your after-hours line to the agent's number, and add a "Talk to us now" button to your website with one line of code.

## How PayPal is used

| Moment | PayPal | Code |
|---|---|---|
| Hold for the service call (browser) | Orders v2 `intent: AUTHORIZE` → JS SDK **v6** buttons (PayPal, Venmo, guest card) → `/v2/checkout/orders/{id}/authorize` | `createHoldOrder`, `authorizeOrder` in `src/lib/paypal.ts`; `src/components/paypal-hold.tsx` |
| Hold by phone keypad | Orders v2 AUTHORIZE with `payment_source.card`, fed by SignalWire's secure `pay` collector | `src/app/api/pay/connector/route.ts`, `authorizeCard` |
| Card on file, $0 | Vault v3 setup token → JS SDK v6 `PayPalSavePaymentButton` or **Card Fields** → payment token | `createSetupToken`, `createPaymentToken`; `src/components/card-on-file.tsx` |
| Final bill within the hold | `/v2/payments/authorizations/{id}/capture` (partial capture releases the rest) | `approveFinalBill`, `chargeFromHold` in `src/lib/money.ts` |
| Bill above the hold | Capture the hold + Orders v2 `intent: CAPTURE` for the balance with **Pay Later** | `createBalanceOrder`, `confirmBalancePaid`; `/pay/[id]` |
| Charge the card on file after approval | Orders v2 CAPTURE with `payment_source.card.vault_id` and `stored_credential` (merchant-initiated) | `chargeSaved` |
| Cancellations | `void` before dispatch; partial capture of the trip fee after | `releaseHold`, `cancelVisit` |
| Refunds | `/v2/payments/captures/{id}/refund` (full or partial, across captures) | `refundJob`, `refundCapture` |
| Reconciliation | Webhooks verified with `/v1/notifications/verify-webhook-signature`: order approved (recovers a hold or balance when the browser closed), authorization voided, capture completed, refunded, reversed, denied, vault token created or deleted | `src/app/api/paypal/webhook/route.ts`, `src/lib/paypal-webhooks.ts` |

Every PayPal write sends a `PayPal-Request-Id`, and every money movement lands once in a ledger keyed by PayPal id (`src/lib/ledger.ts`), so retries, webhooks and the browser can all report the same event safely.

## How AI is used

- **The voice agent** (SignalWire AI, `gpt-4.1-mini`, Cartesia voices, multilingual) runs the call from the SWML in `src/lib/agent.ts`. Its tools (`src/app/api/swaig/route.ts`) are the only way it can touch money or dispatch: `save_job_details`, `start_paypal_hold`, `save_card_on_file`, `take_card_on_keypad`, `check_hold`, `dispatch_technician`, `check_technician`, `book_morning_slot`, `cancel_visit`.
- **Agentic commerce with guardrails.** Business rules live in code, not in the prompt: the server refuses to dispatch until PayPal confirms, refuses holds outside the service area, never accepts spoken card numbers, and a human (the customer) approves the final charge on their own screen.
- **A second agent phones the technician** (`src/lib/tech-call.ts`): it briefs him and records `accept_job` / `decline_job`, then notifies the caller's live session.
- **After each call** the AI writes a structured ticket for the technician (summary, urgency, safety steps, likely work, mood).
- **Setup and briefing** (AI SDK + Vercel AI Gateway, `src/lib/ai.ts`, `src/lib/briefing.ts`): website → settings and call knowledge; plain-words service area → Census counties; the overnight briefing, whose numbers are computed in code so the AI can't invent an amount.

## Architecture

```
Caller (browser, website widget, or phone) ─▶ SignalWire AI agent (SWML from /api/swml)
   │                                            │  tools ─▶ /api/swaig ─▶ PayPal Orders v2 (AUTHORIZE) · Vault v3
   │  PayPal JS SDK v6 on the caller's screen   │  keypad ─▶ /api/pay/connector ─▶ PayPal (card hold)
   └─ approve ─▶ /api/jobs/:id/hold ─▶ PayPal ─▶ calling.ai_message ─▶ Ava says "you're all set"
Dispatch ─▶ SignalWire outbound call ─▶ tech agent (/api/swml/tech, /api/swaig/tech) ─▶ caller hears "Marcus confirmed"
On site ─▶ /jobs/:id (tech) ─▶ /pay/:id (customer approves) ─▶ PayPal capture · balance (Pay Later) · vaulted charge
PayPal webhooks ─▶ /api/paypal/webhook (verified) ─▶ reconcile job + ledger
Owner ─▶ Jobs + Payments (AG Grid) · alerts (Web Push) · Agent setup (AI) · Go live
Postgres (Neon): jobs, payments ledger, businesses (one per workspace), push subscriptions, PayPal event log
```

**Workspaces and privacy.** Every browser gets its own workspace through a signed cookie (`src/proxy.ts`, `src/lib/workspace-id.ts`). The public workspace id in a website's embed snippet can only start calls; opening a dashboard needs the private token. Owner actions check ownership; strangers polling a job never see the technician's phone, the payer's email or approval details.

## Run it yourself

Requirements: Node 22+, a PayPal sandbox app, Postgres (e.g. Neon), a SignalWire project with a phone number, and a Vercel AI Gateway key for the setup AI.

```bash
git clone https://github.com/javafoo/callcaptain && cd callcaptain
npm install
cp .env.example .env.local      # fill in PayPal, DATABASE_URL, SignalWire, WEBHOOK_SECRET, VAPID keys
npm run dev
```

SignalWire and PayPal have to reach your webhooks, so deploy (or tunnel) to a public HTTPS URL, then:

```bash
# The agent's entry point, and optionally route a phone number's voice calls to it
node --env-file=.env.local scripts/provision-signalwire.mjs https://your-public-url --phone +1XXXXXXXXXX
# copy SIGNALWIRE_RESOURCE_ID, SIGNALWIRE_WEB_ADDRESS_ID, SIGNALWIRE_WEB_ADDRESS into your env

# PayPal webhooks (the app finds the webhook id for its own URL)
node --env-file=.env.local scripts/register-paypal-webhook.mjs https://your-public-url
```

Tables create themselves on first request.

## Built during the hackathon

Call Captain is a new project, started on November 10, 2026, during the submission period.

## License

[MIT](LICENSE)
