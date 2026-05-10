import { createUseStyles } from "react-jss";
import Link from ".././link";
import { useState } from "react";

const useStyles = createUseStyles({
    fakeNav: {
        position: 'fixed',
        height: '40px',
        backgroundColor: 'var(--secondary-color)',
        boxShadow: 'rgba(25, 25, 25, 0.3) 0px 3px 3px -3px',
        backgroundRepeat: 'repeat-x',
        verticalAlign: 'middle',
        padding: 0,
        zIndex: 1030,
        top: 0,
        left: 0,
        right: 0
    },
    navContainer: {
        maxWidth: '100%!important',
        width: '100%!important',
        height: '100%!important',
        padding: 0,
    },
    logoContainer: {
        margin: '0 12px',
        height: '100%',
        maxWidth: '118px',
        alignItems: 'center',
        display: 'flex',
    },
    logoNav: {
        width: '118px',
        height: '40px',
        display: 'inline-flex',
        alignItems: 'center',
    },
    logoImage: {
        width: '118px',
        height: '30px',
        objectFit: 'contain',
        display: 'block',
    },
});

const InstallHelpPage = (e) => {
    const s = useStyles();
    const [logoSrc, setLogoSrc] = useState('/img/zekororeal.png');

    return <nav className={`navbar fixed-top ${s.fakeNav}`}>
        <div className={s.navContainer}>
            <div className={s.logoContainer}>
                <Link href="/home">
                    <a className={`${s.logoNav} col-lg-3`} href="/home">
                        <img className={s.logoImage} src={logoSrc} alt="Zekoro" onError={() => setLogoSrc('/img/logo.png')} />
                    </a>
                </Link>
            </div>
        </div>
    </nav>
}

export default InstallHelpPage;
