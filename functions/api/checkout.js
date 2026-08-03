// ── POST /api/checkout ───────────────────────────────────────────────────────
// Cloudflare Pages Function. Takes the client's cart (item names + quantities
// only — never trusts client-submitted prices), builds a Square Checkout
// (Payment Links) request using the server-side price list below, and
// returns the hosted checkout URL for the browser to redirect to.
//
// Required environment variables (set via `wrangler pages secret put`):
//   SQUARE_ACCESS_TOKEN   — Sandbox or Production access token
//   SQUARE_LOCATION_ID    — the Square location to attach the order to
// Optional:
//   SQUARE_ENVIRONMENT    — 'production' to go live; anything else (or unset)
//                           stays on Sandbox. Defaults to Sandbox on purpose
//                           so a missing/misconfigured var can never
//                           accidentally enable real charges.
// ════════════════════════════════════════════════════════════════════════════

// Authoritative prices (USD cents) — keep in sync with CATALOG in src/main.js.
// Client-submitted prices are never used; only names are looked up here.
const PRICES = {
  'CRESCENT GRADIENT':      8000,
  'HALF CRESCENT GRADIENT': 8000,
  'CLOUD BENGAL':           5000,
  'EPSILON':                7700,
  'HYPERCUBE':              28500,
  'GINSENG RITUAL':         60000,
}

export async function onRequestPost({ request, env }) {
  try {
    if (!env.SQUARE_ACCESS_TOKEN || !env.SQUARE_LOCATION_ID) {
      return json({ error: 'Checkout is not configured yet.' }, 500)
    }

    const body = await request.json().catch(() => null)
    const cart = Array.isArray(body?.items) ? body.items : []

    const lineItems = []
    for (const raw of cart) {
      const name  = String(raw?.name ?? '')
      const price = PRICES[name]
      if (!price) continue   // unknown item — ignore rather than trust client data

      const qty = Math.max(1, Math.min(20, Math.floor(Number(raw?.qty)) || 1))
      lineItems.push({
        name,
        quantity: String(qty),
        base_price_money: { amount: price, currency: 'USD' },
      })
    }

    if (lineItems.length === 0) {
      return json({ error: 'Cart is empty or contains no valid items.' }, 400)
    }

    const isProduction = env.SQUARE_ENVIRONMENT === 'production'
    const apiBase = isProduction
      ? 'https://connect.squareup.com'
      : 'https://connect.squareupsandbox.com'

    const siteOrigin = new URL(request.url).origin

    const squareRes = await fetch(`${apiBase}/v2/online-checkout/payment-links`, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${env.SQUARE_ACCESS_TOKEN}`,
        'Square-Version': '2024-10-17',
      },
      body: JSON.stringify({
        idempotency_key: crypto.randomUUID(),
        order: {
          location_id: env.SQUARE_LOCATION_ID,
          line_items: lineItems,
        },
        checkout_options: {
          redirect_url: siteOrigin,
        },
      }),
    })

    const data = await squareRes.json()

    if (!squareRes.ok) {
      console.error('[checkout] Square API error:', JSON.stringify(data))
      return json({ error: 'Could not create checkout session.' }, 502)
    }

    const url = data.payment_link?.long_url || data.payment_link?.url
    if (!url) {
      return json({ error: 'Square did not return a checkout URL.' }, 502)
    }

    return json({ url })
  } catch (err) {
    console.error('[checkout] Unexpected error:', err)
    return json({ error: 'Unexpected server error.' }, 500)
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
