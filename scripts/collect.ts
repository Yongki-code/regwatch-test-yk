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

async function callOpenAI(apiKey: string, title: string, agency: string, isFda: boolean) {
  const ivdNote = isFda
    ? "\n\n주의: 이 항목이 IVD 또는 의료기기와 직접 관련 없으면 urgency를 'Low'로 설정하고 ra_action에 'IVD 직접 관련 없음 — 모니터링 유지'를 포함하라."
    : "";
  const prompt = `아래 의료기기 규제 문서를 IVD RA 전문가 관점에서 분석하라.
제목: ${title}
기관: ${agency}

반드시 아래 JSON 형식만 반환하라:
{"type": "Guidance 또는 Draft Guidance 또는 Amendment 또는 Recall 또는 행정예고 또는 System Update", "summary": "아래 항목을 포함하여 500자 이내 한국어로 작성: 1)규제 배경 및 목적 2)핵심 변경사항 또는 요건 3)적용 대상 제품군 4)시행일 또는 전환 기간", "ra_action": "자사 IVD 제품 관점에서 아래 항목을 포함하여 5줄 이내 한국어로 작성: 1)즉각 검토 필요 사항 2)기술문서 또는 인허가 영향 3)후속 모니터링 필요 사항", "urgency": "High 또는 Medium 또는 Low"}${ivdNote}`;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      max_tokens: 1000,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}`);
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const text = data?.choices?.[0]?.message?.content ?? "";
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("OpenAI parse error");
  const parsed = JSON.parse(m[0]) as { type: string; summary: string; ra_action: string; urgency: string };
  const urgency = ["High", "Medium", "Low"].includes(parsed.urgency) ? parsed.urgency : "Low";
  return { type: parsed.type, summary: parsed.summary, ra_action: parsed.ra_action, urgency };
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
  const openaiKey = process.env.OPENAI_API_KEY || "";

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
          let type = src.type;
          if (openaiKey) {
            const ai = await callOpenAI(openaiKey, it.title, src.agency, !!src.isFda);
            summary = ai.summary;
            ra_action = ai.ra_action;
            urgency = ai.urgency;
            if (ai.type) type = ai.type;
          }
          await airtableCreate(baseId, token, {
            title: it.title,
            source_url: it.link,
            date: isoDate(it.pubDate),
            agency: src.agency,
            region: src.region,
            type,
            tag: type,
            urgency,
            summary,
            ra_action,
            is_new: true,
          });
          collected++;
          if (openaiKey) await sleep(1000);
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
