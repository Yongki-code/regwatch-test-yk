import { createFileRoute } from "@tanstack/react-router";

type SourceCfg = {
  name: string;
  url: string;
  agency: string;
  region: "EU" | "KR" | "MDSAP";
  type: string;
  isFda?: boolean;
};

const SOURCES: SourceCfg[] = [
  { name: "TGA", url: "https://www.tga.gov.au/feeds/alert/safety-alerts.xml", agency: "TGA", region: "MDSAP", type: "Guidance" },
  { name: "Health Canada", url: "https://www.canada.ca/content/dam/hc-sc/migration/hc-sc/rss/dhp-mps/devices-instruments-eng.xml", agency: "Health Canada", region: "MDSAP", type: "Guidance" },
  { name: "FDA MedWatch", url: "https://www.fda.gov/about-fda/contact-fda/stay-informed/rss-feeds/medwatch/rss.xml", agency: "FDA", region: "MDSAP", type: "Guidance", isFda: true },
  { name: "FDA Recalls", url: "https://www.fda.gov/about-fda/contact-fda/stay-informed/rss-feeds/recalls/rss.xml", agency: "FDA", region: "MDSAP", type: "Recall", isFda: true },
  { name: "MDCG", url: "https://health.ec.europa.eu/node/12916/rss_en", agency: "MDCG", region: "EU", type: "Guidance" },
];

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-airtable-base-id, x-airtable-token, x-claude-api-key",
};

function decodeEntities(s: string) {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

function pick(block: string, tag: string): string {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = block.match(re);
  return m ? decodeEntities(m[1]).trim() : "";
}

function pickLink(block: string): string {
  // Atom: <link href="..."/>
  const atom = block.match(/<link[^>]*href=["']([^"']+)["']/i);
  if (atom) return atom[1];
  return pick(block, "link");
}

type FeedItem = { title: string; link: string; pubDate: string };

function parseFeed(xml: string): FeedItem[] {
  const items: FeedItem[] = [];
  const blocks = xml.match(/<item[\s\S]*?<\/item>/gi) || xml.match(/<entry[\s\S]*?<\/entry>/gi) || [];
  for (const b of blocks) {
    const title = pick(b, "title");
    const link = pickLink(b);
    const pubDate = pick(b, "pubDate") || pick(b, "updated") || pick(b, "published") || new Date().toISOString();
    if (title && link) items.push({ title, link, pubDate });
  }
  return items;
}

function isoDate(s: string): string {
  const d = new Date(s);
  if (isNaN(d.getTime())) return new Date().toISOString().slice(0, 10);
  return d.toISOString().slice(0, 10);
}

async function callClaude(apiKey: string, title: string, agency: string, isFda: boolean) {
  const ivdNote = isFda
    ? "\n\n주의: 이 항목이 IVD 또는 의료기기와 직접 관련 없으면 (예: 식품/약품) urgency를 'Low'로 설정하고 ra_action에 'IVD 직접 관련 없음 — 모니터링 유지'를 포함하라."
    : "";
  const prompt = `아래 의료기기 규제 문서를 IVD RA 전문가 관점에서 분석하라.
제목: ${title}
기관: ${agency}

반드시 아래 JSON 형식만 반환하라:
{"summary": "핵심 내용 100자 이내 한국어 요약", "ra_action": "자사 IVD 제품 대응 조치 1~3줄 한국어", "urgency": "High 또는 Medium 또는 Low"}${ivdNote}`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 400,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`Claude ${res.status}`);
  const data = (await res.json()) as { content?: { text?: string }[] };
  const text = data?.content?.[0]?.text ?? "";
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("Claude parse error");
  const parsed = JSON.parse(m[0]) as { summary: string; ra_action: string; urgency: string };
  const urgency = ["High", "Medium", "Low"].includes(parsed.urgency) ? parsed.urgency : "Low";
  return { summary: parsed.summary, ra_action: parsed.ra_action, urgency };
}

async function airtableExists(baseId: string, token: string, sourceUrl: string): Promise<boolean> {
  const formula = encodeURIComponent(`{source_url}="${sourceUrl.replace(/"/g, '\\"')}"`);
  const url = `https://api.airtable.com/v0/${baseId}/regulatory_updates?filterByFormula=${formula}&maxRecords=1`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Airtable check ${res.status}`);
  const data = (await res.json()) as { records: unknown[] };
  return data.records.length > 0;
}

async function airtableCreate(baseId: string, token: string, fields: Record<string, unknown>) {
  const res = await fetch(`https://api.airtable.com/v0/${baseId}/regulatory_updates`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Airtable create ${res.status}: ${t}`);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const Route = createFileRoute("/api/collect")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        const jsonHeaders = { "Content-Type": "application/json", ...CORS };
        try {
          if (request.headers.get("x-test") === "1") {
            return new Response(JSON.stringify({ success: true, test: "ok" }), {
              status: 200,
              headers: jsonHeaders,
            });
          }

          const baseId = request.headers.get("x-airtable-base-id") || process.env.AIRTABLE_BASE_ID || "";
          const token = request.headers.get("x-airtable-token") || process.env.AIRTABLE_TOKEN || "";
          const claudeKey = request.headers.get("x-claude-api-key") || process.env.CLAUDE_API_KEY || "";

          if (!baseId || !token) {
            return new Response(
              JSON.stringify({ success: false, error: "Missing credentials (Airtable Base ID / Token)" }),
              { status: 400, headers: jsonHeaders },
            );
          }

          let collected = 0;
          let skipped = 0;
          const errors: string[] = [];

          for (const src of SOURCES) {
            try {
              const r = await fetch(src.url, { headers: { "User-Agent": "IVD-RegWatch/1.0" } });
              if (!r.ok) {
                errors.push(`${src.name}: fetch ${r.status}`);
                continue;
              }
              const xml = await r.text();
              const items = parseFeed(xml).slice(0, 10); // cap per source
              for (const it of items) {
                try {
                  const exists = await airtableExists(baseId, token, it.link);
                  if (exists) { skipped++; continue; }

                  let summary = "";
                  let ra_action = "";
                  let urgency = "";
                  if (claudeKey) {
                    const ai = await callClaude(claudeKey, it.title, src.agency, !!src.isFda);
                    summary = ai.summary;
                    ra_action = ai.ra_action;
                    urgency = ai.urgency;
                  }
                  await airtableCreate(baseId, token, {
                    title: it.title,
                    source_url: it.link,
                    date: isoDate(it.pubDate),
                    agency: src.agency,
                    region: src.region,
                    type: src.type,
                    tag: src.type,
                    urgency,
                    summary,
                    ra_action,
                    is_new: true,
                  });
                  collected++;
                  if (claudeKey) await sleep(1000);
                } catch (e) {
                  errors.push(`${src.name} item: ${(e as Error).message}`);
                }
              }
            } catch (e) {
              errors.push(`${src.name}: ${(e as Error).message}`);
            }
          }

          return new Response(JSON.stringify({ success: true, collected, skipped, errors }), {
            status: 200,
            headers: jsonHeaders,
          });
        } catch (e) {
          return new Response(
            JSON.stringify({ success: false, error: (e as Error)?.message || String(e) }),
            { status: 200, headers: jsonHeaders },
          );
        }
      },
    },
  },
});
