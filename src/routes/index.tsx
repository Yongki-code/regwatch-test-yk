import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { X, Search, Settings as SettingsIcon, Eye, EyeOff, Loader2 } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Index,
});

type Item = {
  id: string;
  region: "EU" | "KR" | "MDSAP";
  agency: string;
  date: string;
  tag: string;
  type: string;
  urgency: "High" | "Medium" | "Low";
  title: string;
  summary: string;
  ra_action: string;
  source_url: string;
  is_new: boolean;
};

const mockData: Item[] = [
  { id: "1", region: "EU", agency: "MDCG", date: "2026-05-15", tag: "IVDR", type: "Guidance", urgency: "High", title: "MDCG 2026-3 Guidance on performance studies for IVD devices under IVDR", summary: "IVDR 제61조에 따른 성능 연구 설계 및 보고 요건 최신 지침 발표. 레거시 IVD 전환 일정 명확화 포함.", ra_action: "레거시 IVD 제품 목록 재검토 후 성능 연구 계획 수립 필요. 2026년 5월 26일 전환 기한 재확인.", source_url: "https://health.ec.europa.eu", is_new: true },
  { id: "2", region: "KR", agency: "MFDS", date: "2026-05-14", tag: "행정예고", type: "행정예고", urgency: "Medium", title: "체외진단의료기기 허가·심사 규정 일부개정고시(안) 행정예고", summary: "자가검사용 IVD 허가 요건 완화 및 디지털 결과 보고 의무화 내용 포함. 의견 제출 기한 2026.06.14.", ra_action: "개정안 검토 후 자사 자가검사 제품 허가 요건 변경 여부 확인. 의견 제출 여부 내부 결정 필요.", source_url: "https://www.mfds.go.kr", is_new: true },
  { id: "3", region: "MDSAP", agency: "FDA", date: "2026-05-13", tag: "IVD", type: "Guidance", urgency: "Medium", title: "FDA Draft Guidance: Cybersecurity in IVD Software Functions", summary: "IVD 소프트웨어 기능의 사이버보안 요건 초안. 510(k) 제출 시 보안 설계 문서 추가 요구.", ra_action: "자사 IVD 소프트웨어 제품의 사이버보안 설계 문서 현황 파악. 초안 의견 제출 기한(60일) 캘린더 등록.", source_url: "https://www.fda.gov", is_new: true },
  { id: "4", region: "EU", agency: "EUR-Lex", date: "2026-05-10", tag: "MDR", type: "Amendment", urgency: "High", title: "Commission Implementing Regulation (EU) 2026/734 amending Annex IX MDR", summary: "MDR Annex IX 기술문서 요건 개정. Class IIb 이상 제품 임상평가 계획 서식 변경.", ra_action: "Class IIb 이상 제품 기술문서 내 임상평가 계획 서식을 신규 양식으로 교체. 다음 갱신 주기에 반영.", source_url: "https://eur-lex.europa.eu", is_new: false },
  { id: "5", region: "MDSAP", agency: "TGA", date: "2026-05-09", tag: "IVDR", type: "Guidance", urgency: "Low", title: "TGA Guidance: In vitro diagnostic devices — Australian requirements update 2026", summary: "호주 IVD 등록 요건 업데이트. ARTG 등록 갱신 절차 간소화 내용 포함.", ra_action: "호주 시장 IVD 제품 ARTG 갱신 일정 확인. 간소화된 절차 적용 대상 여부 검토.", source_url: "https://www.tga.gov.au", is_new: false },
  { id: "6", region: "MDSAP", agency: "Health Canada", date: "2026-05-08", tag: "IVD", type: "Draft Guidance", urgency: "Medium", title: "Health Canada Draft: Updated IVD Device Licence Application Requirements", summary: "캐나다 IVD 허가 신청 요건 개정 초안. 분자진단 제품 분류 체계 변경 예고.", ra_action: "분자진단 제품 캐나다 허가 등급 재분류 대상 여부 검토. 초안 의견 제출 기한 확인.", source_url: "https://www.canada.ca", is_new: false },
  { id: "7", region: "KR", agency: "MFDS", date: "2026-05-07", tag: "고시", type: "Amendment", urgency: "High", title: "의료기기 GMP 적합성인정 기준 개정 고시 시행", summary: "의료기기 GMP 인정 기준 개정 시행. ISO 13485:2016 기반 적합성 평가 강화.", ra_action: "현행 QMS 대비 개정 GMP 기준 GAP 분석 실시. 내부감사 계획에 신규 요건 반영.", source_url: "https://www.mfds.go.kr", is_new: false },
  { id: "8", region: "EU", agency: "EUDAMED", date: "2026-05-05", tag: "System", type: "System Update", urgency: "Low", title: "EUDAMED Module UDI-DI: Mandatory use extended to Class I IVDs from June 2026", summary: "EUDAMED UDI-DI 모듈 Class I IVD 의무 등록 범위 확대. 2026년 6월 1일 시행.", ra_action: "자사 Class I IVD 제품 EUDAMED UDI-DI 등록 현황 점검. 미등록 제품 6월 1일 전 등록 완료.", source_url: "https://ec.europa.eu/tools/eudamed", is_new: false },
  { id: "9", region: "MDSAP", agency: "FDA", date: "2026-05-03", tag: "Recall", type: "Recall", urgency: "High", title: "FDA Class II Recall: XYZ Glucose Monitoring System — Software Defect", summary: "혈당 모니터링 시스템 소프트웨어 오류로 인한 Class II 리콜. 유사 알고리즘 사용 IVD 영향 검토 권고.", ra_action: "자사 유사 소프트웨어 알고리즘 IVD 제품 점검. CAPA 필요 여부 내부 검토 후 RA팀 보고.", source_url: "https://www.fda.gov/safety/recalls", is_new: false },
  { id: "10", region: "EU", agency: "MDCG", date: "2026-04-30", tag: "IVDR", type: "Guidance", urgency: "Medium", title: "MDCG 2026-2 Questions and Answers on IVDR Transitional Provisions", summary: "IVDR 전환 조항 Q&A 업데이트. 레거시 IVD 판매 지속 조건 및 인증 기관 전환 요건 명확화.", ra_action: "레거시 IVD 제품별 IVDR 전환 일정 재확인. 인증기관(NB) 심사 예약 현황 점검.", source_url: "https://health.ec.europa.eu", is_new: false },
];

