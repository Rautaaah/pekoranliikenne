import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/dist/client/router";
import { createUseStyles } from "react-jss";
import PlayerHeadshot from "../playerHeadshot";
import ZekomonsHeader from "./header";
import { getZekomonsLeaderboard } from "../../services/users";

const useStyles = createUseStyles({
  page: { width: "100%", minHeight: "100vh", background: "radial-gradient(circle at 20% 10%, #233048, #1b2029 42%, #151a22 100%)", color: "#d7e3f3" },
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
  main: { width: "min(1220px, 100%)", margin: "0 auto", padding: 16 },
  pager: { display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 10 },
  pagerBtn: { width: 30, height: 30, background: "#2a313f", color: "#d9e6f8", border: "1px solid #394353", borderRadius: 4, fontSize: 13, display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer", textDecoration: "none" },
  pagerBtnActive: { background: "#1c222d", color: "#ffffff", border: "1px solid #4a566b" },
  pagerDots: { width: 30, height: 30, display: "inline-flex", alignItems: "center", justifyContent: "center", color: "#a9b8cc" },
  grid: { display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 10, "@media (max-width: 1100px)": { gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }, "@media (max-width: 720px)": { gridTemplateColumns: "repeat(2, minmax(0, 1fr))" } },
  card: { background: "#2f3743", border: "1px solid #3b4556", boxShadow: "0 2px 6px rgba(0,0,0,.35)", textDecoration: "none", color: "inherit", display: "block" },
  cardName: { margin: 0, padding: "6px 10px", background: "#2a313b", borderBottom: "1px solid #3b4656", fontSize: 24, fontWeight: 700, lineHeight: 1.1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", "@media (max-width: 920px)": { fontSize: 19 }, "@media (max-width: 620px)": { fontSize: 16 } },
  avatarWrap: { height: 180, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(35,43,55,.55)", borderBottom: "1px solid #3b4656" },
  avatar: { width: 124, height: 124 },
  stats: { padding: "10px 10px 8px" },
  row: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
  statLabel: { color: "#91a3bb", fontSize: 16, "@media (max-width: 920px)": { fontSize: 14 }, "@media (max-width: 620px)": { fontSize: 12 } },
  statValue: { color: "#ffffff", fontSize: 20, fontWeight: 700, "@media (max-width: 920px)": { fontSize: 17 }, "@media (max-width: 620px)": { fontSize: 14 } },
  rapValue: { color: "#4be27a" },
  empty: { marginTop: 30, color: "#a9b8cc", fontSize: 14 },
});

const PAGE_SIZE = 15;
const formatRobux = (v) => `R$ ${(Number(v) || 0).toLocaleString()}`;

const paginationItems = (page, totalPages) => {
  const output = [1];
  const start = Math.max(2, page - 2);
  const end = Math.min(totalPages - 1, page + 2);
  if (start > 2) output.push("...");
  for (let i = start; i <= end; i++) output.push(i);
  if (end < totalPages - 1) output.push("...");
  if (totalPages > 1) output.push(totalPages);
  return output;
};

const ZekomonsLeaderboardPage = () => {
  const s = useStyles();
  const router = useRouter();
  const initial = Number(router?.query?.page);
  const [page, setPage] = useState(Number.isSafeInteger(initial) && initial > 0 ? initial : 1);
  const [rows, setRows] = useState([]);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    const qPage = Number(router?.query?.page);
    if (Number.isSafeInteger(qPage) && qPage > 0 && qPage !== page) {
      setPage(qPage);
    }
  }, [router?.query?.page]);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const response = await getZekomonsLeaderboard({ page, limit: PAGE_SIZE });
        if (!live) return;
        setRows(response?.data || []);
        setTotalPages(Math.max(1, Number(response?.totalPages || 1)));
      } catch (e) {
        if (!live) return;
        setRows([]);
        setTotalPages(1);
      }
    })();
    return () => {
      live = false;
    };
  }, [page]);

  const chips = useMemo(() => paginationItems(page, totalPages), [page, totalPages]);
  const goTo = (nextPage) => {
    const clamped = Math.max(1, Math.min(totalPages, nextPage));
    setPage(clamped);
    router.replace({ pathname: "/zekomons/leaderboard", query: clamped === 1 ? {} : { page: clamped } }, undefined, { shallow: true });
  };

  return (
    <div className={s.page}>
      <ZekomonsHeader activeTab="leaderboard" />
      <main className={s.main}>
        <div className={s.pager}>
          <button className={s.pagerBtn} onClick={() => goTo(page - 1)} disabled={page <= 1}>{"<"}</button>
          {chips.map((item, idx) =>
            item === "..." ? (
              <span className={s.pagerDots} key={`dot-${idx}`}>...</span>
            ) : (
              <button
                className={`${s.pagerBtn} ${item === page ? s.pagerBtnActive : ""}`}
                key={item}
                onClick={() => goTo(item)}
              >
                {item}
              </button>
            )
          )}
          <button className={s.pagerBtn} onClick={() => goTo(page + 1)} disabled={page >= totalPages}>{">"}</button>
        </div>

        {rows.length === 0 ? (
          <p className={s.empty}>No leaderboard entries found.</p>
        ) : (
          <section className={s.grid}>
            {rows.map((entry) => (
              <a key={entry.userId} className={s.card} href={`/zekomons?userId=${entry.userId}`}>
                <h3 className={s.cardName}>{entry.username}</h3>
                <div className={s.avatarWrap}>
                  <PlayerHeadshot id={entry.userId} size={420} className={s.avatar} name={entry.username} disableCache />
                </div>
                <div className={s.stats}>
                  <div className={s.row}>
                    <span className={s.statLabel}>Rank</span>
                    <span className={s.statValue}>#{entry.rank}</span>
                  </div>
                  <div className={s.row}>
                    <span className={s.statLabel}>RAP</span>
                    <span className={`${s.statValue} ${s.rapValue}`}>{formatRobux(entry.inventoryRap)}</span>
                  </div>
                </div>
              </a>
            ))}
          </section>
        )}
      </main>
    </div>
  );
};

export default ZekomonsLeaderboardPage;
