import React, { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/dist/client/router";
import { createUseStyles } from "react-jss";
import Highcharts from "highcharts";
import HighchartsReact from "highcharts-react-official";
import PlayerHeadshot from "../playerHeadshot";
import ZekomonsHeader from "./header";
import { getCollectibleInventory } from "../../services/inventory";
import { multiGetPresence } from "../../services/presence";
import { getResaleData } from "../../services/economy";
import { getMyInfo, getUserInfo, getZekomonsLeaderboardRank } from "../../services/users";

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
  main: { width: "min(1180px, 100%)", margin: "0 auto", padding: 16, display: "grid", gap: 12 },
  card: { background: "#232c3a", border: "1px solid #343f52" },
  profileGrid: { display: "grid", gridTemplateColumns: "300px minmax(0,1fr)", gap: 12, "@media (max-width: 980px)": { gridTemplateColumns: "1fr" } },
  profileHead: { padding: 14, borderBottom: "1px solid #344154" },
  profileName: { margin: 0, color: "#fff", fontSize: 30 },
  link: { color: "#5fb8ff", textDecoration: "none" },
  avatarWrap: { padding: 14, borderBottom: "1px solid #344154", display: "flex", justifyContent: "center" },
  avatar: { width: 180, height: 180, border: "1px solid #3b4a61", background: "#1a2230", borderRadius: 6 },
  metrics: { display: "grid", gridTemplateColumns: "1fr 1fr" },
  metric: { padding: "12px 14px", borderTop: "1px solid #344154" },
  metricLabel: { margin: 0, color: "#8ca1bc", fontSize: 12 },
  metricValue: { margin: "4px 0 0", color: "#f3f8ff", fontWeight: 700, fontSize: 22 },
  chartHead: { padding: 14, borderBottom: "1px solid #344154" },
  chartTitle: { margin: 0, color: "#fff", fontSize: 18 },
  chartBody: { padding: 12, height: 320 },
  sectionBar: { display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 },
  sectionTitle: { margin: "2px 0 0", color: "#fff", fontSize: 44, lineHeight: 1, "@media (max-width: 840px)": { fontSize: 30 } },
  sectionBadge: { height: 30, borderRadius: 999, border: "1px solid #2c84e1", background: "#2378d4", color: "#fff", fontWeight: 700, fontSize: 12, padding: "0 14px", display: "inline-flex", alignItems: "center", textDecoration: "none" },
  invTools: { display: "grid", gridTemplateColumns: "repeat(5, minmax(0,1fr)) minmax(200px, 1.4fr)", gap: 10, "@media (max-width: 1080px)": { gridTemplateColumns: "repeat(2, minmax(0,1fr))" } },
  invTool: { height: 40, border: "1px solid #3a465a", background: "#2b3546", color: "#dce7f6", padding: "0 10px", fontSize: 13, display: "flex", alignItems: "center" },
  invToolButton: { cursor: "pointer", userSelect: "none" },
  searchInput: { height: 40, border: "1px solid #3a465a", background: "#2b3546", color: "#dce7f6", padding: "0 12px", fontSize: 13 },
  grid: { display: "grid", gridTemplateColumns: "repeat(6, minmax(0, 1fr))", gap: 10, "@media (max-width: 1140px)": { gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }, "@media (max-width: 840px)": { gridTemplateColumns: "repeat(2, minmax(0, 1fr))" } },
  itemLink: { textDecoration: "none", color: "inherit", display: "block" },
  item: { border: "1px solid #3a455a", background: "#273242", transition: "transform .1s ease, border-color .1s ease", "&:hover": { borderColor: "#4a5d79", transform: "translateY(-1px)" } },
  itemName: { margin: 0, padding: "6px 8px", fontSize: 14, color: "#fff", fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", borderBottom: "1px solid #3a455a" },
  thumbWrap: { height: 108, borderBottom: "1px solid #3a455a", display: "flex", alignItems: "center", justifyContent: "center", background: "#1f2837", position: "relative" },
  stackBadge: { position: "absolute", right: 6, top: 6, background: "#2ea7ff", color: "#fff", borderRadius: 999, padding: "1px 7px", fontSize: 11, fontWeight: 700, lineHeight: 1.4 },
  thumb: { width: 86, height: 86, objectFit: "contain" },
  stats: { padding: 8, fontSize: 12, color: "#b9c6d8", lineHeight: 1.55 },
});

const formatNum = (n) => (typeof n === "number" && Number.isFinite(n) ? n.toLocaleString() : "-");
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

