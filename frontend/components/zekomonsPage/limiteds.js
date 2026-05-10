import React, { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { createUseStyles } from "react-jss";
import { getItemDetails, searchCatalog } from "../../services/catalog";
import { getResaleData } from "../../services/economy";
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
  main: { width: "min(1180px, 100%)", margin: "0 auto", padding: 16, display: "grid", gap: 10 },
  filters: { display: "grid", gridTemplateColumns: "repeat(6, minmax(0, 1fr))", gap: 8, "@media (max-width: 980px)": { gridTemplateColumns: "repeat(2, minmax(0, 1fr))" } },
  filterBtn: { height: 34, border: "1px solid #353f4f", background: "#3d4652", color: "#fff", fontSize: 12, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "0 10px", cursor: "pointer" },
  search: { height: 36, border: "1px solid #3a465a", background: "#2b3546", color: "#dce7f6", padding: "0 12px", fontSize: 13 },
  pager: { display: "flex", alignItems: "center", gap: 6 },
  pagerBtn: { width: 28, height: 24, border: "1px solid #3a455a", background: "#2b3546", color: "#c9d7e9", display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 12 },
  grid: { display: "grid", gridTemplateColumns: "repeat(6, minmax(0, 1fr))", gap: 10, "@media (max-width: 1140px)": { gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }, "@media (max-width: 840px)": { gridTemplateColumns: "repeat(2, minmax(0, 1fr))" } },
  card: { border: "1px solid #3a455a", background: "#273242", textDecoration: "none", color: "inherit", display: "block" },
  name: { margin: 0, padding: "6px 8px", fontSize: 14, color: "#fff", fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", borderBottom: "1px solid #3a455a" },
  thumbWrap: { height: 108, borderBottom: "1px solid #3a455a", display: "flex", alignItems: "center", justifyContent: "center", background: "#1f2837" },
  thumb: { width: 86, height: 86, objectFit: "contain" },
  stats: { padding: 8, fontSize: 12, color: "#b9c6d8", lineHeight: 1.55 },
});

const formatNum = (n) => (typeof n === "number" && Number.isFinite(n) ? n.toLocaleString() : "-");

const ZekomonsLimitedsPage = () => {
  const s = useStyles();
  const [rows, setRows] = useState([]);
  const [query, setQuery] = useState("");
  const [assetType, setAssetType] = useState("all");
  const [sortType, setSortType] = useState(7);
  const [page, setPage] = useState(1);
  const [resaleMap, setResaleMap] = useState({});

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const result = await searchCatalog({ category: "Collectibles", subCategory: assetType === "all" ? null : assetType, query: query || null, limit: 72, sort: sortType, includeNotForSale: true });
        const ids = (result?.data || []).map((v) => v.id);
        const details = ids.length ? (await getItemDetails(ids)).data.data : [];
        if (!live) return;
        setRows(details || []);
        setPage(1);
      } catch (e) {
        if (live) setRows([]);
      }
    })();
    return () => { live = false; };
  }, [query, sortType, assetType]);

  const maxPages = Math.max(1, Math.ceil(rows.length / 24));
  const shown = useMemo(() => rows.slice((page - 1) * 24, page * 24), [rows, page]);

  useEffect(() => {
    if (!shown.length) return;
    let live = true;
    (async () => {
      const out = {};
      await Promise.all(shown.map(async (item) => { out[item.id] = await getResaleData({ assetId: item.id }).catch(() => null); }));
      if (live) setResaleMap((prev) => ({ ...prev, ...out }));
    })();
    return () => { live = false; };
  }, [shown]);

  return (
    <div className={s.page}>
      <ZekomonsHeader activeTab="limiteds" />
      <main className={s.main}>
        <section className={s.filters}>
          <button className={s.filterBtn} onClick={() => setSortType(7)}>Highest RAP</button>
          <button className={s.filterBtn} onClick={() => setAssetType(assetType === "all" ? "Accessories" : "all")}>Asset Types</button>
          <button className={s.filterBtn}>Demand</button>
          <button className={s.filterBtn}>Trend</button>
          <button className={s.filterBtn} onClick={() => setAssetType(assetType === "Faces" ? "all" : "Faces")}>Categories</button>
          <button className={s.filterBtn} onClick={() => setSortType(sortType === 6 ? 7 : 6)}>Range Filters</button>
        </section>
        <input className={s.search} placeholder="Search" value={query} onChange={(e) => setQuery(e.target.value)} />
        <div className={s.pager}>
          <button className={s.pagerBtn} onClick={() => setPage((p) => Math.max(1, p - 1))}>{"<"}</button>
          <button className={s.pagerBtn}>{page}</button>
          <button className={s.pagerBtn} onClick={() => setPage((p) => Math.min(maxPages, p + 1))}>{">"}</button>
        </div>
        <section className={s.grid}>
          {shown.map((item) => {
            const resale = resaleMap[item.id];
            const rap = resale?.recentAveragePrice;
            const bestPrice = item.lowestPrice || item.price || 0;
            return (
              <a key={item.id} className={s.card} href={`/zekomons/limiteds/${item.id}`}>
                <h3 className={s.name}>{item.name}</h3>
                <div className={s.thumbWrap}><Image className={s.thumb} src={`/thumbs/asset.ashx?assetId=${item.id}`} alt={item.name} width={86} height={86} unoptimized /></div>
                <div className={s.stats}>
                  Price: {formatNum(bestPrice)}<br />
                  RAP: {formatNum(rap)}<br />
                  Available: {formatNum(item.serialCount || 0)}<br />
                  Premium: {item.price ? "Yes" : "No"}
                </div>
              </a>
            );
          })}
        </section>
      </main>
    </div>
  );
};

export default ZekomonsLimitedsPage;
