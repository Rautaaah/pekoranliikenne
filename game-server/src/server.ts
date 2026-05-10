import conf from './helpers/Config';
import CommandHandler from './controllers';
import express = require('express');
import * as models from './models';
import * as HTTPExceptions from 'ts-httpexceptions';
import * as WSLib from 'ws';
import {getUploadCallbacks} from './rendering';
import cp = require('child_process');
import os = require('os');

/**
 * Kill every RCCService process on the host. The orchestrator only tracks
 * its children in-memory (`executorStatus.games`), so any RCC alive at
 * orchestrator startup is necessarily an orphan from a previous run — it
 * can never be controlled, shut down, or addressed by jobId again.
 *
 * Called once at boot (clean slate) and on graceful exit (best effort).
 * Renderer RCCs are spawned on demand by the orchestrator anyway, so this
 * is safe: the next thumbnail request will fire up a fresh worker.
 */
function killAllRccProcesses(reason: string) {
	try {
		if (os.platform() === 'win32') {
			// /F = force, /T = also kill children. Ignore exit code: code 128
			// just means "no matching processes", which is what we want anyway.
			const r = cp.spawnSync('taskkill', ['/F', '/T', '/IM', 'RCCService.exe'], { stdio: 'pipe' });
			console.log(`[info] killAllRccProcesses(${reason}) taskkill exit=${r.status}`);
		} else {
			const r = cp.spawnSync('pkill', ['-9', '-f', 'RCCService'], { stdio: 'pipe' });
			console.log(`[info] killAllRccProcesses(${reason}) pkill exit=${r.status}`);
		}
	} catch (e: any) {
		console.error('[warn] killAllRccProcesses failed:', e?.message || e);
	}
}

// IMPORTANT: must run BEFORE `new CommandHandler()` so that the constructor's
// internal port-scanner doesn't bump into a zombie port-holder.
killAllRccProcesses('startup');

// On graceful shutdown (SIGINT / SIGTERM / unhandled rejection), drag every
// child RCC down with us so the next boot starts clean even if the
// orchestrator is killed externally and never gets to run startup again.
let exiting = false;
function shutdownAndExit(signal: string, code: number = 0) {
	if (exiting) return;
	exiting = true;
	killAllRccProcesses('exit:' + signal);
	process.exit(code);
}
process.on('SIGINT',  () => shutdownAndExit('SIGINT'));
process.on('SIGTERM', () => shutdownAndExit('SIGTERM'));
process.on('SIGHUP',  () => shutdownAndExit('SIGHUP'));
process.on('uncaughtException', (err) => {
	console.error('[fatal] uncaughtException', err);
	shutdownAndExit('uncaughtException', 1);
});

let handle = new CommandHandler();

// WS - used for rendering
const ws = new WSLib.Server({
	port: conf.thumbnailWebsocketPort || 3040,
});
// Express
const app = express();
app.use(express.text({ limit: '250mb' }));
app.use(express.json());

app.use((req, res, next) => {
	console.log('[AUTH] [' + req.method +']', req.url);
	if (req.url === '/api/upload-thumbnail-v1') {
		console.log('[info] skip auth for thumbnailer');
		return next();
	}
	if (req.headers['roblox-server-authorization'] !== conf.authorization) {
		console.error('bad auth')
		return res.status(500).send('Internal server error').end();
	}
	next();
});

// Endpoints invoked by Roblox.Website's ArbiterHttpClient
// (see Roblox/Roblox.Services/Games/GameServer.cs). The C# side POSTs raw
// JSON to /start-game-server, /kill-game-server and /evict-player; map them
// onto the existing CommandHandler methods.
app.post('/start-game-server', async (req, res) => {
	const b = req.body || {};
	const placeId = Number(b.placeId);
	const jobId = String(b.jobId);
	const port = Number(b.gameServerPort ?? b.networkServerPort ?? b.proxyPort);
	if (!placeId || !jobId || !port) {
		console.error('[error] /start-game-server bad payload', b);
		return res.status(400).json({ success: false, message: 'BadRequest' }).end();
	}
	try {
		await handle.startGame(placeId, jobId, port, b);
		res.status(200).json({ success: true }).end();
	} catch (e: any) {
		console.error('[error] /start-game-server failed', e?.message || e);
		res.status(500).json({ success: false, message: e?.message }).end();
	}
});

