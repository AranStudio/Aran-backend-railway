import Stripe from "stripe";

let _stripeClient = null;
function getStripe() {
  if (_stripeClient) return _stripeClient;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  _stripeClient = new Stripe(key, { apiVersion: "2024-06-20" });
  return _stripeClient;
}

async function getOrCreateCustomer(stripe, { userId, email }) {
  const safeEmail = String(email || "").trim();
  const safeUserId = String(userId || "").trim();

  // Try by metadata userId first (Stripe Search)
  if (safeUserId) {
    try {
      const res = await stripe.customers.search({
        query: `metadata['userId']:'${safeUserId.replace(/'/g, "\\'")}'`,
        limit: 1,
      });
      if (res?.data?.length) return res.data[0];
    } catch {
      // ignore; search may not be enabled on older accounts
    }
  }

  // Try by email
  if (safeEmail) {
    const list = await stripe.customers.list({ email: safeEmail, limit: 1 });
    if (list?.data?.length) return list.data[0];
  }

  // Create
  const customer = await stripe.customers.create({
    email: safeEmail || undefined,
    metadata: safeUserId ? { userId: safeUserId } : undefined,
  });
  return customer;
}

export default async function billingPortal(req, res) {
  try {
    const stripe = getStripe();
    if (!stripe) return res.status(500).json({ error: "Missing STRIPE_SECRET_KEY" });

    const { userId, email, returnUrl } = req.body || {};
    const customer = await getOrCreateCustomer(stripe, { userId, email });

    const session = await stripe.billingPortal.sessions.create({
      customer: customer.id,
      return_url: returnUrl || process.env.BILLING_PORTAL_RETURN_URL || undefined,
    });

    return res.json({ url: session.url });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "Billing portal error" });
  }
}
