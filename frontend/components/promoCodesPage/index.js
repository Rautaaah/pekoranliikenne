import React, { useState } from "react";
import { createUseStyles } from "react-jss";
import AuthenticationStore from "../../stores/authentication";
import { redeemPromocode } from "../../services/promocodes";

const useStyles = createUseStyles({
  page: {
    maxWidth: "860px",
    margin: "26px auto 48px",
    background: "#fff",
  },
  title: {
    margin: "0 0 18px 0",
    color: "#2f3744",
    fontSize: "31px",
    lineHeight: 1.15,
    fontWeight: 700,
    "@media (max-width: 767px)": {
      fontSize: "26px",
    },
  },
  content: {
    display: "grid",
    gridTemplateColumns: "1.45fr 0.95fr",
    gap: "0",
    "@media (max-width: 991px)": {
      gridTemplateColumns: "1fr",
    },
  },
  leftColumn: {
    padding: "0 34px 0 0",
    minHeight: "180px",
    "@media (max-width: 991px)": {
      padding: "0 0 22px 0",
    },
  },
  rightColumn: {
    padding: "22px 0 0 34px",
    borderLeft: "1px solid #c9c9c9",
    minHeight: "180px",
    "@media (max-width: 991px)": {
      borderLeft: "none",
      borderTop: "1px solid #c9c9c9",
      padding: "24px 0 0 0",
    },
  },
  sectionHeading: {
    color: "#222",
    fontSize: "15px",
    fontWeight: 700,
    marginBottom: "6px",
  },
  paragraph: {
    color: "#222",
    fontSize: "16px",
    lineHeight: 1.55,
    marginBottom: "22px",
  },
  sideLabel: {
    color: "#222",
    fontSize: "15px",
    fontWeight: 700,
    marginBottom: "16px",
  },
  formRow: {
    display: "flex",
    alignItems: "center",
    gap: "2px",
    "@media (max-width: 575px)": {
      alignItems: "stretch",
      flexDirection: "column",
      gap: "8px",
    },
  },
  input: {
    width: "156px",
    height: "27px",
    border: "1px solid #8b8b8b",
    borderRadius: 0,
    boxShadow: "none",
    fontSize: "14px",
    textTransform: "uppercase",
    padding: "3px 6px",
    "&:focus": {
      borderColor: "#8b8b8b",
      boxShadow: "none",
    },
    "@media (max-width: 575px)": {
      width: "100%",
    },
  },
  button: {
    minWidth: "67px",
    height: "27px",
    padding: "0 12px",
    border: "1px solid #006d00",
    borderRadius: 0,
    background: "#00a000",
    color: "#fff",
    fontWeight: 700,
    fontSize: "14px",
    lineHeight: "25px",
    "&:hover": {
      background: "#009100",
      color: "#fff",
    },
    "&:focus": {
      boxShadow: "none",
    },
    "&:disabled": {
      background: "#7eb67e",
      borderColor: "#5b8c5b",
      color: "#f5f5f5",
    },
  },
  alert: {
    marginTop: "18px",
    maxWidth: "760px",
  },
  rewardCard: {
    marginTop: "12px",
    padding: "16px",
    borderRadius: 0,
    background: "#f8f8f8",
    border: "1px solid #cfcfcf",
  },
  rewardTitle: {
    fontWeight: 700,
    color: "#333",
    marginBottom: "6px",
  },
  loginState: {
    marginTop: "16px",
    color: "#666",
    fontSize: "14px",
  },
});

const PromoCodesPage = () => {
  const s = useStyles();
  const auth = AuthenticationStore.useContainer();
  const [promoCode, setPromoCode] = useState("");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState(null);

  const onSubmit = async (e) => {
    e.preventDefault();
    const normalized = promoCode.trim().toUpperCase();
    if (!normalized) {
      setResult({
        success: false,
        errorMsg: "Enter a promo code first.",
        successMsg: null,
        reward: null,
      });
      return;
    }

    setPending(true);
    try {
      const response = await redeemPromocode(normalized);
      setResult(response);
      if (response.success) {
        setPromoCode("");
      }
    } catch (err) {
      setResult({
        success: false,
        errorMsg: err.message || "Failed to redeem promo code.",
        successMsg: null,
        reward: null,
      });
    } finally {
      setPending(false);
    }
  };

  return (
    <div className={s.page}>
      <h1 className={s.title}>Redeem Zekoro Promotions</h1>

      <div className={s.content}>
        <div className={s.leftColumn}>
          <div className={s.sectionHeading}>How to Use</div>
          <p className={s.paragraph}>
            Have you received a Zekoro promotional code from one of our many events or give-aways?
          </p>
          <p className={s.paragraph}>
            This is the place to claim your goods. Enter the promotional code in the section to the right.
          </p>
          <p className={s.paragraph}>
            Promotional codes may expire, or only be active for a short period of time.
          </p>
        </div>

        <div className={s.rightColumn}>
          <div className={s.sideLabel}>Enter Your Code:</div>
          <form onSubmit={onSubmit}>
            <div className={s.formRow}>
              <input
                className={`form-control ${s.input}`}
                type="text"
                value={promoCode}
                onChange={(e) => setPromoCode(e.currentTarget.value)}
                disabled={pending}
                maxLength={64}
              />
              <button className={`btn ${s.button}`} type="submit" disabled={pending}>
                {pending ? "..." : "Redeem"}
              </button>
            </div>
          </form>
          <div className={s.loginState}>
            {auth.isPending
              ? "Checking your session..."
              : auth.isAuthenticated
                ? `Signed in as ${auth.username}.`
                : "You must be signed in to redeem a code."}
          </div>
        </div>
      </div>

      {result ? (
        <div className={s.alert}>
          <div className={`alert ${result.success ? "alert-success" : "alert-danger"} mb-0`} role="alert">
            {result.success ? result.successMsg : result.errorMsg}
          </div>
          {result.success && result.reward ? (
            <div className={s.rewardCard}>
              <div className={s.rewardTitle}>Reward Added</div>
              {result.reward.assetId ? (
                <p className="mb-1">
                  Item: <a href={`/catalog/${result.reward.assetId}/--`}>{result.reward.assetName || `Asset #${result.reward.assetId}`}</a>
                </p>
              ) : null}
              {result.reward.robux ? <p className="mb-0">Robux: {result.reward.robux}</p> : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};

export default PromoCodesPage;
