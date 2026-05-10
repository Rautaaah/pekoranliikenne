import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createUseStyles } from "react-jss";
import ZekomonsHeader from "./header";
import { cashoutMinesGame, getMinesState, revealMinesTile, startMinesGame } from "../../services/economy";

const useStyles = createUseStyles({
  page: { width: "100%", minHeight: "100vh", background: "#111a2a", color: "#d7e3f3" },
  main: { width: "min(1180px, 100%)", margin: "0 auto", padding: 16, display: "grid", gridTemplateColumns: "minmax(0, 2fr) minmax(280px, 1fr)", gap: 14, "@media (max-width: 980px)": { gridTemplateColumns: "1fr" } },
  heading: { margin: 0, color: "#fff", fontSize: 44, lineHeight: 1 },
  subHeading: { margin: "8px 0 0", color: "#9cb0cb", fontSize: 18 },
  block: { background: "#233047", border: "1px solid #34445f", borderRadius: 12, padding: 16 },
  row: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, "@media (max-width: 700px)": { gridTemplateColumns: "1fr" } },
  label: { display: "block", margin: "0 0 8px", fontSize: 15, color: "#d8e7ff", fontWeight: 700 },
  input: { width: "100%", height: 44, border: "1px solid #435776", borderRadius: 8, background: "#33435d", color: "#fff", fontSize: 18, padding: "0 12px" },
  startBtn: { marginTop: 12, width: "100%", height: 48, border: "none", borderRadius: 10, background: "linear-gradient(90deg, #2563eb, #4f46e5)", color: "#fff", fontSize: 20, fontWeight: 800, cursor: "pointer" },
  board: { marginTop: 12, display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8 },
  tile: { height: 58, borderRadius: 8, border: "1px solid #485d7d", background: "#2f425f", color: "#cfe2ff", fontWeight: 800, fontSize: 20, cursor: "pointer" },
  tileSafe: { background: "#1d5f3f", borderColor: "#3cc780", color: "#eafff4" },
  tileMine: { background: "#6a2631", borderColor: "#f87171", color: "#fff0f0" },
  infoRow: { display: "flex", gap: 14, flexWrap: "wrap", marginTop: 10, color: "#bfd1ee", fontSize: 14 },
  cashoutBtn: { marginTop: 10, width: "100%", height: 46, border: "1px solid #3a8a5a", borderRadius: 10, background: "#1f7a4b", color: "#fff", fontSize: 18, fontWeight: 800, cursor: "pointer" },
  result: { marginTop: 12, borderRadius: 10, padding: "12px 14px", background: "rgba(60,206,117,.12)", border: "1px solid rgba(60,206,117,.5)" },
  resultLoss: { background: "rgba(255,102,102,.10)", borderColor: "rgba(255,102,102,.5)" },
  error: { marginTop: 10, color: "#ff8f8f", fontSize: 14, fontWeight: 700 },
  statCard: { background: "#233047", border: "1px solid #34445f", borderRadius: 12, padding: 14 },
  statTitle: { margin: 0, color: "#fff", fontSize: 28 },
  statRow: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #34445f", "&:last-child": { borderBottom: "none" } },
  statLabel: { color: "#b7c9e5", fontSize: 18 },
  statValue: { color: "#fff", fontSize: 20, fontWeight: 800 },
  statWin: { color: "#51e38a" },
  statLoss: { color: "#ff7f7f" },
});

const formatSigned = (value) => {
  const n = Number(value) || 0;
  if (n > 0) return `+${n.toLocaleString()}`;
  return `${n.toLocaleString()}`;
};

