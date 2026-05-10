import React, { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { createUseStyles } from "react-jss";
import Highcharts from "highcharts";
import HighchartsReact from "highcharts-react-official";
import { getCollectibleOwners } from "../../services/inventory";
import { getItemDetails, getItemUrl } from "../../services/catalog";
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
  wrap: { border: "1px solid #3a455a", background: "#273242" },
  top: { padding: 12, borderBottom: "1px solid #3a455a", display: "flex", gap: 12, alignItems: "center" },
  title: { margin: 0, fontSize: 40, color: "#fff", lineHeight: 1 },
  link: { color: "#5fb8ff", textDecoration: "none" },
  stats: { display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 8, padding: 12, borderBottom: "1px solid #3a455a", "@media (max-width: 840px)": { gridTemplateColumns: "repeat(2, minmax(0, 1fr))" } },
  stat: { border: "1px solid #3f4c62", background: "#313b4d", padding: 8 },
  tableWrap: { padding: 12 },
  pager: { display: "flex", alignItems: "center", gap: 6, marginBottom: 8 },
  pagerBtn: { height: 24, border: "1px solid #3a455a", background: "#2b3546", color: "#c9d7e9", display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 12, padding: "0 8px" },
  table: { width: "100%", borderCollapse: "collapse", "& th, & td": { borderTop: "1px solid #3a455a", padding: "8px 6px", fontSize: 12, color: "#d7e3f3", textAlign: "left" } },
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

const ZekomonsLimitedDetailsPage = ({ assetId }) => {
  const s = useStyles();
  const [item, setItem] = useState(null);
  const [resale, setResale] = useState(null);
  const [owners, setOwners] = useState([]);
  const [cursor, setCursor] = useState("");
  const [next, setNext] = useState(null);
  const [prev, setPrev] = useState(null);

  useEffect(() => {
    if (!assetId) return;
    (async () => {
      const details = await getItemDetails([assetId]).then((d) => d.data.data[0]).catch(() => null);
      const resaleData = await getResaleData({ assetId }).catch(() => null);
      setItem(details);
      setResale(resaleData);
    })();
  }, [assetId]);

  useEffect(() => {
    if (!assetId) return;
    (async () => {
      const page = await getCollectibleOwners({ assetId, cursor, sort: "Asc", limit: 25 }).catch(() => null);
      if (!page) return;
      setOwners(page.data || []);
      setNext(page.nextPageCursor);
      setPrev(page.previousPageCursor);
    })();
  }, [assetId, cursor]);

  const chartOptions = useMemo(() => {
    const points = resale?.priceDataPoints || [];
    return {
      chart: { type: "line", backgroundColor: "#273242", height: 320 },
      title: { text: "" },
      xAxis: { categories: points.map((p) => new Date(p.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })), labels: { style: { color: "#a9bbd4" } } },
      yAxis: { title: { text: "" }, labels: { style: { color: "#a9bbd4" } }, gridLineColor: "#3a455a" },
      legend: { itemStyle: { color: "#d7e3f3" } },
      plotOptions: { series: { marker: { enabled: true, radius: 3 } } },
      series: [{ name: "RAP", data: points.map((p) => p.value), color: "#22c55e" }],
      credits: { enabled: false },
    };
  }, [resale]);

  return (
    <div className={s.page}>
      <ZekomonsHeader activeTab="limiteds" />
      <main className={s.main}>
        <section className={s.wrap}>
          <div className={s.top}>
            {item && <Image src={`/thumbs/asset.ashx?assetId=${item.id}`} alt={item.name} width={120} height={120} unoptimized />}
            <div>
              <h1 className={s.title}>{item?.name || "Loading..."}</h1>
              <a className={s.link} href={item ? getItemUrl({ assetId: item.id, name: item.name }) : "#"}>Zekoro Limited</a>
            </div>
          </div>
          <div className={s.stats}>
            <div className={s.stat}>Best Price<br /><b>{formatNum(item?.lowestPrice || item?.price)}</b></div>
            <div className={s.stat}>RAP<br /><b>{formatNum(resale?.recentAveragePrice)}</b></div>
            <div className={s.stat}>Demand<br /><b>Live</b></div>
          </div>
          <div style={{ padding: 12, borderBottom: "1px solid #3a455a" }}>
            <HighchartsReact highcharts={Highcharts} options={chartOptions} />
          </div>
          <div className={s.tableWrap}>
            <div className={s.pager}>
              <button className={s.pagerBtn} disabled={!prev} onClick={() => prev && setCursor(prev)}>Prev</button>
              <button className={s.pagerBtn} disabled={!next} onClick={() => next && setCursor(next)}>Next</button>
            </div>
            <table className={s.table}>
              <thead><tr><th>Player</th><th>Serial</th><th>Last Online</th><th>UAID</th><th>Trading</th></tr></thead>
              <tbody>
                {owners.map((o) => (
                  <tr key={o.userAssetId}>
                    <td>{o.owner?.name || "Deleted / Private"}</td>
                    <td>{o.serialNumber || "-"}</td>
                    <td>{shortAgo(o.updated)}</td>
                    <td>{o.userAssetId}</td>
                    <td>{o.owner?.id ? <a className={s.link} href={`/Trade/TradeWindow.aspx?TradePartnerID=${o.owner.id}&ReturnUrl=${encodeURIComponent('/zekomons/limiteds/' + assetId)}`}>Trade</a> : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
};

export default ZekomonsLimitedDetailsPage;
