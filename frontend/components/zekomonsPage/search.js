import React, { useEffect, useState } from "react";
import { createUseStyles } from "react-jss";
import PlayerHeadshot from "../playerHeadshot";
import { multiGetPresence } from "../../services/presence";
import { searchUsers } from "../../services/users";
import ZekomonsHeader from "./header";

const useStyles = createUseStyles({
  page: { width: "100%", minHeight: "100vh", background: "#1b2029", color: "#d7e3f3" },
  header: { minHeight: 64, borderBottom: "1px solid #2a3445", background: "#1f2a3a", display: "flex", alignItems: "center", padding: "8px 16px", gap: 12, "@media (max-width: 980px)": { flexWrap: "wrap" } },
  headerLeft: { display: "flex", alignItems: "center", gap: 16 },
  backLink: { textDecoration: "none", color: "#ffffff", fontSize: 14, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, background: "transparent", border: "none", borderRadius: 999, padding: "8px 6px 8px 0" },
  backArrow: { width: 26, height: 26, borderRadius: "50%", border: "none", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 14, background: "transparent" },
  brand: { fontSize: 24, fontWeight: 800, color: "#f5f8ff" },
  brandAccent: { color: "#2ca8ff" },
  nav: { display: "flex", gap: 28, alignItems: "center", marginLeft: "auto", "@media (max-width: 980px)": { width: "100%", marginLeft: 0, gap: 16, justifyContent: "center", overflowX: "auto", whiteSpace: "nowrap" } },
  navTile: { border: "none", background: "transparent", color: "#f4f8ff", display: "inline-flex", alignItems: "center", justifyContent: "center", textDecoration: "none", textAlign: "center", padding: "2px 0", opacity: 0.9, transition: "opacity .12s ease, color .12s ease", "&:hover": { opacity: 1, color: "#ffffff" } },
  navTileActive: { color: "#ffffff", opacity: 1, borderBottom: "2px solid #2ca8ff" },
  navLabel: { fontSize: 28, lineHeight: 1, fontWeight: 700, letterSpacing: 0.1, "@media (max-width: 1200px)": { fontSize: 22 }, "@media (max-width: 980px)": { fontSize: 16 } },
  main: { width: "min(1180px, 100%)", margin: "0 auto", padding: 16, display: "grid", gap: 0 },
  searchWrap: { background: "#3d444d", border: "1px solid #4d5561", padding: 8 },
  searchBar: { display: "grid", gridTemplateColumns: "1fr 32px", gap: 8, alignItems: "center" },
  searchInput: { height: 38, border: "1px solid #5e6672", background: "#f1f3f7", color: "#243041", borderRadius: 0, padding: "0 10px", fontSize: 22, minWidth: 0 },
  closeBtn: { width: 32, height: 32, border: "none", background: "transparent", color: "#fff", fontSize: 26, cursor: "pointer" },
  results: { border: "1px solid #3f4754", borderTop: "none", background: "#2b323c" },
  row: { display: "grid", gridTemplateColumns: "52px 1fr auto", gap: 10, alignItems: "center", padding: 10, textDecoration: "none", color: "#e7edf8", borderTop: "1px solid #3f4754", "&:hover": { background: "#333b47" } },
  rowThumb: { width: 42, height: 42, borderRadius: 4, border: "1px solid #4f5968", overflow: "hidden", background: "#1a2230" },
  rowName: { margin: 0, fontSize: 15, fontWeight: 700 },
  rowMeta: { margin: 0, fontSize: 12, color: "#9bb1ce" },
});

const rowsFrom = (d) => d?.UserSearchResults || d?.userSearchResults || [];
const shortAgo = (iso) => {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  const mins = Math.floor((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
};

const ZekomonsSearchPage = () => {
  const s = useStyles();
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState([]);
  const [presence, setPresence] = useState({});

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setRows([]);
      setPresence({});
      return;
    }
    const t = setTimeout(async () => {
      try {
        const data = await searchUsers({ keyword: q, limit: 20, offset: 0 });
        const r = rowsFrom(data);
        setRows(r);
        const ids = r.map((v) => v.UserId || v.userId).filter(Boolean);
        if (!ids.length) return setPresence({});
        const p = await multiGetPresence({ userIds: ids }).catch(() => []);
        const map = {};
        (p || []).forEach((entry) => { map[entry.userId] = entry; });
        setPresence(map);
      } catch (e) {
        setRows([]);
        setPresence({});
      }
    }, 220);
    return () => clearTimeout(t);
  }, [query]);

  return (
    <div className={s.page}>
      <ZekomonsHeader activeTab="search" />
      <main className={s.main}>
        <section className={s.searchWrap}>
          <div className={s.searchBar}>
            <input className={s.searchInput} placeholder="Search players" value={query} onChange={(e) => setQuery(e.target.value)} />
            <button className={s.closeBtn} onClick={() => setQuery("")}>x</button>
          </div>
          {rows.length > 0 && (
            <div className={s.results}>
              {rows.map((row) => {
                const userId = row.UserId || row.userId;
                const name = row.Name || row.name;
                return (
                  <a key={userId} href={`/zekomons?userId=${userId}`} className={s.row}>
                    <div className={s.rowThumb}><PlayerHeadshot id={userId} size={150} name={name} className={s.rowThumb} disableCache /></div>
                    <div><p className={s.rowName}>{name}</p><p className={s.rowMeta}>ID: {userId}</p></div>
                    <p className={s.rowMeta}>{shortAgo(presence[userId]?.lastOnline)}</p>
                  </a>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  );
};

export default ZekomonsSearchPage;
