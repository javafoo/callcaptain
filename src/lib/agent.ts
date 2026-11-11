import { TIMEZONE, languageLabels, shortName, type Business } from "./business";
import { voiceString } from "./voices";
import { dollars, type Job } from "./db";

/**
 * The SWML document SignalWire runs for every call: one `ai` verb with the dispatcher's
 * prompt and the SWAIG functions that move money. Built from the owner's Agent setup.
 * Shapes follow https://signalwire.com/docs/swml/reference/calling/ai (prompt.pom, params,
 * multilingual, SWAIG.defaults/functions, post_prompt).
 */

function hook(origin: string, path: string, secret: string, jobId: string) {
  return `${origin}${path}?key=${encodeURIComponent(secret)}&job=${jobId}`;
}

/** After the secure keypad hands the call back, a fresh AI session picks up where we were. */
export type Resume = { payResult: string | null };

export function buildSwml(job: Job, b: Business, origin: string, secret: string, resume?: Resume) {
  const web = job.channel === "web";
  const fee = dollars(job.fee_cents);
  const tripFee = dollars(b.tripFeeCents);
  const name = shortName(b);
  const multi = b.languages.length > 1;
  const voice = voiceString(b.voiceId);

  const paymentStep = web
    ? [
        `When the caller agrees to the hold, call start_paypal_hold. A secure PayPal button then appears on their screen.`,
        `Tell them they can approve it with PayPal, Venmo or a card, and that it is a hold, not a charge.`,
        `If they would rather not use the button, offer to take a card on their keypad instead and call take_card_on_keypad.`,
      ]
    : [`When the caller agrees to the hold, call take_card_on_keypad so they can type their card on the phone keypad.`];

  const held = job.status === "hold_placed" || job.status === "dispatched";
  const greeting = !resume
    ? `Thanks for calling ${name}'s after-hours line. I'm ${b.agentName}, the AI dispatcher. What's going on?`
    : held
      ? `Thanks${job.customer_name ? `, ${job.customer_name}` : ""}. Your ${fee} hold is placed with PayPal, and nothing is charged. One moment while I send the technician.`
      : `Sorry${job.customer_name ? `, ${job.customer_name}` : ""}, that card didn't go through.${web ? " You can approve the hold with the PayPal button instead," : ""} or I can book the first morning visit. Which would you like?`;

  const resumeContext = resume
    ? [
        {
          title: "Where this call is right now",
          body: `You already spoke with this caller and took their details. Name: ${job.customer_name ?? "unknown"}. Address: ${job.service_address ?? "unknown"} ${job.zip ?? ""}. Problem: ${job.issue ?? "unknown"}. They just used the secure keypad for the service-call hold. Keypad result: ${resume.payResult ?? "unknown"}. ${held ? "The hold IS placed. Call dispatch_technician right away, then tell them who is coming and when." : "The hold is NOT placed. Do not dispatch. Offer the PayPal button or the morning slot."} Do not ask for details you already have.`,
        },
      ]
    : [];

  return {
    version: "1.0.0",
    sections: {
      main: [
        ...(resume ? [] : [{ answer: {} }]),
        {
          ai: {
            params: {
              ai_model: "gpt-4.1-mini",
              local_tz: TIMEZONE,
              static_greeting: greeting,
              static_greeting_no_barge: true,
              end_of_speech_timeout: 700,
              attention_timeout: 15000,
              swaig_allow_swml: true,
              enable_barge: true,
              debug_webhook_url: hook(origin, "/api/transcript", secret, job.id),
              debug_webhook_level: 2,
            },
            // One multilingual Cartesia voice. With more than one language, SignalWire detects
            // the caller's language and the agent answers in it, switching live.
            ...(multi
              ? {
                  multilingual: {
                    start_language: "en",
                    allowed: b.languages,
                    min_switch_words: 2,
                    languages: [{ language: "default", voice }],
                  },
                }
              : {
                  languages: [{ name: "English", code: "en-US", voice, function_fillers: ["One moment.", "Okay, give me a second."] }],
                }),
            global_data: { job_id: job.id, channel: job.channel },
            prompt: {
              temperature: 0.4,
              pom: [
                ...resumeContext,
                {
                  title: "Who you are",
                  body: `You are ${b.agentName}, the after-hours AI dispatcher for ${b.businessName}. The company does ${b.services} for homes. ${b.serviceZips.length ? `It serves ZIP codes starting with ${b.serviceZips.join(", ")}. If asked, describe that area plainly; save_job_details makes the final check.` : "It serves any area."} People call you at night with emergencies. You are calm, warm and quick. You keep people safe first, then get a technician on the way.`,
                },
                {
                  title: "How you talk",
                  bullets: [
                    "Short sentences, under 20 words. One question at a time.",
                    "Plain, kind language. The caller is stressed.",
                    "Never use dashes or lists when speaking. Speak like a person.",
                    "Say money as words a person would say, like one hundred forty-nine dollars.",
                    ...(multi
                      ? [`You speak ${languageLabels(b.languages)}. Always answer in the language the caller is speaking, and switch when they switch.`]
                      : []),
                  ],
                },
                {
                  title: "Call flow",
                  numbered: true,
                  bullets: [
                    "Safety first. If water is still running, walk them to the shutoff: the valve on the cold pipe above the water heater, or the main shutoff where the water line enters the house. If water is near outlets or the electrical panel, tell them to stay out of the water. If they smell gas, tell them to leave the house now and call 911 and the gas company, and do not dispatch.",
                    "Get their first name, the street address with ZIP code, what happened, and a callback number. Then call save_job_details.",
                    "If save_job_details says the address is outside the service area, apologize, explain you can't send anyone there, and suggest a local plumber. Do not offer a hold.",
                    `Explain the after-hours service call: it is ${fee}, and it goes toward the repair. To send someone tonight you place a hold for it now. Nothing is charged until the work is done, and if they cancel before the technician heads out the hold is simply released.`,
                    ...paymentStep,
                    "While you wait, stay with them and give one practical tip, like moving valuables off the floor or putting a bucket under the drip.",
                    "When you are told the hold is approved, thank them and call dispatch_technician right away. Tell them the technician's name and arrival window.",
                    `If they decline the hold, do not push. Offer the first morning slot, ${b.morningSlot}, with book_morning_slot. Nobody is turned away.`,
                    "Before ending, ask if there is anything else, then say goodbye warmly.",
                  ],
                },
                {
                  title: "Money rules",
                  bullets: [
                    "Never ask for, repeat or accept card numbers spoken out loud. If the caller starts reading a card number, stop them politely and use take_card_on_keypad, which keeps the card away from you.",
                    "If you ever receive keypad digits as text, the secure keypad did not start. Never repeat or use those digits. Say the keypad had a hiccup and offer the PayPal button or the morning slot.",
                    "Never quote repair prices. The technician quotes on site before any work starts.",
                    `If the caller cancels after the technician is on the way, a ${tripFee} trip fee applies and the rest of the hold is released. Use cancel_visit if they want to cancel.`,
                    "Only say a hold is placed after a function result or a system notice confirms it.",
                    "If a big repair comes up, mention that the final bill can be paid with PayPal, including Pay Later, so they can split it up.",
                  ],
                },
                ...(b.instructions
                  ? [{ title: `Notes from the owner of ${b.businessName}`, body: b.instructions }]
                  : []),
              ],
            },
            post_prompt: {
              temperature: 0.2,
              text: 'Summarize the call as JSON with keys: "summary" (two sentences for the technician, in English), "problem" (short label), "urgency" ("emergency" | "urgent" | "routine"), "language" (the language the caller spoke), "safety_steps_taken" (string), "likely_work" (short guess for the technician, not a price), "customer_mood" ("calm" | "stressed" | "upset").',
            },
            post_prompt_url: hook(origin, "/api/post-prompt", secret, job.id),
            SWAIG: {
              defaults: { web_hook_url: hook(origin, "/api/swaig", secret, job.id) },
              functions: [
                {
                  function: "save_job_details",
                  description: "Save who is calling, where, and what is wrong. Call once you have the name, address with ZIP code, and problem. Also checks the service area.",
                  parameters: {
                    type: "object",
                    properties: {
                      customer_name: { type: "string", description: "Caller's first name" },
                      service_address: { type: "string", description: "Street address where the technician should go" },
                      zip_code: { type: "string", description: "Five-digit ZIP code of the service address" },
                      issue: { type: "string", description: "What happened, one sentence, in English" },
                      urgency: { type: "string", enum: ["emergency", "urgent", "routine"], description: "emergency = active water or no heat in freezing weather" },
                      callback_phone: { type: "string", description: "Callback number, digits only, if given" },
                    },
                    required: ["customer_name", "service_address", "zip_code", "issue", "urgency"],
                  },
                  fillers: { "en-US": ["Let me check that address."], default: ["One moment."] },
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
                  description: `Let the caller type a card on their keypad for the ${fee} hold. The card goes to PayPal and you never hear it.`,
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

/**
 * SWML `pay` hand-off. Run inline inside the AI session, SignalWire accepted the action but
 * never started `pay`, so the AI kept hearing the keypad. Instead we hand the call off
 * (`transfer: true` ends the AI session, so nothing is listening), collect the card with
 * `pay`, then `transfer` back to /api/swml?resume=1, which starts a fresh AI session that
 * knows the job and the result.
 */
export function keypadPayAction(job: Job, b: Business, origin: string, secret: string) {
  const resumeUrl = `${hook(origin, "/api/swml", secret, job.id)}&resume=1&pay_result=\${pay_result}`;
  return {
    transfer: true,
    SWML: {
      version: "1.0.0",
      sections: {
        main: [
          { play: { url: "say:Connecting you to the secure keypad. The assistant can't hear what you type." } },
          {
            // Same shape SignalWire's own Agents SDK emits for FunctionResult.pay(): string
            // values and the pay engine's own prompt voice.
            pay: {
              payment_connector_url: hook(origin, "/api/pay/connector", secret, job.id),
              status_url: hook(origin, "/api/pay/status", secret, job.id),
              input: "dtmf",
              payment_method: "credit-card",
              timeout: "8",
              max_attempts: "2",
              security_code: "true",
              postal_code: "true",
              min_postal_code_length: "5",
              token_type: "one-time",
              charge_amount: (job.fee_cents / 100).toFixed(2),
              currency: "usd",
              language: "en-US",
              voice: "woman",
              description: `${shortName(b)} service call hold`,
              valid_card_types: "visa mastercard amex discover",
              prompts: [
                { for: "payment-card-number", actions: [{ type: "Say", phrase: "Please type your card number on the keypad, then press pound." }] },
                { for: "expiration-date", actions: [{ type: "Say", phrase: "Now the expiration date. Two digits for the month, two for the year, then pound." }] },
                { for: "security-code", actions: [{ type: "Say", phrase: "Now the security code on the back, then pound." }] },
                { for: "postal-code", actions: [{ type: "Say", phrase: "Last one. Your billing ZIP code, then pound." }] },
                { for: "payment-processing", actions: [{ type: "Say", phrase: "Thanks. Placing the hold with PayPal now." }] },
              ],
            },
          },
          { transfer: { dest: resumeUrl } },
        ],
      },
    },
  };
}
