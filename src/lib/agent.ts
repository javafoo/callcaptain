import { BUSINESS } from "./business";
import { dollars, type Job } from "./db";

/**
 * The SWML document SignalWire runs for every call: one `ai` verb with the dispatcher's
 * prompt and the SWAIG functions that move money. Shapes follow
 * https://signalwire.com/docs/swml/reference/calling/ai (prompt.pom, params, languages,
 * SWAIG.defaults/functions, post_prompt).
 */

const fee = dollars(BUSINESS.serviceCallCents);
const tripFee = dollars(BUSINESS.tripFeeCents);

function hook(origin: string, path: string, secret: string, jobId: string) {
  return `${origin}${path}?key=${encodeURIComponent(secret)}&job=${jobId}`;
}

export function buildSwml(job: Job, origin: string, secret: string) {
  const web = job.channel === "web";
  const swaigUrl = hook(origin, "/api/swaig", secret, job.id);

  const paymentStep = web
    ? [
        `When the caller agrees to the hold, call start_paypal_hold. A secure PayPal button then appears on their screen, right under the call button.`,
        `Tell them they can approve it with PayPal, Venmo or a card, and that it is a hold, not a charge.`,
        `If they would rather not use the button, offer to take a card on their keypad instead and call take_card_on_keypad.`,
      ]
    : [`When the caller agrees to the hold, call take_card_on_keypad so they can type their card on the phone keypad.`];

  return {
    version: "1.0.0",
    sections: {
      main: [
        { answer: {} },
        {
          ai: {
            params: {
              ai_model: "gpt-4.1-mini",
              local_tz: BUSINESS.timezone,
              static_greeting: `Thanks for calling ${BUSINESS.shortName}'s after-hours line. I'm ${BUSINESS.agentName}, the AI dispatcher. What's going on?`,
              static_greeting_no_barge: true,
              end_of_speech_timeout: 700,
              attention_timeout: 15000,
              swaig_allow_swml: true,
              enable_barge: true,
              debug_webhook_url: hook(origin, "/api/transcript", secret, job.id),
              debug_webhook_level: 2,
            },
            languages: [
              {
                name: "English",
                code: "en-US",
                voice: BUSINESS.voice,
                function_fillers: ["One moment.", "Okay, give me a second."],
              },
            ],
            global_data: { job_id: job.id, channel: job.channel },
            prompt: {
              temperature: 0.4,
              pom: [
                {
                  title: "Who you are",
                  body: `You are ${BUSINESS.agentName}, the after-hours AI dispatcher for ${BUSINESS.name}, a home plumbing and heating company. People call you at night with water leaks, burst pipes, failed water heaters, no heat and backed-up drains. You are calm, warm and quick. You keep people safe first, then get a technician on the way.`,
                },
                {
                  title: "How you talk",
                  bullets: [
                    "Short sentences, under 20 words. One question at a time.",
                    "Plain, kind language. The caller is stressed.",
                    "Never use dashes or lists when speaking. Speak like a person.",
                    "Say money as words a person would say, like one hundred forty-nine dollars.",
                  ],
                },
                {
                  title: "Call flow",
                  numbered: true,
                  bullets: [
                    "Safety first. If water is still running, walk them to the shutoff: the valve on the cold pipe above the water heater, or the main shutoff where the water line enters the house. If water is near outlets or the electrical panel, tell them to stay out of the water. If they smell gas, tell them to leave the house now and call 911 and the gas company, and do not dispatch.",
                    "Get their first name, the service address, what happened, and a callback number. Then call save_job_details.",
                    `Explain the after-hours service call: it is ${fee}, and it goes toward the repair. To send someone tonight you place a hold for it now. Nothing is charged until the work is done, and if they cancel before the technician heads out the hold is simply released.`,
                    ...paymentStep,
                    "While you wait, stay with them and give one practical tip, like moving valuables off the floor or putting a bucket under the drip.",
                    "When you are told the hold is approved, thank them and call dispatch_technician right away. Tell them the technician's name and arrival window.",
                    `If they decline the hold, do not push. Offer the first morning slot with book_morning_slot. Nobody is turned away.`,
                    "Before ending, ask if there is anything else, then say goodbye warmly.",
                  ],
                },
                {
                  title: "Money rules",
                  bullets: [
                    "Never ask for, repeat or accept card numbers spoken out loud. If the caller starts reading a card number, stop them politely and use take_card_on_keypad, which keeps the card away from you.",
                    "Never quote repair prices. The technician quotes on site before any work starts.",
                    `If the caller cancels after the technician is on the way, a ${tripFee} trip fee applies and the rest of the hold is released. Use cancel_visit if they want to cancel.`,
                    "Only say a hold is placed after a function result or a system notice confirms it.",
                    "If a big repair comes up, mention that the final bill can be paid with PayPal, including Pay Later, so they can split it up.",
                  ],
                },
              ],
            },
            post_prompt: {
              temperature: 0.2,
              text: 'Summarize the call as JSON with keys: "summary" (two sentences for the technician), "problem" (short label), "urgency" ("emergency" | "urgent" | "routine"), "safety_steps_taken" (string), "likely_work" (short guess for the technician, not a price), "customer_mood" ("calm" | "stressed" | "upset").',
            },
            post_prompt_url: hook(origin, "/api/post-prompt", secret, job.id),
            SWAIG: {
              defaults: { web_hook_url: swaigUrl },
              functions: [
                {
                  function: "save_job_details",
                  description: "Save who is calling, where, and what is wrong. Call once you have the name, address and problem.",
                  parameters: {
                    type: "object",
                    properties: {
                      customer_name: { type: "string", description: "Caller's first name" },
                      service_address: { type: "string", description: "Street address where the technician should go" },
                      issue: { type: "string", description: "What happened, in the caller's words, one sentence" },
                      urgency: { type: "string", enum: ["emergency", "urgent", "routine"], description: "emergency = active water or no heat in freezing weather" },
                      callback_phone: { type: "string", description: "Callback number, digits only, if given" },
                    },
                    required: ["customer_name", "service_address", "issue", "urgency"],
                  },
                },
                ...(web
                  ? [
                      {
                        function: "start_paypal_hold",
                        description: `Show the secure PayPal button on the caller's screen for the ${fee} service-call hold. Call after they agree to the hold.`,
                        parameters: { type: "object", properties: {} },
                      },
                    ]
                  : []),
                {
                  function: "take_card_on_keypad",
                  description: `Let the caller type a card on their phone keypad for the ${fee} hold. The card goes to PayPal and you never hear it.`,
                  parameters: { type: "object", properties: {} },
                },
                {
                  function: "check_hold",
                  description: "Check whether the service-call hold has been approved yet. Use if the caller says they finished approving.",
                  parameters: { type: "object", properties: {} },
                },
                {
                  function: "dispatch_technician",
                  description: "Send the on-call technician. Only works once the hold is approved.",
                  parameters: { type: "object", properties: {} },
                },
                {
                  function: "book_morning_slot",
                  description: "Book the first morning visit instead, with no hold, when the caller declines the hold.",
                  parameters: { type: "object", properties: {} },
                },
                {
                  function: "cancel_visit",
                  description: "Cancel tonight's visit when the caller asks to. Applies the cancellation policy to the hold.",
                  parameters: { type: "object", properties: {} },
                },
              ],
            },
          },
        },
      ],
    },
  };
}

