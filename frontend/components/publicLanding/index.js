import React, { useEffect, useState } from "react";
import { createUseStyles } from "react-jss";
import AuthenticationStore from "../../stores/authentication";
import { getBaseUrl2 } from "../../lib/request";
import { getSignupMetadata, login, signup } from "../../services/auth";

const turnstileSiteKey = "0x4AAAAAAC2dQD0M8-hT9n_I";

const useStyles = createUseStyles({
    "@keyframes heroGlowPulse": {
        "0%": {
            opacity: 0.52,
            transform: "scale(0.985)",
            boxShadow: "0 0 28px rgba(168, 220, 255, 0.22), 0 0 56px rgba(119, 192, 255, 0.14)",
        },
        "50%": {
            opacity: 0.95,
            transform: "scale(1.015)",
            boxShadow: "0 0 42px rgba(208, 239, 255, 0.4), 0 0 84px rgba(120, 198, 255, 0.24)",
        },
        "100%": {
            opacity: 0.52,
            transform: "scale(0.985)",
            boxShadow: "0 0 28px rgba(168, 220, 255, 0.22), 0 0 56px rgba(119, 192, 255, 0.14)",
        },
    },
    page: {
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        backgroundColor: "#0d2231",
        backgroundImage: "linear-gradient(rgba(5, 18, 30, 0.48), rgba(5, 18, 30, 0.6)), url('/img/landing/signupbackground.png')",
        backgroundRepeat: "no-repeat",
        backgroundSize: "cover",
        backgroundPosition: "center center",
        color: "#fff7f2",
    },
    topBar: {
        background: "transparent",
        boxShadow: "none",
    },
    topBarInner: {
        width: "100%",
        maxWidth: 1920,
        margin: "0 auto",
        padding: "2px 16px 0",
        display: "flex",
        position: "relative",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 8,
        flexWrap: "wrap",
    },
    cornerIcon: {
        width: 58,
        height: 58,
        objectFit: "contain",
        filter: "drop-shadow(0 4px 10px rgba(0,0,0,0.25))",
        position: "absolute",
        left: 14,
        top: 2,
    },
    loginCluster: {
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
        gap: 0,
        marginTop: 10,
        marginLeft: "auto",
        minWidth: "min(100%, 720px)",
    },
    loginForm: {
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-end",
        gap: 10,
        flexWrap: "wrap",
        width: "100%",
    },
    input: {
        width: 138,
        height: 40,
        borderRadius: 4,
        border: "1px solid rgba(86, 147, 214, 0.35)",
        background: "#eef3ff",
        color: "#2f231e",
        padding: "0 13px",
        fontSize: 15,
        outline: "none",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.3)",
        "&::placeholder": {
            color: "#7b7f8e",
        },
        "&:focus": {
            borderColor: "#4ea1ff",
            boxShadow: "0 0 0 3px rgba(78, 161, 255, 0.22)",
        },
    },
    loginButton: {
        height: 40,
        minWidth: 88,
        border: 0,
        borderRadius: 4,
        background: "#167dff",
        color: "#fff",
        fontSize: 15,
        fontWeight: 700,
        padding: "0 18px",
        cursor: "pointer",
        transition: "background 120ms ease",
        "&:hover": {
            background: "#3190ff",
        },
        "&:disabled": {
            opacity: 0.65,
            cursor: "default",
        },
    },
    loginLinks: {
        display: "flex",
        gap: 14,
        flexWrap: "wrap",
        justifyContent: "flex-end",
        fontSize: 13,
        lineHeight: 1.2,
        marginTop: -1,
        color: "#fff4ef",
        "& a": {
            color: "#fff4ef",
            textDecoration: "none",
        },
        "& a:hover": {
            textDecoration: "underline",
        },
    },
    loginFeedback: {
        fontSize: 14,
        color: "#ffe6de",
        textAlign: "right",
        width: "100%",
    },
    hero: {
        flex: 1,
        width: "100%",
        maxWidth: 1440,
        margin: "0 auto",
        padding: "70px 28px 36px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 56,
    },
    heroPanel: {
        flex: "1 1 58%",
        minHeight: 420,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        paddingLeft: 40,
        paddingRight: 24,
    },
    brandBlock: {
        display: "flex",
        flex: "1 1 auto",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "left",
        width: "100%",
        maxWidth: 620,
    },
    brandImage: {
        width: "100%",
        maxWidth: 680,
        objectFit: "contain",
        filter: "drop-shadow(0 20px 34px rgba(0,0,0,0.36))",
    },
    signupCard: {
        width: "100%",
        maxWidth: 360,
        background: "rgba(255,255,255,0.97)",
        color: "#332723",
        borderRadius: 12,
        padding: "30px 26px 16px",
        boxShadow: "0 30px 72px rgba(6, 15, 24, 0.34), 0 10px 24px rgba(0, 0, 0, 0.18), inset 0 1px 0 rgba(255,255,255,0.72)",
        border: "1px solid rgba(255,255,255,0.58)",
    },
    signupHeading: {
        margin: "0 0 22px",
        textAlign: "center",
        fontSize: 18,
        fontWeight: 800,
        letterSpacing: 0.4,
        textTransform: "uppercase",
        textShadow: "0 1px 0 rgba(255,255,255,0.38)",
    },
    discordButton: {
        width: "100%",
        height: 44,
        border: 0,
        borderRadius: 6,
        background: "#5865f2",
        color: "#fff",
        fontWeight: 700,
        fontSize: 16,
        cursor: "pointer",
        marginBottom: 18,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        transition: "background 120ms ease",
        boxShadow: "0 12px 26px rgba(57, 72, 211, 0.2), inset 0 1px 0 rgba(255,255,255,0.2)",
        "&:hover": {
            background: "#6772f4",
        },
        "&:disabled": {
            background: "#8e95a2",
            color: "#eef2f8",
            cursor: "default",
        },
    },
    discordIcon: {
        width: 18,
        height: 18,
        fill: "#fff",
        flexShrink: 0,
    },
    signupInput: {
        width: "100%",
        height: 42,
        borderRadius: 5,
        border: "1px solid #cfd5de",
        background: "#fff",
        color: "#2e2623",
        padding: "0 13px",
        fontSize: 15,
        marginBottom: 10,
        outline: "none",
        boxShadow: "0 6px 14px rgba(14, 26, 40, 0.06), inset 0 1px 0 rgba(255,255,255,0.75)",
        "&::placeholder": {
            color: "#828692",
        },
        "&:focus": {
            borderColor: "#4ea1ff",
            boxShadow: "0 0 0 3px rgba(78, 161, 255, 0.18)",
        },
        "&:disabled": {
            background: "#f2f2f2",
            color: "#8b8b8b",
            cursor: "default",
        },
    },
    signupButton: {
        width: "100%",
        height: 44,
        border: 0,
        borderRadius: 6,
        background: "#167dff",
        color: "#fff",
        fontWeight: 800,
        fontSize: 16,
        cursor: "pointer",
        transition: "background 120ms ease",
        boxShadow: "0 16px 30px rgba(23, 96, 197, 0.24), inset 0 1px 0 rgba(255,255,255,0.2)",
        "&:hover": {
            background: "#3190ff",
        },
        "&:disabled": {
            opacity: 0.65,
            cursor: "default",
        },
    },
    captchaOverlay: {
        position: "fixed",
        inset: 0,
        background: "rgba(5, 12, 20, 0.68)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        zIndex: 1000,
    },
    captchaModal: {
        width: "min(100%, 420px)",
        background: "#ffffff",
        color: "#2f231e",
        borderRadius: 8,
        padding: "22px 20px 18px",
        boxShadow: "0 20px 60px rgba(0,0,0,0.32)",
    },
    captchaTitle: {
        margin: "0 0 8px",
        fontSize: 22,
        fontWeight: 800,
        color: "#1d2c3b",
    },
    captchaText: {
        margin: "0 0 16px",
        fontSize: 15,
        lineHeight: 1.5,
        color: "#4c5563",
    },
    captchaWidget: {
        minHeight: 70,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        marginBottom: 14,
    },
    captchaError: {
        minHeight: 22,
        fontSize: 14,
        color: "#b13d2d",
        marginBottom: 12,
    },
    captchaActions: {
        display: "flex",
        justifyContent: "flex-end",
        gap: 10,
    },
    captchaSecondary: {
        height: 40,
        border: "1px solid #cfd5de",
        borderRadius: 6,
        background: "#ffffff",
        color: "#304054",
        fontWeight: 700,
        padding: "0 16px",
        cursor: "pointer",
    },
    captchaPrimary: {
        height: 40,
        border: 0,
        borderRadius: 6,
        background: "#167dff",
        color: "#fff",
        fontWeight: 800,
        padding: "0 18px",
        cursor: "pointer",
        "&:disabled": {
            opacity: 0.65,
            cursor: "default",
        },
    },
    maintenanceShell: {
        flex: 1,
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "32px 16px",
    },
    maintenanceCard: {
        width: "min(100%, 480px)",
        background: "rgba(255,255,255,0.97)",
        color: "#2f231e",
        borderRadius: 8,
        padding: "28px 24px 24px",
        textAlign: "center",
        boxShadow: "0 24px 72px rgba(6, 15, 24, 0.34)",
    },
    maintenanceLogo: {
        width: "100%",
        maxWidth: 260,
        margin: "0 auto 10px",
        display: "block",
    },
    maintenanceTitle: {
        margin: "0 0 10px",
        fontSize: 26,
        fontWeight: 800,
        color: "#15283a",
    },
    maintenanceBody: {
        margin: "0 0 18px",
        fontSize: 16,
        lineHeight: 1.5,
        color: "#526070",
    },
    maintenanceInput: {
        width: "100%",
        height: 42,
        borderRadius: 5,
        border: "1px solid #cfd5de",
        background: "#fff",
        color: "#2e2623",
        padding: "0 13px",
        fontSize: 15,
        marginBottom: 12,
        outline: "none",
    },
    maintenanceButton: {
        width: "100%",
        height: 42,
        border: 0,
        borderRadius: 6,
        background: "#167dff",
        color: "#fff",
        fontWeight: 800,
        fontSize: 16,
        cursor: "pointer",
        "&:disabled": {
            opacity: 0.65,
            cursor: "default",
        },
    },
    maintenanceError: {
        minHeight: 20,
        marginTop: 12,
        fontSize: 14,
        color: "#b13d2d",
    },
    signupFeedback: {
        minHeight: 12,
        marginTop: 8,
        fontSize: 14,
        color: "#8b4742",
        textAlign: "center",
    },
    signupStatus: {
        minHeight: 18,
        marginBottom: 10,
        fontSize: 13,
        color: "#5a6576",
        textAlign: "center",
    },
    signupStatusOk: {
        color: "#2b7a3c",
    },
    signupStatusWarn: {
        color: "#9a5a00",
    },
    signupStatusLink: {
        display: "block",
        marginTop: 4,
        color: "#1769aa",
        textDecoration: "underline",
    },
    footer: {
        background: "transparent",
        color: "#f2f7ff",
        textAlign: "center",
        padding: "10px 14px",
        fontSize: 12,
        textShadow: "0 3px 14px rgba(0,0,0,0.55)",
    },
    "@media (max-width: 1180px)": {
        hero: {
            flexDirection: "column",
            paddingTop: 34,
            gap: 28,
        },
        heroPanel: {
            minHeight: 0,
            paddingLeft: 0,
            paddingRight: 0,
            maxWidth: 760,
            margin: "0 auto",
        },
    },
    "@media (max-width: 960px)": {
        topBarInner: {
            padding: "6px 12px 4px",
            flexDirection: "column",
            alignItems: "stretch",
            gap: 4,
        },
        cornerIcon: {
            position: "static",
            width: 44,
            height: 44,
            marginBottom: 2,
        },
        loginCluster: {
            marginTop: 0,
            marginLeft: 0,
            minWidth: "100%",
            alignItems: "stretch",
        },
        loginForm: {
            justifyContent: "stretch",
        },
        input: {
            width: "100%",
        },
        loginButton: {
            width: "100%",
        },
        loginLinks: {
            justifyContent: "flex-end",
        },
    },
    "@media (max-width: 820px)": {
        topBarInner: {
            padding: "6px 12px 2px",
        },
        loginLinks: {
            justifyContent: "space-between",
        },
        hero: {
            paddingLeft: 16,
            paddingRight: 16,
        },
        brandImage: {
            maxWidth: 520,
        },
        signupCard: {
            paddingLeft: 18,
            paddingRight: 18,
        },
    },
});

