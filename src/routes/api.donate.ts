import Stripe from "stripe";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const requestSchema = z.object({
  amount: z.number().int().min(5).max(500),
  returnPath: z.string().regex(/^\/(?!\/)[^\r\n]*$/),
});

export const Route = createFileRoute("/api/donate")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const parsed = requestSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) {
          return Response.json({ error: "Choose a valid donation amount." }, { status: 400 });
        }
        const body = parsed.data;
        const origin = new URL(request.url).origin;
        const secretKey = process.env.STRIPE_SECRET_KEY;

        if (!secretKey) {
          return Response.json({ mode: "demo", amount: body.amount });
        }

        try {
          const stripe = new Stripe(secretKey);
          const session = await stripe.checkout.sessions.create({
            mode: "payment",
            submit_type: "donate",
            line_items: [
              {
                quantity: 1,
                price_data: {
                  currency: "usd",
                  unit_amount: body.amount * 100,
                  product_data: { name: "Support Orbit" },
                },
              },
            ],
            success_url: `${origin}${body.returnPath}?donated=1`,
            cancel_url: `${origin}${body.returnPath}?donated=cancelled`,
          });

          if (!session.url) {
            return Response.json({ error: "Checkout could not be created." }, { status: 502 });
          }
          return Response.json({ mode: "live", url: session.url });
        } catch {
          return Response.json({ error: "Checkout could not be created." }, { status: 502 });
        }
      },
    },
  },
});
