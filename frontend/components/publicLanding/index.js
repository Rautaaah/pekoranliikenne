import React, { useEffect, useRef, useState } from "react";
import { createUseStyles } from "react-jss";
import AuthenticationStore from "../../stores/authentication";
import { getBaseUrl2 } from "../../lib/request";
import { getSignupChallenge, getSignupMetadata, login, signup } from "../../services/auth";
import sansyLogo from "./img/sansy-logo-full.png";

const siteBuildId = process.env.NEXT_PUBLIC_BUILD_ID || "local";

const useStyles = createUseStyles({
    "@keyframes authCardIn": {
        "0%": { opacity: 0, transform: "translateY(14px)" },
        "100%": { opacity: 1, transform: "translateY(0)" },
    },
    authPage: {
        width: "100%",
        minHeight: "100vh",
        margin: 0,
        padding: "44px 20px 70px",
        boxSizing: "border-box",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 64,
        position: "relative",
        overflow: "hidden",
        backgroundColor: "#2b1611",
        backgroundImage: "repeating-linear-gradient(45deg, rgba(245, 236, 214, .028) 0 2px, transparent 2px 22px), repeating-linear-gradient(-45deg, rgba(245, 236, 214, .028) 0 2px, transparent 2px 22px)",
        color: "#fbf3e3",
        fontFamily: '"Space Grotesk", "Trebuchet MS", Arial, sans-serif',
        "@media (max-width: 860px)": {
            flexDirection: "column",
            gap: 22,
        },
    },
    authBackgroundCanvas: {
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        zIndex: 0,
        pointerEvents: "none",
    },
    authShell: {
        width: "100%",
        maxWidth: 390,
        position: "relative",
        zIndex: 2,
        animation: "$authCardIn 0.4s ease both",
    },
    authCard: {
        padding: "24px 24px 22px",
        boxSizing: "border-box",
        borderRadius: 16,
        border: "1px solid rgba(245, 236, 214, .08)",
        background: "#3a1f18",
        boxShadow: "0 20px 50px rgba(0, 0, 0, .45)",
    },
    authToggle: {
        display: "flex",
        padding: 4,
        marginBottom: 20,
        position: "relative",
        borderRadius: 11,
        background: "#24110d",
    },
    authToggleThumb: {
        position: "absolute",
        top: 4,
        bottom: 4,
        left: 4,
        width: "calc(50% - 4px)",
        borderRadius: 8,
        background: "#a8573a",
        transition: "transform 0.25s",
    },
    authToggleThumbRight: {
        transform: "translateX(100%)",
    },
    authToggleLink: {
        flex: "1 1 0%",
        height: 36,
        zIndex: 1,
        position: "relative",
        display: "block",
        color: "#c9ad97",
        fontSize: 14,
        fontWeight: 700,
        lineHeight: "36px",
        textAlign: "center",
        textDecoration: "none",
        "&:hover": { color: "#fff8ea" },
    },
    authToggleActive: {
        color: "#fff8ea",
    },
    authHeading: {
        margin: "0 0 18px",
        color: "#fbf3e3",
        fontSize: 23,
        fontWeight: 700,
        letterSpacing: "-0.02em",
        textAlign: "center",
    },
    authField: {
        marginBottom: 11,
    },
    authInput: {
        width: "100%",
        padding: "12px 15px",
        boxSizing: "border-box",
        border: "2px dashed #6e3a2b",
        borderRadius: 10,
        outline: "none",
        background: "#2a1510",
        color: "#fbf3e3",
        fontFamily: "inherit",
        fontSize: 15,
        transition: "border-color 0.16s",
        "&::placeholder": { color: "#9a7a68" },
        "&:focus": { borderColor: "#d07a52" },
        "&:disabled": { opacity: 0.55 },
    },
    authInputInvalid: {
        borderColor: "#ff6b6b",
        "&:focus": { borderColor: "#ff6b6b" },
    },
    authFieldError: {
        display: "block",
        marginTop: 5,
        color: "#ff7777",
        fontSize: 12,
        lineHeight: 1.4,
    },
    authDiscordButton: {
        width: "100%",
        height: 46,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        border: 0,
        borderRadius: 10,
        background: "#5865f2",
        color: "#fff",
        fontFamily: "inherit",
        fontSize: 15,
        fontWeight: 700,
        textDecoration: "none",
        cursor: "pointer",
        transition: "background 0.14s",
        "&:hover": { background: "#4752c4" },
        "&:disabled": {
            background: "#2f6b3a",
            cursor: "default",
        },
    },
    authDiscordIcon: {
        width: 22,
        height: 22,
        display: "block",
        fill: "currentColor",
    },
    authDivider: {
        display: "flex",
        alignItems: "center",
        gap: 12,
        margin: "16px 0",
        color: "#b0907c",
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: "0.16em",
        textTransform: "uppercase",
        "& span": {
            flex: "1 1 0%",
            height: 1,
            background: "rgba(245, 236, 214, .14)",
        },
    },
    authSubmit: {
        width: "100%",
        minHeight: 46,
        marginTop: 8,
        padding: "0 16px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        border: 0,
        borderRadius: 10,
        background: "#a8573a",
        color: "#fff8ea",
        fontFamily: "inherit",
        fontSize: 15,
        fontWeight: 700,
        textDecoration: "none",
        cursor: "pointer",
        transition: "background 0.14s",
        "&:hover": { background: "#924a30" },
        "&:active": { background: "#7d3f29" },
        "&:disabled": { opacity: 0.6, cursor: "default" },
    },
    authStatus: {
        margin: "0 0 12px",
        color: "#c9ad97",
        fontSize: 12.5,
        lineHeight: 1.5,
        textAlign: "center",
        "& a": {
            color: "#f0c9a8",
            fontWeight: 600,
            textDecoration: "none",
        },
        "& a:hover": { color: "#fff", textDecoration: "underline" },
    },
    authInlineButton: {
        padding: 0,
        border: 0,
        background: "transparent",
        color: "#f0c9a8",
        font: "inherit",
        fontWeight: 700,
        textDecoration: "underline",
        cursor: "pointer",
    },
    authFeedback: {
        minHeight: 18,
        marginTop: 10,
        color: "#ff9b8a",
        fontSize: 13,
        lineHeight: 1.45,
        textAlign: "center",
    },
    authFoot: {
        display: "flex",
        flexWrap: "wrap",
        justifyContent: "space-between",
        gap: 8,
        marginTop: 16,
        color: "#e0bfa6",
        fontSize: 12.5,
        "& a": {
            color: "#f0c9a8",
            fontWeight: 600,
            textDecoration: "none",
        },
        "& span": { color: "#e0bfa6" },
        "& a:hover": { color: "#fff" },
    },
    authMark: {
        position: "relative",
        zIndex: 2,
        userSelect: "none",
        animation: "$authCardIn 0.5s ease 0.05s both",
        "& img": {
            width: "clamp(280px, 36vw, 520px)",
            height: "auto",
            display: "block",
            filter: "drop-shadow(0 12px 28px rgba(0, 0, 0, .5))",
        },
        "@media (max-width: 860px)": {
            order: -1,
            "& img": { width: "min(74vw, 320px)" },
        },
    },
    authLegal: {
        position: "absolute",
        right: 0,
        bottom: 10,
        left: 0,
        zIndex: 2,
        color: "rgba(245, 225, 205, .45)",
        fontSize: 10.5,
        textAlign: "center",
    },
    siteUpdateBadge: {
        position: "fixed",
        left: 12,
        bottom: 12,
        zIndex: 5,
        display: "flex",
        alignItems: "center",
        gap: 7,
        padding: "7px 10px",
        border: "1px solid rgba(245, 236, 214, .18)",
        borderRadius: 999,
        background: "rgba(36, 17, 13, .92)",
        color: "#e8d8c8",
        fontSize: 11,
        boxShadow: "0 4px 14px rgba(0, 0, 0, .28)",
        "& code": {
            color: "#f0c9a8",
            fontFamily: "monospace",
            fontSize: 10,
        },
    },
    siteUpdateDot: {
        width: 7,
        height: 7,
        borderRadius: "50%",
        background: "#80c98b",
        boxShadow: "0 0 8px rgba(128, 201, 139, .6)",
    },
    authCaptchaChallenge: {
        marginBottom: 12,
        padding: "14px 12px",
        borderRadius: 8,
        background: "#f0ece8",
        color: "#2b211d",
        fontFamily: "monospace",
        fontSize: 26,
        fontWeight: 800,
        letterSpacing: 8,
        textAlign: "center",
        userSelect: "none",
    },
    authCaptchaInput: {
        width: "100%",
        height: 42,
        marginBottom: 12,
        padding: "0 12px",
        boxSizing: "border-box",
        border: "1px solid #8e7568",
        borderRadius: 8,
        background: "#fff",
        color: "#2b211d",
        font: "inherit",
        textAlign: "center",
        letterSpacing: 3,
        "&:focus": { outline: "2px solid #d28b62", outlineOffset: 1 },
        "&:disabled": { opacity: 0.6 },
    },
    authGenderOptions: {
        minHeight: 48,
        padding: "5px 12px",
        boxSizing: "border-box",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-around",
        gap: 14,
        marginBottom: 11,
        border: "2px dashed #6e3a2b",
        borderRadius: 10,
        background: "#2a1510",
    },
    authGenderLabel: {
        marginBottom: 6,
        color: "#fbf3e3",
        fontSize: 14,
        fontWeight: 500,
    },
    authGenderOption: {
        width: 36,
        height: 36,
        padding: 0,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        border: "1px solid transparent",
        borderRadius: "50%",
        background: "transparent",
        color: "#89817e",
        fontFamily: "inherit",
        fontSize: 25,
        lineHeight: 1,
        cursor: "pointer",
        transition: "color 0.14s, background 0.14s, border-color 0.14s",
        "&:hover": { color: "#c9c0bc" },
        "&:focus-visible": { outline: "2px solid #d07a52", outlineOffset: 2 },
        "&:disabled": { opacity: 0.55, cursor: "default" },
    },
    authGenderFemaleActive: {
        borderColor: "#e76c9a",
        background: "rgba(231, 108, 154, .16)",
        color: "#e76c9a",
    },
    authGenderMaleActive: {
        borderColor: "#4c91e8",
        background: "rgba(76, 145, 232, .16)",
        color: "#4c91e8",
    },
    authGenderNonBinaryActive: {
        borderColor: "#9870d6",
        background: "rgba(152, 112, 214, .16)",
        color: "#9870d6",
    },
    authCaptchaOverlay: {
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        padding: 20,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(10, 5, 3, .72)",
    },
    authCaptchaModal: {
        width: "min(100%, 420px)",
        padding: "22px 20px 18px",
        boxSizing: "border-box",
        borderRadius: 16,
        background: "#3a1f18",
        color: "#fbf3e3",
        boxShadow: "0 20px 60px rgba(0,0,0,.4)",
    },
    authCaptchaTitle: { margin: "0 0 8px", fontSize: 21 },
    authCaptchaText: { margin: "0 0 16px", color: "#c9ad97", lineHeight: 1.5 },
    authCaptchaError: { minHeight: 22, marginBottom: 12, color: "#ff9b8a", fontSize: 14 },
    authCaptchaActions: { display: "flex", justifyContent: "flex-end", gap: 10 },
    authCaptchaSecondary: {
        height: 40,
        padding: "0 16px",
        border: "1px solid #6e3a2b",
        borderRadius: 8,
        background: "#2a1510",
        color: "#fbf3e3",
        fontFamily: "inherit",
        fontWeight: 700,
        cursor: "pointer",
        "&:disabled": { opacity: 0.6, cursor: "default" },
    },
    authCaptchaPrimary: {
        height: 40,
        padding: "0 18px",
        border: 0,
        borderRadius: 8,
        background: "#a8573a",
        color: "#fff8ea",
        fontFamily: "inherit",
        fontWeight: 700,
        cursor: "pointer",
        "&:disabled": { opacity: 0.6, cursor: "default" },
    },
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
    gender: null,
};

const getErrorMessage = (error, fallbackMessage) => {
    return error?.response?.data?.errors?.[0]?.message || error?.message || fallbackMessage;
};

const getSignupUsernameError = username => {
    if (!username) return "Choose a username.";
    if (username.length < 3 || username.length > 20) return "Username must be 3-20 characters.";
    if (!/^[A-Za-z0-9_]+$/.test(username) ||
        username.startsWith("_") ||
        username.endsWith("_") ||
        (username.match(/_/g) || []).length > 1) {
        return "Use letters and numbers, with at most one underscore.";
    }
    if (username.toUpperCase() === "ROBLOX") return "ROBLOX is a reserved username.";
    if (username.toLowerCase().includes("fuck")) return "That username contains an inappropriate word.";
    return "";
};

const getSignupPasswordError = (password, username) => {
    if (!password) return "Choose a password.";
    if (password.length < 3) return "Password must be at least 3 characters.";
    if (password.toLowerCase() === username.toLowerCase()) return "Password cannot be the same as your username.";
    return "";
};

const PublicLanding = ({ mode = "signup" }) => {
    const s = useStyles();
    const auth = AuthenticationStore.useContainer();
    const isLoginPage = mode === "login";
    const backgroundCanvasRef = useRef(null);
    const [loginState, setLoginState] = useState({
        username: "",
        password: "",
        twoFactorCode: "",
    });
    const [signupState, setSignupState] = useState({
        username: "",
        password: "",
        confirmPassword: "",
        gender: null,
    });
    const [signupMetadata, setSignupMetadata] = useState(defaultSignupMetadata);
    const [signupMetadataLoading, setSignupMetadataLoading] = useState(true);
    const [signupMetadataError, setSignupMetadataError] = useState("");
    const [discordCallbackError, setDiscordCallbackError] = useState("");
    const [loginLoading, setLoginLoading] = useState(false);
    const [signupLoading, setSignupLoading] = useState(false);
    const [loginFeedback, setLoginFeedback] = useState("");
    const [signupFeedback, setSignupFeedback] = useState("");
    const [signupAttempted, setSignupAttempted] = useState(false);
    const [signupServerFieldErrors, setSignupServerFieldErrors] = useState({});
    const [captchaModalOpen, setCaptchaModalOpen] = useState(false);
    const [captchaError, setCaptchaError] = useState("");
    const [captchaToken, setCaptchaToken] = useState("");
    const [captchaText, setCaptchaText] = useState("");
    const [captchaAnswer, setCaptchaAnswer] = useState("");
    const [captchaRefreshId, setCaptchaRefreshId] = useState(0);
    const [pendingSignup, setPendingSignup] = useState(defaultPendingSignup);
    const [captchaLoading, setCaptchaLoading] = useState(false);
    const [captchaSubmitting, setCaptchaSubmitting] = useState(false);
    useEffect(() => {
        if (!auth.isPending && auth.isAuthenticated) {
            window.location.href = getBaseUrl2("/home");
        }
    }, [auth.isAuthenticated, auth.isPending]);

    useEffect(() => {
        const canvas = backgroundCanvasRef.current;
        const context = canvas?.getContext("2d");
        if (!canvas || !context) return undefined;

        let animationFrame = 0;
        let width = 0;
        let height = 0;
        const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        const colors = ["168,87,58", "245,236,214", "110,58,43", "208,122,82"];
        const glows = Array.from({ length: 7 }, (_, index) => ({
            x: Math.random(),
            y: Math.random(),
            radius: 180 + Math.random() * 260,
            dx: (Math.random() - 0.5) * 0.00025,
            dy: (Math.random() - 0.5) * 0.00025,
            color: colors[index % colors.length],
            opacity: index % 4 === 1 ? 0.05 : 0.16,
        }));
        const specks = Array.from({ length: 90 }, () => ({
            x: Math.random(),
            y: Math.random(),
            size: 0.6 + Math.random() * 1.8,
            velocity: 0.00005 + Math.random() * 0.00018,
            opacity: 0.08 + Math.random() * 0.25,
        }));

        const resize = () => {
            const ratio = window.devicePixelRatio || 1;
            width = canvas.clientWidth;
            height = canvas.clientHeight;
            canvas.width = width * ratio;
            canvas.height = height * ratio;
            context.setTransform(ratio, 0, 0, ratio, 0, 0);
        };
        const draw = () => {
            context.clearRect(0, 0, width, height);
            glows.forEach(glow => {
                glow.x += glow.dx;
                glow.y += glow.dy;
                if (glow.x < -0.2 || glow.x > 1.2) glow.dx *= -1;
                if (glow.y < -0.2 || glow.y > 1.2) glow.dy *= -1;
                const gradient = context.createRadialGradient(
                    glow.x * width,
                    glow.y * height,
                    0,
                    glow.x * width,
                    glow.y * height,
                    glow.radius,
                );
                gradient.addColorStop(0, `rgba(${glow.color},${glow.opacity})`);
                gradient.addColorStop(1, `rgba(${glow.color},0)`);
                context.fillStyle = gradient;
                context.fillRect(0, 0, width, height);
            });
            specks.forEach(speck => {
                speck.y -= speck.velocity;
                if (speck.y < -0.02) {
                    speck.y = 1.02;
                    speck.x = Math.random();
                }
                context.fillStyle = `rgba(245,236,214,${speck.opacity})`;
                context.beginPath();
                context.arc(speck.x * width, speck.y * height, speck.size, 0, Math.PI * 2);
                context.fill();
            });
            if (!reducedMotion) animationFrame = window.requestAnimationFrame(draw);
        };

        resize();
        window.addEventListener("resize", resize);
        draw();
        return () => {
            window.cancelAnimationFrame(animationFrame);
            window.removeEventListener("resize", resize);
        };
    }, []);

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
            if (metadata.isDiscordVerified) setDiscordCallbackError("");
            if (afterVerification && !metadata.isDiscordVerified) {
                setSignupMetadataError("Discord verification could not be confirmed. Please verify again.");
            }
        } catch (error) {
            setSignupMetadata(defaultSignupMetadata);
            setSignupMetadataError("Discord verification could not be confirmed. Please retry verification.");
        } finally {
            setSignupMetadataLoading(false);
        }
    };

    useEffect(() => {
        if (isLoginPage) return;
        let afterVerification = false;
        if (typeof window !== "undefined") {
            const url = new URL(window.location.href);
            afterVerification = url.searchParams.get("discordVerified") === "1";
            const callbackFailed = url.searchParams.get("discordError") === "verification_failed";
            if (afterVerification || callbackFailed) {
                url.searchParams.delete("discordVerified");
                url.searchParams.delete("discordError");
                window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
            }
            if (callbackFailed) setDiscordCallbackError("Discord verification did not complete. Please try again.");
        }
        refreshSignupMetadata(afterVerification);
    }, [isLoginPage]);

    useEffect(() => {
        if (!captchaModalOpen) return undefined;

        let cancelled = false;
        setCaptchaLoading(true);
        getSignupChallenge()
            .then(challenge => {
                if (cancelled) return;
                setCaptchaText(challenge.text);
                setCaptchaToken(challenge.captchaToken);
                setCaptchaAnswer("");
            })
            .catch(error => {
                if (!cancelled) {
                    setCaptchaError(getErrorMessage(error, "Text challenge failed to load. Please try again."));
                }
            })
            .finally(() => {
                if (!cancelled) setCaptchaLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [captchaModalOpen, captchaRefreshId]);

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
        setSignupServerFieldErrors(previous => ({
            ...previous,
            [key]: "",
        }));
    };

    const closeCaptchaModal = () => {
        setCaptchaModalOpen(false);
        setCaptchaError("");
        setCaptchaToken("");
        setCaptchaText("");
        setCaptchaAnswer("");
        setCaptchaSubmitting(false);
        setPendingSignup(defaultPendingSignup);
    };

    const submitSignupWithCaptcha = async () => {
        setSignupLoading(true);
        setCaptchaSubmitting(true);
        try {
            await signup({
                username: pendingSignup.username,
                password: pendingSignup.password,
                gender: pendingSignup.gender,
                captchaToken,
                captchaAnswer,
            });
            window.location.assign("https://discord.gg/KcnemeAUpK");
        } catch (error) {
            const message = getErrorMessage(error, "Signup failed. Please try again.");
            const normalizedMessage = message.toLowerCase();
            if (normalizedMessage.includes("username") || normalizedMessage.includes("reserved")) {
                setSignupServerFieldErrors(previous => ({ ...previous, username: message }));
            } else if (normalizedMessage.includes("password")) {
                setSignupServerFieldErrors(previous => ({ ...previous, password: message }));
            } else {
                setSignupFeedback(message);
            }
            setCaptchaError(message);
            setCaptchaToken("");
            setCaptchaText("");
            setCaptchaAnswer("");
            setCaptchaRefreshId(previous => previous + 1);
        } finally {
            setSignupLoading(false);
            setCaptchaSubmitting(false);
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
        setSignupAttempted(true);

        if (!signupMetadata.isDiscordVerified) {
            setSignupFeedback("Discord verification is required before you can sign up.");
            return;
        }

        if (signupMetadata.hasExistingAccount && signupMetadata.existingUsername) {
            setSignupFeedback(`This Discord account is already linked to ${signupMetadata.existingUsername}.`);
            return;
        }

        const username = signupState.username.trim();
        const usernameError = getSignupUsernameError(username);
        const passwordError = getSignupPasswordError(signupState.password, username);
        const confirmPasswordError = signupState.password !== signupState.confirmPassword
            ? "Your passwords do not match."
            : "";
        if (usernameError || passwordError || confirmPasswordError) return;

        if (!signupState.gender) {
            setSignupFeedback("Choose a gender to continue.");
            return;
        }

        setPendingSignup({
            username,
            password: signupState.password,
            gender: signupState.gender,
        });
        setCaptchaError("");
        setCaptchaToken("");
        setCaptchaText("");
        setCaptchaAnswer("");
        setCaptchaLoading(false);
        setCaptchaModalOpen(true);
    };

    const isDiscordVerified = signupMetadata.isDiscordVerified;
    const signupMetadataStatus = discordCallbackError || signupMetadataError || (signupMetadata.isDiscordVerified
            ? signupMetadata.hasExistingAccount
                ? `This Discord account is already linked to ${signupMetadata.existingUsername || "an existing account"}.`
                : `Verified as ${signupMetadata.discordDisplay || signupMetadata.discordUsername || "Discord user"}`
            : "Discord verification is required before you can sign up.");
    const usernameFieldError = signupServerFieldErrors.username ||
        ((signupAttempted || signupState.username)
            ? getSignupUsernameError(signupState.username.trim())
            : "");
    const passwordFieldError = signupServerFieldErrors.password ||
        ((signupAttempted || signupState.password)
            ? getSignupPasswordError(signupState.password, signupState.username.trim())
            : "");
    const confirmPasswordFieldError = (signupAttempted || signupState.confirmPassword) &&
        signupState.password !== signupState.confirmPassword
        ? "Your passwords do not match."
        : "";

    return (
        <main className={s.authPage}>
            <canvas aria-hidden="true" className={s.authBackgroundCanvas} ref={backgroundCanvasRef} />
            {captchaModalOpen ? (
                <div className={s.authCaptchaOverlay}>
                    <div aria-labelledby="signup-captcha-title" aria-modal="true" className={s.authCaptchaModal} role="dialog">
                        <h3 className={s.authCaptchaTitle} id="signup-captcha-title">Type the text exactly as shown</h3>
                        <p className={s.authCaptchaText}>Use the same capital letters and numbers. This code expires in five minutes.</p>
                        <div aria-label={`Challenge text: ${captchaText}`} className={s.authCaptchaChallenge} role="img">
                            {captchaLoading ? "Loading..." : captchaText || "Text challenge unavailable"}
                        </div>
                        <input
                            autoComplete="off"
                            aria-label="Enter the text shown above"
                            className={s.authCaptchaInput}
                            disabled={!captchaToken || captchaSubmitting}
                            maxLength={6}
                            onChange={event => setCaptchaAnswer(event.target.value)}
                            spellCheck={false}
                            type="text"
                            value={captchaAnswer}
                        />
                        <div aria-live="polite" className={s.authCaptchaError}>{captchaError}</div>
                        <div className={s.authCaptchaActions}>
                            <button
                                className={s.authCaptchaSecondary}
                                disabled={captchaSubmitting || captchaLoading}
                                onClick={() => {
                                    setCaptchaError("");
                                    setCaptchaText("");
                                    setCaptchaToken("");
                                    setCaptchaRefreshId(previous => previous + 1);
                                }}
                                type="button"
                            >
                                New text
                            </button>
                            <button
                                className={s.authCaptchaSecondary}
                                disabled={captchaSubmitting}
                                onClick={closeCaptchaModal}
                                type="button"
                            >
                                Cancel
                            </button>
                            <button
                                className={s.authCaptchaPrimary}
                                disabled={!captchaToken || !captchaAnswer || captchaSubmitting || captchaLoading}
                                onClick={submitSignupWithCaptcha}
                                type="button"
                            >
                                {captchaSubmitting ? "Creating account..." : "Continue"}
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}

            <section className={s.authShell}>
                <div className={s.authCard}>
                    <nav aria-label="Account" className={s.authToggle}>
                        <div className={`${s.authToggleThumb} ${isLoginPage ? s.authToggleThumbRight : ""}`} />
                        <a
                            aria-current={!isLoginPage ? "page" : undefined}
                            className={`${s.authToggleLink} ${!isLoginPage ? s.authToggleActive : ""}`}
                            href="/"
                        >
                            Sign up
                        </a>
                        <a
                            aria-current={isLoginPage ? "page" : undefined}
                            className={`${s.authToggleLink} ${isLoginPage ? s.authToggleActive : ""}`}
                            href="/login"
                        >
                            Log in
                        </a>
                    </nav>

                    {isLoginPage ? (
                        <>
                            <h1 className={s.authHeading}>Welcome back</h1>
                            <form onSubmit={onLoginSubmit}>
                                <div className={s.authField}>
                                    <input
                                        autoComplete="username"
                                        className={s.authInput}
                                        disabled={loginLoading}
                                        onChange={event => onLoginChange("username", event.target.value)}
                                        placeholder="Username"
                                        type="text"
                                        value={loginState.username}
                                    />
                                </div>
                                <div className={s.authField}>
                                    <input
                                        autoComplete="current-password"
                                        className={s.authInput}
                                        disabled={loginLoading}
                                        onChange={event => onLoginChange("password", event.target.value)}
                                        placeholder="Password"
                                        type="password"
                                        value={loginState.password}
                                    />
                                </div>
                                <div className={s.authField}>
                                    <input
                                        autoComplete="one-time-code"
                                        className={s.authInput}
                                        disabled={loginLoading}
                                        inputMode="numeric"
                                        maxLength={6}
                                        onChange={event => onLoginChange("twoFactorCode", event.target.value)}
                                        pattern="[0-9]*"
                                        placeholder="2FA code (leave blank if not set)"
                                        type="text"
                                        value={loginState.twoFactorCode}
                                    />
                                </div>
                                <button className={s.authSubmit} disabled={loginLoading} type="submit">
                                    {loginLoading ? "Logging in..." : "Log in"}
                                </button>
                            </form>
                            <div aria-live="polite" className={s.authFeedback}>{loginFeedback}</div>
                            <div className={s.authDivider}><span />or<span /></div>
                            <a className={s.authDiscordButton} href="/api/discord/login">
                                <svg aria-hidden="true" className={s.authDiscordIcon} viewBox="0 0 24 24">
                                    <path d="M20.317 4.369a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.249a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.036A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.1 13.1 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.009c.12.099.246.198.373.292a.077.077 0 0 1-.006.127 12.3 12.3 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.84 19.84 0 0 0 6.002-3.03.077.077 0 0 0 .032-.056c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028ZM8.02 15.331c-1.183 0-2.157-1.086-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.332-.956 2.418-2.157 2.418Zm7.975 0c-1.183 0-2.157-1.086-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.332-.946 2.418-2.157 2.418Z" />
                                </svg>
                                Log in with Discord
                            </a>
                            <div className={s.authFoot}>
                                <a href={getBaseUrl2("/auth/password-reset")}>Forgot password?</a>
                                <span title="Use the /reset-password command in the Discord server">
                                    Need help? Ask in Discord
                                </span>
                            </div>
                        </>
                    ) : (
                        <>
                            <h1 className={s.authHeading}>Create your account</h1>
                            <button
                                className={s.authDiscordButton}
                                disabled={isDiscordVerified || signupMetadataLoading}
                                onClick={() => {
                                    if (!isDiscordVerified && !signupMetadataLoading) {
                                        setDiscordCallbackError("");
                                        window.location.href = "/api/discord/signup";
                                    }
                                }}
                                type="button"
                            >
                                <svg aria-hidden="true" className={s.authDiscordIcon} viewBox="0 0 24 24">
                                    <path d="M20.317 4.369a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.249a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.036A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.1 13.1 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.009c.12.099.246.198.373.292a.077.077 0 0 1-.006.127 12.3 12.3 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.84 19.84 0 0 0 6.002-3.03.077.077 0 0 0 .032-.056c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028ZM8.02 15.331c-1.183 0-2.157-1.086-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.332-.956 2.418-2.157 2.418Zm7.975 0c-1.183 0-2.157-1.086-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.332-.946 2.418-2.157 2.418Z" />
                                </svg>
                                {signupMetadataLoading
                                    ? "Checking Discord..."
                                    : isDiscordVerified
                                        ? "Discord verified"
                                        : "Verify with Discord (required)"}
                            </button>
                            <div className={s.authDivider}><span />then<span /></div>
                            <div aria-live="polite" className={s.authStatus}>
                                {signupMetadata.hasExistingAccount ? (
                                    <>
                                        This Discord account is already linked to {signupMetadata.existingUsername || "an existing account"}.{" "}
                                        <a href="/api/discord/login">Log in with Discord</a>
                                    </>
                                ) : signupMetadataStatus}
                                {signupMetadataError ? (
                                    <>
                                        {" "}
                                        <button
                                            className={s.authInlineButton}
                                            onClick={() => refreshSignupMetadata(true)}
                                            type="button"
                                        >
                                            Retry check
                                        </button>
                                    </>
                                ) : null}
                            </div>
                            <form onSubmit={onSignupSubmit}>
                                <div className={s.authField}>
                                    <input
                                        aria-describedby={usernameFieldError ? "signup-username-error" : undefined}
                                        aria-invalid={Boolean(usernameFieldError)}
                                        autoComplete="username"
                                        className={`${s.authInput} ${usernameFieldError ? s.authInputInvalid : ""}`}
                                        disabled={!isDiscordVerified || signupMetadata.hasExistingAccount || signupLoading}
                                        maxLength={20}
                                        onChange={event => onSignupChange("username", event.target.value)}
                                        placeholder="Username (3-20 characters)"
                                        type="text"
                                        value={signupState.username}
                                    />
                                    {usernameFieldError ? (
                                        <span className={s.authFieldError} id="signup-username-error" role="alert">
                                            {usernameFieldError}
                                        </span>
                                    ) : null}
                                </div>
                                <div className={s.authField}>
                                    <input
                                        aria-describedby={passwordFieldError ? "signup-password-error" : undefined}
                                        aria-invalid={Boolean(passwordFieldError)}
                                        autoComplete="new-password"
                                        className={`${s.authInput} ${passwordFieldError ? s.authInputInvalid : ""}`}
                                        disabled={!isDiscordVerified || signupMetadata.hasExistingAccount || signupLoading}
                                        onChange={event => onSignupChange("password", event.target.value)}
                                        placeholder="Password"
                                        type="password"
                                        value={signupState.password}
                                    />
                                    {passwordFieldError ? (
                                        <span className={s.authFieldError} id="signup-password-error" role="alert">
                                            {passwordFieldError}
                                        </span>
                                    ) : null}
                                </div>
                                <div className={s.authField}>
                                    <input
                                        aria-describedby={confirmPasswordFieldError ? "signup-confirm-password-error" : undefined}
                                        aria-invalid={Boolean(confirmPasswordFieldError)}
                                        autoComplete="new-password"
                                        className={`${s.authInput} ${confirmPasswordFieldError ? s.authInputInvalid : ""}`}
                                        disabled={!isDiscordVerified || signupMetadata.hasExistingAccount || signupLoading}
                                        onChange={event => onSignupChange("confirmPassword", event.target.value)}
                                        placeholder="Confirm password"
                                        type="password"
                                        value={signupState.confirmPassword}
                                    />
                                    {confirmPasswordFieldError ? (
                                        <span className={s.authFieldError} id="signup-confirm-password-error" role="alert">
                                            {confirmPasswordFieldError}
                                        </span>
                                    ) : null}
                                </div>
                                <div className={s.authGenderLabel}>Gender</div>
                                <div aria-label="Gender" className={s.authGenderOptions} role="radiogroup">
                                    <button
                                        aria-label="Female"
                                        aria-pressed={signupState.gender === 3}
                                        className={`${s.authGenderOption} ${signupState.gender === 3 ? s.authGenderFemaleActive : ""}`}
                                        disabled={!isDiscordVerified || signupMetadata.hasExistingAccount || signupLoading}
                                        onClick={() => onSignupChange("gender", 3)}
                                        type="button"
                                    >
                                        ♀
                                    </button>
                                    <button
                                        aria-label="Male"
                                        aria-pressed={signupState.gender === 2}
                                        className={`${s.authGenderOption} ${signupState.gender === 2 ? s.authGenderMaleActive : ""}`}
                                        disabled={!isDiscordVerified || signupMetadata.hasExistingAccount || signupLoading}
                                        onClick={() => onSignupChange("gender", 2)}
                                        type="button"
                                    >
                                        ♂
                                    </button>
                                    <button
                                        aria-label="Non-binary"
                                        aria-pressed={signupState.gender === 4}
                                        className={`${s.authGenderOption} ${signupState.gender === 4 ? s.authGenderNonBinaryActive : ""}`}
                                        disabled={!isDiscordVerified || signupMetadata.hasExistingAccount || signupLoading}
                                        onClick={() => onSignupChange("gender", 4)}
                                        type="button"
                                    >
                                        ⚧
                                    </button>
                                </div>
                                <button
                                    className={s.authSubmit}
                                    disabled={!isDiscordVerified || signupMetadata.hasExistingAccount || signupLoading}
                                    type="submit"
                                >
                                    {signupLoading ? "Creating account..." : "Create account"}
                                </button>
                            </form>
                            <div aria-live="polite" className={s.authFeedback}>{signupFeedback}</div>
                            <div className={s.authFoot}>
                                <span>Already have an account? <a href="/login">Log in</a></span>
                            </div>
                        </>
                    )}
                </div>
            </section>

            <div className={s.authMark}>
                <img alt="Sansy" src={sansyLogo.src} />
            </div>
            <div className={s.authLegal}>(c) 2026 Sansy. Not affiliated with Roblox Corporation.</div>
            {!isLoginPage ? (
                <div
                    aria-label={`Site updated. Build ${siteBuildId}`}
                    className={s.siteUpdateBadge}
                    title={`Deployed build ${siteBuildId}`}
                >
                    <span aria-hidden="true" className={s.siteUpdateDot} />
                    <span>Site updated</span>
                    <code>{siteBuildId === "local" ? "local" : siteBuildId.slice(0, 7)}</code>
                </div>
            ) : null}
        </main>
    );
};

export default PublicLanding;