const ZekomonsPage = () => {
  const s = useStyles();
  const router = useRouter();
  const viewedUserId = useMemo(() => {
    const raw = router?.query?.userId;
    const parsed = Number(raw);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
  }, [router?.query?.userId]);

  const [profile, setProfile] = useState(null);
  const [presence, setPresence] = useState(null);
  const [profileInventory, setProfileInventory] = useState([]);
  const [leaderboardRank, setLeaderboardRank] = useState(null);
  const [stackHoardsEnabled, setStackHoardsEnabled] = useState(true);
  const [inventoryQuery, setInventoryQuery] = useState("");
  const [profileHistory, setProfileHistory] = useState({ rap: [], labels: [] });

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const me = await getMyInfo();
        const targetUserId = viewedUserId || me.id;
        const [info, p] = await Promise.all([
          getUserInfo({ userId: targetUserId }),
          multiGetPresence({ userIds: [targetUserId] }).catch(() => []),
        ]);
        const rankInfo = await getZekomonsLeaderboardRank({ userId: targetUserId }).catch(() => null);
        let cursor = "";
        let all = [];
        let runs = 0;
        while (runs < 15) {
          runs += 1;
          const pageData = await getCollectibleInventory({ userId: targetUserId, cursor, limit: 100 }).catch(() => null);
          if (!pageData) break;
          const rows = pageData.data || [];
          all = all.concat(rows);
          if (!pageData.nextPageCursor) break;
          cursor = pageData.nextPageCursor;
        }
        if (!live) return;
        setProfile(info);
        setPresence(Array.isArray(p) ? p[0] : null);
        setProfileInventory(all);
        setLeaderboardRank(rankInfo?.rank ?? null);
      } catch (e) {
        if (!live) return;
        setProfile(null);
        setPresence(null);
        setProfileInventory([]);
        setLeaderboardRank(null);
      }
    })();
    return () => { live = false; };
  }, [viewedUserId]);

  useEffect(() => {
    if (!profileInventory.length) {
      setProfileHistory({ rap: [], labels: [] });
      return;
    }
    let live = true;
    (async () => {
      const uniq = [...new Set(profileInventory.map((v) => v.assetId))].slice(0, 8);
      const resaleList = await Promise.all(uniq.map((assetId) => getResaleData({ assetId }).catch(() => null)));
      if (!live) return;
      const buckets = {};
      resaleList.forEach((resale) => {
        (resale?.priceDataPoints || []).forEach((p) => {
          const key = new Date(p.date).toISOString().slice(0, 10);
          if (!buckets[key]) buckets[key] = { rap: 0 };
          buckets[key].rap += Number(p.value || 0);
        });
      });
      const labels = Object.keys(buckets).sort();
      setProfileHistory({
        labels: labels.map((d) => new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" })),
        rap: labels.map((d) => Math.round(buckets[d].rap)),
      });
    })();
    return () => { live = false; };
  }, [profileInventory]);

  const statusText = useMemo(() => {
    const t = String(presence?.userPresenceType || "").toLowerCase();
    if (t === "online" || t === "ingame" || t === "instudio") return "Online";
    return shortAgo(presence?.lastOnline);
  }, [presence]);

  const inventoryItems = useMemo(() => {
    const normalizedQuery = inventoryQuery.trim().toLowerCase();
    const rows = profileInventory
      .filter((item) => !normalizedQuery || String(item?.name || "").toLowerCase().includes(normalizedQuery))
      .sort((a, b) => Number(b?.recentAveragePrice || 0) - Number(a?.recentAveragePrice || 0));

    if (!stackHoardsEnabled) {
      return rows.slice(0, 18).map((item) => ({
        ...item,
        stackCount: 1,
        primarySerial: item.serialNumber,
        primaryUserAssetId: item.userAssetId,
      }));
    }

    const byAsset = new Map();
    rows.forEach((item) => {
      const key = Number(item.assetId);
      if (!byAsset.has(key)) {
        byAsset.set(key, { ...item, stackCount: 1, primarySerial: item.serialNumber, primaryUserAssetId: item.userAssetId });
        return;
      }
      const existing = byAsset.get(key);
      existing.stackCount += 1;
    });

    return Array.from(byAsset.values()).slice(0, 18);
  }, [profileInventory, stackHoardsEnabled, inventoryQuery]);

  const userId = profile?.id || viewedUserId;

  return (
    <div className={s.page}>
      <ZekomonsHeader activeTab="profile" />

      <main className={s.main}>
        <section className={s.profileGrid}>
          <div className={s.card}>
            <div className={s.profileHead}>
              <h1 className={s.profileName}>{profile?.name || "..."}</h1>
              <a className={s.link} href={userId ? `/users/${userId}/profile` : "#"}>Zekoro Player Profile</a>
            </div>
            <div className={s.avatarWrap}>{userId ? <PlayerHeadshot id={userId} size={420} className={s.avatar} name={profile?.name} /> : <div className={s.avatar} />}</div>
            <div className={s.metrics}>
              <div className={s.metric}><p className={s.metricLabel}>RAP</p><p className={s.metricValue}>{formatNum(profile?.inventory_rap)}</p></div>
              <div className={s.metric}><p className={s.metricLabel}>Status</p><p className={s.metricValue}>{statusText}</p></div>
              <div className={s.metric}><p className={s.metricLabel}>Last Seen Online</p><p className={s.metricValue}>{shortAgo(presence?.lastOnline)}</p></div>
              <div className={s.metric}><p className={s.metricLabel}>Leaderboard Rank</p><p className={s.metricValue}>{leaderboardRank ? `#${formatNum(leaderboardRank)}` : "-"}</p></div>
            </div>
          </div>
          <div className={s.card}>
            <div className={s.chartHead}><h2 className={s.chartTitle}>Profile History</h2></div>
            <div className={s.chartBody}>
              {profileHistory.labels.length > 0 ? (
                <HighchartsReact
                  highcharts={Highcharts}
                  options={{
                    chart: { type: "line", backgroundColor: "#273242", height: 290 },
                    title: { text: "" },
                    xAxis: { categories: profileHistory.labels, labels: { style: { color: "#a9bbd4" } } },
                    yAxis: { title: { text: "" }, labels: { style: { color: "#a9bbd4" } }, gridLineColor: "#3a455a" },
                    legend: { itemStyle: { color: "#d7e3f3" } },
                    plotOptions: { series: { marker: { enabled: true, radius: 3 } } },
                    series: [{ name: "RAP", data: profileHistory.rap, color: "#22c55e" }],
                    credits: { enabled: false },
                  }}
                />
              ) : <p style={{ margin: "auto", color: "#9cb0cb" }}>No history data available yet.</p>}
            </div>
          </div>
        </section>

        <div className={s.sectionBar}>
          <h2 className={s.sectionTitle}>Inventory</h2>
          <a className={s.sectionBadge} href={userId ? `/users/${userId}/inventory` : "#"}>Inventory</a>
        </div>
        <div className={s.invTools}>
          <div className={s.invTool}>Sort: Highest RAP</div>
          <div className={s.invTool}>Filter: RAP</div>
          <div className={s.invTool}>Min</div>
          <div className={s.invTool}>Max</div>
          <div className={`${s.invTool} ${s.invToolButton}`} role="button" tabIndex={0} onClick={() => setStackHoardsEnabled((v) => !v)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setStackHoardsEnabled((v) => !v); }}>
            Stack Hoards: {stackHoardsEnabled ? "On" : "Off"}
          </div>
          <input className={s.searchInput} placeholder="Search inventory" value={inventoryQuery} onChange={(e) => setInventoryQuery(e.target.value)} />
        </div>
        <section className={s.grid}>
          {inventoryItems.map((item) => (
            <a key={`${item.assetId}-${item.primaryUserAssetId}`} className={s.itemLink} href={`/zekomons/limiteds/${item.assetId}`}>
              <article className={s.item}>
                <h3 className={s.itemName}>{item.name || `Asset ${item.assetId}`}</h3>
                <div className={s.thumbWrap}>
                  {item.stackCount > 1 && <span className={s.stackBadge}>x{item.stackCount}</span>}
                  <Image className={s.thumb} src={`/thumbs/asset.ashx?assetId=${item.assetId}`} alt={item.name || "asset"} width={86} height={86} unoptimized />
                </div>
                <div className={s.stats}>
                  RAP: {formatNum(item.recentAveragePrice)}<br />
                  Serial: {item.stackCount > 1 ? "-" : (item.primarySerial ? `#${item.primarySerial}` : "-")}<br />
                  UAID: {item.stackCount > 1 ? "Multiple" : item.primaryUserAssetId}
                </div>
              </article>
            </a>
          ))}
        </section>
      </main>
    </div>
  );
};

export default ZekomonsPage;
