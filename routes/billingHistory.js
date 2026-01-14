import Stripe from "stripe";

let _stripeClient = null;
function getStripe() {
  if (_stripeClient) return _stripeClient;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  _stripeClient = new Stripe(key, { apiVersion: "2024-06-20" });
  return _stripeClient;
}

async function getCustomerId(stripe, { userId, email }) {
  const safeEmail = String(email || "").trim();
  const safeUserId = String(userId || "").trim();

  if (safeUserId) {
    try {
      const res = await stripe.customers.search({
        query: `metadata['userId']:'${safeUserId.replace(/'/g, "\\'")}'`,
        limit: 1,
      });
      if (res?.data?.length) return res.data[0].id;
    } catch {}
  }
  if (safeEmail) {
    const list = await stripe.customers.list({ email: safeEmail, limit: 1 });
    if (list?.data?.length) return list.data[0].id;
  }
  return null;
}

export default async function billingHistory(req, res) {
  try {
    const stripe = getStripe();
    if (!stripe) return res.status(500).json({ error: "Missing STRIPE_SECRET_KEY" });

    const { userId, email } = req.body || {};
    const customerId = await getCustomerId(stripe, { userId, email });
    if (!customerId) return res.json({ invoices: [] });

    const inv = await stripe.invoices.list({ customer: customerId, limit: 20 });

    const invoices = (inv?.data || []).map((i) => ({
      id: i.id,
      number: i.number,
      hosted_invoice_url: i.hosted_invoice_url,
      amount: typeof i.amount_paid === "number" ? `$${(i.amount_paid / 100).toFixed(2)}` : "",
      date: i.created ? new Date(i.created * 1000).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "2-digit" }) : "",
      status: i.status,
    }));

    return res.json({ invoices });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "Billing history error" });
  }
}
