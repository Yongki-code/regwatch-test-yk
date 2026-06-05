type SourceCfg = {
  name: string;
  url: string;
  agency: string;
  region: "EU" | "KR" | "MDSAP";
  type: string;
  urlType: "rss" | "html";
  isFda?: boolean;
};

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

async function extractItemsFromHtml(openaiKey: string, src: SourceCfg): Promise<FeedItem[]> {
  const htmlRes = await fetch(`https://r.jina.ai/${src.url}`, {
    headers: { "User-Agent": "IVD-RegWatch/1.0" },
  });
  if (!htmlRes.ok) throw new Error(`Jina ${htmlRes.status}`);
  const pageText = await htmlRes.text();
  console.log(`[${src.name}] Jina preview:`, pageText.slice(0, 500));

  const extractRes = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openaiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o",
      max_tokens: 1000,
      messages: [{
        role: "user",
        content: `다음 웹페이지 내용에서 규제 관련 업데이트 항목을 최대 10개 추출하라.
반드시 아래 JSON 배열 형식만 반환하라:
[{"title": "항목 제목", "link": "항목 URL", "pubDate": "날짜(없으면 오늘)"}]
웹페이지 내용:
${pageText.slice(0, 3000)}`,
      }],
    }),
  });
  if (!extractRes.ok) throw new Error(`OpenAI extract ${extractRes.status}`);
  const extractData = (await extractRes.json()) as { choices?: { message?: { content?: string } }[] };
  const extractText = extractData?.choices?.[0]?.message?.content ?? "[]";
  console.log(`[${src.name}] OpenAI raw:`, extractText.slice(0, 500));
  const match = extractText.match(/\[[\s\S]*\]/);
  const items = match ? (JSON.parse(match[0]) as FeedItem[]) : [];
  const baseUrl = new URL(src.url).origin;
  const fixed = items.map(it => ({...it, link: it.link.startsWith("http") ? it.link : `${baseUrl}${it.link.startsWith("/") ? "" : "/"}${it.link}`}));
  console.log(`[${src.name}] extracted ${fixed.length} items:`, JSON.stringify(fixed.slice(0, 3), null, 2));
  return fixed;
}

async function callOpenAI(apiKey: string, title: string, agency: string, isFda: boolean) {
  const ivdNote = isFda
    ? "\n\n주의: 이 항목이 IVD 또는 의료기기와 직접 관련 없으면 urgency를 'Low'로 설정하고 ra_action에 'IVD 직접 관련 없음 — 모니터링 유지'를 포함하라."
    : "";
  const prompt = `반드시 JSON만 반환하라. 다른 텍스트, 설명, 마크다운 코드블록 없이 순수 JSON 객체만 출력하라.

아래 의료기기 규제 문서를 IVD RA 전문가 관점에서 분석하라.
제목: ${title}
기관: ${agency}

반드시 아래 JSON 형식만 반환하라:
{"type": "Guidance 또는 Draft Guidance 또는 Amendment 또는 Recall 또는 행정예고 또는 System Update", "summary": "아래 항목을 포함하여 500자 이내 한국어로 작성: 1)규제 배경 및 목적 2)핵심 변경사항 또는 요건 3)적용 대상 제품군 4)시행일 또는 전환 기간", "ra_action": "자사 IVD 제품 관점에서 아래 항목을 포함하여 5줄 이내 한국어로 작성: 1)즉각 검토 필요 사항 2)기술문서 또는 인허가 영향 3)후속 모니터링 필요 사항", "urgency": "High 또는 Medium 또는 Low\n\nurgency 판단 기준 (엄격하게 적용):\n\n- High: 아래 조건을 모두 충족하는 경우만 해당\n  · 규정 발효일 또는 적용 의무일이 6개월 이내\n  · 제품 설계 변경, 인허가 갱신, 기술문서 즉각 수정 중 하나 이상이 반드시 필요\n  · IVD 제품에 직접적으로 적용되는 강제 규정\n\n- Medium: 아래 중 하나 이상 해당\n  · 1년 이내 대응 필요\n  · 내부 절차·SOP 업데이트 필요\n  · IVD 관련 가이던스로 향후 심사 기준에 영향 가능성\n\n- Low: 아래 중 하나 이상 해당\n  · 시행일이 1년 이상 남음\n  · IVD와 간접 관련이거나 참고·모니터링 수준\n  · 기존 요건의 명확화·해석 수준에 해당\n\n판단 기준: 가이던스 문서 대부분은 Medium 또는 Low이다.\n\nHigh는 전체 수집 항목의 20% 이내로 제한하라."}${ivdNote}`;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o",
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

async function fetchSources(baseId: string, token: string): Promise<SourceCfg[]> {
  const url = `https://api.airtable.com/v0/${baseId}/sources?filterByFormula=${encodeURIComponent("{active}=1")}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Airtable sources ${res.status}`);
  const data = (await res.json()) as {
    records: { fields: {
      Name?: string; name?: string; url?: string; agency?: string;
      region?: string; type?: string; url_type?: string;
    } }[];
  };
  return data.records
    .map((r) => {
      const f = r.fields;
      return {
        name: f.Name || f.name || "",
        url: f.url || "",
        agency: f.agency || "",
        region: (f.region || "MDSAP") as "EU" | "KR" | "MDSAP",
        type: f.type || "Guidance",
        urlType: ((f.url_type || "rss").toLowerCase() as "rss" | "html"),
        isFda: f.agency === "FDA",
      };
    })
    .filter((s) => s.url);
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

  const SOURCES = await fetchSources(baseId, token);
  console.log(`Loaded ${SOURCES.length} active sources from Airtable`);

  let collected = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const src of SOURCES) {
    try {
      let items: FeedItem[] = [];
      if (src.urlType === "html") {
        if (!openaiKey) {
          errors.push(`${src.name}: HTML 추출에는 OPENAI_API_KEY 필요`);
          continue;
        }
        items = (await extractItemsFromHtml(openaiKey, src)).slice(0, 10);
      } else {
        const r = await fetch(src.url, { headers: { "User-Agent": "IVD-RegWatch/1.0" } });
        if (!r.ok) {
          errors.push(`${src.name}: fetch ${r.status}`);
          continue;
        }
        const xml = await r.text();
        items = parseFeed(xml).slice(0, 10);
      }

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
