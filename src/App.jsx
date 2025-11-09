import React, { useEffect, useState } from "react";

/*
 * OMO Marketing UNIT Sectional Meeting – Liquid Glass Web App (single file)
 * Fixes:
 *  - Remove BG button & helper text
 *  - Center-align TOP screen
 *  - Ensure post-transition screen is visible even without Tailwind (white text / min-height)
 *
 * NEWS SOURCE: https://www.holdings.toppan.com/ja/news/
 *  - Scrape titles/links; try to detect dates; last 10 days prioritized
 *  - Fetch order: window.NEWS_PROXY -> direct -> AllOrigins fallback
 */

// LocalStorage keys
const SESSIONS_KEY = "omo_sectional_sessions_v1";

export default function OMOSectionalMeetingApp() {
  const [view, setView] = useState("top");

  // ===== Editable states (meeting content) =====
  const [agenda, setAgenda] = useState("次回の議題をここに記入…\n・案件進捗\n・来週のイベント\n・課題共有");
  const [notifications, setNotifications] = useState(["伝達事項1…", "伝達事項2…", "伝達事項3…", "伝達事項4…", "伝達事項5…"]);
  const [mustDo, setMustDo] = useState({
    eLearning: "受講期限・対象コースなどを記入…",
    attendance: "勤怠の注意点・締め時間など…",
    regulation: "勤務時間レギュレーションの要点…",
    eoc: "EOC関連の連絡事項…",
  });
  const [shareTopics, setShareTopics] = useState("共有したいトピックを記入…\n参照資料やURLもどうぞ。");

  // ===== Modal editor =====
  const [modal, setModal] = useState({ open: false, title: "", value: "", onSave: (v) => { } });
  const openEditor = (title, value, onSave) => setModal({ open: true, title, value, onSave });
  const closeEditor = () => setModal({ open: false, title: "", value: "", onSave: (v) => { } });

  // ===== News =====
  const [news, setNews] = useState([]);
  const [newsError, setNewsError] = useState("");
  const [loadingNews, setLoadingNews] = useState(false);

  useEffect(() => {
    // Restore sessions
    try {
      const raw = localStorage.getItem(SESSIONS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.length) hydrate(parsed[0].data);
      }
    } catch (_) { }
  }, []);

  useEffect(() => {
    if (view === "main") fetchNews();
  }, [view]);

  // ===== Sessions (simple: export/import buttons kept via keyboard shortcuts if needed) =====
  function currentData() {
    return { agenda, notifications, mustDo, shareTopics };
  }
  function hydrate(data) {
    setAgenda(data?.agenda ?? "");
    setNotifications(Array.isArray(data?.notifications) ? data.notifications : ["", "", "", "", ""]);
    setMustDo(data?.mustDo ?? { eLearning: "", attendance: "", regulation: "", eoc: "" });
    setShareTopics(data?.shareTopics ?? "");
  }
  function saveLocal() {
    const list = [
      {
        id: "local-only",
        title: "last-saved",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        data: currentData(),
      },
    ];
    try {
      localStorage.setItem(SESSIONS_KEY, JSON.stringify(list));
      toast("保存しました");
    } catch (_) { }
  }
  function exportSessions() {
    const blob = new Blob([JSON.stringify([{ id: "export", data: currentData() }], null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `omo-sessions-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
  function importSessions(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        const first = Array.isArray(parsed) ? parsed[0] : null;
        if (first?.data) {
          hydrate(first.data);
          toast("インポートしました");
        } else {
          alert("JSON形式が不正です");
        }
      } catch (e) {
        alert("JSONとして読み込めませんでした");
      }
    };
    reader.readAsText(file);
  }

  // ===== News fetching =====
  async function fetchWithAllOrigins(url) {
    const r = await fetch("https://api.allorigins.win/get?url=" + encodeURIComponent(url));
    if (!r.ok) throw new Error("AllOrigins fetch failed");
    const data = await r.json();
    return data.contents;
  }
  async function fetchDirect(url) {
    const r = await fetch(url, { mode: "cors" });
    if (!r.ok) throw new Error("Direct fetch failed");
    return await r.text();
  }
  async function fetchViaProxy(url) {
    if (!window.NEWS_PROXY) throw new Error("No proxy defined");
    const r = await fetch(window.NEWS_PROXY + encodeURIComponent(url));
    if (!r.ok) throw new Error("Proxy fetch failed");
    return await r.text();
  }
  function parseNews(htmlText) {
    const doc = new DOMParser().parseFromString(htmlText, "text/html");
    const anchors = Array.from(doc.querySelectorAll("a"));
    const items = [];
    const reDate = /(20\d{2})[\.\/年](\d{1,2})[\.\/月](\d{1,2})/;
    const today = new Date();
    const tenDaysAgo = new Date(today.getTime() - 10 * 24 * 60 * 60 * 1000);

    anchors.forEach((a) => {
      const href = a.getAttribute("href") || "";
      const text = (a.textContent || "").trim();
      if (!href || !/\/ja\/news\//.test(href)) return;

      let ctx = text;
      let dateText = text;
      const parentText = a.closest("li, article, div, tr")?.textContent || "";
      if (parentText.length > text.length) {
        ctx = parentText.replace(/\s+/g, " ").trim();
        dateText = ctx;
      }
      const m = reDate.exec(dateText);
      let date = null;
      if (m) {
        const y = parseInt(m[1], 10);
        const mo = parseInt(m[2], 10) - 1;
        const d = parseInt(m[3], 10);
        date = new Date(y, mo, d);
      }

      const url = href.startsWith("http") ? href : new URL(href, "https://www.holdings.toppan.com").href;
      items.push({ title: text || "ニュース", url, date, ctx });
    });

    const map = new Map();
    items.forEach((it) => {
      if (!map.has(it.url)) map.set(it.url, it);
    });
    let unique = Array.from(map.values());

    const dated = unique.filter((it) => it.date && it.date >= tenDaysAgo);
    const undated = unique.filter((it) => !it.date || it.date < tenDaysAgo);

    dated.sort((a, b) => (b.date?.getTime() || 0) - (a.date?.getTime() || 0));
    const combined = [...dated, ...undated].slice(0, 20);
    return combined;
  }
  async function fetchNews() {
    try {
      setLoadingNews(true);
      setNewsError("");
      const src = "https://www.holdings.toppan.com/ja/news/";

      let html = "";
      if (window.NEWS_PROXY) {
        try {
          html = await fetchViaProxy(src);
        } catch (e) { }
      }
      if (!html) {
        try {
          html = await fetchDirect(src);
        } catch (e) { }
      }
      if (!html) {
        html = await fetchWithAllOrigins(src);
      }

      const parsed = parseNews(html);
      setNews(parsed);
    } catch (e) {
      console.error(e);
      setNewsError("ニュースの取得に失敗しました。NEWS_PROXY(Cloudflare Worker)の設定を推奨します。");
    } finally {
      setLoadingNews(false);
    }
  }

  // ===== UI helpers =====
  function toast(msg) {
    const el = document.createElement("div");
    el.textContent = msg;
    el.style.cssText =
      "position:fixed;bottom:24px;left:50%;transform:translateX(-50%);padding:10px 16px;border-radius:9999px;background:rgba(0,0,0,.6);color:#fff;z-index:60;font-size:12px;backdrop-filter:blur(6px)";
    document.body.appendChild(el);
    setTimeout(() => {
      el.remove();
    }, 1400);
  }

  return (
    <div className="min-h-screen w-full overflow-x-hidden relative" style={{ color: "#fff" }}>
      {/* Background: soft gradient blobs */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute -top-32 -left-20" style={blob(60, "to tr", "#f6d5e3", "#ffd6e5", "#ffe1b3")} />
        <div className="absolute -bottom-32 -right-20" style={blob(60, "to tr", "#ffe1b3", "#fff0c9", "#ffd6e5")} />
      </div>

      {view === "top" ? (
        <TopScreen onStart={() => setView("main")} />
      ) : (
        <MainScreen
          agenda={agenda}
          setAgenda={setAgenda}
          notifications={notifications}
          setNotifications={setNotifications}
          mustDo={mustDo}
          setMustDo={setMustDo}
          shareTopics={shareTopics}
          setShareTopics={setShareTopics}
          openEditor={openEditor}
          news={news}
          newsError={newsError}
          loadingNews={loadingNews}
          onBack={() => setView("top")}
          onSaveLocal={saveLocal}
          onExport={exportSessions}
          onImport={importSessions}
        />
      )}

      {/* Modal Editor */}
      {modal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0" style={{ background: "rgba(0,0,0,.4)", backdropFilter: "blur(4px)" }} onClick={closeEditor} />
          <div
            className="relative"
            style={{
              width: "min(92vw, 900px)",
              borderRadius: 24,
              background: "rgba(255,255,255,.18)",
              border: "1px solid rgba(255,255,255,.3)",
              padding: 20,
              boxShadow: "0 20px 60px rgba(0,0,0,.25)",
              animation: "pop .18s ease-out both",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
              <h3 style={{ fontSize: 18, fontWeight: 700 }}>{modal.title}</h3>
              <button onClick={closeEditor} style={chipBtn}>
                Close
              </button>
            </div>
            <textarea
              value={modal.value}
              onChange={(e) => setModal((m) => ({ ...m, value: e.target.value }))}
              style={{
                width: "100%",
                height: "40vh",
                borderRadius: 16,
                padding: 14,
                background: "rgba(255,255,255,.6)",
                border: "1px solid rgba(255,255,255,.4)",
                outline: "none",
                color: "#111",
              }}
            />
            <div style={{ marginTop: 14, display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button
                onClick={() => {
                  modal.onSave(modal.value);
                  closeEditor();
                }}
                style={goldBtn}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Minimal inline animations (if Tailwind not present) */}
      <style>{`
        @keyframes floaty { 0%{transform:translateY(0)} 50%{transform:translateY(-10px)} 100%{transform:translateY(0)} }
        @keyframes gradientX { 0%{background-position:0% 50%} 50%{background-position:100% 50%} 100%{background-position:0% 50%} }
        @keyframes pop { 0%{ transform: scale(.98); opacity:0 } 100%{ transform: scale(1); opacity:1 } }
        .animate-float { animation: floaty 6s ease-in-out infinite; }
      `}</style>
    </div>
  );
}

/* ---------- TOP screen (centered) ---------- */
function TopScreen({ onStart }) {
  const wrap = {
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    padding: 24,
  };
  const title = {
    fontWeight: 800,
    fontSize: "clamp(28px, 6vw, 64px)",
    lineHeight: 1.15,
    marginBottom: 24,
    color: "#fff",
    textShadow: "0 0 30px rgba(255, 200, 150, .25)",
    backgroundImage: "linear-gradient(90deg, #f6d5e3, #ffd6e5, #ffe1b3)",
    WebkitBackgroundClip: "text",
    colorTransparent: "transparent",
  };
  return (
    <div style={wrap}>
      <h1 className="animate-float" style={title}>
        OMO Marketing UNIT
        <br />
        Sectional Meeting
      </h1>
      <button style={goldBtn} onClick={onStart}>
        Let’s get started!
      </button>
    </div>
  );
}

/* ---------- Main screen ---------- */
function MainScreen({
  agenda,
  setAgenda,
  notifications,
  setNotifications,
  mustDo,
  setMustDo,
  shareTopics,
  setShareTopics,
  openEditor,
  news,
  newsError,
  loadingNews,
  onBack,
  onSaveLocal,
  onExport,
  onImport,
}) {
  return (
    <div
      className="max-w-6xl mx-auto px-4 md:px-6 pb-24 pt-6"
      style={{ minHeight: "100vh", color: "#fff" }} // visible even without Tailwind
    >
      {/* Back + save/export/import */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 16 }}>
        <button onClick={onBack} style={gradBtn}>Back to TOP</button>
        <button onClick={onSaveLocal} style={chipBtn}>上書き保存</button>
        <button onClick={onExport} style={chipBtn}>エクスポート</button>
        <label style={{ ...chipBtn, cursor: "pointer" }}>
          インポート
          <input
            type="file"
            accept="application/json"
            onChange={(e) => e.target.files?.[0] && onImport(e.target.files[0])}
            style={{ display: "none" }}
          />
        </label>
      </div>

      {/* Agenda */}
      <SectionTitle>Today's Agenda</SectionTitle>
      <LiquidCard>
        <div style={{ display: "flex", gap: 12 }}>
          <textarea
            value={agenda}
            onChange={(e) => setAgenda(e.target.value)}
            placeholder="議題を入力…"
            style={ta}
          />
          <button onClick={() => openEditor("Today's Agenda", agenda, (v) => setAgenda(v))} style={chipBtn}>
            Pop-up
          </button>
        </div>
      </LiquidCard>

      {/* News */}
      <div style={{ height: 16 }} />
      <SectionTitle>News Release</SectionTitle>
      <LiquidCard>
        {loadingNews ? (
          <p style={{ opacity: 0.7 }}>読み込み中…</p>
        ) : newsError ? (
          <p style={{ color: "#ffb3b3" }}>{newsError}</p>
        ) : news.length === 0 ? (
          <p style={{ opacity: 0.7 }}>直近10日分のニュースが取得できませんでした。</p>
        ) : (
          <ul style={{ display: "grid", gap: 8, padding: 0, margin: 0, listStyle: "none" }}>
            {news.map((n, i) => (
              <li key={i} style={{ display: "grid", gap: 4 }}>
                <a href={n.url} target="_blank" rel="noreferrer" style={{ textDecoration: "underline", color: "#ffe1b3" }}>
                  {n.date ? `${fmtDate(n.date)} ` : ""}{n.title || n.url}
                </a>
                <span style={{ fontSize: 12, opacity: 0.6, wordBreak: "break-all" }}>{n.url}</span>
              </li>
            ))}
          </ul>
        )}
        <p style={{ marginTop: 8, fontSize: 12, opacity: 0.6 }}>※ ソース: TOPPAN Holdings ニュースリリース</p>
      </LiquidCard>

      {/* Notifications */}
      <div style={{ height: 16 }} />
      <SectionTitle>Notifications</SectionTitle>
      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))" }}>
        {notifications.map((val, idx) => (
          <LiquidCard key={idx}>
            <div style={{ display: "flex", gap: 12 }}>
              <textarea
                value={val}
                onChange={(e) => setNotifications((arr) => arr.map((v, i) => (i === idx ? e.target.value : v)))}
                placeholder={`通知 ${idx + 1}…`}
                style={ta}
              />
              <div style={{ display: "grid", gap: 8 }}>
                <button
                  onClick={() =>
                    openEditor(`Notification ${idx + 1}`, val, (v) =>
                      setNotifications((arr) => arr.map((x, i) => (i === idx ? v : x)))
                    )
                  }
                  style={chipBtn}
                >
                  Pop-up
                </button>
                <button onClick={() => setNotifications((arr) => arr.filter((_, i) => i !== idx))} style={chipBtn}>
                  −
                </button>
              </div>
            </div>
          </LiquidCard>
        ))}
      </div>
      <div style={{ marginTop: 10 }}>
        <button onClick={() => setNotifications((arr) => [...arr, "新しい通知…"])} style={gradBtn}>
          ＋ Add window
        </button>
      </div>

      {/* A must-do */}
      <div style={{ height: 16 }} />
      <SectionTitle>A must-do</SectionTitle>
      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))" }}>
        <MustDoCard title="1. e-learning" value={mustDo.eLearning} onEdit={(v) => setMustDo((s) => ({ ...s, eLearning: v }))} openEditor={openEditor} />
        <MustDoCard title="2. 勤怠" value={mustDo.attendance} onEdit={(v) => setMustDo((s) => ({ ...s, attendance: v }))} openEditor={openEditor} />
        <MustDoCard title="3. 勤務時間のレギュレーション" value={mustDo.regulation} onEdit={(v) => setMustDo((s) => ({ ...s, regulation: v }))} openEditor={openEditor} />
        <MustDoCard title="4. EOC" value={mustDo.eoc} onEdit={(v) => setMustDo((s) => ({ ...s, eoc: v }))} openEditor={openEditor} />
      </div>

      {/* Share Topics */}
      <div style={{ height: 16 }} />
      <SectionTitle>Share Topics</SectionTitle>
      <LiquidCard>
        <div style={{ display: "flex", gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, marginBottom: 6, opacity: 0.7 }}>Today's Topic Presenter</div>
            <textarea
              value={shareTopics}
              onChange={(e) => setShareTopics(e.target.value)}
              placeholder="共有トピックを入力…"
              style={ta}
            />
          </div>
          <button onClick={() => openEditor("Share Topics", shareTopics, (v) => setShareTopics(v))} style={chipBtn}>
            Pop-up
          </button>
        </div>
      </LiquidCard>

      <footer style={{ marginTop: 24, fontSize: 12, opacity: 0.6, textAlign: "center" }}>© OMO Marketing UNIT</footer>
    </div>
  );
}

/* ---------- Small components & styles ---------- */
function MustDoCard({ title, value, onEdit, openEditor }) {
  return (
    <div style={{ position: "relative" }}>
      <div
        style={{
          position: "absolute",
          top: -10,
          left: 16,
          fontSize: 12,
          padding: "2px 8px",
          borderRadius: 999,
          background: "rgba(255,255,255,.6)",
          color: "#333",
          border: "1px solid rgba(255,255,255,.5)",
          boxShadow: "0 2px 8px rgba(0,0,0,.08)",
        }}
      >
        {title}
      </div>
      <LiquidCard>
        <div style={{ display: "flex", gap: 12 }}>
          <textarea value={value} onChange={(e) => onEdit(e.target.value)} style={ta} />
          <button onClick={() => openEditor(title, value, (v) => onEdit(v))} style={chipBtn}>
            Pop-up
          </button>
        </div>
      </LiquidCard>
    </div>
  );
}

function SectionTitle({ children }) {
  return (
    <h2
      style={{
        fontSize: "clamp(18px, 2.2vw, 24px)",
        fontWeight: 700,
        marginBottom: 12,
        backgroundImage: "linear-gradient(90deg, #f6cbdc, #ffd6e5, #ffe1b3)",
        WebkitBackgroundClip: "text",
        color: "transparent",
        backgroundSize: "200% 200%",
        animation: "gradientX 8s ease infinite",
      }}
    >
      {children}
    </h2>
  );
}

function LiquidCard({ children }) {
  return (
    <div
      style={{
        position: "relative",
        borderRadius: 24,
        padding: 16,
        background: "rgba(255,255,255,.18)",
        border: "1px solid rgba(255,255,255,.3)",
        boxShadow: "0 10px 40px rgba(255,180,80,.15), inset 0 1px 0 rgba(255,255,255,.2)",
      }}
    >
      {children}
    </div>
  );
}

/* ---------- Utilities ---------- */
function fmtDate(d) {
  try {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const da = String(d.getDate()).padStart(2, "0");
    return `${y}.${m}.${da}`;
  } catch (_) {
    return "";
  }
}
function blob(vw, dir, c1, c2, c3) {
  return {
    width: `${vw}vw`,
    height: `${vw}vw`,
    borderRadius: "50%",
    filter: "blur(64px)",
    opacity: 0.4,
    backgroundImage: `linear-gradient(${dir}, ${c1}, ${c2}, ${c3})`,
    animation: "floaty 12s ease-in-out infinite",
  };
}

/* ---------- Shared inline styles ---------- */
const goldBtn = {
  borderRadius: 9999,
  padding: "14px 28px",
  fontWeight: 700,
  border: "1px solid rgba(255,255,255,.4)",
  background: "linear-gradient(90deg, #f9e2a1, #ffd27a, #f7c46a, #ffd27a)",
  backgroundSize: "200% 100%",
  cursor: "pointer",
};
const gradBtn = {
  borderRadius: 9999,
  padding: "10px 20px",
  fontWeight: 600,
  border: "1px solid rgba(255,255,255,.4)",
  background: "linear-gradient(90deg, #f3c6d0, #f2b9d2, #f5c698, #ffd27a)",
  backgroundSize: "200% 100%",
  cursor: "pointer",
};
const chipBtn = {
  borderRadius: 16,
  padding: "8px 12px",
  background: "rgba(0,0,0,.2)",
  border: "1px solid rgba(255,255,255,.35)",
  cursor: "pointer",
};
const ta = {
  flex: 1,
  minHeight: 140,
  borderRadius: 16,
  padding: 14,
  background: "rgba(255,255,255,.6)",
  border: "1px solid rgba(255,255,255,.4)",
  outline: "none",
  color: "#111",
};