const REGIONS = ["EU", "KR", "MDSAP"] as const;
const DOC_TYPES = ["Guidance", "Draft Guidance", "행정예고", "Amendment", "Recall", "System Update"] as const;
const SOURCES: { name: string; status: "정상" | "Delayed" | "오류" }[] = [
  { name: "FDA", status: "정상" },
  { name: "MFDS", status: "정상" },
  { name: "EUR-Lex", status: "정상" },
  { name: "MDCG", status: "정상" },
  { name: "Health Canada", status: "Delayed" },
  { name: "TGA", status: "정상" },
  { name: "EUDAMED", status: "정상" },
];

const API_KEY_STORAGE = "ivd_claude_api_key";

const urgencyColor = (u: Item["urgency"]) =>
  u === "High" ? "#ef4444" : u === "Medium" ? "#f59e0b" : "#64748b";
const urgencyLabel = (u: Item["urgency"]) =>
  u === "High" ? "긴급" : u === "Medium" ? "보통" : "낮음";
const regionPill = (r: Item["region"]) => {
  if (r === "EU") return "bg-indigo-500/20 text-indigo-300";
  if (r === "KR") return "bg-emerald-500/20 text-emerald-300";
  return "bg-violet-500/20 text-violet-300";
};
const statusDot = (s: string) =>
  s === "정상" ? "bg-green-500" : s === "Delayed" ? "bg-amber-500" : "bg-red-500";

async function callClaude(apiKey: string, item: Item): Promise<{ summary: string; ra_action: string }> {
  const prompt = `아래 의료기기 규제 문서를 IVD RA 전문가 관점에서 분석하라.
제목: ${item.title}
기관: ${item.agency}
유형: ${item.type}
지역: ${item.region}

다음 JSON 형식으로만 응답하라 (다른 텍스트 없이):
{"summary": "핵심 내용 100자 이내 요약", "ra_action": "자사 IVD 제품 대응 조치 1~3줄"}`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 512,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
  const data = await res.json();
  const text = data?.content?.[0]?.text ?? "";
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("parse");
  return JSON.parse(match[0]);
}