const defaultSignupMetadata = {
    isDiscordVerified: false,
    discordUsername: null,
    discordDisplay: null,
    hasExistingAccount: false,
    existingUsername: null,
};

const defaultPendingSignup = {
    username: "",
    password: "",
};

const getErrorMessage = (error, fallbackMessage) => {
    return error?.response?.data?.errors?.[0]?.message || error?.message || fallbackMessage;
};

const PublicLanding = () => {
    const s = useStyles();
    const auth = AuthenticationStore.useContainer();
    const [loginState, setLoginState] = useState({
        username: "",
        password: "",
        twoFactorCode: "",
    });
    const [signupState, setSignupState] = useState({
        username: "",
        password: "",
        confirmPassword: "",
    });
    const [signupMetadata, setSignupMetadata] = useState(defaultSignupMetadata);
    const [signupMetadataLoading, setSignupMetadataLoading] = useState(true);
    const [signupMetadataError, setSignupMetadataError] = useState("");
    const [discordCallbackCompleted, setDiscordCallbackCompleted] = useState(false);
    const [loginLoading, setLoginLoading] = useState(false);
    const [signupLoading, setSignupLoading] = useState(false);
    const [loginFeedback, setLoginFeedback] = useState("");
    const [signupFeedback, setSignupFeedback] = useState("");
    const [captchaModalOpen, setCaptchaModalOpen] = useState(false);
    const [captchaError, setCaptchaError] = useState("");
    const [captchaToken, setCaptchaToken] = useState("");
    const [pendingSignup, setPendingSignup] = useState(defaultPendingSignup);
    const [captchaWidgetRendered, setCaptchaWidgetRendered] = useState(false);
    const [captchaSubmitting, setCaptchaSubmitting] = useState(false);
    useEffect(() => {
        if (!auth.isPending && auth.isAuthenticated) {
            window.location.href = getBaseUrl2("/home");
        }
    }, [auth.isAuthenticated, auth.isPending]);

    const refreshSignupMetadata = async (afterVerification = false) => {
        setSignupMetadataLoading(true);
        setSignupMetadataError("");
        try {
            const result = await getSignupMetadata();
            const metadata = {
                ...defaultSignupMetadata,
                ...result,
            };
            setSignupMetadata(metadata);
            if (afterVerification && !metadata.isDiscordVerified) {
                setSignupMetadataError("Discord verification could not be confirmed. Please verify again.");
            }
        } catch (error) {
            setSignupMetadata(defaultSignupMetadata);
            setSignupMetadataError("We couldn't check Discord verification. Please try again.");
        } finally {
            setSignupMetadataLoading(false);
        }
    };

    useEffect(() => {
        let afterVerification = false;
        if (typeof window !== "undefined") {
            const url = new URL(window.location.href);
            afterVerification = url.searchParams.get("discordVerified") === "1";
            if (afterVerification) {
                setDiscordCallbackCompleted(true);
                url.searchParams.delete("discordVerified");
                window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
            }
        }
        refreshSignupMetadata(afterVerification);
    }, []);

    useEffect(() => {
        if (typeof window === "undefined") return undefined;
        if (!captchaModalOpen) return undefined;

        let cancelled = false;
        let waitHandle = null;

        const mountTurnstile = () => {
            if (cancelled || captchaWidgetRendered) return;
            const container = document.getElementById("signup-turnstile");
            if (!container) return;
            if (!window.turnstile || typeof window.turnstile.render !== "function") {
                waitHandle = window.setTimeout(mountTurnstile, 200);
                return;
            }

            container.innerHTML = "";
            window.turnstile.render(container, {
                sitekey: turnstileSiteKey,
                callback: token => {
                    setCaptchaToken(token);
                    setCaptchaError("");
                },
                "expired-callback": () => {
                    setCaptchaToken("");
                    setCaptchaError("Verification expired. Please verify again.");
                },
                "error-callback": () => {
                    setCaptchaToken("");
                    setCaptchaError("Captcha failed to load. Please try again.");
                },
            });
            setCaptchaWidgetRendered(true);
        };

        mountTurnstile();

        return () => {
            cancelled = true;
            if (waitHandle) {
                window.clearTimeout(waitHandle);
            }
        };
    }, [captchaModalOpen, captchaWidgetRendered]);

    const onLoginChange = (key, value) => {
        setLoginState(previous => ({
            ...previous,
            [key]: value,
        }));
    };

    const onSignupChange = (key, value) => {
        setSignupState(previous => ({
            ...previous,
            [key]: value,
        }));
    };

    const closeCaptchaModal = () => {
        setCaptchaModalOpen(false);
        setCaptchaError("");
        setCaptchaToken("");
        setCaptchaWidgetRendered(false);
        setCaptchaSubmitting(false);
        setPendingSignup(defaultPendingSignup);
    };

    const submitSignupWithCaptcha = async token => {
        setSignupLoading(true);
        setCaptchaSubmitting(true);
        try {
            await signup({
                username: pendingSignup.username,
                password: pendingSignup.password,
                captchaToken: token,
            });
            window.location.href = getBaseUrl2("/home");
        } catch (error) {
            const message = getErrorMessage(error, "Signup failed. Please try again.");
            setSignupFeedback(message);
            setCaptchaError(message);
        } finally {
            setSignupLoading(false);
            setCaptchaSubmitting(false);
            setCaptchaModalOpen(false);
            setCaptchaToken("");
            setCaptchaWidgetRendered(false);
            setPendingSignup(defaultPendingSignup);
        }
    };

    const onLoginSubmit = async event => {
        event.preventDefault();
        setLoginFeedback("");

        if (!loginState.username.trim() || !loginState.password) {
            setLoginFeedback("Enter your username and password to log in.");
            return;
        }

        setLoginLoading(true);
        try {
            const usernameWithOptionalCode = loginState.twoFactorCode.trim()
                ? `${loginState.username.trim()}|${loginState.twoFactorCode.trim()}`
                : loginState.username.trim();
            const result = await login({
                username: usernameWithOptionalCode,
                password: loginState.password,
            });
            if (result?.data?.message === "TwoStepVerificationRequired") {
                setLoginFeedback("Enter your 2FA code in the optional field, then try logging in again.");
                return;
            }
            window.location.href = getBaseUrl2("/home");
        } catch (error) {
            setLoginFeedback(getErrorMessage(error, "Login failed. Please try again."));
        } finally {
            setLoginLoading(false);
        }
    };

    const onSignupSubmit = async event => {
        event.preventDefault();
        setSignupFeedback("");

        if (!signupMetadata.isDiscordVerified && !discordCallbackCompleted) {
            setSignupFeedback("Discord verification is required before you can sign up.");
            return;
        }

        if (signupMetadata.hasExistingAccount && signupMetadata.existingUsername) {
            setSignupFeedback(`This Discord account is already linked to ${signupMetadata.existingUsername}.`);
            return;
        }

        if (!signupState.username.trim()) {
            setSignupFeedback("Choose a username to continue.");
            return;
        }

        if (!signupState.password) {
            setSignupFeedback("Choose a password to continue.");
            return;
        }

        if (signupState.password !== signupState.confirmPassword) {
            setSignupFeedback("Your passwords do not match.");
            return;
        }

        setPendingSignup({
            username: signupState.username.trim(),
            password: signupState.password,
        });
        setCaptchaError("");
        setCaptchaToken("");
        setCaptchaWidgetRendered(false);
        setCaptchaModalOpen(true);
    };

    const isDiscordVerified = signupMetadata.isDiscordVerified || discordCallbackCompleted;
    const signupMetadataStatus = signupMetadataError && discordCallbackCompleted
        ? "Discord callback completed, but we couldn't refresh account status. You can enter your details; the server will verify Discord again when you sign up."
        : signupMetadataError || (signupMetadata.isDiscordVerified
            ? signupMetadata.hasExistingAccount
                ? `This Discord account is already linked to ${signupMetadata.existingUsername || "an existing account"}.`
                : `Verified as ${signupMetadata.discordDisplay || signupMetadata.discordUsername || "Discord user"}`
            : discordCallbackCompleted
                ? "Discord callback completed. You can enter your details; your verification will be checked again when you sign up."
                : "Discord verification is required before you can sign up.");

    return (
        <div className={s.page}>
            {captchaModalOpen ? (
                <div className={s.captchaOverlay}>
                    <div className={s.captchaModal}>
                        <h3 className={s.captchaTitle}>Please verify you are not a robot</h3>
                        <p className={s.captchaText}>Complete the captcha to finish creating your account.</p>
                        <div className={s.captchaWidget} id="signup-turnstile" />
                        <div className={s.captchaError}>{captchaError}</div>
                        <div className={s.captchaActions}>
                            <button
                                className={s.captchaSecondary}
                                disabled={captchaSubmitting}
                                onClick={closeCaptchaModal}
                                type="button"
                            >
                                Cancel
                            </button>
                            <button
                                className={s.captchaPrimary}
                                disabled={!captchaToken || captchaSubmitting}
                                onClick={() => submitSignupWithCaptcha(captchaToken)}
                                type="button"
                            >
                                {captchaSubmitting ? "Verifying..." : "Continue"}
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}
            <div className={s.topBar}>
                <div className={s.topBarInner}>
                    <img alt="Zekoro icon" className={s.cornerIcon} src="/img/landing/zekorooooo.png" />
                    <div className={s.loginCluster}>
                        <form className={s.loginForm} onSubmit={onLoginSubmit}>
                            <input
                                className={s.input}
                                disabled={loginLoading}
                                onChange={event => onLoginChange("username", event.target.value)}
                                placeholder="Username"
                                type="text"
                                value={loginState.username}
                            />
                            <input
                                className={s.input}
                                disabled={loginLoading}
                                onChange={event => onLoginChange("password", event.target.value)}
                                placeholder="Password"
                                type="password"
                                value={loginState.password}
                            />
                            <input
                                className={s.input}
                                disabled={loginLoading}
                                onChange={event => onLoginChange("twoFactorCode", event.target.value)}
                                placeholder="2FA Code (Optional)"
                                type="text"
                                value={loginState.twoFactorCode}
                            />
                            <button className={s.loginButton} disabled={loginLoading} type="submit">
                                {loginLoading ? "Logging In..." : "Log In"}
                            </button>
                        </form>
                        <div className={s.loginLinks}>
                            <a href={getBaseUrl2("/auth/password-reset")}>Forgot Password?</a>
                            <a href="/api/discord/login">Login with Discord</a>
                        </div>
                        {loginFeedback ? <div className={s.loginFeedback}>{loginFeedback}</div> : null}
                    </div>
                </div>
            </div>
            <div className={s.hero}>
                <div className={s.heroPanel}>
                    <div className={s.brandBlock}>
                        <img alt="Zekoro" className={s.brandImage} src="/img/landing/zekorologo222.png" />
                    </div>
                </div>
                <div className={s.signupCard}>
                    <h2 className={s.signupHeading}>Sign Up Now!</h2>
                    <button
                        className={s.discordButton}
                        disabled={isDiscordVerified || signupMetadataLoading}
                        onClick={() => {
                            if (isDiscordVerified || signupMetadataLoading) return;
                            window.location.href = "/api/discord/signup";
                        }}
                        type="button"
                    >
                        <svg aria-hidden="true" className={s.discordIcon} viewBox="0 0 127.14 96.36">
                            <path d="M107.7 8.07A105.15 105.15 0 0 0 81.47 0a72.06 72.06 0 0 0-3.36 6.83 97.68 97.68 0 0 0-29.11 0A72.37 72.37 0 0 0 45.64 0 105.89 105.89 0 0 0 19.39 8.09C2.79 32.65-1.71 56.6.54 80.21h.01a105.73 105.73 0 0 0 32.17 16.15 77.7 77.7 0 0 0 6.89-11.27 68.42 68.42 0 0 1-10.84-5.18c.91-.66 1.8-1.34 2.66-2.04 20.87 9.54 43.56 9.54 64.18 0 .87.71 1.76 1.39 2.66 2.04a68.68 68.68 0 0 1-10.85 5.19 77 77 0 0 0 6.89 11.26A105.25 105.25 0 0 0 126.6 80.22c2.64-27.36-4.5-51.09-18.9-72.15ZM42.45 65.69c-6.27 0-11.41-5.73-11.41-12.78s5.04-12.78 11.41-12.78c6.37 0 11.52 5.78 11.41 12.78 0 7.05-5.04 12.78-11.41 12.78Zm42.24 0c-6.27 0-11.41-5.73-11.41-12.78s5.04-12.78 11.41-12.78c6.37 0 11.52 5.78 11.41 12.78 0 7.05-5.03 12.78-11.41 12.78Z"/>
                        </svg>
                        {signupMetadataLoading
                            ? "Checking Discord..."
                            : isDiscordVerified
                                ? "Discord Verified"
                                : "Verify with Discord"}
                    </button>
                    <div className={`${s.signupStatus} ${isDiscordVerified ? s.signupStatusOk : s.signupStatusWarn}`}>
                        {signupMetadata.hasExistingAccount ? (
                            <>
                                This Discord account is already linked to {signupMetadata.existingUsername || "an existing account"}.
                                <a className={s.signupStatusLink} href="/api/discord/login">Log in with Discord</a>
                            </>
                        ) : signupMetadataStatus}
                    </div>
                    {signupMetadataError ? (
                        <button
                            className={s.captchaSecondary}
                            onClick={() => refreshSignupMetadata(true)}
                            type="button"
                        >
                            Retry verification check
                        </button>
                    ) : null}
                    <form onSubmit={onSignupSubmit}>
                        <input
                            className={s.signupInput}
                            disabled={!isDiscordVerified || signupMetadata.hasExistingAccount || signupLoading}
                            onChange={event => onSignupChange("username", event.target.value)}
                            placeholder="Username"
                            type="text"
                            value={signupState.username}
                        />
                        <input
                            className={s.signupInput}
                            disabled={!isDiscordVerified || signupMetadata.hasExistingAccount || signupLoading}
                            onChange={event => onSignupChange("password", event.target.value)}
                            placeholder="Password"
                            type="password"
                            value={signupState.password}
                        />
                        <input
                            className={s.signupInput}
                            disabled={!isDiscordVerified || signupMetadata.hasExistingAccount || signupLoading}
                            onChange={event => onSignupChange("confirmPassword", event.target.value)}
                            placeholder="Confirm Password"
                            type="password"
                            value={signupState.confirmPassword}
                        />
                        <button
                            className={s.signupButton}
                            disabled={!isDiscordVerified || signupMetadata.hasExistingAccount || signupLoading}
                            type="submit"
                        >
                            {signupLoading ? "Creating Account..." : "Sign Up"}
                        </button>
                    </form>
                    <div className={s.signupFeedback}>{signupFeedback}</div>
                </div>
            </div>
            <div className={s.footer}>(c) 2026 Zekoro. Not affiliated with Roblox Corporation.</div>
        </div>
    );
};

export default PublicLanding;
