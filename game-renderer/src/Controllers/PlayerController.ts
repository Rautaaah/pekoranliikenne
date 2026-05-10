import express, {Response} from "express";
import Config from "../Utilities/Libraries/Config.js";
import Valid from "../Utilities/Middleware/ValidateDto.js";
import {PlayerRenderRequest} from "../Utilities/Dto/Catalog.js";
import {Console, List} from "../Utilities/Libraries/CS.js";
import {ImagePlayerBox as box} from "../Utilities/Libraries/Queues.js";
import {RequestRCCBase} from "./BaseController.js";
import {BaseJson} from "./BaseController.js";
import AvatarTemplate from "../../scripts/Avatar.json" with {type: "json"};
import CloseupTemplate from "../../scripts/Closeup.json" with {type: "json"};

const router = express.Router();
// QueueBox is now shared with /image via ImagePlayerBox so both routes
// dispatch through the same RCC pool (see Utilities/Libraries/Queues.ts).
const cloneTemplate = <T>(template: T): T => JSON.parse(JSON.stringify(template));

router.post("/thumbnail", Valid(PlayerRenderRequest), async (req, res) => {
    const charAppUrl = `${Config.BaseUrl}v1.1/avatar-fetch?placeId=0&userId=${req.body.userId}`;
    const xml: BaseJson = cloneTemplate(AvatarTemplate);
    xml.Settings.Arguments[0] = Config.BaseUrl;
    xml.Settings.Arguments[1] = charAppUrl;
    xml.Settings.Arguments[2] = "PNG";
    xml.Settings.Arguments[3] = 840;
    xml.Settings.Arguments[4] = 840;
    Console.Debug(`Queueing player thumbnail request with UserId ${req.body.userId}`);
    return await box.Enqueue((port: number) => RequestRCCBase(
        req,
        res,
        xml,
        port,
        "Player thumbnail"
    ));
});

router.post("/thumbnail-3d", Valid(PlayerRenderRequest), async (req, res) => {
    const charAppUrl = `${Config.BaseUrl}v1.1/avatar-fetch?placeId=0&userId=${req.body.userId}`;
    const xml: BaseJson = cloneTemplate(AvatarTemplate);
    xml.Settings.Arguments[0] = Config.BaseUrl;
    xml.Settings.Arguments[1] = charAppUrl;
    xml.Settings.Arguments[2] = "OBJ";
    xml.Settings.Arguments[3] = 352;
    xml.Settings.Arguments[4] = 352;
    Console.Debug(`Queueing 3D Player thumbnail request with UserId ${req.body.userId}`);
    return await box.Enqueue((port: number) => RequestRCCBase(
        req,
        res,
        xml,
        port,
        "3D Player thumbnail"
    ));
});

router.post("/headshot", Valid(PlayerRenderRequest), async (req, res) => {
    const charAppUrl = `${Config.BaseUrl}v1.1/avatar-fetch?placeId=0&userId=${req.body.userId}`;
    const xml: BaseJson = cloneTemplate(CloseupTemplate);
    xml.Settings.Arguments[0] = Config.BaseUrl;
    xml.Settings.Arguments[1] = charAppUrl;
    xml.Settings.Arguments[2] = "PNG";
    xml.Settings.Arguments[3] = 720;
    xml.Settings.Arguments[4] = 720;
    xml.Settings.Arguments[5] = true;
    xml.Settings.Arguments[6] = 40;
    xml.Settings.Arguments[7] = 60;
    xml.Settings.Arguments[8] = 0;
    xml.Settings.Arguments[9] = 0;
    Console.Debug(`Queueing player headshot request with UserId ${req.body.userId}`);
    return await box.Enqueue((port: number) => RequestRCCBase(
        req,
        res,
        xml,
        port,
        "Player headshot"
    ));
});

export default router;

export interface Thumbnail3DRCC {
    camera: {
        position: {
            x: number;
            y: number;
            z: number;
        },
        direction: {
            x: number;
            y: number;
            z: number;
        },
        fov: number
    },
    AABB: {
        min: {
            x: number;
            y: number;
            z: number;
        },
        max: {
            x: number;
            y: number;
            z: number;
        },
    },
    files: {
        "scene.obj"?: {
            content: string;
        },
        "scene.mtl"?: {
            content: string;
        },
    },
}

export interface Thumbnail3DResponse {
    camera: {
        position: {
            x: number;
            y: number;
            z: number;
        },
        direction: {
            x: number;
            y: number;
            z: number;
        },
        fov: number
    },
    aabb: {
        min: {
            x: number;
            y: number;
            z: number;
        },
        max: {
            x: number;
            y: number;
            z: number;
        },
    },
    mtl: string,
    obj: string,
    textures: string[],
}
