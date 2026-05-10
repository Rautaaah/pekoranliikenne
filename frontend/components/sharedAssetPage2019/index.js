import React, { useEffect, useState } from "react";
import CatalogDetails from "../catalogDetailsPage";
import CatalogDetailsPage from "../catalogDetailsPage/stores/catalogDetailsPage";
import CatalogDetailsPageModal from "../catalogDetailsPage/stores/catalogDetailsPageModal";
import GameDetails from "../gameDetails";
import GameDetailsStore from "../gameDetails/stores/gameDetailsStore";
import { getItemDetailsNew, getItemUrl } from "../../services/catalog";
import { getGameUrl, getLibraryItemUrl, isLibraryItem, multiGetPlaceDetails, multiGetUniverseDetails } from "../../services/games";
import { useRouter } from "next/dist/client/router";
import Feedback from "../../stores/feedback";
import ErrorPage from "../errorPage";
import AssetDetailsStore from "../AssetDetailsPage/stores/AssetDetailsStore";
import AssetDetailsPage from "../AssetDetailsPage";
import AssetDetailsModalStore from "../AssetDetailsPage/stores/AssetDetailsModalStore";
import { catalogPageStyle, getCatalogPageStyle } from "../../services/theme";
import SharedAssetPage from "../sharedAssetPage";

const getUrlForAssetType = ({ assetTypeId, assetId, name, forceGame = false }) => {
    if (forceGame || assetTypeId === 9) {
        // Place
        return getGameUrl({
            placeId: assetId,
            name,
        });
    } else if (isLibraryItem({ assetTypeId })) {
        // Library item
        return getLibraryItemUrl({
            assetId,
            name,
        });
    }
    // Anything else
    return getItemUrl({ assetId: assetId, name: name });
}

/**
 * @param {string} idParamName
 * @param {string} nameParamName
 * @param {ProductInfoLegacy} info
 * @returns {React.JSX.Element|null}
 * @constructor
 */
const AssetPage = ({ idParamName, nameParamName = "" }) => {
    const router = useRouter();
    const [details, setDetails] = useState(null);
    const assetId = Number(router.query[idParamName]);
    const forceGameRoute = router.pathname === '/games/[assetId]/[name]';
    
    useEffect(async () => {
        if (!assetId) return;
        
        if (!details || details.id !== assetId) {
            if (forceGameRoute) {
                try {
                    const placeResp = await multiGetPlaceDetails({ placeIds: [assetId] });
                    const place = placeResp?.[0];
                    if (!place) throw new Error("NotFound");
                    const universeResp = await multiGetUniverseDetails({ universeIds: [place.universeId] });
                    const uni = universeResp?.[0];
                    if (!uni) throw new Error("NotFound");
                    const gameDetails = {
                        name: uni.name,
                        description: uni.description,
                        creatorTargetId: uni.creator.id,
                        creatorType: uni.creator.type,
                        creatorName: uni.creator.name,
                        assetType: 9,
                        id: assetId,
                        createdAt: uni.created,
                        updatedAt: uni.updated,
                        isForSale: uni.price !== null,
                        price: uni.price,
                        itemRestrictions: [],
                        productId: assetId,
                        itemType: "Asset",
                        lowestSellerData: null,
                        offsaleDeadline: null,
                        currency: 1,
                    };
                    setDetails(gameDetails);
                    const expectedUrl = getUrlForAssetType({
                        assetTypeId: 9,
                        assetId: assetId,
                        name: uni.name,
                        forceGame: true,
                    });
                    if (typeof window !== "undefined" && window.location.href !== expectedUrl) {
                        router.push(expectedUrl).then();
                    }
                } catch (e) {
                    Feedback.error("Failed to load game details");
                    throw e;
                }
                return;
            }

            const newDetails = await getItemDetailsNew([assetId]);
            if (newDetails?.length > 0) {
                setDetails(newDetails[0]);
                
                const expectedUrl = getUrlForAssetType({
                    assetTypeId: newDetails[0].assetType,
                    assetId: newDetails[0].id,
                    name: newDetails[0].name,
                    forceGame: forceGameRoute,
                });
                if (typeof window !== 'undefined' && window.location.href !== expectedUrl) {
                    router.push(expectedUrl).then();
                }
            } else {
                console.warn("New details length is 0, returning..");
            }
        }
    }, [assetId]);
    
    if (getCatalogPageStyle() === catalogPageStyle.Legacy)
        return <SharedAssetPage idParamName={idParamName} nameParamName={nameParamName} />
    
    if (!details || !assetId) return <span className="spinner" style={{ height: "100%", backgroundSize: "auto 36px" }}/>
    
    if (forceGameRoute || details.assetType === 9) {
        // Place
        return <GameDetailsStore.Provider>
            <GameDetails details={details}/>
        </GameDetailsStore.Provider>;
    }
    // Anything else (e.g. hat, shirt, model)
    return <AssetDetailsStore.Provider>
        <AssetDetailsModalStore.Provider>
            <AssetDetailsPage details={details}/>
        </AssetDetailsModalStore.Provider>
    </AssetDetailsStore.Provider>
}

export default AssetPage;
