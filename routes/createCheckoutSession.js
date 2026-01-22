import Stripe from "stripe";

let _stripeClient = null;
function getStripe() {
  if (_stripeClient) return _stripeClient;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  _stripeClient = new Stripe(key, { apiVersion: "2024-06-20" });
  return _stripeClient;
}

const PRICE_IDS = {
  director: process.env.STRIPE_PRICE_DIRECTOR || "",
  studio: process.env.STRIPE_PRICE_STUDIO || "",
};

const DEFAULT_SUCCESS_URL =
  process.env.CHECKOUT_SUCCESS_URL || "https://www.aran.studio/pricing";
const DEFAULT_CANCEL_URL =
  process.env.CHECKOUT_CANCEL_URL || "https://www.aran.studio/pricing";

const priceModeCache = new Map();

function validatePriceId(plan, priceId) {
  if (!priceId) {
    return `Missing STRIPE_PRICE_${plan.toUpperCase()} for plan '${plan}'.`;
  }
  if (!priceId.startsWith("price_")) {
    return `Invalid STRIPE_PRICE_${plan.toUpperCase()} (must be a Stripe price_ ID).`;
  }
  return null;
}

function getStripeMode() {
  const key = process.env.STRIPE_SECRET_KEY || "";
  if (key.startsWith("sk_live_")) return "live";
  if (key.startsWith("sk_test_")) return "test";
  return null;
}

async function ensurePriceMatchesMode(stripe, priceId) {
  if (!priceId || priceModeCache.has(priceId)) return;
  const expectedMode = getStripeMode();
  if (!expectedMode) return;

  try {
    const price = await stripe.prices.retrieve(priceId);
    const priceMode = price?.livemode ? "live" : "test";
    if (priceMode !== expectedMode) {
      throw new Error(
        `Stripe price ${priceId} is ${priceMode} but STRIPE_SECRET_KEY is ${expectedMode}. ` +
          "Check that your test/live price IDs match the API key mode."
      );
    }
    priceModeCache.set(priceId, priceMode);
  } catch (err) {
    const msg = err?.message || "Unable to retrieve Stripe price";
    throw new Error(
      `${msg}. Verify the price ID exists in the same Stripe mode as STRIPE_SECRET_KEY.`
    );
  }
}

function appendCheckoutStatus(baseUrl, status) {
  const safeBase = String(baseUrl || "").trim();
  if (!safeBase) return safeBase;

  try {
    const url = new URL(safeBase);
    url.searchParams.set("checkout", status);
    return url.toString();
  } catch {
    const joiner = safeBase.includes("?") ? "&" : "?";
    return `${safeBase}${joiner}checkout=${encodeURIComponent(status)}`;
  }
}

export default async function createCheckoutSession(req, res) {
  try {
    const stripe = getStripe();
    if (!stripe) {
      return res.status(400).json({
        error: "Stripe is not configured. Missing STRIPE_SECRET_KEY on the backend.",
      });
    }

    const body = req.body || {};
    const plan = String(body.plan || "").trim().toLowerCase();
    const interval = String(body.interval || "month").trim().toLowerCase();
    const userId = String(body.userId || "").trim();
    const email = String(body.email || "").trim();
    const baseSuccessUrl = body.successUrl || DEFAULT_SUCCESS_URL;
    const baseCancelUrl = body.cancelUrl || DEFAULT_CANCEL_URL;
    const successUrl = appendCheckoutStatus(baseSuccessUrl, "success");
    const cancelUrl = appendCheckoutStatus(baseCancelUrl, "cancel");

    if (!plan || !Object.prototype.hasOwnProperty.call(PRICE_IDS, plan)) {
      return res.status(400).json({ error: "Invalid plan. Use 'director' or 'studio'." });
    }
    if (!email) return res.status(400).json({ error: "Missing email." });
    if (!userId) return res.status(400).json({ error: "Missing userId." });

    const priceId = PRICE_IDS[plan];
    const priceError = validatePriceId(plan, priceId);
    if (priceError) return res.status(400).json({ error: priceError });
    try {
      await ensurePriceMatchesMode(stripe, priceId);
    } catch (err) {
      return res.status(400).json({ error: err?.message || "Stripe price mode mismatch." });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      allow_promotion_codes: true,
      customer_email: email,
      client_reference_id: userId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      subscription_data: {
        metadata: {
          userId,
          plan,
        },
      },
      metadata: {
        userId,
        plan,
        interval,
      },
    });

    return res.json({ url: session.url });
  } catch (err) {
    console.error("createCheckoutSession error:", err);
    return res.status(500).json({ error: err?.message || "Failed to create checkout session" });
  }
}
