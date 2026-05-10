import express from "express";
import Config from "./Utilities/Libraries/Config.js";
import {Console} from "./Utilities/Libraries/CS.js";
import PlayerController from "./Controllers/PlayerController.js";
import ImageController from "./Controllers/ImageController.js";
import CatalogController from "./Controllers/CatalogController.js";
import PlaceController from "./Controllers/PlaceController.js";
import {CatalogGameBox, ImagePlayerBox} from "./Utilities/Libraries/Queues.js";

const App = express();
const ProcessPort = Config.Ports.Process;

App.use(express.text({ limit: "250mb" }));
App.use(express.json());

App.listen(ProcessPort, () => Console.Log(`Renderer started on port &a&l${ProcessPort}`));

App.use("/player", PlayerController);
App.use("/image", ImageController);
App.use("/catalog", CatalogController);
App.use("/game", PlaceController);
App.get("/", (_, res) => {
    return res.status(200).send("PEKAPEKA OK!");
});

// Operator-friendly status endpoint. Shows the current state of the two
// RCC pools (port, pending depth, suspended flag) so you can spot a stuck
// RCC without tailing logs. Cheap — no RCC round-trip — safe to poll.
const describeBox = (label: string, box: typeof CatalogGameBox) => ({
    name: label,
    queues: box.Queues.ToArray().map(q => ({
        port: q.port,
        pending: q.pending.Count(),
        consecutiveFailures: q.consecutiveFailures,
        suspended: q.IsSuspended(),
        suspendedUntil: q.suspendedUntil > 0 ? new Date(q.suspendedUntil).toISOString() : null,
    })),
});
App.get("/status", (_, res) => {
    return res.status(200).json({
        ok: true,
        pools: [
            describeBox("CatalogGameBox", CatalogGameBox),
            describeBox("ImagePlayerBox", ImagePlayerBox),
        ],
    });
});