const MinesPage = () => {
  const s = useStyles();
  const [state, setState] = useState(null);
  const [amount, setAmount] = useState("10");
  const [minesCount, setMinesCount] = useState("3");
  const [game, setGame] = useState(null);
  const [revealed, setRevealed] = useState({});
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const data = await getMinesState();
    setState(data);
  }, []);

  useEffect(() => {
    refresh().catch((e) => setError(e?.message || "Failed to load mines."));
  }, [refresh]);

  const parsedAmount = useMemo(() => Math.floor(Number(amount) || 0), [amount]);
  const parsedMines = useMemo(() => Math.floor(Number(minesCount) || 0), [minesCount]);
  const canStart = !busy && !game && parsedAmount >= 1 && parsedAmount <= 100 && parsedMines >= 1 && parsedMines <= 24 && (state?.limits?.betsRemainingToday ?? 0) > 0;
  const canCashout = !!game && !busy && Object.keys(revealed).some((k) => revealed[k] === "safe");

  const onStart = async () => {
    if (!canStart) return;
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const res = await startMinesGame({ amount: parsedAmount, minesCount: parsedMines });
      setGame({ gameId: res.gameId, amount: res.amount, minesCount: res.minesCount, safeReveals: res.safeReveals, multiplier: res.currentMultiplier });
      setRevealed({});
      setState(res.state || state);
    } catch (e) {
      setError(e?.message || "Failed to start mines game.");
      await refresh().catch(() => {});
    } finally {
      setBusy(false);
    }
  };

  const onReveal = async (tileIndex) => {
    if (!game || busy || revealed[tileIndex]) return;
    setBusy(true);
    setError("");
    try {
      const res = await revealMinesTile({ gameId: game.gameId, tileIndex });
      if (res.hitMine) {
        const newRevealed = { ...revealed, [tileIndex]: "mine" };
        (res.revealedMineTiles || []).forEach((idx) => {
          newRevealed[idx] = "mine";
        });
        setRevealed(newRevealed);
        setResult({ won: false, delta: res.delta, payout: 0, multiplier: res.currentMultiplier });
        setGame(null);
      } else {
        setRevealed((prev) => ({ ...prev, [tileIndex]: "safe" }));
        if (res.roundFinished) {
          setResult({ won: !!res.won, delta: res.delta, payout: res.payout, multiplier: res.currentMultiplier });
          setGame(null);
        } else {
          setGame((prev) => prev ? { ...prev, safeReveals: res.safeReveals, multiplier: res.currentMultiplier } : prev);
        }
      }
      setState(res.state || state);
    } catch (e) {
      setError(e?.message || "Failed to reveal tile.");
      await refresh().catch(() => {});
    } finally {
      setBusy(false);
    }
  };

  const onCashout = async () => {
    if (!canCashout || !game) return;
    setBusy(true);
    setError("");
    try {
      const res = await cashoutMinesGame({ gameId: game.gameId });
      setResult({ won: true, delta: res.delta, payout: res.payout, multiplier: res.multiplier });
      setGame(null);
      setState(res.state || state);
    } catch (e) {
      setError(e?.message || "Failed to cash out.");
      await refresh().catch(() => {});
    } finally {
      setBusy(false);
    }
  };

  const stats = state?.stats || {};
  const limits = state?.limits || {};

  return (
    <div className={s.page}>
      <ZekomonsHeader activeTab="mines" />
      <main className={s.main}>
        <section>
          <h1 className={s.heading}>Mines</h1>
          <p className={s.subHeading}>Pick safe tiles, avoid mines, and cash out anytime.</p>
          <div className={s.block} style={{ marginTop: 12 }}>
            <div className={s.row}>
              <div>
                <label className={s.label}>Bet Amount</label>
                <input className={s.input} value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ""))} disabled={!!game || busy} />
              </div>
              <div>
                <label className={s.label}>Mines Count</label>
                <input className={s.input} value={minesCount} onChange={(e) => setMinesCount(e.target.value.replace(/[^\d]/g, ""))} disabled={!!game || busy} />
              </div>
            </div>
            <button className={s.startBtn} onClick={onStart} disabled={!canStart}>{busy && !game ? "Starting..." : "Start Game"}</button>
            <div className={s.infoRow}>
              <span>Remaining today: {limits.betsRemainingToday ?? 0} / {limits.maxBetsPer24Hours ?? 0}</span>
              {game ? <span>Current Multiplier: x{Number(game.multiplier || 0).toFixed(4)}</span> : null}
              {game ? <span>Safe Reveals: {game.safeReveals}</span> : null}
            </div>

            <div className={s.board}>
              {Array.from({ length: 25 }).map((_, idx) => {
                const status = revealed[idx];
                return (
                  <button
                    key={idx}
                    className={`${s.tile} ${status === "safe" ? s.tileSafe : ""} ${status === "mine" ? s.tileMine : ""}`}
                    onClick={() => onReveal(idx)}
                    disabled={!game || busy || !!status}
                  >
                    {status === "safe" ? "✓" : status === "mine" ? "✕" : "?"}
                  </button>
                );
              })}
            </div>

            <button className={s.cashoutBtn} onClick={onCashout} disabled={!canCashout}>
              {busy && game ? "Processing..." : "Cash Out"}
            </button>

            {result ? (
              <div className={`${s.result} ${!result.won ? s.resultLoss : ""}`}>
                <b>{result.won ? "You cashed out!" : "You hit a mine!"}</b>
                <div>Delta: {formatSigned(result.delta)} R$ {result.won ? `(Payout: ${Number(result.payout || 0).toLocaleString()})` : ""}</div>
                <div>Multiplier: x{Number(result.multiplier || 0).toFixed(4)}</div>
              </div>
            ) : null}

            {error ? <div className={s.error}>{error}</div> : null}
          </div>
        </section>
        <aside>
          <div className={s.statCard}>
            <h2 className={s.statTitle}>Mines Stats</h2>
            <div className={s.statRow}><span className={s.statLabel}>Total Games</span><span className={s.statValue}>{stats.totalGames ?? 0}</span></div>
            <div className={s.statRow}><span className={s.statLabel}>Wins</span><span className={`${s.statValue} ${s.statWin}`}>{stats.wins ?? 0}</span></div>
            <div className={s.statRow}><span className={s.statLabel}>Losses</span><span className={`${s.statValue} ${s.statLoss}`}>{stats.losses ?? 0}</span></div>
            <div className={s.statRow}><span className={s.statLabel}>Win Rate</span><span className={s.statValue}>{stats.winRate ?? 0}%</span></div>
            <div className={s.statRow}><span className={s.statLabel}>Net Profit</span><span className={`${s.statValue} ${Number(stats.netProfit || 0) >= 0 ? s.statWin : s.statLoss}`}>{formatSigned(stats.netProfit || 0)}</span></div>
          </div>
        </aside>
      </main>
    </div>
  );
};

export default MinesPage;