function Index() {
  const [regions, setRegions] = useState<Set<string>>(new Set(REGIONS));
  const [types, setTypes] = useState<Set<string>>(new Set(DOC_TYPES));
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Item | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [apiKey, setApiKey] = useState<string>("");
  const [hasKey, setHasKey] = useState(false);

  const [aiResult, setAiResult] = useState<{ summary: string; ra_action: string } | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState(false);

  useEffect(() => {
    const k = localStorage.getItem(API_KEY_STORAGE) || "";
    setApiKey(k);
    setHasKey(!!k);
  }, []);

  useEffect(() => {
    if (!selected) return;
    setAiResult(null);
    setAiError(false);
    const stored = localStorage.getItem(API_KEY_STORAGE);
    if (!stored) return;
    setAiLoading(true);
    callClaude(stored, selected)
      .then((r) => setAiResult(r))
      .catch(() => setAiError(true))
      .finally(() => setAiLoading(false));
  }, [selected]);

  const toggle = (set: Set<string>, val: string, setter: (s: Set<string>) => void) => {
    const next = new Set(set);
    next.has(val) ? next.delete(val) : next.add(val);
    setter(next);
  };

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    return mockData.filter(
      (d) =>
        regions.has(d.region) &&
        types.has(d.type) &&
        (!q || d.title.toLowerCase().includes(q) || d.summary.toLowerCase().includes(q))
    );
  }, [regions, types, query]);

  const todayCount = mockData.filter((d) => d.date === "2026-05-15").length;
  const highCount = mockData.filter((d) => d.urgency === "High").length;
  const unreadCount = mockData.filter((d) => d.is_new).length;

  return (
    <div className="flex min-h-screen text-slate-100" style={{ backgroundColor: "#0b1120" }}>
      {/* SIDEBAR */}
      <aside
        className="w-60 shrink-0 border-r border-slate-800 flex flex-col"
        style={{ backgroundColor: "#0f172a" }}
      >
        <div className="p-5 border-b border-slate-800">
          <h1 className="text-lg font-bold text-white">IVD RegWatch</h1>
          <p className="text-xs text-slate-400 mt-0.5">규제 자동 모니터링</p>
        </div>

        <div className="p-5 border-b border-slate-800">
          <h2 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-3">
            지역 필터
          </h2>
          <div className="space-y-2">
            {REGIONS.map((r) => (
              <label key={r} className="flex items-center gap-2 text-sm text-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={regions.has(r)}
                  onChange={() => toggle(regions, r, setRegions)}
                  className="accent-indigo-500"
                />
                {r}
              </label>
            ))}
          </div>
        </div>

        <div className="p-5 border-b border-slate-800">
          <h2 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-3">
            문서 유형
          </h2>
          <div className="space-y-2">
            {DOC_TYPES.map((t) => (
              <label key={t} className="flex items-center gap-2 text-sm text-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={types.has(t)}
                  onChange={() => toggle(types, t, setTypes)}
                  className="accent-indigo-500"
                />
                {t}
              </label>
            ))}
          </div>
        </div>

        <div className="p-5">
          <h2 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-3">
            소스 상태
          </h2>
          <div className="space-y-2">
            {SOURCES.map((s) => (
              <div key={s.name} className="flex items-center gap-2 text-xs">
                <span className={`w-2 h-2 rounded-full ${statusDot(s.status)}`} />
                <span className="text-slate-200 flex-1">{s.name}</span>
                <span className="text-slate-500">{s.status}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-auto p-5 border-t border-slate-800 space-y-3">
          <div className="flex items-center gap-2 text-xs">
            <span className={`w-2 h-2 rounded-full ${hasKey ? "bg-green-500" : "bg-slate-500"}`} />
            <span className={hasKey ? "text-slate-200" : "text-slate-400"}>
              {hasKey ? "API 연결됨" : "API 미설정"}
            </span>
          </div>
          <button
            onClick={() => setSettingsOpen(true)}
            className="flex items-center gap-2 text-sm text-slate-300 hover:text-white w-full"
          >
            <SettingsIcon className="w-4 h-4" />
            설정
          </button>
        </div>
      </aside>

      {/* CENTER */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <div className="px-8 py-5 border-b border-slate-800 flex items-center gap-4">
          <h2 className="text-xl font-semibold text-white">최신 규제 업데이트</h2>
          <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 text-xs">
            {filtered.length}
          </span>
          <div className="ml-auto relative w-72">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="제목·요약 검색"
              className="w-full pl-9 pr-3 py-2 text-sm rounded-md border border-slate-700 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
              style={{ backgroundColor: "#111827" }}
            />
          </div>
        </div>

        <div className="px-8 pt-5 grid grid-cols-4 gap-3">
          <MetricCard label="오늘 수집" value={String(todayCount)} />
          <MetricCard label="이번 주 High" value={String(highCount)} accent="#ef4444" />
          <MetricCard label="미열람" value={String(unreadCount)} accent="#f59e0b" />
          <MetricCard label="소스 상태" value="7/7 정상" accent="#22c55e" />
        </div>

        <div className="flex-1 overflow-y-auto px-8 py-5 space-y-3">
          {filtered.map((item) => (
            <Card key={item.id} item={item} onClick={() => setSelected(item)} />
          ))}
          {filtered.length === 0 && (
            <div className="text-center text-slate-500 py-12 text-sm">조건에 맞는 업데이트가 없습니다.</div>
          )}
        </div>
      </main>

      {/* SLIDE OVER */}
      {selected && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-40"
            onClick={() => setSelected(null)}
          />
          <div
            className="fixed right-0 top-0 h-full w-[480px] z-50 overflow-y-auto border-l border-slate-800"
            style={{ backgroundColor: "#0f172a" }}
          >
            <div className="p-6">
              <button
                onClick={() => setSelected(null)}
                className="absolute top-4 right-4 p-2 rounded-md hover:bg-slate-800 text-slate-400"
              >
                <X className="w-5 h-5" />
              </button>

              <h3 className="text-xl font-semibold text-white pr-10 leading-snug">
                {selected.title}
              </h3>

              <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
                <span className="px-2 py-0.5 rounded bg-slate-700 text-slate-200">
                  {selected.agency}
                </span>
                <span className={`px-2 py-0.5 rounded-full ${regionPill(selected.region)}`}>
                  {selected.region}
                </span>
                <span className="text-slate-400">{selected.date}</span>
                <span
                  className="px-2 py-0.5 rounded-full text-white font-semibold ml-auto"
                  style={{ backgroundColor: urgencyColor(selected.urgency) }}
                >
                  {urgencyLabel(selected.urgency)}
                </span>
              </div>

              <DetailBox
                label="AI 요약"
                labelClass="text-indigo-300"
                bg="#1e1b4b"
                border="#6366f1"
                hasKey={hasKey}
                loading={aiLoading}
                error={aiError}
                content={aiResult?.summary}
              />

              <DetailBox
                label="RA ACTION"
                labelClass="text-amber-300"
                bg="#1a1200"
                border="#f59e0b"
                hasKey={hasKey}
                loading={aiLoading}
                error={aiError}
                content={aiResult?.ra_action}
              />

              <div className="mt-5">
                <h4 className="text-sm font-semibold text-white mb-2">자사 영향 검토 포인트</h4>
                <ul className="space-y-1.5 text-sm text-slate-300 list-disc list-inside">
                  <li>해당 규제가 자사 제품 라인에 직접 적용되는지 확인</li>
                  <li>현재 기술문서 및 QMS 대비 GAP 분석 필요 여부 판단</li>
                  <li>대응 일정 및 담당자 배정 후 내부 회의 안건 등록</li>
                </ul>
              </div>

              <a
                href={selected.source_url}
                target="_blank"
                rel="noreferrer"
                className="mt-6 inline-flex items-center justify-center w-full px-4 py-2.5 rounded-md border border-slate-600 text-slate-100 text-sm hover:bg-slate-800 transition"
              >
                원문 보기 →
              </a>
            </div>
          </div>
        </>
      )}

      {/* SETTINGS MODAL */}
      {settingsOpen && (
        <SettingsModal
          initialKey={apiKey}
          onClose={() => setSettingsOpen(false)}
          onSave={(k) => {
            localStorage.setItem(API_KEY_STORAGE, k);
            setApiKey(k);
            setHasKey(!!k);
          }}
        />
      )}
    </div>
  );
}

function DetailBox({
  label, labelClass, bg, border, hasKey, loading, error, content,
}: {
  label: string; labelClass: string; bg: string; border: string;
  hasKey: boolean; loading: boolean; error: boolean; content?: string;
}) {
  return (
    <div
      className="mt-5 p-4 rounded-md border-l-4 min-h-[80px]"
      style={{ backgroundColor: bg, borderLeftColor: border }}
    >
      <div className={`text-xs font-semibold uppercase tracking-wider mb-2 ${labelClass}`}>
        {label}
      </div>
      {!hasKey ? (
        <p className="text-sm text-slate-400 italic text-center py-2">
          Claude API 키를 설정하면 AI 요약 및 RA Action 기능을 사용할 수 있습니다
        </p>
      ) : loading ? (
        <div className="flex items-center justify-center py-3">
          <Loader2 className="w-5 h-5 text-slate-300 animate-spin" />
        </div>
      ) : error ? (
        <p className="text-sm text-red-400">요약 생성 중 오류가 발생했습니다. API 키를 확인해 주세요.</p>
      ) : (
        <p className="text-sm text-slate-100 leading-relaxed">{content}</p>
      )}
    </div>
  );
}

function SettingsModal({
  initialKey, onClose, onSave,
}: { initialKey: string; onClose: () => void; onSave: (k: string) => void }) {
  const [val, setVal] = useState(initialKey);
  const [show, setShow] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<null | "ok" | "fail">(null);

  const test = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": val,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 8,
          messages: [{ role: "user", content: "ping" }],
        }),
      });
      setTestResult(res.ok ? "ok" : "fail");
    } catch {
      setTestResult("fail");
    } finally {
      setTesting(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-50" onClick={onClose} />
      <div
        className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[520px] z-50 rounded-lg border border-slate-700 p-6"
        style={{ backgroundColor: "#0f172a" }}
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-semibold text-white">설정</h3>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-slate-800 text-slate-400">
            <X className="w-5 h-5" />
          </button>
        </div>

        <label className="block text-sm text-slate-200 mb-2">Claude API Key</label>
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <input
              type={show ? "text" : "password"}
              value={val}
              onChange={(e) => { setVal(e.target.value); setTestResult(null); }}
              placeholder="sk-ant-..."
              className="w-full pl-3 pr-10 py-2 text-sm rounded-md border border-slate-700 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
              style={{ backgroundColor: "#111827" }}
            />
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-200"
            >
              {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <button
            onClick={test}
            disabled={!val || testing}
            className="px-3 py-2 text-sm rounded-md border border-slate-600 text-slate-100 hover:bg-slate-800 disabled:opacity-50 flex items-center gap-1.5"
          >
            {testing && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            테스트
          </button>
        </div>

        {testResult === "ok" && (
          <p className="mt-2 text-sm text-green-400">유효한 키입니다 ✓</p>
        )}
        {testResult === "fail" && (
          <p className="mt-2 text-sm text-red-400">유효하지 않은 키입니다 ✗</p>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-md border border-slate-600 text-slate-200 hover:bg-slate-800"
          >
            취소
          </button>
          <button
            onClick={() => { onSave(val.trim()); onClose(); }}
            className="px-4 py-2 text-sm rounded-md bg-indigo-600 hover:bg-indigo-500 text-white font-medium"
          >
            저장
          </button>
        </div>
      </div>
    </>
  );
}

function MetricCard({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div
      className="rounded-lg p-4 border border-slate-800"
      style={{ backgroundColor: "#111827" }}
    >
      <div className="text-2xl font-bold" style={{ color: accent ?? "#f8fafc" }}>
        {value}
      </div>
      <div className="text-xs text-slate-400 mt-1">{label}</div>
    </div>
  );
}

function Card({ item, onClick }: { item: Item; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      className="relative rounded-lg p-4 pl-5 cursor-pointer hover:bg-slate-800/60 transition border border-slate-800"
      style={{ backgroundColor: "#111827" }}
    >
      <span
        className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full"
        style={{ backgroundColor: urgencyColor(item.urgency) }}
      />
      {item.is_new && (
        <span
          className="absolute top-3 right-3 px-2 py-0.5 rounded-full text-xs font-bold"
          style={{ color: "#22c55e", backgroundColor: "#052e16" }}
        >
          NEW
        </span>
      )}
      <div className="flex items-center gap-2 text-xs text-slate-400">
        <span>{item.agency}</span>
        <span>·</span>
        <span className={`px-2 py-0.5 rounded-full ${regionPill(item.region)}`}>
          {item.region}
        </span>
      </div>
      <div className="mt-2">
        <span className="text-xs px-2 py-0.5 rounded-full bg-slate-700 text-slate-300">
          {item.type}
        </span>
      </div>
      <h3 className="mt-2 text-sm font-medium text-white line-clamp-2 pr-16">{item.title}</h3>
      <p className="mt-1 text-xs text-slate-400 line-clamp-1">{item.summary}</p>
      <div className="mt-2 text-right text-xs text-slate-500">{item.date}</div>
    </div>
  );
}
