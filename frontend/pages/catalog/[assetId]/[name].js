import SharedAssetPage from "../../../components/sharedAssetPage2019";
import { getProductInfoLegacy } from "../../../services/catalog";
import Head from "next/head";
import Theme2016 from "../../../components/theme2016";

const getItemThumbnailUrl = (assetId, imageVersion) => {
    if (!assetId) return "";
    return `https://zekoro.org/thumbs/asset.ashx?assetId=${assetId}&cacheBust=${imageVersion}`;
}

const ItemPage = ({ name, description, assetId, creatorName, imageVersion, ...props }) => {
    const title = name || "Catalog Item";
    const ogDescription = description || "Check out this Zekoro catalog item.";
    const ogImage = getItemThumbnailUrl(assetId, imageVersion);
    const ogUrl = assetId ? `https://zekoro.org/catalog/${assetId}/--` : "https://zekoro.org/catalog";
    return (
        <>
            {name && (
                <Head>
                    <title>{title} - Zekoro</title>
                    <meta property="og:title" content={title}/>
                    <meta property="og:url" content={ogUrl}/>
                    <meta property="og:type" content="website"/>
                    <meta property="og:description" content={ogDescription}/>
                    <meta property="og:image" content={ogImage}/>
                    <meta property="og:image:secure_url" content={ogImage}/>
                    <meta property="og:image:type" content="image/png"/>
                    <meta property="og:image:width" content="420"/>
                    <meta property="og:image:height" content="420"/>
                    {creatorName ? <meta property="og:determiner" content={creatorName}/> : null}
                    <meta name="twitter:card" content="summary_large_image"/>
                    <meta name="twitter:title" content={title}/>
                    <meta name="twitter:description" content={ogDescription}/>
                    <meta name="twitter:image" content={ogImage}/>
                    <meta property="og:site_name" content="Zekoro"/>
                    <meta name="theme-color" content="#1188ff"/>
                </Head>
            )}
            <SharedAssetPage idParamName='assetId' nameParamName='name'/>
        </>
    );
}

export async function getServerSideProps(context) {
    const { assetId } = context.query;
    const imageVersion = Date.now();
    context.res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    context.res.setHeader('Pragma', 'no-cache');
    context.res.setHeader('Expires', '0');
    try {
        const info = await getProductInfoLegacy(assetId);
        return {
            props: {
                name: info.Name,
                description: info.Description || "Check out this Zekoro catalog item.",
                creatorName: info.Creator?.Name || null,
                assetId: assetId,
                imageVersion,
            }
        };
    } catch (error) {
        console.error(error);
        return {
            props: {
                name: null,
                description: null,
                creatorName: null,
                assetId: null,
                imageVersion,
            }
        };
    }
}

export default ItemPage;
