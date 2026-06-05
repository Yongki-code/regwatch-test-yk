import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { X, Search, Settings as SettingsIcon, Eye, EyeOff, Loader2, Trash2, Plus } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Index,
});

type Item = {
  id: string;
  region: string;
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

type Source = {
  id: string;
  name: string;
  url: string;
  agency: string;
  region: string;
  type: string;
  url_type: "rss" | "html";
  active: boolean;
};

const mockData: Item[] = [];

const AIRTABLE_BASE_STORAGE = "ivd_airtable_base_id";
const AIRTABLE_TOKEN_STORAGE = "ivd_airtable_token";

const urgencyColor = (u: Item["urgency"]) =>
  u === "High" ? "#ef4444" : u === "Medium" ? "#f59e0b" : "#64748b";
const urgencyLabel = (u: Item["urgency"]) =>
  u === "High" ? "긴급" : u === "Medium" ? "보통" : "낮음";
const regionPill = (r: string) => {
  if (r === "EU") return "bg-indigo-500/20 text-indigo-300";
  if (r === "KR") return "bg-emerald-500/20 text-emerald-300";
  return "bg-violet-500/20 text-violet-300";
};

type AirtableRecord = {
  id: string;
  fields: Partial<{
    title: string; source_url: string; date: string; agency: string;
    region: string; type: string; tag: string; urgency: string;
    summary: string; ra_action: string; is_new: boolean;
  }>;
};

async function fetchAirtable(baseId: string, token: string): Promise<Item[]> {
  const url = `https://api.airtable.com/v0/${baseId}/regulatory_updates?sort%5B0%5D%5Bfield%5D=date&sort%5B0%5D%5Bdirection%5D=desc&maxRecords=100`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Airtable ${res.status}`);
  const data = (await res.json()) as { records: AirtableRecord[] };
  return data.records.map((r) => ({
    id: r.id,
    region: r.fields.region || "MDSAP",
    agency: r.fields.agency || "",
    date: r.fields.date || "",
    tag: r.fields.tag || "",
    type: r.fields.type || "Guidance",
    urgency: (r.fields.urgency as Item["urgency"]) || "Low",
    title: r.fields.title || "",
    summary: r.fields.summary || "",
    ra_action: r.fields.ra_action || "",
    source_url: r.fields.source_url || "",
    is_new: !!r.fields.is_new,
  }));
}

type SourceRecord = {
  id: string;
  fields: Partial<{
    Name: string; name: string; url: string; agency: string;
    region: string; type: string; url_type: string; active: boolean;
  }>;
};

async function fetchSources(baseId: string, token: string): Promise<Source[]> {
  const url = `https://api.airtable.com/v0/${baseId}/sources?maxRecords=100`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Airtable sources ${res.status}`);
  const data = (await res.json()) as { records: SourceRecord[] };
  return data.records.map((r) => ({
    id: r.id,
    name: r.fields.Name || r.fields.name || "",
    url: r.fields.url || "",
    agency: r.fields.agency || "",
    region: r.fields.region || "",
    type: r.fields.type || "",
    url_type: ((r.fields.url_type || "rss").toLowerCase() as "rss" | "html"),
    active: !!r.fields.active,
  }));
}

function Index() {
  const [regions, setRegions] = useState<Set<string>>(new Set());
  const [types, setTypes] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Item | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [airtableBase, setAirtableBase] = useState("");
  const [airtableToken, setAirtableToken] = useState("");
  const [airtableConnected, setAirtableConnected] = useState(false);

  const [data, setData] = useState<Item[]>(mockData);
  const [sources, setSources] = useState<Source[]>([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [usingMock, setUsingMock] = useState(true);

  const loadAirtable = (base: string, token: string) => {
    if (!base || !token) {
      setData(mockData);
      setSources([]);
      setUsingMock(true);
      return;
    }
    setDataLoading(true);
    Promise.all([fetchAirtable(base, token), fetchSources(base, token).catch(() => [])])
      .then(([rows, srcs]) => {
        setData(rows);
        setSources(srcs);
        setUsingMock(rows.length === 0);
      })
      .catch(() => {
        setData(mockData);
        setUsingMock(true);
      })
      .finally(() => setDataLoading(false));
  };

  useEffect(() => {
    const b = localStorage.getItem(AIRTABLE_BASE_STORAGE) || "";
    const t = localStorage.getItem(AIRTABLE_TOKEN_STORAGE) || "";
    setAirtableBase(b); setAirtableToken(t);
    setAirtableConnected(!!(b && t));
    loadAirtable(b, t);
  }, []);

  const toggle = (set: Set<string>, val: string, setter: (s: Set<string>) => void) => {
    const next = new Set(set);
    next.has(val) ? next.delete(val) : next.add(val);
    setter(next);
  };

  // Regions come from active sources; types come from regulatory_updates
  const availableRegions = useMemo(
    () => Array.from(new Set(sources.filter((s) => s.active).map((s) => s.region).filter(Boolean))).sort(),
    [sources]
  );
  const availableTypes = useMemo(
    () => Array.from(new Set(data.map((d) => d.type).filter(Boolean))).sort(),
    [data]
  );

  useEffect(() => {
    setRegions(new Set(availableRegions));
  }, [availableRegions.join("|")]);
  useEffect(() => {
    setTypes(new Set(availableTypes));
  }, [availableTypes.join("|")]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    return data.filter(
      (d) =>
        (regions.size === 0 || regions.has(d.region)) &&
        (types.size === 0 || types.has(d.type)) &&
        (!q || d.title.toLowerCase().includes(q) || d.summary.toLowerCase().includes(q))
    );
  }, [data, regions, types, query]);

  const today = new Date().toISOString().slice(0, 10);
  const todayCount = data.filter((d) => d.date === today).length;
  const highCount = data.filter((d) => d.urgency === "High").length;
  const unreadCount = data.filter((d) => d.is_new).length;
  const lastCollected = data.reduce((acc, d) => (d.date && d.date > acc ? d.date : acc), "");

  const markRead = async (item: Item) => {
    setSelected(item);
    if (!item.is_new) return;
    setData((prev) => prev.map((d) => (d.id === item.id ? { ...d, is_new: false } : d)));
    const base = localStorage.getItem(AIRTABLE_BASE_STORAGE) || "";
    const token = localStorage.getItem(AIRTABLE_TOKEN_STORAGE) || "";
    if (!base || !token) return;
    try {
      await fetch(`https://api.airtable.com/v0/${base}/regulatory_updates/${item.id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ fields: { is_new: false } }),
      });
    } catch {
      setData((prev) => prev.map((d) => (d.id === item.id ? { ...d, is_new: true } : d)));
    }
  };

  return (
    <div className="flex min-h-screen text-slate-100" style={{ backgroundColor: "#0b1120" }}>
      <aside
        className="w-60 shrink-0 border-r border-slate-800 flex flex-col"
        style={{ backgroundColor: "#0f172a" }}
      >
        <div className="p-5 border-b border-slate-800">
          <h1 className="text-lg font-bold text-white">IVD RegWatch</h1>
          <p className="text-xs text-slate-400 mt-0.5">규제 자동 모니터링</p>
        </div>

        <div className="p-5 border-b border-slate-800">
          <h2 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-3">지역 필터</h2>
          <div className="space-y-2">
            {availableRegions.length === 0 && (
              <p className="text-xs text-slate-500">활성 소스 없음</p>
            )}
            {availableRegions.map((r) => (
              <label key={r} className="flex items-center gap-2 text-sm text-slate-200 cursor-pointer">
                <input type="checkbox" checked={regions.has(r)} onChange={() => toggle(regions, r, setRegions)} className="accent-indigo-500" />
                {r}
              </label>
            ))}
          </div>
        </div>

        <div className="p-5 border-b border-slate-800">
          <h2 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-3">문서 유형</h2>
          <div className="space-y-2">
            {availableTypes.length === 0 && (
              <p className="text-xs text-slate-500">데이터 없음</p>
            )}
            {availableTypes.map((t) => (
              <label key={t} className="flex items-center gap-2 text-sm text-slate-200 cursor-pointer">
                <input type="checkbox" checked={types.has(t)} onChange={() => toggle(types, t, setTypes)} className="accent-indigo-500" />
                {t}
              </label>
            ))}
          </div>
        </div>

        <div className="p-5">
          <h2 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-3">수집 현황</h2>
          <div className="space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-400">마지막 수집</span>
              <span className="text-slate-200">{lastCollected || "—"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">누적 수집</span>
              <span className="text-slate-200">{data.length}건</span>
            </div>
          </div>
        </div>

        <div className="mt-auto p-5 border-t border-slate-800 space-y-3">
          <div className="flex items-center gap-2 text-xs">
            <span className={`w-2 h-2 rounded-full ${airtableConnected ? "bg-green-500" : "bg-slate-500"}`} />
            <span className={airtableConnected ? "text-slate-200" : "text-slate-400"}>{airtableConnected ? "Airtable 연결됨" : "Airtable 미설정"}</span>
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

      <main className="flex-1 flex flex-col overflow-hidden">
        <div className="px-8 py-5 border-b border-slate-800 flex items-center gap-4">
          <h2 className="text-xl font-semibold text-white">최신 규제 업데이트</h2>
          <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 text-xs">{filtered.length}</span>
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

        {usingMock && (
          <div className="mx-8 mt-4 px-4 py-2.5 rounded-md text-xs text-amber-200 border" style={{ backgroundColor: "#1a1200", borderColor: "#f59e0b" }}>
            설정에서 Airtable을 연결하면 실데이터가 표시됩니다.
          </div>
        )}

        <div className="px-8 pt-5 grid grid-cols-3 gap-3">
          <MetricCard label="오늘 수집" value={String(todayCount)} />
          <MetricCard label="이번 주 High" value={String(highCount)} accent="#ef4444" />
          <MetricCard label="미열람" value={String(unreadCount)} accent="#f59e0b" />
        </div>

        <div className="flex-1 overflow-y-auto px-8 py-5 space-y-3">
          {dataLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="rounded-lg p-4 border border-slate-800 animate-pulse" style={{ backgroundColor: "#111827" }}>
                <div className="h-3 w-32 bg-slate-700 rounded mb-3" />
                <div className="h-4 w-3/4 bg-slate-700 rounded mb-2" />
                <div className="h-3 w-1/2 bg-slate-800 rounded" />
              </div>
            ))
          ) : (
            <>
              {filtered.map((item) => (
                <Card key={item.id} item={item} onClick={() => markRead(item)} />
              ))}
              {filtered.length === 0 && (
                <div className="text-center text-slate-500 py-12 text-sm">조건에 맞는 업데이트가 없습니다.</div>
              )}
            </>
          )}
        </div>
      </main>

      {selected && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40" onClick={() => setSelected(null)} />
          <div className="fixed right-0 top-0 h-full w-[480px] z-50 overflow-y-auto border-l border-slate-800" style={{ backgroundColor: "#0f172a" }}>
            <div className="p-6">
              <button onClick={() => setSelected(null)} className="absolute top-4 right-4 p-2 rounded-md hover:bg-slate-800 text-slate-400">
                <X className="w-5 h-5" />
              </button>

              <h3 className="text-xl font-semibold text-white pr-10 leading-snug">{selected.title}</h3>

              <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
                <span className="px-2 py-0.5 rounded bg-slate-700 text-slate-200">{selected.agency}</span>
                <span className={`px-2 py-0.5 rounded-full ${regionPill(selected.region)}`}>{selected.region}</span>
                <span className="text-slate-400">{selected.date}</span>
                <span className="px-2 py-0.5 rounded-full text-white font-semibold ml-auto" style={{ backgroundColor: urgencyColor(selected.urgency) }}>
                  {urgencyLabel(selected.urgency)}
                </span>
              </div>

              <DetailBox label="AI 요약" labelClass="text-indigo-300" bg="#1e1b4b" border="#6366f1" content={selected.summary} />
              <DetailBox label="RA ACTION" labelClass="text-amber-300" bg="#1a1200" border="#f59e0b" content={selected.ra_action} />

              <div className="mt-5">
                <h4 className="text-sm font-semibold text-white mb-2">자사 영향 검토 포인트</h4>
                <ul className="space-y-1.5 text-sm text-slate-300 list-disc list-inside">
                  <li>해당 규제가 자사 제품 라인에 직접 적용되는지 확인</li>
                  <li>현재 기술문서 및 QMS 대비 GAP 분석 필요 여부 판단</li>
                  <li>대응 일정 및 담당자 배정 후 내부 회의 안건 등록</li>
                </ul>
              </div>

              <a href={selected.source_url} target="_blank" rel="noreferrer"
                className="mt-6 inline-flex items-center justify-center w-full px-4 py-2.5 rounded-md border border-slate-600 text-slate-100 text-sm hover:bg-slate-800 transition">
                원문 보기 →
              </a>
            </div>
          </div>
        </>
      )}

      {settingsOpen && (
        <SettingsModal
          initialBase={airtableBase}
          initialToken={airtableToken}
          sources={sources}
          onSourcesChange={setSources}
          onClose={() => setSettingsOpen(false)}
          onSave={(b, t) => {
            localStorage.setItem(AIRTABLE_BASE_STORAGE, b);
            localStorage.setItem(AIRTABLE_TOKEN_STORAGE, t);
            setAirtableBase(b); setAirtableToken(t);
            setAirtableConnected(!!(b && t));
            loadAirtable(b, t);
          }}
        />
      )}
    </div>
  );
}

function DetailBox({
  label, labelClass, bg, border, content,
}: {
  label: string; labelClass: string; bg: string; border: string; content?: string;
}) {
  return (
    <div className="mt-5 p-4 rounded-md border-l-4 min-h-[80px]" style={{ backgroundColor: bg, borderLeftColor: border }}>
      <div className={`text-xs font-semibold uppercase tracking-wider mb-2 ${labelClass}`}>{label}</div>
      {content ? (
        <p className="text-sm text-slate-100 leading-relaxed whitespace-pre-line">{content}</p>
      ) : (
        <p className="text-sm text-slate-400 italic text-center py-2">내용이 없습니다</p>
      )}
    </div>
  );
}

function SettingsModal({
  initialBase, initialToken, sources, onSourcesChange, onClose, onSave,
}: {
  initialBase: string; initialToken: string;
  sources: Source[];
  onSourcesChange: (s: Source[]) => void;
  onClose: () => void; onSave: (b: string, t: string) => void;
}) {
  const [base, setBase] = useState(initialBase);
  const [token, setToken] = useState(initialToken);
  const [showToken, setShowToken] = useState(false);

  const [collecting, setCollecting] = useState(false);
  const [collectMsg, setCollectMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [showAddForm, setShowAddForm] = useState(false);

  const runCollect = async () => {
    setCollecting(true);
    setCollectMsg(null);
    try {
      const res = await fetch("/api/collect", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-airtable-base-id": base,
          "x-airtable-token": token,
        },
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setCollectMsg({ ok: false, text: `✗ 오류: ${data.error || res.statusText}` });
      } else {
        const errPart = data.errors?.length ? ` (오류 ${data.errors.length}건)` : "";
        setCollectMsg({ ok: true, text: `✓ ${data.collected}건 수집 완료, ${data.skipped}건 중복 스킵${errPart}` });
      }
    } catch (e) {
      setCollectMsg({ ok: false, text: `✗ 오류: ${(e as Error).message}` });
    } finally {
      setCollecting(false);
    }
  };

  const reloadSources = async () => {
    if (!base || !token) return;
    try {
      const s = await fetchSources(base, token);
      onSourcesChange(s);
    } catch {/* ignore */}
  };

  const toggleActive = async (s: Source) => {
    if (!base || !token) return;
    const next = !s.active;
    onSourcesChange(sources.map((x) => (x.id === s.id ? { ...x, active: next } : x)));
    try {
      await fetch(`https://api.airtable.com/v0/${base}/sources/${s.id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ fields: { active: next } }),
      });
    } catch {
      onSourcesChange(sources);
    }
  };

  const deleteSource = async (s: Source) => {
    if (!base || !token) return;
    if (!confirm(`"${s.name}" 소스를 삭제하시겠습니까?`)) return;
    const prev = sources;
    onSourcesChange(sources.filter((x) => x.id !== s.id));
    try {
      await fetch(`https://api.airtable.com/v0/${base}/sources/${s.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      onSourcesChange(prev);
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-50" onClick={onClose} />
      <div
        className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[640px] max-h-[90vh] overflow-y-auto z-50 rounded-lg border border-slate-700 p-6"
        style={{ backgroundColor: "#0f172a" }}
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-semibold text-white">설정</h3>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-slate-800 text-slate-400">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div>
          <h4 className="text-sm font-semibold text-white mb-4">데이터 수집 설정</h4>

          <label className="block text-sm text-slate-200 mb-2">Airtable Base ID</label>
          <input
            type="text"
            value={base}
            onChange={(e) => setBase(e.target.value)}
            placeholder="appXXXXXXXXXXXXXX"
            className="w-full px-3 py-2 text-sm rounded-md border border-slate-700 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
            style={{ backgroundColor: "#111827" }}
          />

          <label className="block text-sm text-slate-200 mb-2 mt-4">Airtable API Token</label>
          <div className="relative">
            <input
              type={showToken ? "text" : "password"}
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="pat..."
              className="w-full pl-3 pr-10 py-2 text-sm rounded-md border border-slate-700 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
              style={{ backgroundColor: "#111827" }}
            />
            <button type="button" onClick={() => setShowToken((s) => !s)}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-200">
              {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>

          <button
            onClick={runCollect}
            disabled={collecting || !base || !token}
            className="mt-4 w-full px-4 py-2.5 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {collecting && <Loader2 className="w-4 h-4 animate-spin" />}
            지금 수집 실행
          </button>

          {collectMsg && (
            <p className={`mt-3 text-sm ${collectMsg.ok ? "text-green-400" : "text-red-400"}`}>{collectMsg.text}</p>
          )}

          <div className="mt-4 flex items-center gap-2 text-xs">
            <span className="w-2 h-2 rounded-full bg-green-500" />
            <span className="text-slate-300">자동 수집: 매일 오전 7시 (KST)</span>
          </div>
        </div>

        {/* SOURCE MANAGEMENT */}
        <div className="mt-6 pt-6 border-t border-slate-800">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-sm font-semibold text-white">수집 소스 관리</h4>
            <button
              onClick={() => setShowAddForm((v) => !v)}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-md border border-slate-600 text-slate-100 hover:bg-slate-800"
            >
              <Plus className="w-3.5 h-3.5" /> 소스 추가
            </button>
          </div>

          {showAddForm && (
            <AddSourceForm
              base={base}
              token={token}
              onCancel={() => setShowAddForm(false)}
              onCreated={async () => {
                setShowAddForm(false);
                await reloadSources();
              }}
            />
          )}

          <div className="space-y-2 mt-3">
            {sources.length === 0 && (
              <p className="text-xs text-slate-500">등록된 소스가 없습니다.</p>
            )}
            {sources.map((s) => (
              <div key={s.id} className="flex items-center gap-3 p-3 rounded-md border border-slate-800" style={{ backgroundColor: "#111827" }}>
                <button
                  onClick={() => toggleActive(s)}
                  className={`relative w-9 h-5 rounded-full transition-colors ${s.active ? "bg-indigo-500" : "bg-slate-600"}`}
                  aria-label="toggle"
                >
                  <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${s.active ? "translate-x-4" : ""}`} />
                </button>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-white truncate">{s.name || s.agency || "(이름 없음)"}</div>
                  <div className="text-xs text-slate-400 truncate">{s.agency}</div>
                </div>
                {s.region && (
                  <span className={`px-2 py-0.5 rounded-full text-xs ${regionPill(s.region)}`}>{s.region}</span>
                )}
                <span className="px-2 py-0.5 rounded-full text-xs bg-slate-700 text-slate-200 uppercase">{s.url_type}</span>
                <button
                  onClick={() => deleteSource(s)}
                  className="p-1.5 rounded text-slate-400 hover:text-red-400 hover:bg-slate-800"
                  aria-label="delete"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onClose}
            className="px-4 py-2 text-sm rounded-md border border-slate-600 text-slate-200 hover:bg-slate-800">
            취소
          </button>
          <button onClick={() => { onSave(base.trim(), token.trim()); onClose(); }}
            className="px-4 py-2 text-sm rounded-md bg-indigo-600 hover:bg-indigo-500 text-white font-medium">
            저장
          </button>
        </div>
      </div>
    </>
  );
}

function AddSourceForm({
  base, token, onCancel, onCreated,
}: {
  base: string; token: string; onCancel: () => void; onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [agency, setAgency] = useState("");
  const [region, setRegion] = useState<"EU" | "KR" | "MDSAP">("EU");
  const [type, setType] = useState("Guidance");
  const [urlType, setUrlType] = useState<"rss" | "html">("rss");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    if (!base || !token) { setErr("Airtable 연결이 필요합니다."); return; }
    if (!name || !url) { setErr("이름과 URL은 필수입니다."); return; }
    setSaving(true); setErr(null);
    try {
      const res = await fetch(`https://api.airtable.com/v0/${base}/sources`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          fields: { Name: name, url, agency, region, type, url_type: urlType, active: true },
        }),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(`${res.status}: ${t}`);
      }
      onCreated();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const input = "w-full px-3 py-2 text-sm rounded-md border border-slate-700 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500";

  return (
    <div className="p-4 rounded-md border border-slate-700 mb-2 space-y-3" style={{ backgroundColor: "#0b1120" }}>
      <div>
        <label className="block text-xs text-slate-300 mb-1">소스 이름</label>
        <input className={input} style={{ backgroundColor: "#111827" }} value={name} onChange={(e) => setName(e.target.value)} placeholder="MDCG" />
      </div>
      <div>
        <label className="block text-xs text-slate-300 mb-1">URL</label>
        <input className={input} style={{ backgroundColor: "#111827" }} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-slate-300 mb-1">기관명</label>
          <input className={input} style={{ backgroundColor: "#111827" }} value={agency} onChange={(e) => setAgency(e.target.value)} placeholder="MDCG" />
        </div>
        <div>
          <label className="block text-xs text-slate-300 mb-1">지역</label>
          <select className={input} style={{ backgroundColor: "#111827" }} value={region} onChange={(e) => setRegion(e.target.value as "EU" | "KR" | "MDSAP")}>
            <option value="EU">EU</option>
            <option value="KR">KR</option>
            <option value="MDSAP">MDSAP</option>
          </select>
        </div>
      </div>
      <div>
        <label className="block text-xs text-slate-300 mb-1">문서 유형</label>
        <input className={input} style={{ backgroundColor: "#111827" }} value={type} onChange={(e) => setType(e.target.value)} placeholder="Guidance" />
      </div>
      <div>
        <label className="block text-xs text-slate-300 mb-2">URL 유형</label>
        <div className="flex items-center gap-4 text-sm text-slate-200">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="radio" checked={urlType === "rss"} onChange={() => setUrlType("rss")} className="accent-indigo-500" />
            RSS
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="radio" checked={urlType === "html"} onChange={() => setUrlType("html")} className="accent-indigo-500" />
            HTML
          </label>
        </div>
      </div>
      {err && <p className="text-xs text-red-400">{err}</p>}
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="px-3 py-1.5 text-sm rounded-md border border-slate-600 text-slate-200 hover:bg-slate-800">취소</button>
        <button onClick={submit} disabled={saving}
          className="px-3 py-1.5 text-sm rounded-md bg-indigo-600 hover:bg-indigo-500 text-white font-medium disabled:opacity-50 flex items-center gap-2">
          {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          저장
        </button>
      </div>
    </div>
  );
}

function MetricCard({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-lg p-4 border border-slate-800" style={{ backgroundColor: "#111827" }}>
      <div className="text-2xl font-bold" style={{ color: accent ?? "#f8fafc" }}>{value}</div>
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
      <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full" style={{ backgroundColor: urgencyColor(item.urgency) }} />
      {item.is_new && (
        <span className="absolute top-3 right-3 px-2 py-0.5 rounded-full text-xs font-bold" style={{ color: "#22c55e", backgroundColor: "#052e16" }}>
          NEW
        </span>
      )}
      <div className="flex items-center gap-2 text-xs text-slate-400">
        <span>{item.agency}</span>
        <span>·</span>
        <span className={`px-2 py-0.5 rounded-full ${regionPill(item.region)}`}>{item.region}</span>
      </div>
      <div className="mt-2">
        <span className="text-xs px-2 py-0.5 rounded-full bg-slate-700 text-slate-300">{item.type}</span>
      </div>
      <h3 className="mt-2 text-sm font-medium text-white line-clamp-2 pr-16">{item.title}</h3>
      <p className="mt-1 text-xs text-slate-400 line-clamp-1">{item.summary}</p>
      <div className="mt-2 text-right text-xs text-slate-500">{item.date}</div>
    </div>
  );
}
