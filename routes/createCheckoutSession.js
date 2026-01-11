import Stripe from "stripe";

// NOTE: Stripe is optional for development. If STRIPE_SECRET_KEY is missing,
// this route will return a clear error instead of crashing the whole server.

let _stripeClient = null;
function getStripe() {
  if (_stripeClient) return _stripeClient;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  _stripeClient = new Stripe(key, { apiVersion: "2024-06-20" });
  return _stripeClient;
}

export default async function createCheckoutSession(req, res, next) {
  try {
    const stripe = getStripe();
    if (!stripe) {
      return res.status(500).json({ error: "Missing STRIPE_SECRET_KEY" });
    }

    const { plan, userId, email, successUrl, cancelUrl } = req.body || {};

    const normalizedPlan = String(plan || "").toLowerCase();
    const priceId =
      normalizedPlan === "director"
        ? (process.env.STRIPE_PRICE_DIRECTOR || null)
        : normalizedPlan === "studio"
        ? (process.env.STRIPE_PRICE_STUDIO || null)
        : null;

    if (!priceId) {
      return res
        .status(400)
        .json({ error: "Invalid plan. Use 'director' or 'studio'." });
    }

    const frontendUrl = process.env.FRONTEND_URL || "https://www.aran.studio";
    const success_url =
      (typeof successUrl === "string" && successUrl) ||
      `${frontendUrl}/upgrade-success?session_id={CHECKOUT_SESSION_ID}`;
    const cancel_url =
      (typeof cancelUrl === "string" && cancelUrl) || `${frontendUrl}/pricing`;

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url,
      cancel_url,

      // Helps you reconcile later (webhooks) without trusting the client.
      client_reference_id: userId || undefined,

      customer_email: email || undefined,

      // Optional metadata
      metadata: {
        plan: normalizedPlan,
        userId: userId || "",
      },
    });

    return res.json({ url: session.url });
  } catch (err) {
    console.error("createCheckoutSession error:", err);
    return res.status(500).json({ error: "Failed to create checkout session" });
  }
}
