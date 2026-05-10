import {Request, Response} from "express";
import {PlayerRenderRequest} from "../Utilities/Dto/Catalog.js";
import {RCCRequest, SOAPEnvelope, SOAPEnvelope2} from "../Utilities/Libraries/Request.js";
import xml2js from "xml2js";
import {Console} from "../Utilities/Libraries/CS.js";
import Resp from "../Utilities/Libraries/Resp.js";
import util from "util";

const extractLuaValue = (node: any): string | undefined => {
    if (!node) return undefined;

    if (typeof node.value === "string") {
        return node.value;
    }

    if (Array.isArray(node)) {
        for (const item of node) {
            const value = extractLuaValue(item);
            if (value) return value;
        }
        return undefined;
    }

    if (node.LuaValue) {
        return extractLuaValue(node.LuaValue);
    }

    if (typeof node === "object") {
        for (const value of Object.values(node)) {
            const extracted = extractLuaValue(value);
            if (extracted) return extracted;
        }
    }

    return undefined;
};

const extractSoapFault = (result: any): string | undefined => {
    const fault = result?.Body?.Fault;
    if (!fault) return undefined;
    return fault.faultstring || fault.faultcode || JSON.stringify(fault);
};

const extractRccResult = (result: any): string | undefined => {
    return extractLuaValue(result?.Body?.BatchJobResponse?.BatchJobResult)
        || extractLuaValue(result?.Body?.OpenJobExResponse?.OpenJobExResult)
        || extractLuaValue(result?.Body?.ExecuteExResponse?.ExecuteExResult)
        || extractLuaValue(result?.Body?.ExecuteResponse?.ExecuteResult);
};

export const RequestRCCBase = async (
    req: Request,
    res: Response,
    xml: BaseJson | string,
    port: number,
    type: string,
    envelopeType?: number
) => {
    const request: any = req.body;
	// Console.Debug("Raw RCC request:\n" + JSON.stringify(request, null, 2));
    const response: any = await RCCRequest(port, xml, request.jobExpiration);
    const responsePreview = typeof response === "string"
        ? response.slice(0, 500)
        : util.inspect(response, { depth: 4, colors: false }).slice(0, 500);
    // Console.Debug("Raw RCC response:\n" + (typeof response === "string" ? response: util.inspect(response, { depth: 5, colors: false })));
    try {
        let result: any = (await xml2js.parseStringPromise(response, {explicitArray: false}))["SOAP-ENV:Envelope"];
        result = CleanXmlJson(result);
        const fault = extractSoapFault(result);
        if (fault) {
            throw new Error(fault);
        }
        const xmlData = extractRccResult(result);
        if (!xmlData) {
            throw new Error(`RCC response did not contain a result payload. Preview: ${responsePreview}`);
        }
		
        Console.Log(`&aRendered &lsuccessfully&r&a on port &l${port}&r with UserId &l${request.userId}&r, &lAssetId ${request.assetId}&r.`);
        // return res.status(200).set("Content-Type", "image/png").send(Buffer.from(xmlData, "base64"));
        return Resp(res, 200, "success", true, {data: xmlData});
    } catch (e: any) {
        if (e.message.startsWith("Non-whitespace before first tag.")) {
            Console.Error(`${type} render with &c&lUserId ${request.userId}&r, &c&lAssetId ${request.assetId}&r on &c&lport ${port}&r failed while parsing RCC response. Raw response preview:\n${responsePreview}\n\nParser error:\n${e.message}`);
        } else {
            Console.Error(`${type} render with &c&lUserId ${request.userId}&r, &c&lAssetId ${request.assetId}&r on &c&lport ${port}&r failed with the following error message: \n${e.message}`);
        }
        return Resp(res, 500, e.message);
    }
};

export const RequestRCCBaseXMLData = async (
    req: Request,
    res: Response,
    xml: BaseJson | string,
    port: number,
    type: string,
    envelopeType?: number
): Promise<any> => {
    const request: any = req.body;

    const response: any = await RCCRequest(port, xml, request.jobExpiration);
    const responsePreview = typeof response === "string"
        ? response.slice(0, 500)
        : util.inspect(response, { depth: 4, colors: false }).slice(0, 500);
    try {
        let result: any = (await xml2js.parseStringPromise(response, {explicitArray: false}))["SOAP-ENV:Envelope"];
        result = CleanXmlJson(result);
        const fault = extractSoapFault(result);
        if (fault) {
            throw new Error(fault);
        }
        const xmlData = extractRccResult(result);
        if (!xmlData) {
            throw new Error(`RCC response did not contain a result payload. Preview: ${responsePreview}`);
        }
        Console.Log(`&aRendered &lsuccessfully&r&a on port &l${port}&r with ${request.userId}&r, &c&lAssetId ${request.assetId}&r.`);
        return xmlData;
    } catch (e: any) {
        if (e.message.startsWith("Non-whitespace before first tag.")) {
            Console.Error(`${type} render with &c&lUserId ${request.userId}&r, &c&lAssetId ${request.assetId}&r on &c&lport ${port}&r failed while parsing RCC response. Raw response preview:\n${responsePreview}\n\nParser error:\n${e.message}`);
        } else {
            Console.Error(`${type} render with ${request.userId}&r, &c&lAssetId ${request.assetId}&r on &c&lport ${port}&r failed with the following error message: \n${e.message}`);
        }
        return Resp(res, 500, e.message);
    }
};

export class BaseJson {
    Mode!: string;
    Settings!: {
        Type: string;
        Arguments: any[];
    };
    Arguments!: {};
}

function CleanXmlJson(obj: any): any {
    if (Array.isArray(obj)) {
        return obj.map(CleanXmlJson);
    } else if (typeof obj === "object" && obj !== null) {
        const newObj: any = {};

        for (const key in obj) {
            if (key === "$") continue;
            const cleanedKey = key.includes(":") ? key.split(":")[1] : key;
            newObj[cleanedKey] = CleanXmlJson(obj[key]);
        }
        return newObj;
    }
    return obj;
}
