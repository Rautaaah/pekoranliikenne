import Config from "./Config.js";
import {QueueBox} from "./Queue.js";
import {Console} from "./CS.js";

/*
 * Shared queue boxes for the renderer.
 *
 * Historically each controller (Player / Image / Catalog / Place) created
 * its own QueueBox over its own slice of `Config.Ports.RCC`. With overlapping
 * port sets that meant two independent queues could simultaneously dispatch
 * to the same physical RCC instance — RCC only serves one job at a time, so
 * the second request stalled, blew the timeout, and got marked as a failure
 * which then suspended the port for an exponential backoff (see Queue.ts).
 *
 * The new model is two **logical** RCC pools, deliberately small so the
 * operator can run as few as two RCCService.exe instances:
 *
 *     CatalogGameBox  -> serves /catalog/* and /game/*  (place + asset renders)
 *     ImagePlayerBox  -> serves /image/*  and /player/* (image + avatar renders)
 *
 * Operators configure the RCC ports under `Ports.RCC.CatalogGame` and
 * `Ports.RCC.ImagePlayer` in config.json. If those keys are absent we fall
 * back to merging the legacy keys (Catalog+Place, Image+Player) so an
 * existing config.json keeps working without edits.
 */

type PortList = number[];

const dedupe = (ports: (PortList | undefined)[]): PortList => {
    const out = new Set<number>();
    for (const list of ports) {
        if (!list) continue;
        for (const p of list) {
            if (typeof p === "number" && Number.isFinite(p) && p > 0) out.add(p);
        }
    }
    return [...out];
};

const rcc = Config.Ports.RCC as any;

const catalogGamePorts: PortList = Array.isArray(rcc.CatalogGame) && rcc.CatalogGame.length > 0
    ? rcc.CatalogGame
    : dedupe([rcc.Catalog, rcc.Place]);

const imagePlayerPorts: PortList = Array.isArray(rcc.ImagePlayer) && rcc.ImagePlayer.length > 0
    ? rcc.ImagePlayer
    : dedupe([rcc.Image, rcc.Player]);

if (catalogGamePorts.length === 0) {
    Console.Warn("CatalogGame RCC pool is empty. Render requests for /catalog/* and /game/* will fail. " +
        "Set Ports.RCC.CatalogGame in config.json.");
}
if (imagePlayerPorts.length === 0) {
    Console.Warn("ImagePlayer RCC pool is empty. Render requests for /image/* and /player/* will fail. " +
        "Set Ports.RCC.ImagePlayer in config.json.");
}

Console.Log(`&aRCC pool &lcatalog/game&r&a -> ports &l[${catalogGamePorts.join(", ")}]&r`);
Console.Log(`&aRCC pool &limage/player&r&a -> ports &l[${imagePlayerPorts.join(", ")}]&r`);

export const CatalogGameBox = new QueueBox<any>("CatalogGameBox", catalogGamePorts);
export const ImagePlayerBox = new QueueBox<any>("ImagePlayerBox", imagePlayerPorts);