/** SWML `pay` action: SignalWire collects the card by keypad and POSTs it to our connector. */
export function keypadPayAction(job: Job, origin: string, secret: string) {
  return {
    SWML: {
      version: "1.0.0",
      sections: {
        main: [
          {
            set: {
              ai_response: `The keypad card result was \${pay_result}. If it is success, the ${fee} hold is placed on their card: confirm it in one sentence and call dispatch_technician. If not, apologize, and offer ${job.channel === "web" ? "the PayPal button on their screen or " : ""}the first morning slot.`,
            },
          },
          {
            pay: {
              payment_connector_url: hook(origin, "/api/pay/connector", secret, job.id),
              charge_amount: (BUSINESS.serviceCallCents / 100).toFixed(2),
              currency: "usd",
              description: `${BUSINESS.shortName} service call hold`,
              input: "dtmf",
              payment_method: "credit-card",
              token_type: "one-time",
              security_code: true,
              postal_code: true,
              max_attempts: 2,
              timeout: 6,
              valid_card_types: "visa mastercard amex discover",
              voice: BUSINESS.voice,
              prompts: [
                { for: "payment-card-number", actions: [{ type: "Say", phrase: "Please type your card number on your keypad, then press pound." }] },
                { for: "expiration-date", actions: [{ type: "Say", phrase: "Now the expiration date. Two digits for the month, two for the year." }] },
                { for: "security-code", actions: [{ type: "Say", phrase: "And the security code on the back." }] },
                { for: "postal-code", actions: [{ type: "Say", phrase: "Last one. Your billing zip code, then pound." }] },
                { for: "payment-processing", actions: [{ type: "Say", phrase: "Thanks. Placing the hold with PayPal now." }] },
              ],
            },
          },
        ],
      },
    },
  };
}
