const stripe = require("stripe")(process.env.sk_test_51Tinn8H7KLNRhY3F4MozDz3IBkAov7Vszh0WetGfvN9sRVtirXqoeuChV0GaP47wrFzhNnTpstBtrOxy0gBMuo0B00JkZgRfOB);

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { amount, requestId, customerEmail } = req.body;

    if (!amount || amount < 1) {
      return res.status(400).json({ error: "Invalid payment amount" });
    }

    const baseUrl = req.headers.origin || "https://shift-fuel-jt3dr2xtw-mmb0yz123456789-7792s-projects.vercel.app";

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      customer_email: customerEmail || undefined,
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: "ShiftFuel Concierge Service",
              description: requestId ? `Request ID: ${requestId}` : "Vehicle concierge service",
            },
            unit_amount: Math.round(Number(amount) * 100),
          },
          quantity: 1,
        },
      ],
      metadata: {
        request_id: requestId || "",
      },
      success_url: `${baseUrl}/track.html?payment=success&request=${requestId || ""}`,
      cancel_url: `${baseUrl}/index.html#book`,
    });

    return res.status(200).json({ url: session.url });
  } catch (error) {
    console.error("Stripe checkout error:", error);
    return res.status(500).json({ error: "Could not create checkout session" });
  }
};
