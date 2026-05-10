import express, {Request, Response} from "express";
import Config from "../Utilities/Libraries/Config.js";
import Valid from "../Utilities/Middleware/ValidateDto.js";
import {CatalogGameBox as box} from "../Utilities/Libraries/Queues.js";
import {RequestRCCBase} from "./BaseController.js";
import {PlaceRenderRequest} from "../Utilities/Dto/Catalog.js";
import {Console} from "../Utilities/Libraries/CS.js";
import {BaseJson} from "./BaseController.js";
import PlaceTemplate from "../../scripts/Place.json" with {type: "json"};

const router = express.Router();
// QueueBox is shared with /catalog via CatalogGameBox.
const cloneTemplate = <T>(template: T): T => JSON.parse(JSON.stringify(template));

router.post("/thumbnail", Valid(PlaceRenderRequest), async (req: Request, res: Response) => {
    const assetUrl = `${Config.BaseUrl}asset?id=${req.body.placeId}`;
    const xml: BaseJson = cloneTemplate(PlaceTemplate);
    xml.Settings.Arguments[0] = assetUrl;
    xml.Settings.Arguments[1] = "PNG";
    xml.Settings.Arguments[2] = req.body.x;
    xml.Settings.Arguments[3] = req.body.y;
    xml.Settings.Arguments[4] = Config.BaseUrl;
    xml.Settings.Arguments[6] = Config.BaseUrl;
    if (typeof req.body.universeId === "number") {
        xml.Settings.Arguments[7] = req.body.universeId;
    }
    Console.Log(`Queueing place thumbnail request with PlaceId ${req.body.placeId}`);
    return await box.Enqueue((port: number) => RequestRCCBase(
        req,
        res,
        xml,
        port,
        "Place thumbnail"
    ));
});

export default router;
