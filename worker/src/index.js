// Xmas gift board server: one Durable Object holds the set of removed item ids.
// GET  /removed                         -> { "<item id>": "<ISO time removed>", ... }
// POST /removed {pass, check:true}      -> 200 if the passphrase is right (used to unlock editing)
// POST /removed {pass, id, remove:bool} -> removes or restores one item, returns the new set

const ORIGINS = ["https://linglab.org", "https://www.linglab.org", "https://samuelling.github.io"];

export class Board {
  constructor(ctx, env) { this.ctx = ctx; }
  async fetch(req) {
    const current = (await this.ctx.storage.get("removed")) || {};
    if (req.method === "GET") return Response.json(current);
    const { id, remove } = await req.json();
    if (remove) current[id] = new Date().toISOString();
    else delete current[id];
    await this.ctx.storage.put("removed", current);
    return Response.json(current);
  }
}

export default {
  async fetch(req, env) {
    const origin = req.headers.get("Origin") || "";
    const cors = {
      "Access-Control-Allow-Origin": ORIGINS.includes(origin) ? origin : ORIGINS[0],
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Vary": "Origin",
    };
    const reply = (body, status = 200) =>
      new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } });

    if (req.method === "OPTIONS") return new Response(null, { headers: cors });
    if (new URL(req.url).pathname !== "/removed") return reply({ error: "not found" }, 404);

    const board = env.BOARD.get(env.BOARD.idFromName("xmas"));
    if (req.method === "GET") return reply(await (await board.fetch("https://board/removed")).json());
    if (req.method !== "POST") return reply({ error: "method not allowed" }, 405);

    let body;
    try { body = await req.json(); } catch { return reply({ error: "bad request" }, 400); }
    if (!env.PASSPHRASE) return reply({ error: "editing isn't set up yet" }, 503);
    if (typeof body.pass !== "string" || body.pass !== env.PASSPHRASE) return reply({ error: "wrong passphrase" }, 401);
    if (body.check) return reply({ ok: true });
    if (typeof body.id !== "string" || !/^[a-z0-9-]{1,150}$/.test(body.id)) return reply({ error: "bad item id" }, 400);

    const res = await board.fetch("https://board/removed", {
      method: "POST",
      body: JSON.stringify({ id: body.id, remove: !!body.remove }),
    });
    return reply(await res.json());
  },
};
