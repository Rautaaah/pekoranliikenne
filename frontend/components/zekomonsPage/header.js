import React, { useEffect, useState } from "react";
import { createUseStyles } from "react-jss";
import Link from "../link";
import PlayerHeadshot from "../playerHeadshot";
import { getMyInfo } from "../../services/users";

const useStyles = createUseStyles({
  header: {
    minHeight: 64,
    borderBottom: "1px solid #2a3445",
    background: "#1f2a3a",
    display: "flex",
    alignItems: "center",
    padding: "8px 16px",
    position: "relative",
    gap: 12,
    "@media (max-width: 980px)": {
      flexWrap: "wrap",
      justifyContent: "space-between",
    },
  },
  left: {
    display: "flex",
    alignItems: "center",
    gap: 16,
    zIndex: 1,
  },
  backLink: {
    textDecoration: "none",
    color: "#ffffff",
    fontSize: 14,
    fontWeight: 600,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    background: "transparent",
    border: "none",
    padding: "8px 0",
  },
  brand: { fontSize: 24, fontWeight: 800, color: "#f5f8ff", lineHeight: 1 },
  brandAccent: { color: "#2ca8ff" },
  nav: {
    display: "flex",
    gap: 26,
    alignItems: "center",
    position: "absolute",
    left: "50%",
    transform: "translateX(-50%)",
    "@media (max-width: 980px)": {
      position: "static",
      transform: "none",
      width: "100%",
      justifyContent: "center",
      gap: 16,
      order: 3,
      overflowX: "auto",
      whiteSpace: "nowrap",
      paddingBottom: 2,
    },
  },
  navGroup: {
    position: "relative",
    display: "inline-flex",
    alignItems: "center",
    // paddingBottom acts as a hover bridge between the link and the dropdown
    // so moving the cursor down to click a child does not break ":hover".
    paddingBottom: 8,
    "&:hover $dropdown": {
      display: "flex",
    },
  },
  navLink: {
    textDecoration: "none",
    color: "#ffffff",
    opacity: 0.9,
    fontWeight: 700,
    fontSize: 16,
    lineHeight: 1,
    padding: "2px 0",
    borderBottom: "2px solid transparent",
    transition: "opacity .12s ease, color .12s ease, border-color .12s ease",
    "&:hover": {
      opacity: 1,
      color: "#ffffff",
    },
    "@media (max-width: 980px)": {
      fontSize: 14,
    },
  },
  dropdown: {
    display: "none",
    position: "absolute",
    top: "100%",
    left: "50%",
    transform: "translateX(-50%)",
    marginTop: 0,
    background: "#25344c",
    border: "1px solid #3a4b68",
    borderRadius: 8,
    padding: 8,
    minWidth: 150,
    flexDirection: "column",
    gap: 4,
    zIndex: 20,
  },
  dropdownLink: {
    textDecoration: "none",
    color: "#d7e6ff",
    fontSize: 14,
    fontWeight: 700,
    padding: "8px 10px",
    borderRadius: 6,
    "&:hover": {
      background: "#334766",
      color: "#ffffff",
    },
  },
  dropdownActive: {
    background: "#2ca8ff",
    color: "#ffffff",
  },
  navActive: {
    color: "#ffffff",
    opacity: 1,
    borderBottomColor: "#2ca8ff",
  },
  right: {
    marginLeft: "auto",
    display: "inline-flex",
    alignItems: "center",
    zIndex: 1,
  },
  profileLink: {
    textDecoration: "none",
    color: "#ffffff !important",
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    fontWeight: 700,
    fontSize: 14,
    lineHeight: 1,
    opacity: 0.95,
    "&:hover": {
      opacity: 1,
      color: "#ffffff !important",
    },
  },
  profileText: {
    color: "#ffffff !important",
  },
  profileThumb: {
    width: 28,
    height: 28,
    borderRadius: "50%",
    overflow: "hidden",
    border: "1px solid #3d4a60",
    background: "#182233",
  },
});

const tabs = [
  { key: "limiteds", label: "Limiteds", href: "/zekomons/limiteds" },
  { key: "leaderboard", label: "Leaderboard", href: "/zekomons/leaderboard" },
  { key: "search", label: "Search", href: "/zekomons/search" },
];

const ZekomonsHeader = ({ activeTab }) => {
  const s = useStyles();
  const [myUserId, setMyUserId] = useState(null);

  useEffect(() => {
    let live = true;
    getMyInfo()
      .then((info) => {
        if (!live) return;
        setMyUserId(info?.id || null);
      })
      .catch(() => {
        if (!live) return;
        setMyUserId(null);
      });
    return () => {
      live = false;
    };
  }, []);

  const myProfileHref = myUserId ? `/zekomons?userId=${myUserId}` : "/zekomons";

  return (
    <header className={s.header}>
      <div className={s.left}>
        <a className={s.backLink} href="https://zekoro.org/home">
          Back To Zekoro
        </a>
        <div className={s.brand}>
          Zeko<span className={s.brandAccent}>mons</span>
        </div>
      </div>

      <nav className={s.nav}>
        {tabs.map((tab) => {
          if (tab.children?.length) {
            const groupActive = tab.children.some((child) => child.key === activeTab) || activeTab === tab.key;
            return (
              <div key={tab.key} className={s.navGroup}>
                <Link href={tab.children[0].href}>
                  <a className={`${s.navLink} ${groupActive ? s.navActive : ""}`}>{tab.label}</a>
                </Link>
                <div className={s.dropdown}>
                  {tab.children.map((child) => (
                    <Link key={child.key} href={child.href}>
                      <a className={`${s.dropdownLink} ${activeTab === child.key ? s.dropdownActive : ""}`}>{child.label}</a>
                    </Link>
                  ))}
                </div>
              </div>
            );
          }

          return (
            <Link key={tab.key} href={tab.href}>
              <a className={`${s.navLink} ${activeTab === tab.key ? s.navActive : ""}`}>{tab.label}</a>
            </Link>
          );
        })}
      </nav>

      <div className={s.right}>
        <a className={s.profileLink} href={myProfileHref}>
          <PlayerHeadshot id={myUserId || 1} size={150} className={s.profileThumb} name="Profile" disableCache />
          <span className={s.profileText}>Profile</span>
        </a>
      </div>
    </header>
  );
};

export default ZekomonsHeader;
