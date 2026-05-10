import { createUseStyles } from "react-jss";
import { getTheme, themeType } from "../../services/theme";

const footerLinks = {
  "/about-us": "About Us",
  "https://discord.gg/7yUx9C3hCc": "Discord",
  "/My/CurrencyExchange.aspx": "Currency Exchange",
  "/auth/tos": "Terms",
  "/auth/privacy": "Privacy",
};

const useFooterStyles2 = createUseStyles({
  footerContainer: {
    padding: "12px",
    background: p => p.theme === themeType.obc2016 ? "#393939" : "var(--white-color)",
    width: "100%",
    marginTop: "40px",
    boxShadow: "0 0 3px rgba(25, 25, 25, 0.3)",
  },
  footer: {
    textAlign: "center",
    margin: "0 auto",
    maxWidth: "970px",
    display: "flex",
    flexDirection: "column",
  },
  footerLinks: {
    padding: 0,
    textAlign: "center",
    marginBottom: "20px",
    marginTop: "20px",
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    marginLeft: 0,
    marginRight: 0,
    listStyle: "none",
    "&:before,&:after": {
      content: " ",
      display: "table",
    },
  },
  footerLink: {
    margin: "6px",
    whiteSpace: "nowrap",
    listStyle: "none",
    "& a": {
      fontSize: "16px",
      fontWeight: "500",
      color: p => p.theme === themeType.obc2016 ? "var(--text-color-secondary-dark)" : "var(--text-color-secondary)",
      textDecoration: "none",
      "&:hover": {
        textDecoration: "none",
        color: "var(--text-color-primary)",
      },
    },
  },
  footerNote: {
    fontSize: "10px",
    fontWeight: "500",
    margin: "12px auto",
    textAlign: "center",
    width: "78%",
    color: p => p.theme === themeType.obc2016 ? "var(--text-color-secondary-dark)" : "var(--text-color-secondary)",
    lineHeight: "1.5em",
    wordWrap: "break-word",
    hyphens: "none",
  },
});

const Footer = () => {
  const s = useFooterStyles2({ theme: getTheme() });
  return <footer className={s.footerContainer}>
    <div className={s.footer}>
      <ul className={s.footerLinks}>
        {
          Object.getOwnPropertyNames(footerLinks).map(v => {
            return <li className={s.footerLink} key={v}>
              <a href={v}> {footerLinks[v]} </a>
            </li>;
          })
        }
      </ul>
      <p className={s.footerNote}>{"\u00A9"}2025 Zekoro. Zekoro is not affliated with Roblox Corporation.</p>
    </div>
  </footer>;
};

export default Footer;
