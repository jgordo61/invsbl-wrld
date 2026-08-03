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
// Client-submitted prices are never used; only (name, size) are looked up here.
const FLAT_PRICES = {
  'CLOUD BENGAL':   5000,
  'EPSILON':        7700,
  'HYPERCUBE':      28500,
  'GINSENG RITUAL': 60000,
}

// Gauged piercings — require a size, priced per gauge.
const SIZED_PRICES = {
  'CRESCENT GRADIENT':      { '6G': 8000, '4G': 8000, '2G': 8000, '1G': 8000, '0G': 9000, '00G': 9000 },
  'HALF CRESCENT GRADIENT': { '6G': 8000, '4G': 8000, '2G': 8000, '1G': 8000, '0G': 9000, '00G': 9000 },
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
      const name = String(raw?.name ?? '')
      const size = raw?.size ? String(raw.size) : null

      let price, displayName
      if (SIZED_PRICES[name]) {
        price = size ? SIZED_PRICES[name][size] : undefined
        if (!price) continue   // sized item with no/invalid size — reject rather than guess
        displayName = `${name} — ${size}`
      } else {
        price = FLAT_PRICES[name]
        if (!price) continue   // unknown item — ignore rather than trust client data
        displayName = name
      }

      const qty = Math.max(1, Math.min(20, Math.floor(Number(raw?.qty)) || 1))
      lineItems.push({
        name: displayName,
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
          ask_for_shipping_address: true,
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
