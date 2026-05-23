type SourceCfg = {
  name: string;
  url: string;
  agency: string;
  region: "EU" | "KR" | "MDSAP";
  type: string;
  isFda?: boolean;
};

const SOURCES: SourceCfg[] = [
  { name: "MDCG", url: "https://health.ec.europa.eu/node/12916/rss_en", agency: "MDCG", region: "EU", type: "Guidance" },
];

type FeedItem = { title: string; link: string; pubDate: string };

function isoDate(s: string): string {
  const d = new Date(s);
  if (isNaN(d.getTime())) return new Date().toISOString().slice(0, 10);
  return d.toISOString().slice(0, 10);
}

function decodeEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();
}

function pick(block: string, tag: string): string {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i");
  const m = block.match(re);
  return m ? decodeEntities(m[1]) : "";
}

function pickLink(block: string): string {
  const a = block.match(/<link[^>]*href=["']([^"']+)["'][^>]*\/?>(?:<\/link>)?/i);
  if (a) return a[1];
  const b = block.match(/<link[^>]*>([\s\S]*?)<\/link>/i);
  if (b) return decodeEntities(b[1]);
  return "";
}

function parseFeed(xml: string): FeedItem[] {
  const items: FeedItem[] = [];
  const itemRe = /<item[\s>][\s\S]*?<\/item>/gi;
  const entryRe = /<entry[\s>][\s\S]*?<\/entry>/gi;
  const blocks = xml.match(itemRe) || xml.match(entryRe) || [];
  for (const block of blocks) {
    const title = pick(block, "title");
    const link = pickLink(block);
    const pubDate = pick(block, "pubDate") || pick(block, "updated") || pick(block, "published") || "";
    if (title && link) items.push({ title, link, pubDate });
  }
  return items;
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

async function main() {
  const baseId = process.env.AIRTABLE_BASE_ID || "";
  const token = process.env.AIRTABLE_TOKEN || "";
  const claudeKey = process.env.CLAUDE_API_KEY || "";

  if (!baseId || !token) {
    console.error("Missing AIRTABLE_BASE_ID or AIRTABLE_TOKEN");
    process.exit(1);
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
      const items = parseFeed(xml).slice(0, 10);
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

  console.log(JSON.stringify({ success: true, collected, skipped, errors }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
