import React from 'react';
import Head from 'next/head';
import Theme2016 from "../../../components/theme2016";
import UserProfile from "../../../components/userProfile";
import UserProfileStore from "../../../components/userProfile/stores/UserProfileStore";
import { getUserInfo } from "../../../services/users";

const getProfileHeadshotUrl = (userId, imageVersion) => {
    if (!userId) return '';
    return `https://zekoro.org/thumbs/avatar-headshot.ashx?userId=${userId}&cacheBust=${imageVersion}`;
}

const UserProfilePage = ({ username, userId, description, imageVersion, ...props }) => {
    const ogTitle = username ? `${username}'s Profile` : "Zekoro";
    const ogUrl = userId ? `https://zekoro.org/users/${userId}/profile` : '';
    const ogDesc = description || 'Join Zekoro and explore together!';
    const headshotUrl = getProfileHeadshotUrl(userId, imageVersion);
    
    return (
        <>
            {username && (
                <Head>
                    <title>{ogTitle} - Zekoro</title>
                    <meta property="og:title" content={ogTitle}/>
                    <meta property="og:url" content={ogUrl}/>
                    <meta property="og:type" content="profile"/>
                    <meta property="og:description" content={ogDesc}/>
                    <meta property="og:image" content={headshotUrl}/>
                    <meta property="og:image:secure_url" content={headshotUrl}/>
                    <meta property="og:image:type" content="image/png"/>
                    <meta property="og:image:width" content="420"/>
                    <meta property="og:image:height" content="420"/>
                    <meta name="twitter:card" content="summary"/>
                    <meta name="twitter:title" content={ogTitle}/>
                    <meta name="twitter:description" content={ogDesc}/>
                    <meta name="twitter:image" content={headshotUrl}/>
                    <meta property="og:site_name" content="Zekoro"/>
                    <meta name="theme-color" content="#1188ff"/>
                    <script src="/js/3d/three-r137/three.js"/>
                    <script src="/js/3d/three-r137/MTLLoaderr.js"/>
                    <script src="/js/3d/three-r137/OBJLoaderr.js"/>
                    <script src="/js/3d/three-r137/RobloxOrbitControls.js"/>
                    <script src="/js/3d/tween.js"/>
                </Head>
            )}
            <UserProfileStore.Provider>
                <Theme2016>
                    <UserProfile userId={userId}/>
                </Theme2016>
            </UserProfileStore.Provider>
        </>
    );
};

export async function getServerSideProps(context) {
    const { userId } = context.query;
    const imageVersion = Date.now();
    context.res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    context.res.setHeader('Pragma', 'no-cache');
    context.res.setHeader('Expires', '0');
    // we will get the username, desc
    try {
        const info = await getUserInfo({ userId });
        const username = info.name || "Zekoro";
        const description = info.description || "No description available";
        return {
            props: {
                username,
                description,
                userId,
                imageVersion,
            }
        };
    } catch (error) {
        console.error("Error fetching user info in profile.js" + error);
        return {
            props: {
                username: "Zekoro",
                description: "Join Zekoro and explore together!",
                userId,
                imageVersion,
            }
        };
    }
}

export default UserProfilePage;
