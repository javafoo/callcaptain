# Call Captain

**An AI voice dispatcher for after-hours home repair calls that secures the service call with a PayPal hold, charged only after the job is done.**

- **Live demo:** https://callcaptain.vercel.app (call the agent from your browser, no phone or account needed)
- **Demo video:** _coming soon_
- Built for the [PayPal AI Hackathon](https://paypalaihackathon.devpost.com) · PayPal **sandbox only**, no real money moves.

---

## The problem

At 2 AM a water heater bursts. The homeowner calls a plumber and gets voicemail or an answering service that takes a message. The plumbing company has two bad options: wake a technician and send a truck to someone who may not be there or may not pay, or lose the job to whoever answers first.

Today's fixes don't fit how this trade works:

- **Homeowners pay after the job.** Asking for full payment up front at 2 AM feels like a scam.
- **People won't read a card number to a stranger**, least of all to an AI at night.
- **Contractors need to know the visit is covered** before a truck rolls.

## What Call Captain does

Ava, the AI dispatcher, answers the call and handles every money moment through PayPal:

1. **Safety first, then triage.** She walks the caller to the water shutoff, checks for gas or electrical danger, and takes name, address and problem.
2. **A hold, not a charge.** She explains the $149 after-hours service call and puts a **PayPal button on the caller's screen** mid-call. The caller approves with PayPal, Venmo or a card. It's a PayPal **authorization**: $0 moves.
3. **Or the keypad, never the AI.** A caller who'd rather not tap a link types a card on the keypad. SignalWire collects the digits outside the AI, and PayPal holds the card. The model never sees a card number.
4. **Live confirmation.** The moment PayPal approves, the server injects a notice into the live conversation and Ava says "You're all set, Marcus is on his way" without the caller asking.
5. **Charge after the job.** In the owner dashboard the owner enters the final bill. PayPal **captures** it from the hold and releases the rest. A bill larger than the hold captures the hold and sends the balance as a PayPal link where **Pay Later** can split it up.
6. **Fair cancellations.** Cancel before dispatch and the hold is **voided**. Cancel after the truck rolled and only the $79 trip fee is **partially captured**, with the rest released.
7. **A ticket for the tech.** When the call ends, the AI writes a structured ticket: summary, problem, urgency, safety steps taken, likely work.

Callers who decline the hold are never turned away: Ava books the first morning slot instead.

## How PayPal is used

| Moment | PayPal API | Code |
|---|---|---|
| Hold for the service call (browser) | Orders v2 `intent: AUTHORIZE` → JS SDK **v6** buttons (PayPal, Venmo, guest card) → `POST /v2/checkout/orders/{id}/authorize` | `src/lib/paypal.ts` `createHoldOrder`, `authorizeOrder`; `src/components/paypal-hold.tsx` |
| Hold by phone keypad | Orders v2 `intent: AUTHORIZE` with `payment_source.card`, fed by SignalWire's `pay` connector | `src/app/api/pay/connector/route.ts`, `authorizeCard` |
| Charge the final bill | `POST /v2/payments/authorizations/{id}/capture` with `final_capture` | `completeJob` in `src/lib/money.ts` |
| Cancel before dispatch / owner release | `POST /v2/payments/authorizations/{id}/void` | `releaseHold` |
| Cancel after dispatch | Partial capture of the trip fee, `final_capture: true` releases the rest | `cancelVisit` |
| Balance above the hold | Orders v2 `intent: CAPTURE`, JS SDK v6 with **Pay Later** eligibility | `createBalanceOrder`, `/pay/[id]` |

Every PayPal write sends a `PayPal-Request-Id`, so a retried webhook can't double-charge.

## How AI is used

- **SignalWire AI Agent** (`gpt-4.1-mini` on SignalWire's voice runtime) runs the conversation from the SWML in `src/lib/agent.ts`: a structured prompt, safety rules, and money rules ("never accept spoken card numbers", "only say a hold is placed after a function confirms it").
- **Tools (SWAIG functions)** in `src/app/api/swaig/route.ts` are how the AI moves money: `save_job_details`, `start_paypal_hold`, `take_card_on_keypad`, `check_hold`, `dispatch_technician`, `book_morning_slot`, `cancel_visit`. Business rules live in code, not in the prompt, so the model can't dispatch a truck before the hold exists.
- **Live notices:** when the PayPal popup is approved, `calling.ai_message` tells the agent mid-call (`src/lib/signalwire.ts`).
- **Post-call ticket:** the AI's `post_prompt` returns JSON for the technician, shown in the dashboard.
- **Live transcript** streams to the call page from the AI debug webhook.

## Try it (judges)

1. Open **https://callcaptain.vercel.app** in Chrome on a laptop and click the green call button. Allow the microphone.
2. Play the homeowner: "My water heater just burst and there's water everywhere."
3. Give any first name and address. When Ava explains the $149 hold, say yes.
4. A PayPal box appears on the right. Either:
   - click **PayPal** and log in with the sandbox buyer below, or
   - click **Debit or Credit Card** and use test card `4111 1111 1111 1111`, expiry `12/29`, CVV `123`.
5. Ava confirms on her own and dispatches Marcus. Hang up.
6. Click **Finish the job as the owner** (or open `/dashboard`), pick your job, and try one of:
   - **Charge** `120` → $120 captured, $29 released,
   - **Charge** `1840` → $149 captured, then open the customer's payment page to pay the $1,691 balance (Pay Later is offered on eligible amounts),
   - **Customer cancelled** → $79 trip fee kept, the rest released.

**Keypad path:** during the call say "Can I just type my card on the keypad?" A keypad appears under the call button. Type `4111111111111111#`, then `1229`, `123`, `95131#`.

### Sandbox logins

| What | Value |
|---|---|
| PayPal sandbox buyer email | `sb-45io452985664@personal.example.com` |
| PayPal sandbox buyer password | `sa3LG/gi` |
| Test card (guest checkout and keypad) | `4111 1111 1111 1111`, `12/29`, CVV `123`, ZIP `95131` |

## Architecture

```
Browser (Next.js page) ──WebRTC──▶ SignalWire AI agent (SWML from /api/swml)
   │  polls /api/jobs/:id               │  SWAIG tools ──▶ /api/swaig ──▶ PayPal Orders v2 (AUTHORIZE)
   │  PayPal JS SDK v6 buttons          │  pay (keypad) ──▶ /api/pay/connector ──▶ PayPal Orders v2 (card)
   └─ onApprove ──▶ /api/jobs/:id/hold ──▶ PayPal authorize ──▶ calling.ai_message ──▶ agent speaks
Owner dashboard (AG Grid) ──▶ /api/jobs/:id/owner ──▶ PayPal capture / void / balance order
Postgres (Neon): one `jobs` table with a timeline of every event
```

## Run it yourself

Requirements: Node 22+, a PayPal sandbox app, a Postgres database, and a SignalWire project for voice.

```bash
git clone https://github.com/javafoo/callcaptain && cd callcaptain
npm install
cp .env.example .env.local      # fill in PayPal, DATABASE_URL, SignalWire, WEBHOOK_SECRET
npm run dev
```

SignalWire has to reach your webhooks, so deploy (or tunnel) to a public HTTPS URL, then create the agent's entry point once:

```bash
node --env-file=.env.local scripts/provision-signalwire.mjs https://your-public-url
# copy SIGNALWIRE_RESOURCE_ID, SIGNALWIRE_WEB_ADDRESS_ID, SIGNALWIRE_WEB_ADDRESS into your env
```

The `jobs` table creates itself on first request.

## Built during the hackathon

Call Captain is a new project, started on November 10, 2026, during the submission period.

## License

[MIT](LICENSE)
