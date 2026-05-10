import '../styles/globals.css';
import '../styles/helpers/textHelpers.css';
import 'bootstrap/dist/css/bootstrap.min.css';
import App from 'next/app';
import { useRouter } from 'next/router';
// Roblox CSS
import '../styles/roblox/icons.css';
import Navbar from '../components/navbar';
import React, {useEffect} from 'react';
import Head from 'next/head';
import Footer from '../components/footer';
import NextNProgress from "nextjs-progressbar";
import LoginModalStore from '../stores/loginModal';
import AuthenticationStore from '../stores/authentication';
import NavigationStore from '../stores/navigation';
import {getTheme, themeType, getFontStyle, fontStyle, getAccentColor} from '../services/theme';
import MainWrapper from '../components/mainWrapper';
import GlobalAlert from '../components/globalAlert';
import ThumbnailStore from "../stores/thumbnailStore";
import getFlag from "../lib/getFlag";
import Chat from "../components/chat";
import FeedbackStore from "../stores/feedback";
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime.js'

class GlobalErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false };
    }

    static getDerivedStateFromError() {
        return { hasError: true };
    }

    componentDidCatch(error) {
        console.error('[frontend] Unhandled render error', error);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div style={{ padding: 20 }}>
                    <h2 style={{ marginBottom: 8 }}>Something went wrong</h2>
                    <p style={{ margin: 0 }}>Please refresh the page. If this keeps happening, try again in a minute.</p>
                </div>
            );
        }
        return this.props.children;
    }
}

function MaintenanceGate({ children }) {
    return children;
}

if (typeof window !== 'undefined') {
    console.log(String.raw`
      _______      _________      _____       ______     _
     / _____ \    |____ ____|    / ___ \     | ____ \   | |
    / /     \_\       | |       / /   \ \    | |   \ \  | |
    | |               | |      / /     \ \   | |   | |  | |
    \ \______         | |      | |     | |   | |___/ /  | |
     \______ \        | |      | |     | |   |  ____/   | |
            \ \       | |      | |     | |   | |        | |
     _      | |       | |      \ \     / /   | |        |_|
    \ \_____/ /       | |       \ \___/ /    | |         _
     \_______/        |_|        \_____/     |_|        |_|

     Keep your account safe! Do not paste any text here.`);
}

