import OpenAI from "openai";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      { ok: false, error: "OPENAI_API_KEY is not configured. Add it to frontend/.env.local and restart the dev server." },
      { status: 500 }
    );
  }

  let body: { messages?: unknown; context?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const rawMessages = body.messages;
  const context = typeof body.context === "string" ? body.context.slice(0, 800) : "";

  if (!Array.isArray(rawMessages) || rawMessages.length === 0) {
    return NextResponse.json({ ok: false, error: "No messages provided." }, { status: 400 });
  }

  // Validate and sanitise each message
  const messages: { role: "user" | "assistant"; content: string }[] = [];
  for (const m of rawMessages) {
    if (
      typeof m !== "object" ||
      m === null ||
      !["user", "assistant"].includes((m as Record<string, unknown>).role as string) ||
      typeof (m as Record<string, unknown>).content !== "string"
    ) {
      return NextResponse.json({ ok: false, error: "Invalid message format." }, { status: 400 });
    }
    messages.push({
      role: (m as { role: "user" | "assistant"; content: string }).role,
      content: ((m as { role: string; content: string }).content as string).slice(0, 4000),
    });
  }

  const systemContent =
    "You are an expert AI assistant specialising in elliptic curves, number theory, " +
    "and algebraic geometry. You help users of the Elliptic Curve Solver web app — " +
    "a tool that finds integer and rational points on parametric elliptic curves of " +
    "the form y² = f(n, x).\n\n" +
    "Your capabilities include:\n" +
    "• Explaining elliptic curve theory (Weierstrass form, group law, torsion, rank, BSD conjecture)\n" +
    "• Interpreting solutions: what integer points mean geometrically and arithmetically\n" +
    "• Suggesting search parameters or example curves\n" +
    "• Explaining the chord-tangent addition law and point doubling\n" +
    "• Discussing modular forms, L-functions, and related topics\n" +
    "• Helping debug unexpected results\n\n" +
    "Be concise, precise, and use mathematical notation where helpful (e.g. y² = x³ − x). " +
    "When giving equations, prefer plain text notation the user can paste into the solver " +
    "(Python syntax: ** for powers, * for multiplication)." +
    (context ? `\n\nCurrent solver context:\n${context}` : "");

  const client = new OpenAI({ apiKey });

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const completion = await client.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [{ role: "system", content: systemContent }, ...messages],
          max_tokens: 1024,
          temperature: 0.5,
          stream: true,
        });

        for await (const chunk of completion) {
          const delta = chunk.choices[0]?.delta?.content;
          if (delta) {
            const payload = `data: ${JSON.stringify({ type: "delta", content: delta })}\n\n`;
            controller.enqueue(encoder.encode(payload));
          }
        }
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`));
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "error", message: msg })}\n\n`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
    },
  });
}