app.post('/kill-game-server', async (req, res) => {
	const b = req.body || {};
	const jobId = String(b.jobId);
	if (!jobId) return res.status(400).json({ success: false, message: 'BadRequest' }).end();
	try {
		await handle.closeGame(jobId);
		res.status(200).json({ success: true }).end();
	} catch (e: any) {
		console.error('[error] /kill-game-server failed', e?.message || e);
		res.status(500).json({ success: false, message: e?.message }).end();
	}
});

app.post('/evict-player', async (req, res) => {
	// not implemented yet on this orchestrator; ack so the website does not error
	console.log('[info] /evict-player', req.body);
	res.status(200).json({ success: true }).end();
});

app.post('/api/public-method', (req, res, next) => {
	const b = req.body;
	console.log('[' + req.method + '] ' + req.url + ' - ' + b.method);
	// @ts-ignore
	const f = handle[b.method];
	if (typeof f === 'function') {
		const c = f.apply(handle, b.arguments);
		if (typeof c === 'object' && c.then) {
			(c as Promise<any>).then((result) => {
				res.status(200).json(result).end();
			}).catch(e => {
				console.error('[error] error handling method', b.method, e);
				res.status(500).json({ success: false }).end();
			})
		} else {
			res.status(200).json(c).end();
		}
	} else {
		res.status(404).json({ success: false, message: 'NotFound' }).end();
	}
});

app.post('/api/upload-thumbnail-v1', (req, res, next) => {
	console.log('[info] upload-thumbnail start');
	try {
		if (req.body) {
			const js = JSON.parse(req.body);
			if (js['accessKey'] === conf.authorization) {
				const key = js['jobId'];
				const callbacks = getUploadCallbacks()[key];
				handle.removeFromRunningJobs(key);
				if (callbacks) {
					console.log("notifying", callbacks.length, 'subscribers')
					for (const item of callbacks) {
						item(js);
					}
					delete getUploadCallbacks()[key];
					return res.status(200).send({
						success: true,
					}).end();
				} else {
					console.error('[warning] no job id callback for', key);
				}
			} else {
				console.log('bad key', js);
			}
		}
	} catch (e) {
		console.error(e);
	}
	res.status(503).send('Unavailable').end();
});

export default () => {
	// Express
	app.listen(conf.port, () => {
		console.log(`[info] express listening on port`, conf.port)
	});
	// Ws
	console.log('[info] ws server listening on port', (conf.thumbnailWebsocketPort || 3040));
}

const onMessage = async (data: string) => {
	let cmd = JSON.parse(data.toString()) as models.Command;
	console.log('[info] ' + cmd.command)
	// @ts-ignore
	if (typeof handle[cmd.command] !== 'function') {
		console.log('[err] sending 404 for invalidCommand: ' + cmd.command)
		return {
			status: 404,
			code: 'InvalidCommand',
			id: cmd.id,
		};
	}
	try {
		// @ts-ignore
		let results = await handle[cmd.command](...cmd.args);
		return {
			status: 200,
			data: results,
			id: cmd.id,
		}
	} catch (err) {
		if (err instanceof HTTPExceptions.Exception && err! instanceof HTTPExceptions.InternalServerError) {
			return {
				status: err.status,
				code: err.message,
				errorDetails: err,
				id: cmd.id,
			}
		}
		console.error('[error] [ws handle try/catch]', err);
		return {
			status: 500,
			code: 'InternalServerError',
			errorDetails: err,
			id: cmd.id,
		};
	}
}

ws.on('connection', (c, req) => {
	console.log('[info] new connection');
	let url = req.url;
	if (!url) {
		console.log('[info] closing bad conn due to no url')
		return c.close();
	}
	let q = url.indexOf('?');
	if (q === -1) {
		console.log('[info] closing bad conn due to no query param');
		return c.close();
	}
	let d = new URLSearchParams(url.slice(q));
	let key = d.get('key');
	if (!key) {
		console.log('[info] closing bad conn due to no key');
		return c.close();
	}
	if (key !== conf.authorization) {
		console.log('[info] closing bad conn due to non-matching key');
		return c.close();
	}
	c.on('message', async (data) => {
		onMessage(data.toString()).then(result => {
			c.send(JSON.stringify(result))
		})
	})
	c.on('close', () => {
		console.log('[info] closed connection');
	});
});