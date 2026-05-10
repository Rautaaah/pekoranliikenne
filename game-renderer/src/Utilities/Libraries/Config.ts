import * as path from "path";
import * as fs from "fs";
const projectDir = path.resolve(process.cwd());

export const Config: IConfig = JSON.parse(fs.readFileSync(path.join(projectDir, "/config.json")).toString()) as IConfig;

export default Config;

export interface IConfig {
    BaseUrl: string;
    SoapBaseUrl?: string;
    RCCUrl: string;
    Debug: boolean,
    Ports: {
        Process: number;
        RCC: {
            All: number[];
            // New 2-pool layout (preferred). Each pool is the list of RCC ports
            // that serve that logical group:
            //   CatalogGame -> /catalog/* and /game/* requests
            //   ImagePlayer -> /image/*  and /player/* requests
            // The renderer falls back to merging the legacy keys below if
            // these are missing, so old config.json files still work.
            CatalogGame?: number[];
            ImagePlayer?: number[];
            // Legacy per-route keys. Kept for back-compat only — a single
            // CatalogGame/ImagePlayer pair is the recommended layout.
            Player?: number[];
            Image?: number[];
            Place?: number[];
            Catalog?: number[];
        }
    },
    Paths: {
        RCCService: string;
    }
}