function RobloxApp({Component, pageProps}) {
    const router = useRouter();
    const blendColor = (hex, amount) => {
        const cleanHex = (hex || '').replace('#', '');
        if (cleanHex.length !== 6) return hex;
        const toRgb = (start) => parseInt(cleanHex.slice(start, start + 2), 16);
        const clamp = (n) => Math.max(0, Math.min(255, Math.round(n)));
        const r = toRgb(0);
        const g = toRgb(2);
        const b = toRgb(4);
        const mix = (v) => amount >= 0 ? v + (255 - v) * amount : v * (1 + amount);
        const out = [clamp(mix(r)), clamp(mix(g)), clamp(mix(b))]
            .map((v) => v.toString(16).padStart(2, '0'))
            .join('');
        return `#${out}`;
    };

    const hexToRgbString = (hex) => {
        const cleanHex = (hex || '').replace('#', '');
        if (cleanHex.length !== 6) return '0, 162, 255';
        const r = parseInt(cleanHex.slice(0, 2), 16);
        const g = parseInt(cleanHex.slice(2, 4), 16);
        const b = parseInt(cleanHex.slice(4, 6), 16);
        return `${r}, ${g}, ${b}`;
    };

    const applyAccentTheme = () => {
        const root = document.documentElement;
        const theme = getTheme();
        const accent = getAccentColor();
        const keys = ['--primary-color', '--primary-color-2', '--primary-color-hover', '--secondary-color'];
        if (!accent || theme === themeType.obc2016) {
            keys.forEach((key) => root.style.removeProperty(key));
            return;
        }
        root.style.setProperty('--primary-color', accent);
        root.style.setProperty('--primary-color-2', hexToRgbString(accent));
        root.style.setProperty('--primary-color-hover', blendColor(accent, 0.14));
        root.style.setProperty('--secondary-color', blendColor(accent, -0.18));
    };

    // set theme:
    // jss globals apparently don't support parameters/props, so the only way to do a dynamic global style is to either append a <style> element, use setAttribute(), or append a css file.
    // @ts-ignore
    const isChristmas = false
    useEffect(() => {
		// for font switch
        const bodyEl = document.body;
        if (!bodyEl) return;
        const font = getFontStyle();
		const safeClass = (name) => `font-${name.replace(/\s+/g, '-')}`;
        Object.values(fontStyle).forEach(f => bodyEl.classList.remove(safeClass(f)));
        bodyEl.classList.add(safeClass(font));
        // const el = typeof window !== 'undefined' && document.getElementsByTagName('body');
        // if (el && el.length) {
        //   const theme = getTheme();
        //   const divBackground = theme === themeType.obc2016 ? 'url(/img/Unofficial/obc_theme_2016_bg.png) repeat-x #222224' : isChristmas ? 'url(/img/holiday/blue-snow.png) repeat' : document.getElementById('theme-2016-enabled') ? 'var(--background-color)' : 'var(--white-color)';
        //   el[0].setAttribute('style', 'background: ' + divBackground);
        //   if (theme === themeType.obc2016) {
        //     document.documentElement.style.setProperty('--text-color-primary', '#fff');
        //     document.documentElement.style.setProperty('--text-color-secondary', '#5a5a5a');
        //     document.documentElement.style.setProperty('--white-color', '#191919');
        //     document.documentElement.style.setProperty('--background-color', '#393939');
        //     document.documentElement.style.setProperty('--text-color-secondary-dark', '#b8b8b8');
        //     document.documentElement.setAttribute('data-bs-theme', 'dark');
        //     document.documentElement.style.setProperty('--text-color-quinary', '#5b5b5b');
        //   }
        //   if (isChristmas) {
        //     document.documentElement.style.setProperty('--primary-color', 'rgb(174,0,62)');
        //     document.documentElement.style.setProperty('--secondary-color', 'rgb(150,0,51)');
        //     document.documentElement.style.setProperty('--primary-color-hover', 'rgb(210,0,87)');
        //   }
        // }
		
        dayjs.extend(relativeTime);
        const el = typeof window !== 'undefined' && document.getElementsByTagName('body');
        if (el && el.length) {
            const theme = getTheme();
            const divBackground =
                theme === themeType.obc2016
                ?
                'url(/img/Unofficial/obc_theme_2016_bg.png) repeat-x #222224'
                :
                document.getElementById('theme-2016-enabled')
                ?
                '#e3e3e3'
                :
                '#fff'
            ;
            el[0].setAttribute('style', 'background: ' + divBackground);
            applyAccentTheme();
        }
    }, [pageProps]);
    
    return <div style={pageProps.disableWebsiteTheming ? {minHeight: '100vh'} : null}>
        <Head>
            <link rel="preconnect" href="https://fonts.googleapis.com"/>
            <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin={''}/>
            <title>{pageProps.title || 'Zekoro'}</title>
            <link rel='icon' type="image/png" href='/img/zekorooooo.png?v=20260409'/>
            <meta name='viewport' content='width=device-width, initial-scale=1'/>
        </Head>
        <MaintenanceGate>
            <AuthenticationStore.Provider>
                {pageProps.disableWebsiteTheming ? null : <>
                    <LoginModalStore.Provider>
                        <NavigationStore.Provider>
                            <Navbar/>
                        </NavigationStore.Provider>
                    </LoginModalStore.Provider>
                    <GlobalAlert/>
                </>}
                <FeedbackStore.Provider>
                    <MainWrapper disableTopPadding={pageProps.disableWebsiteTheming} mainFlex={pageProps.disableWebsiteTheming}>
                        {getFlag('clientSideRenderingEnabled', false) ?
                            <NextNProgress options={{showSpinner: true}} color='var(--primary-color)' height={4}/> : null}
                        <ThumbnailStore.Provider>
                            <GlobalErrorBoundary key={router.asPath}>
                                <Component {...pageProps} />
                            </GlobalErrorBoundary>
                            {pageProps.disableWebsiteTheming ? null : <Chat/>}
                        </ThumbnailStore.Provider>
                    </MainWrapper>
                </FeedbackStore.Provider>
                {pageProps.disableWebsiteTheming ? null : <Footer/>}
            </AuthenticationStore.Provider>
        </MaintenanceGate>
    </div>
}

export default RobloxApp;
