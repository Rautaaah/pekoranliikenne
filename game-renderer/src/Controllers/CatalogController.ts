import express, {Request, Response} from "express";
import Config from "../Utilities/Libraries/Config.js";
import Valid from "../Utilities/Middleware/ValidateDto.js";
import {CatalogGameBox as box} from "../Utilities/Libraries/Queues.js";
import {BaseJson, RequestRCCBase} from "./BaseController.js";
import {AnimationRenderRequest, AssetRenderRequest, BodyPartRenderRequest, PackageRenderRequest} from "../Utilities/Dto/Catalog.js";
import {Console} from "../Utilities/Libraries/CS.js";
import fs from "node:fs";
import path from "node:path";

import PackageTemplate from "../../scripts/Package.json" with {type: "json"};
import AnimSilhouetteTemplate from "../../scripts/AnimationSilhouette.json" with {type: "json"};
import AnimationTemplate from "../../scripts/AvatarAnimation.json" with {type: "json"};
import BodyPartTemplate from "../../scripts/BodyPart.json" with {type: "json"};
import HatTemplate from "../../scripts/Hat.json" with {type: "json"};
import HeadTemplate from "../../scripts/Head.json" with {type: "json"};
import MeshTemplate from "../../scripts/Mesh.json" with {type: "json"};
import ModelTemplate from "../../scripts/Model.json" with {type: "json"};
const router = express.Router();
// QueueBox is shared with /game (place renders) via CatalogGameBox.
const cloneTemplate = <T>(template: T): T => JSON.parse(JSON.stringify(template));

router.post("/hat", Valid(AssetRenderRequest), async (req: Request, res: Response) => {
    const assetUrl = `${Config.BaseUrl}asset?id=${req.body.assetId}`;
    const xml: BaseJson = cloneTemplate(HatTemplate);
    xml.Settings.Arguments[0] = assetUrl;
    xml.Settings.Arguments[1] = "PNG";
    xml.Settings.Arguments[2] = 1680;
    xml.Settings.Arguments[3] = 1680;
    xml.Settings.Arguments[4] = Config.BaseUrl;
    Console.Debug(`Queueing catalog hat request with AssetId ${req.body.assetId}`);
    return await box.Enqueue((port: number) => RequestRCCBase(
        req,
        res,
        xml,
        port,
        "Catalog hat"
    ));
});

router.post("/head", Valid(AssetRenderRequest), async (req: Request, res: Response) => {
    const assetUrl = `${Config.BaseUrl}asset?id=${req.body.assetId}`;
    const xml: BaseJson = cloneTemplate(HeadTemplate);
    xml.Settings.Arguments[0] = assetUrl;
    xml.Settings.Arguments[1] = "PNG";
    xml.Settings.Arguments[2] = 1680;
    xml.Settings.Arguments[3] = 1680;
    xml.Settings.Arguments[4] = Config.BaseUrl;
    xml.Settings.Arguments[5] = 1785197;
    Console.Debug(`Queueing catalog head with AssetId ${req.body.assetId}`);
    return await box.Enqueue((port: number) => RequestRCCBase(
        req,
        res,
        xml,
        port,
        "Catalog head"
    ));
});

router.post("/model", Valid(AssetRenderRequest), async (req: Request, res: Response) => {
    const assetUrl = `${Config.BaseUrl}asset?id=${req.body.assetId}`;
    const xml: BaseJson = cloneTemplate(ModelTemplate);
    xml.Settings.Arguments[0] = assetUrl;
    xml.Settings.Arguments[1] = "PNG";
    xml.Settings.Arguments[2] = 420;
    xml.Settings.Arguments[3] = 420;
    xml.Settings.Arguments[4] = Config.BaseUrl;
    Console.Debug(`Queueing catalog model with AssetId ${req.body.assetId}`);
    return await box.Enqueue((port: number) => RequestRCCBase(
        req,
        res,
        xml,
        port,
        "Catalog model"
    ));
});

