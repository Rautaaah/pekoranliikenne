import axios from "axios";
import http from "http";
import {SOAP} from "./SOAP.js";
import Config from "./Config.js";
import {BaseJson} from "../../Controllers/BaseController.js";
import {Console} from "./CS.js";

const rccAgent = new http.Agent({
    keepAlive: true,
    keepAliveMsecs: 15_000,
    maxSockets: 256,
});

export const HttpRequest = async <T>(method: HttpMethod, url: URL, data: any): Promise<T> => {
    const isBrowser = typeof window !== "undefined";
    try {
        if (isBrowser)
            throw new Error("Browser isn't supported for Requests!");
        return await axios.request({
            method,
            url: url.toString(),
            data,
            maxRedirects: 3,
        }).then(res => res.data) as Promise<T>;
    } catch (e) {
        if (axios.isAxiosError(e)) {
            if (e?.response?.status && e.response.status !== 502) {
                return e.response.data as T;
            }
        }
        // @ts-ignore
        throw new Error(e);
    }
};

export const RCCRequest = async <T>(port: number, data: BaseJson | string, jobExpiration: number): Promise<T> => {
    const safeJobExpirationSeconds = Number.isFinite(jobExpiration) && jobExpiration > 0
        ? Math.min(Math.floor(jobExpiration), 120)
        : 30;
    const headers = {
        "Content-Type": "text/xml",
    };
    const finalScript = typeof data === "string" ? data : JSON.stringify(data);
    const xml = SOAP(Config.SoapBaseUrl || Config.BaseUrl, safeJobExpirationSeconds, finalScript);
    const maxAttempts = 3;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            const response = await axios.request({
                method: HttpMethod.POST,
                url: `${Config.RCCUrl}:${port}`,
                timeout: safeJobExpirationSeconds * 1000,
                data: xml,
                maxRedirects: 1,
                headers,
                httpAgent: rccAgent,
            });
            return response.data as T;
        } catch (e: any) {
            if (axios.isAxiosError(e) && e?.response?.status && e.response.status !== 502) {
                return e.response.data as T;
            }

            const shouldRetry = attempt < maxAttempts;
            const message = e?.message ?? "Unknown RCC error";
            if (!shouldRetry) {
                Console.Error(`Error occurred while requesting to RCC on port ${port}: ${message}`);
                throw new Error(message);
            }

            const delayMs = 250 * attempt;
            await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
    }

    throw new Error("Unreachable");
};

export enum HttpMethod {
    POST = "POST",
    GET = "GET",
    PATCH = "PATCH",
    DELETE = "DELETE",
    PUT = "PUT",
}

export class LuaValue {
    type!: string;
    value!: string;
}

export class BatchJobResultClass {
    type!: string;
    value?: string; // present only for LUA_TSTRING
    table?: {
        LuaValue: LuaValue[];
    };
}

export class SOAPEnvelope {
    Header?: any;
    Body!: SOAPBodyClass;
}

export class SOAPBodyClass {
    BatchJobResponse!: BatchJobResponseClass;
}

export class BatchJobResponseClass {
    BatchJobResult!: BatchJobResultClass[];
}

export class SOAPEnvelope2 {
    Header?: any;
    Body!: {
        BatchJobResponse: {
            BatchJobResult: BatchJobResultClass;
        };
    };
}
