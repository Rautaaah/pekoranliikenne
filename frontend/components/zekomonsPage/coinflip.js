import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createUseStyles } from "react-jss";
import ZekomonsHeader from "./header";
import { getCoinflipState, placeCoinflipBet } from "../../services/economy";

const useStyles = createUseStyles({
  page: { width: "100%", minHeight: "100vh", background: "#111a2a", color: "#d7e3f3" },
  main: { width: "min(1180px, 100%)", margin: "0 auto", padding: 16, display: "grid", gridTemplateColumns: "minmax(0, 2fr) minmax(280px, 1fr)", gap: 14, "@media (max-width: 980px)": { gridTemplateColumns: "1fr" } },
  heading: { margin: 0, color: "#fff", fontSize: 44, lineHeight: 1 },
  subHeading: { margin: "8px 0 0", color: "#9cb0cb", fontSize: 18 },
  block: { background: "#233047", border: "1px solid #34445f", borderRadius: 12, padding: 16 },
  notice: { marginTop: 12, background: "rgba(255,177,26,.08)", border: "1px solid rgba(255,177,26,.5)", color: "#f9d17a", borderRadius: 10, padding: "12px 14px", fontSize: 13, lineHeight: 1.45 },
  label: { display: "block", margin: "16px 0 8px", fontSize: 16, color: "#d8e7ff", fontWeight: 700 },
  amountInput: { width: "100%", height: 48, border: "1px solid #435776", borderRadius: 8, background: "#33435d", color: "#fff", fontSize: 24, padding: "0 12px" },
  chipRow: { display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 },
  chip: { border: "1px solid #4b5e7b", background: "#33435d", color: "#dce8fa", borderRadius: 8, height: 34, minWidth: 52, padding: "0 12px", cursor: "pointer", fontWeight: 700 },
  sideRow: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 16 },
  sideButton: { height: 56, borderRadius: 10, border: "1px solid #52627c", background: "#3a485f", color: "#f3f8ff", fontSize: 24, fontWeight: 800, cursor: "pointer" },
  sideActive: { borderColor: "#d9a300", background: "#f3a200", color: "#1d2430" },
  flipBtn: { width: "100%", marginTop: 16, height: 54, border: "none", borderRadius: 10, background: "linear-gradient(90deg, #4f46e5, #5b52f3)", color: "#fff", fontSize: 30, fontWeight: 800, cursor: "pointer" },
  flipBtnDisabled: { opacity: 0.6, cursor: "not-allowed" },
  result: { marginTop: 14, borderRadius: 10, padding: "12px 14px", background: "rgba(60,206,117,.12)", border: "1px solid rgba(60,206,117,.5)" },
  resultLoss: { background: "rgba(255,102,102,.10)", borderColor: "rgba(255,102,102,.5)" },
  resultTitle: { margin: 0, color: "#fff", fontSize: 24, fontWeight: 800 },
  resultSub: { margin: "5px 0 0", color: "#b8cce8", fontSize: 15 },
  hint: { marginTop: 10, color: "#a9bdd9", fontSize: 14 },
  error: { marginTop: 10, color: "#ff8f8f", fontSize: 14, fontWeight: 700 },
  statCard: { background: "#233047", border: "1px solid #34445f", borderRadius: 12, padding: 14 },
  balance: { fontSize: 30, fontWeight: 800, color: "#fff", display: "flex", alignItems: "center", gap: 8 },
  statTitle: { margin: 0, color: "#fff", fontSize: 28 },
  statRow: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #34445f", "&:last-child": { borderBottom: "none" } },
  statLabel: { color: "#b7c9e5", fontSize: 18 },
  statValue: { color: "#fff", fontSize: 20, fontWeight: 800 },
  statWin: { color: "#51e38a" },
  statLoss: { color: "#ff7f7f" },
  recentTitle: { margin: "0 0 10px", color: "#fff", fontSize: 28 },
  recentItem: { borderRadius: 10, border: "1px solid #34445f", padding: "10px 12px", marginBottom: 8, background: "#1f2b40" },
  recentTop: { display: "flex", justifyContent: "space-between", alignItems: "center", color: "#fff", fontSize: 16, fontWeight: 700 },
  recentMeta: { marginTop: 4, color: "#8fa6c7", fontSize: 12 },
});

const presetAmounts = [10, 25, 50, 100];

const formatSigned = (value) => {
  const n = Number(value) || 0;
  if (n > 0) return `+${n.toLocaleString()}`;
  return `${n.toLocaleString()}`;
};