router.post("/mesh", Valid(AssetRenderRequest), async (req: Request, res: Response) => {
    const assetUrl = `${Config.BaseUrl}asset?id=${req.body.assetId}`;
    const xml: BaseJson = cloneTemplate(MeshTemplate);
    xml.Settings.Arguments[0] = assetUrl;
    xml.Settings.Arguments[1] = "PNG";
    xml.Settings.Arguments[2] = 420;
    xml.Settings.Arguments[3] = 420;
    xml.Settings.Arguments[4] = Config.BaseUrl;
    Console.Debug(`Queueing catalog mesh with AssetId ${req.body.assetId}`);
    return await box.Enqueue((port: number) => RequestRCCBase(
        req,
        res,
        xml,
        port,
        "Catalog mesh"
    ));
});

router.post("/package", Valid(PackageRenderRequest), async (req: Request, res: Response) => {
    const xml: BaseJson = JSON.parse(JSON.stringify(PackageTemplate));
    const mannequinUrl = `${Config.BaseUrl}v1/asset?id=1785197`;
    xml.Settings.Arguments[0] = req.body.assetUrls;
    xml.Settings.Arguments[1] = Config.BaseUrl;
    xml.Settings.Arguments[3] = 420;
    xml.Settings.Arguments[4] = 420;
    xml.Settings.Arguments[5] = mannequinUrl;
    Console.Debug(`Queueing catalog package with AssetUrls ${req.body.assetUrls}`);
    return await box.Enqueue((port: number) => RequestRCCBase(
        req,
        res,
        xml,
        port,
        "Catalog package"
    ));
});

router.post("/bodypart", Valid(BodyPartRenderRequest), async (req: Request, res: Response) => {
    const xml: BaseJson = JSON.parse(JSON.stringify(BodyPartTemplate));
    const mannequinUrl = `${Config.BaseUrl}v1/asset?id=1785197`;
    Console.Log(`AssetUrl: ${req.body.assetUrl}`);
    xml.Settings.Arguments[0] = req.body.assetUrl;
    xml.Settings.Arguments[1] = Config.BaseUrl;
    xml.Settings.Arguments[3] = 420;
    xml.Settings.Arguments[4] = 420;
    xml.Settings.Arguments[5] = mannequinUrl;
    Console.Log(`Body part request XML: ${JSON.stringify(xml)}`);
    return await box.Enqueue((port: number) => RequestRCCBase(
        req,
        res,
        xml,
        port,
        "Body part request"
    ));
});

router.post("/animationsilhouette", Valid(AssetRenderRequest), async (req: Request, res: Response) => {
    const xml: BaseJson = JSON.parse(JSON.stringify(AnimSilhouetteTemplate));
    xml.Settings.Arguments[0] = `${Config.BaseUrl}/v1/asset?id=${req.body.assetId}`;
    xml.Settings.Arguments[1] = Config.BaseUrl;
    xml.Settings.Arguments[4] = '128/128/128';
    Console.Debug(`Queueing catalog animation silhouette with AssetId ${req.body.assetId}`);
    return await box.Enqueue((port: number) => RequestRCCBase(
        req,
        res,
        xml,
        port,
        "Catalog animation silhouette"
    ));
});

router.post("/animation", Valid(AnimationRenderRequest), async (req: Request, res: Response) => {
    const xml: BaseJson = JSON.parse(JSON.stringify(AnimationTemplate));
    xml.Settings.Arguments[0] = req.body.characterAppearanceUrl;
    xml.Settings.Arguments[1] = Config.BaseUrl;
    xml.Settings.Arguments[5] = req.body.animationUrl;
    Console.Debug(`Queueing catalog animation with AssetId ${req.body.assetUrls}`);
    return await box.Enqueue((port: number) => RequestRCCBase(
        req,
        res,
        xml,
        port,
        "Catalog animation"
    ));
});

export default router;
