import Stripe from "stripe";

let _stripeClient = null;
function getStripe() {
  if (_stripeClient) return _stripeClient;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  _stripeClient = new Stripe(key, { apiVersion: "2024-06-20" });
  return _stripeClient;
}

// Default product IDs (fallback). You can override via env vars.
const DEFAULT_PRODUCTS = {
  director: process.env.STRIPE_PRODUCT_DIRECTOR || "prod_TcheO3yxXePdu0",
  studio: process.env.STRIPE_PRODUCT_STUDIO || "prod_TchK2nhVt9Fadw",
};

// Pick a recurring price for a product.
// Prefers interval passed (month/year). Falls back to any active recurring price.
async function pickPriceId(stripe, productId, interval = "month") {
  const prices = await stripe.prices.list({ product: productId, active: true, limit: 20 });

  const recurring = (prices.data || []).filter((p) => !!p.recurring);
  const exact = recurring.find((p) => p.recurring?.interval === interval);
  if (exact) return exact.id;

  // If no exact match, prefer monthly, then yearly, then first recurring.
  const monthly = recurring.find((p) => p.recurring?.interval === "month");
  if (monthly) return monthly.id;
  const yearly = recurring.find((p) => p.recurring?.interval === "year");
  if (yearly) return yearly.id;

  if (recurring[0]) return recurring[0].id;
  return null;
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
    const successUrl = body.successUrl || process.env.CHECKOUT_SUCCESS_URL || "https://www.aran.studio";
    const cancelUrl = body.cancelUrl || process.env.CHECKOUT_CANCEL_URL || "https://www.aran.studio";

    if (!plan || !DEFAULT_PRODUCTS[plan]) {
      return res.status(400).json({ error: "Invalid plan. Use 'director' or 'studio'." });
    }
    if (!email) return res.status(400).json({ error: "Missing email." });
    if (!userId) return res.status(400).json({ error: "Missing userId." });

    const productId = DEFAULT_PRODUCTS[plan];
    const priceId = await pickPriceId(stripe, productId, interval);
    if (!priceId) {
      return res.status(400).json({
        error:
          "No active recurring price found for this product in Stripe. Create an active monthly (or yearly) recurring price.",
      });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      allow_promotion_codes: true,
      customer_email: email,
      client_reference_id: userId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl + "?checkout=success",
      cancel_url: cancelUrl + "?checkout=cancel",
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