const CoinflipPage = () => {
  const s = useStyles();
  const [state, setState] = useState(null);
  const [amount, setAmount] = useState("10");
  const [side, setSide] = useState("heads");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  const refresh = useCallback(async () => {
    const data = await getCoinflipState();
    setState(data);
  }, []);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const data = await getCoinflipState();
        if (!live) return;
        setState(data);
      } catch (e) {
        if (!live) return;
        setError(e?.message || "Failed to load coinflip.");
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  const parsedAmount = useMemo(() => {
    const n = Number(amount);
    if (!Number.isFinite(n)) return 0;
    return Math.floor(n);
  }, [amount]);

  const canFlip = !loading && parsedAmount >= 1 && parsedAmount <= 100 && state?.limits?.betsRemainingToday > 0;

  const onFlip = async () => {
    if (!canFlip) return;
    setLoading(true);
    setError("");
    try {
      const response = await placeCoinflipBet({ amount: parsedAmount, side });
      setResult({
        won: !!response.won,
        resultSide: response.resultSide,
        delta: response.delta,
      });
      setState(response.state || state);
    } catch (e) {
      setError(e?.message || "Flip failed.");
      await refresh().catch(() => {});
    } finally {
      setLoading(false);
    }
  };

  const recent = state?.recentFlips || [];
  const stats = state?.stats || {};
  const limits = state?.limits || {};

  return (
    <div className={s.page}>
      <ZekomonsHeader activeTab="coinflip" />
      <main className={s.main}>
        <section>
          <h1 className={s.heading}>Coin Flip</h1>
          <p className={s.subHeading}>
            Test your luck with a 50/50 coin flip. Max bet: {limits.maxBet ?? 100}. Limit: {limits.maxBetsPer24Hours ?? 5} bets every 24 hours.
          </p>
          <div className={s.notice}>
            This feature is for entertainment inside the game economy. Outcome is decided server-side using a secure random 50/50 flip.
          </div>

          <div className={s.block} style={{ marginTop: 12 }}>
            <label className={s.label}>Bet Amount</label>
            <input className={s.amountInput} value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ""))} />
            <div className={s.chipRow}>
              {presetAmounts.map((preset) => (
                <button key={preset} className={s.chip} onClick={() => setAmount(String(preset))}>{preset}</button>
              ))}
              <button className={s.chip} onClick={() => setAmount(String(limits.maxBet || 100))}>MAX</button>
            </div>

            <div className={s.sideRow}>
              <button className={`${s.sideButton} ${side === "heads" ? s.sideActive : ""}`} onClick={() => setSide("heads")}>Heads</button>
              <button className={`${s.sideButton} ${side === "tails" ? s.sideActive : ""}`} onClick={() => setSide("tails")}>Tails</button>
            </div>

            <button className={`${s.flipBtn} ${!canFlip ? s.flipBtnDisabled : ""}`} onClick={onFlip} disabled={!canFlip}>
              {loading ? "Flipping..." : `Flip for ${Math.max(1, parsedAmount).toLocaleString()} Robux`}
            </button>

            {result ? (
              <div className={`${s.result} ${!result.won ? s.resultLoss : ""}`}>
                <p className={s.resultTitle}>{result.won ? "You Won!" : "You Lost"}</p>
                <p className={s.resultSub}>
                  Result: {String(result.resultSide || "").toUpperCase()} ({formatSigned(result.delta)} R$)
                </p>
              </div>
            ) : null}

            <div className={s.hint}>
              Bets remaining today: {limits.betsRemainingToday ?? "-"} / {limits.maxBetsPer24Hours ?? "-"}
            </div>
            {error ? <div className={s.error}>{error}</div> : null}
          </div>
        </section>

        <aside>
          <div className={s.statCard}>
            <div className={s.balance}>R$ {(state?.balance?.robux ?? 0).toLocaleString()}</div>
          </div>

          <div className={s.statCard} style={{ marginTop: 12 }}>
            <h2 className={s.statTitle}>Your Stats</h2>
            <div className={s.statRow}><span className={s.statLabel}>Total Games</span><span className={s.statValue}>{stats.totalGames ?? 0}</span></div>
            <div className={s.statRow}><span className={s.statLabel}>Wins</span><span className={`${s.statValue} ${s.statWin}`}>{stats.wins ?? 0}</span></div>
            <div className={s.statRow}><span className={s.statLabel}>Losses</span><span className={`${s.statValue} ${s.statLoss}`}>{stats.losses ?? 0}</span></div>
            <div className={s.statRow}><span className={s.statLabel}>Win Rate</span><span className={s.statValue}>{stats.winRate ?? 0}%</span></div>
            <div className={s.statRow}><span className={s.statLabel}>Net Profit</span><span className={`${s.statValue} ${Number(stats.netProfit || 0) >= 0 ? s.statWin : s.statLoss}`}>{formatSigned(stats.netProfit || 0)}</span></div>
          </div>

          <div className={s.statCard} style={{ marginTop: 12 }}>
            <h2 className={s.recentTitle}>Recent Flips</h2>
            {recent.length === 0 ? (
              <p className={s.hint}>No flips yet.</p>
            ) : recent.map((entry, idx) => (
              <div key={`${entry.createdAt}-${idx}`} className={s.recentItem}>
                <div className={s.recentTop}>
                  <span>{entry.amount} robux ({entry.resultSide || "?"})</span>
                  <span className={Number(entry.delta) >= 0 ? s.statWin : s.statLoss}>{formatSigned(entry.delta)}</span>
                </div>
                <div className={s.recentMeta}>{new Date(entry.createdAt).toLocaleString()}</div>
              </div>
            ))}
          </div>
        </aside>
      </main>
    </div>
  );
};

export default CoinflipPage;
