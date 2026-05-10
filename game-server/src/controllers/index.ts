// TODO: This is garbage. RCC managment, image resize/compression, and everything else should be split into their own files
import StdExceptions from '../helpers/Exceptions';
import fs = require('fs');
import path = require('path');
import util = require('util');
import cp = require('child_process');
import pf = require('portfinder');
const sleep = util.promisify(setTimeout);
import os = require('os');
import conf from '../helpers/Config';
import * as models from '../models';
import sharp = require('sharp');
import uuid = require('uuid');
import http = require('http');
import dgram = require('dgram');
let myIp = 'UNKNOWN';
const dockerEnabled: boolean = !conf.dockerDisabled;
console.log('[info] dockerEnabled:',dockerEnabled);
const rccPort = conf.rccPort || 64989; // default: 64989

const isPortAvailable = (port: number): Promise<boolean> => {
	return new Promise((res, rej) => {
		let didAnything = false;
		let timer = setTimeout(() => {
			if (didAnything) return;

			console.log('[info] isPortAvailable timeout for',port);
			res(false);
			try {
				server.close();
			}catch(e) {}
			// @ts-ignore
			timer = undefined;
		}, 5 * 1000);
		const server = http.createServer();
		server.on('error', () => {
			if (didAnything) return;
			if (timer) {
				clearTimeout(timer);
			}
			didAnything = true;
			res(false);
		});
		server.on('listening', () => {
			server.close();
			if (didAnything) return;
			console.log('[info] isPortAvailable',port);
			if (timer) {
				clearTimeout(timer);
			}
			didAnything = true;
			sleep(1000).then(() => {
				res(true);
			})
		})
		server.listen(port);
	});
}

const getFreeRccPort = async (skip: number[] = []): Promise<number> => {
	for (let i = 6001; i < 50000; i++) {
		if (skip.includes(i)) continue;
		let avail = await isPortAvailable(i);
		console.log('[info] port available?',i,avail);
		if (avail) {
			return i;
		}
	}
	throw new Error('No ports available');
}

/**
 * Discover the ephemeral UDP port the patched 2020 RCC bound its NetworkServer
 * to for a given jobId. We can't ask RCC directly (it ignores PreferredPort
 * and exposes nothing over its SOAP interface that reports the chosen port),
 * so we tail its FLog files under %LOCALAPPDATA%\Roblox\logs and look for
 *
 *   `<jobId> binding socket on in6addr_any:NNNN`
 *
 * Polls every 500 ms up to `timeoutMs`. Returns null if the line never shows
 * up (RCC crashed before binding, log dir missing, etc.) — caller decides
 * what to do then. Linux/docker installs that don't write to that path will
 * also return null; they're expected to handle port binding via the
 * orchestrator's existing docker plumbing.
 */
async function findRccGamePort(jobId: string, timeoutMs = 15_000): Promise<number | null> {
	if (os.platform() !== 'win32') return null;
	const logsDir = path.join(process.env.LOCALAPPDATA || '', 'Roblox', 'logs');
	if (!logsDir || !fs.existsSync(logsDir)) return null;

	const start = Date.now();
	const re = /binding socket on in6addr_any:(\d+)/;
	while (Date.now() - start < timeoutMs) {
		try {
			// Newest files first so we hit our match without scanning historical
			// logs on a busy host.
			const files = fs.readdirSync(logsDir)
				.filter(f => f.endsWith('.txt'))
				.map(f => {
					const full = path.join(logsDir, f);
					let mtime = 0;
					try { mtime = fs.statSync(full).mtimeMs; } catch {}
					return { full, mtime };
				})
				.sort((a, b) => b.mtime - a.mtime);

			for (const { full } of files) {
				let content: string;
				try { content = fs.readFileSync(full, 'utf-8'); } catch { continue; }
				if (!content.includes(jobId)) continue;
				const m = content.match(re);
				if (m) return Number(m[1]);
			}
		} catch (e: any) {
			console.error('[warn] findRccGamePort scan error:', e?.message ?? e);
		}
		await sleep(500);
	}
	return null;
}

/**
 * Stand up a UDP forwarder on `0.0.0.0:publicPort` that bridges to
 * `127.0.0.1:rccPort`. Per-client downstream sockets keep the demux clean
 * (the RCC sees each connecting player as a distinct ephemeral source port,
 * exactly like a real NAT). Idle client mappings are reaped after 60 s so
 * long-running servers don't accumulate dead sockets.
 *
 * Best-effort: any error on either side is logged but doesn't crash the
 * orchestrator. The caller MUST invoke `close()` when the game ends so the
 * public port is freed for the next allocation.
 */
function startUdpProxy(publicPort: number, rccPort: number, jobId: string): IUdpProxy {
	const pub = dgram.createSocket({ type: 'udp4', reuseAddr: true });
	type ClientEntry = { sock: dgram.Socket; lastSeen: number };
	const clients = new Map<string, ClientEntry>();
	const idleTimeoutMs = 60_000;

	pub.on('message', (msg: Buffer, rinfo: dgram.RemoteInfo) => {
		const key = `${rinfo.address}:${rinfo.port}`;
		let entry = clients.get(key);
		if (!entry) {
			const sock = dgram.createSocket('udp4');
			sock.on('message', (rccMsg: Buffer) => {
				try { pub.send(rccMsg, rinfo.port, rinfo.address); } catch {}
				const e = clients.get(key);
				if (e) e.lastSeen = Date.now();
			});
			sock.on('error', (err: Error) => {
				console.error(`[udp-proxy ${jobId}] downstream socket error for ${key}:`, err.message);
				try { sock.close(); } catch {}
				clients.delete(key);
			});
			entry = { sock, lastSeen: Date.now() };
			clients.set(key, entry);
		}
		entry.lastSeen = Date.now();
		try { entry.sock.send(msg, rccPort, '127.0.0.1'); } catch (e: any) {
			console.error(`[udp-proxy ${jobId}] send to RCC failed:`, e?.message ?? e);
		}
	});
	pub.on('error', (err: Error) => {
		console.error(`[udp-proxy ${jobId}] public socket error:`, err.message);
	});
	pub.bind(publicPort, '0.0.0.0', () => {
		console.log(`[udp-proxy ${jobId}] listening on 0.0.0.0:${publicPort} -> 127.0.0.1:${rccPort}`);
	});

	const sweeper = setInterval(() => {
		const now = Date.now();
		for (const [key, entry] of clients) {
			if (now - entry.lastSeen > idleTimeoutMs) {
				try { entry.sock.close(); } catch {}
				clients.delete(key);
			}
		}
	}, 30_000);

	return {
		publicPort,
		rccPort,
		close: () => {
			try { clearInterval(sweeper); } catch {}
			for (const entry of clients.values()) {
				try { entry.sock.close(); } catch {}
			}
			clients.clear();
			try { pub.close(); } catch {}
			console.log(`[udp-proxy ${jobId}] closed`);
		},
	};
}

import getScripts from '../scripts';
const scripts = getScripts();

import axiosStatic from 'axios';
import { awaitResult, doesCallbackExist, getResult, resolutionMultiplier } from '../rendering';
import { addMessage } from '../discord';
const axiosClient = axiosStatic.create({
	headers: {
		'user-agent': 'GameServer/1.0',
	}
});

(async() => {
	let result = await axiosClient.get('http://ipv4.icanhazip.com');
	myIp = result.data;
	console.log('[info] server ip:',myIp);
})().catch(e => {
	console.error('[error] could not fetch ip:',e);
});

const maxRendersBeforeRestart = 100;

interface IQueueEntry {
	request: string;
	jobId: string;
	createdAt: number;
}

interface IRccConnection {
	close: () => void;
	port: number;
	id: string;
}

interface IGamePlayerEntry {

}

interface IUdpProxy {
	publicPort: number;
	rccPort: number;
	close: () => void;
}

interface IGameEntry {
	rccReference: IRccConnection|null;
	rccClosed: boolean;
	stdout: string;
	stderr: string;
	exitCode: number|string;

	createdAt: number;

	renderCount: number;
	runningGames: number;
	placeId: number;
	port: number;
	maxPlayerCount: number;
	players: IGamePlayerEntry[];
	serverId: string;
	udpProxy?: IUdpProxy | null;
	interval: {
		latest: any;
		onEnd: () => void;
	};
}

interface IExecutorStatus {
	games: IGameEntry[];
}
const maxJobQueueRunningCount = (() => {
	if (!dockerEnabled)
		return Math.max(1, Math.trunc(os.cpus().length/2));
	return Math.max(1, Math.trunc(os.cpus().length/2));
})();
console.log('[info] system thread count',maxJobQueueRunningCount);

const truncateForDiscordMessage = (msg: string) => {
	msg = msg.replace(/\*/g, '\\*').replace(/\_/g, '\\_').replace(/\~/g, '\\~').replace(/\`/g, '\\`');
	const maxLen = 500;
	if (msg.length < maxLen)
		return msg;
	return msg.substring(msg.length-maxLen) + '...';
}

/**
 * Handle incoming WS commands
 */
export default class CommandHandler extends StdExceptions {

	private executorStatus: IExecutorStatus = {
		games: [],
	}
	private reservedPorts: number[] = [];

	constructor() {
		super();
	}

	private randomId(): string {
		// use UUID for consistency
		return uuid.v4();
		// return require('crypto').randomBytes(32).toString('hex');
	}

	private async startRcc(game: IGameEntry): Promise<void> {
		// isRccReady call is to check if a dev is already running rcc e.g. for debugging.
		if (game.rccReference || ( await this.isRccReady(rccPort))) {
			console.log('[info] rcc already running');
			if (!game.rccReference) {
				game.rccReference = {
					close: () => {},
					port: rccPort,
					id: this.randomId(),
				}
			}
			return;
		}
		console.log('[info] looking for port...');
		// Pass already-reserved ports so the scanner skips them (otherwise a port whose RCC
		// is still booting looks "OS-free" and we'd hand out a duplicate, then loop forever
		// trying to deduplicate it).
		const portToRunOn = await getFreeRccPort(this.reservedPorts.slice());
		// Reserve immediately so concurrent startRcc() calls cannot pick the same port
		// during the window between selection and rcc.spawn().
		this.reservedPorts.push(portToRunOn);
		console.log('[info] found port for rcc!',portToRunOn,'reserved=',this.reservedPorts);
		let rcc: cp.ChildProcessWithoutNullStreams;
		const dockerPidFileLocation = path.join(__dirname, '../../rcccid-' + portToRunOn);
		let rccCid: string|undefined;
		if (!dockerEnabled) {
			const rccPath = conf.rcc || path.join(__dirname, '../../rccservice/Release/');
			const rccExecutable = rccPath + (os.platform() === 'win32' ? 'RCCService.exe' : 'rcc');
			// Patched 2020 RCCService.exe expects the port as a positional argv[1] and ignores
			// `-Port`. See vortexi-src/vortexigameserver/ProcessController.py StartRCC.
			rcc = cp.spawn(rccExecutable, [portToRunOn.toString(), '-PlaceId:0', '-Console'], {
				cwd: rccPath,
				stdio: 'pipe',
			});
		}else{
			try {
				fs.unlinkSync(dockerPidFileLocation);
			}catch(e) {}
			rcc = cp.spawn('/usr/bin/sudo', [path.join(__dirname, '../../start-rcc.sh'), portToRunOn.toString()]);
		}
		game.rccClosed = false;

		// CPU throttling. RCC instances run pathfinding / physics / Lua at
		// NORMAL priority by default and on a 4-core box a handful of busy
		// servers is enough to peg the CPU and starve the orchestrator HTTP
		// loop and the website. Drop them to BELOW_NORMAL so the OS scheduler
		// always favours the control plane: under contention RCC slows down
		// gracefully instead of locking up the whole VM.
		try {
			if (rcc.pid && typeof (os as any).setPriority === 'function') {
				(os as any).setPriority(rcc.pid, (os as any).constants?.priority?.PRIORITY_BELOW_NORMAL ?? 10);
			}
		} catch (e: any) {
			console.log('[warning] could not lower RCC priority:', e?.message ?? e);
		}

		rcc.on('message', (msg) => {
			console.log(msg);
		});
		rcc.stdout.on('data', function (data) {
			game.stdout += data.toString();
			if (!game.stdout.endsWith('\n')) {
				game.stdout += '\n';
			}
			console.log('stdout: ' + data.toString());
		});
		rcc.stderr.on('data', function (data) {
			game.stderr += data.toString();
			if (!game.stderr.endsWith('\n')) {
				game.stderr += '\n';
			}
			console.log('stderr: ' + data.toString());
		});
		rcc.stdout.resume();
		rcc.stderr.resume();
		rcc.on('exit', (code) => {
			this.reservedPorts = this.reservedPorts.filter(v => v !== portToRunOn);
			console.log('[info] rcc child process exited with code ', code);
			if (code !== 0 && code !== null) {
				const lastedMilliseconds = ((Date.now() - game.createdAt) / 1000).toFixed(2);
				const msg = `**RCC exited with code ${code}**\nSTDOUT=${truncateForDiscordMessage(game.stdout)}\nSTDERR=${truncateForDiscordMessage(game.stderr)}\nplaceId=${game.placeId}\nserverId=${game.serverId}\ndurationSeconds=${lastedMilliseconds}\nip=${myIp}`;
			}
			setTimeout(() => {
				if (!game.rccClosed) {
					this.executorStatus.games.forEach(v => {
						if (v.rccReference && game.rccReference && v.rccReference.id === game.rccReference.id) {
							// Kill any running game servers
							this.closeGame(v.serverId);
						}
					})
					game.rccClosed = true;
				}
			}, 1000);
		});

		game.rccReference = {
			id: this.randomId(),
			port: portToRunOn,
			close: () => {
				try {
					rcc.kill('SIGINT');
					game.rccReference = null;
				} catch (e) { }
				if (dockerEnabled) {
					// ID is passed to docker, do regex to prevent arbitrary command execution
					let match = fs.readFileSync(dockerPidFileLocation).toString('utf-8').trim().match(/[a-z0-9]+/g);
					if (!match) {
						console.error('[warning] rcc id does not exist, container will not be deleted');
						return;
					}
					rccCid = match[0];
					console.log('[info] rcc running on docker container:',rccCid);
					if (rccCid) {
						try {
							const rccStopPath = path.join(__dirname, '../../stop-rcc.sh');
							console.log('trying to kill rcc...',rccStopPath,rccCid);
							// cp.execSync('docker kill ' + rccCid);
							let proc = cp.spawn('/usr/bin/sudo',[
								rccStopPath,
								rccCid,
							], {
								stdio: 'inherit',
							});
							proc.on('exit', (c) => {
								console.log('rcc killed with exit code',c);
							});
							console.log('rcc killed');
						}catch(e) {
							console.error('[error] could not kill rcc container',e);
						}
					}
				}
			}
		};

		console.log('[info] waiting for rcc...');
		try {
			await this.waitForRcc(game, portToRunOn);
		}catch(e) {
			if (game.rccReference) {
				game.rccReference.close();
			}
			game.rccReference = null;
			throw e
		}
		console.log('[info] RCC ok');
	}

	protected async isRccReady(port: number) {
		try {
			const result = await axiosClient.request({
				method: 'GET',
				url: 'http://localhost:' + port + '/',
				headers: {
					'Content-Type': 'text/xml; charset=utf-8',
				},
				validateStatus: () => true,
				timeout: 1000,
			});
			await sleep(1500); // rcc requires a second before it actually replies to commands, even if it responds to our ping
			return true;
		} catch (e) {
			return false;
		}
	}

	protected async waitForRcc(game: IGameEntry, port: number) {
		let start = Date.now();
		do {
			let elapsedSeconds = (Date.now() - start) / 1000;
			if (elapsedSeconds > 10) {
				throw new Error('Waited over 10 seconds for rcc, give up');
			}
			if (game.rccClosed) {
				throw new Error('RCC was closed');
			}
			try {
				const result = await axiosClient.request({
					method: 'GET',
					url: 'http://localhost:' + port + '/',
					headers: {
						'Content-Type': 'text/xml; charset=utf-8',
					},
					validateStatus: () => true,
					timeout: 1000,
				});
				await sleep(1500);
				console.log('[info] rcc ok');
				return
			} catch (e) {
				console.log('[info] rcc not ok', e.message);
				await sleep(250);
			}
		} while (true)
	}

	public async runJob(game: IGameEntry, job: IQueueEntry) {
		if (!game.rccReference) {
			throw new Error('RCC is not configured');
		}
		// send request
		const result = await axiosClient.request({
			method: 'POST',
			url: 'http://localhost:' + game.rccReference.port + '/',
			headers: {
				'Content-Type': 'text/xml; charset=utf-8',
			},
			data: job.request,
			timeout: 2 * 60 * 1000,
		});
		// wait until over
		// await getResult(job.jobId);
		console.log('[info] got rcc job', job.jobId);
	}

	/**
	 * Get the status of the web server
	 */
	public async status() {
		return {
			status: 'OK',
		}
	}

	private createSoapRequest(script: string, jobId: string): { request: string; jobId: string; createdAt: number; } {
		const scriptToSend = script
		.replace(/InsertJobIdHere/g, jobId);
		const xml = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <OpenJobEx xmlns="http://roblox.com/">
        <job>
            <id>${jobId}</id>
            <category>0</category>
            <cores>1</cores>
            <expirationInSeconds>43200</expirationInSeconds>
        </job>
        <script>
            <name>GameStart</name>
            <script>
			<![CDATA[
			${scriptToSend}
			]]>
			</script>
        </script>
    </OpenJobEx>
  </soap:Body>
</soap:Envelope>`;
		return {
			request: xml,
			jobId,
			createdAt: Date.now(),
		}
	}

	private createShutdownRequest(jobId: string): { request: string; jobId: string; } {
		const xml = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <CloseJob xmlns="http://roblox.com/" jobID="${jobId}">
		<jobID>${jobId}</jobID>
        <job>
            <id>${jobId}</id>
        </job>
    </CloseJob>
  </soap:Body>
</soap:Envelope>`;
		return {
			request: xml,
			jobId,
		}
	}

	public openJob(game: IGameEntry, timeout: number, port: number, jobRequest: { request: string; jobId: string; }): Promise<void> {
		if (!game.rccReference) {
			throw new Error('RCC is not configured');
		}
		let didTimeout = false;
		return new Promise((res, rej) => {
			const timeoutTimer = setTimeout(() => {
				didTimeout = true;
				rej(new Error('Request timeout'));
			}, timeout);

			axiosClient.request({
				method: 'POST',
				url: 'http://localhost:' + port + '/',
				headers: {
					'Content-Type': 'text/xml; charset=utf-8',
				},
				data: jobRequest.request,
				timeout: timeout,
			}).then(result => {
				if (didTimeout) return;
				clearTimeout(timeoutTimer);
				// todo: parse response, then check for lua error?
				console.log('RPC Result:',result.data);

				res();
			}).catch(e => {
				if (didTimeout) return;
				clearTimeout(timeoutTimer);

				rej(e);
			})
		});
	}

	public getStatus() {
		const status = this.executorStatus.games.map(v => {
			return {
				id: v.serverId,
				placeId: v.placeId,
				playerCount: v.players.length,
				port: v.port,
				isFull: v.players.length >= v.maxPlayerCount,
			};
		});
		console.log('[info] GS status:',status);
		return {
			data: status,
		};
	}

	/**
	 * Build the JSON job descriptor the patched 2020 RCCService expects inside the SOAP
	 * `<script>` element. The patched RCC's OpenJobEx handler parses this body as JSON
	 * (NOT as Lua), so anything else triggers the
	 * "Closing DataModel due to exception: Attempted to execute with invalid JSON" error.
	 */
	public createGameJsonScript(meta: {
		placeId: number,
		jobId: string,
		port: number,
		universeId?: number,
		creatorId?: number,
		creatorType?: number,
		placeVersion?: number,
		baseUrl?: string,
		machineAddress?: string,
		matchmakingContextId?: number,
		gameCode?: string,
		placeVisitAccessKey?: string,
	}): string {
		const baseUrl = (meta.baseUrl || conf.baseUrl).replace(/\/$/, '');
		const machineAddress = meta.machineAddress || '127.0.0.1';
		const creatorTypeStr = meta.creatorType === 2 ? 'Group' : 'User';
		// Patched 2020 RCC expects a nested job descriptor:
		//   { Mode, GameId, Settings: { ... }, Arguments: {} }
		const descriptor = {
			Mode: 'GameServer',
			GameId: meta.jobId,
			Settings: {
				Type: 'Avatar',
				PlaceId: meta.placeId,
				SessionId: meta.jobId,
				GameId: meta.jobId,
				JobId: meta.jobId,
				MachineAddress: machineAddress,
				PreferredPort: meta.port,
				GsmInterval: 5,
				MaxPlayers: 30,
				MaxGameInstances: 51,
				PreferredPlayerCapacity: 30,
				DataCenterId: '69420',
				PlaceVisitAccessKey: meta.placeVisitAccessKey ?? '',
				UniverseId: meta.universeId ?? 0,
				PlaceFetchUrl: `${baseUrl}/asset/?id=${meta.placeId}`,
				MatchmakingContextId: meta.matchmakingContextId ?? 1,
				CreatorId: meta.creatorId ?? 1,
				CreatorType: creatorTypeStr,
				PlaceVersion: meta.placeVersion ?? 1,
				BaseUrl: baseUrl,
				ApiKey: conf.authorization,
				AccessKey: conf.authorization,
				GameCode: meta.gameCode ?? '',
				script: "print('Initializing NetworkServer.')",
			},
			Arguments: {},
		};
		return JSON.stringify(descriptor);
	}

	/**
	 * Legacy Lua game-script builder. Unused by patched 2020 RCC but kept around.
	 */
	public createGameScript(placeId: number, gameId: string, port: number): string {
		return scripts.gameServer
			.replace(/local port = 123/g, `local port = ${port}`)
			.replace(/local placeId = 123/g, `local placeId = ${placeId}`);
	}

	public async startGame(placeId: number, id: string, port: number, meta?: any) {
		if (this.executorStatus.games.length >= 5) {
			throw new Error('Already running max games');
		}
		console.log('[info] startGame called with', placeId, id, port, 'meta?', !!meta);
		const game = {
			rccClosed: false,
			rccReference: null,
			createdAt: Date.now(),
			runningGames: 0,
			renderCount: 0,
			maxPlayerCount: 10,
			placeId: placeId,
			players: [],
			serverId: id,
			port: port,
			stdout: '',
			stderr: '',
			exitCode: '',
			interval: {
				onEnd: () => {
					console.log('[info] server died or timed out (render)');
					this.closeGame(id);
				},
				latest: setInterval(() => {

				}, 30 * 1000),
			},
		} as IGameEntry;

		// CRITICAL: register the game entry in `executorStatus.games` BEFORE
		// the spawn so that the in-flight tracking is visible to closeGame()
		// and checkServerFreshness(). Previously this `push` was missing
		// entirely, which meant `closeGame(serverId)` could never find the
		// game it was meant to kill — every /kill-game-server call quietly
		// returned 200 OK while the RCC kept running forever. Renderers had
		// their own list (`this.RenderRcc`); only game servers were lost.
		this.executorStatus.games.push(game);

		try {
			let start = Date.now();
			await this.startRcc(game);
			if (!game.rccReference) {
				throw new Error('No RCC Reference after calling startRcc');
			}
			// Patched 2020 RCC: SOAP <script> must contain JSON job descriptor.
			const jsonScript = this.createGameJsonScript({
				placeId,
				jobId: id,
				port,
				universeId: meta?.universeId,
				creatorId: meta?.creatorId,
				creatorType: meta?.creatorType,
				placeVersion: meta?.placeVersion,
				matchmakingContextId: meta?.matchmakingContextId,
				gameCode: meta?.gameCode,
				placeVisitAccessKey: meta?.placeVisitAccessKey,
				machineAddress: meta?.gameServerIp,
				baseUrl: meta?.baseUrl,
			});
			console.log('[info] open job (json descriptor)…');
			const req = this.createSoapRequest(jsonScript, id);
			await this.openJob(game, 30 * 1000, game.rccReference.port, req);
			console.log('[info] job opened');
			await sleep(1500);

			// === UDP proxy bridge ===
			// The patched 2020 RCC ignores Settings.PreferredPort and binds its
			// NetworkServer to a random ephemeral port. We discover that port by
			// scanning the RCC's local log file for the
			//   `binding socket on in6addr_any:NNNN`
			// line that mentions our jobId, then stand up a UDP forwarder so the
			// website-advertised public port (== `port`) maps onto whatever the
			// RCC actually picked. Without this the client connects to a port
			// nothing is listening on and the engine fails with error 529.
			try {
				const actualRccPort = await findRccGamePort(id, 20_000);
				if (actualRccPort && actualRccPort !== port) {
					console.log(`[info] RCC bound NetworkServer to ${actualRccPort}; starting UDP proxy ${port} -> ${actualRccPort}`);
					game.udpProxy = startUdpProxy(port, actualRccPort, id);
				} else if (actualRccPort) {
					console.log(`[info] RCC bound directly to requested port ${port}; no proxy needed`);
				} else {
					console.error(`[warn] could not determine RCC's bound NetworkServer port for job ${id}; clients may fail to connect (529)`);
				}
			} catch (proxyErr: any) {
				console.error('[warn] UDP proxy setup failed:', proxyErr?.message ?? proxyErr);
			}
		} catch (e) {
			await this.closeGame(id);
			throw e;
		}
		return {};
	}

	public async closeGame(serverId: string) {
		let game = this.executorStatus.games.find(v => v.serverId === serverId);
		if (!game) return;
		if (game.players.length > 0) {
			// todo: iterate over players and inform web that these people left the game?
		}
		if (!game.serverId) return;
		try {
			clearInterval(game.interval.latest);
		} catch (e) {
			console.error(e);
		}
		// Tear down the UDP proxy bridge first so we stop forwarding traffic
		// to a port that's about to be closed by RCC shutdown. Best-effort.
		if (game.udpProxy) {
			try { game.udpProxy.close(); } catch (e: any) { console.error('[warn] udpProxy close failed:', e?.message ?? e); }
			game.udpProxy = null;
		}
		try {
			await axiosClient.post(conf.baseUrl + '/gs/delete', {
				serverId: game.serverId,
				authorization: conf.authorization,
			})
		} catch (e) {
			console.error('[error] could not close server (double)', e.message, e.response?.data);
		}
		try {
			if (game.rccReference) {
				await this.openJob(game, 10 * 1000, game.rccReference.port, this.createShutdownRequest(serverId));
			}
		}catch(e) {
			console.error('[error] could not request rcc to shut down. will ignore.',e.response, e.message);
		}
		// Remove our game entry
		this.executorStatus.games = this.executorStatus.games.filter(v => v.serverId !== serverId);
		console.log('[info] successfully shut down', serverId, 'there are now', this.executorStatus.games.length, 'game instances running');
		// Check for anyone else using our RCC instance.
		// Currently this is useless - we have it setup as one RCC for each game, but this is done to make it easier
		// to expand to multiple games per rcc in the future.
		const gamesRunningOnThisRcc = this.executorStatus.games.filter(v => {
			if (v.rccReference && game && game.rccReference && v.rccReference.id === game.rccReference.id) {
				return true;
			}
			return false;
		});

		if (gamesRunningOnThisRcc.length === 0 && game.rccReference) {
			// RIP Rcc :(
			console.log('[info] There are no game servers left. RCC is being shut down.');
			game.rccReference.close();
		}
	}

	public async isServerAlive(serverId: string): Promise<boolean> {
		let status = this.executorStatus.games.find(v => v.serverId === serverId);
		if (!status) {
			return false;
		}
		try {
			const resp = await axiosClient.post<{ isAlive: boolean; updatedAt: string }>(conf.baseUrl + '/gs/activity', {
				serverId: status.serverId,
				authorization: conf.authorization,
			});
			return resp.data.isAlive;
		} catch (e) {
			// rip
			console.error('[error] could not get gs activity for serverId', status.serverId, e);
			return false;
		}
	}

	/**
	 * Strict liveness check: kill the RCC if its last /v2.0/Refresh ping is older than
	 * IDLE_KILL_MS, with an INITIAL_GRACE_MS grace period after spawn so RCC has time
	 * to come up and emit its first ping. Called every 5s by the per-game watchdog.
	 */
	private static IDLE_KILL_MS = 15 * 1000;
	private static INITIAL_GRACE_MS = 30 * 1000;
	public async checkServerFreshness(serverId: string): Promise<void> {
		const status = this.executorStatus.games.find(v => v.serverId === serverId);
		if (!status) return;
		const ageSinceSpawn = Date.now() - status.createdAt;
		if (ageSinceSpawn < CommandHandler.INITIAL_GRACE_MS) return;

		let payload: { isAlive: boolean; updatedAt: string };
		try {
			const resp = await axiosClient.post<{ isAlive: boolean; updatedAt: string }>(
				conf.baseUrl + '/gs/activity',
				{ serverId: status.serverId, authorization: conf.authorization },
				{ timeout: 5000 },
			);
			payload = resp.data;
		} catch (e: any) {
			console.error('[warn] /gs/activity poll failed for', status.serverId, e?.message ?? e);
			return; // don't kill the RCC just because the website is briefly unreachable
		}

		// asset_server row gone → server was deleted on the website side.
		if (!payload.isAlive) {
			console.log('[info] server', serverId, 'is no longer registered on website, closing RCC');
			status.interval?.onEnd();
			return;
		}

		const updatedAtMs = new Date(payload.updatedAt).getTime();
		if (Number.isNaN(updatedAtMs)) return;
		const idleMs = Date.now() - updatedAtMs;
		if (idleMs > CommandHandler.IDLE_KILL_MS) {
			console.log('[info] server', serverId, 'has not pinged for',
				(idleMs / 1000).toFixed(1), 's (>', CommandHandler.IDLE_KILL_MS / 1000, 's), closing RCC');
			status.interval?.onEnd();
		}
	}

	public async shutdown(serverId: string): Promise<{}> {
		console.log('[info] call shutdown for', serverId);
		await this.closeGame(serverId);
		return {}
	}

	private JobQueue: IQueueEntry[] = [];
	private RunningJobIds: string[] = [];
	private JobQueueRunningCount = 0;
	private RenderRcc: IGameEntry[] = [];
	public addToQueue(item: IQueueEntry): void {
		this.JobQueue.push(item);
		console.log('[info] addToQueue. queue length =', this.JobQueue.length, 'rcc runner count =', this.JobQueueRunningCount, 'rcc instance count =', this.RenderRcc.length);
		if (this.JobQueueRunningCount < maxJobQueueRunningCount) {
			console.log('[info] start job queue because it is not running');
			this.runJobQueue();
		}
	}

	private async GetRccForRender(): Promise<IGameEntry> {
		let applicable = this.RenderRcc.filter(v => !v.rccClosed && v.rccReference).sort((a,b) => {
			return a.runningGames > b.runningGames ? 1 : a.runningGames === b.runningGames ? (
				a.renderCount > b.renderCount ? 1 : a.renderCount === b.renderCount ? 0 : -1
			) : -1;
		});
		if (applicable && applicable.length) {
			let i = 0;
			for (const rcc of applicable) {
				console.log('[info] picked RCC instance data: running =',rcc.runningGames, 'renders =',rcc.renderCount, 'created =',rcc.createdAt, 'idx =',i);
				i++;

				if (rcc.renderCount >= maxRendersBeforeRestart) {
					console.log('[info] RCC picked has too many renders, requesting a shutdown',rcc.renderCount,'vs',maxRendersBeforeRestart);
					await this.requestRccThumbnailerClose(rcc);
				}else{
					return rcc;
				}
			}
		}
		console.log('[info] no applicable RCC instances for render, will create one');
		const id = this.randomId();
		const port = 0;

		// ugly hack to use a fake game to start rcc :(
		// rcc should be startable WITHOUT a game...
		const game = {
			rccClosed: false,
			rccReference: null,
			createdAt: Date.now(),

			runningGames: 0,
			renderCount: 0,
			maxPlayerCount: 0,
			placeId: 0,
			players: [],
			serverId: id,
			port: port,
			stdout: '',
			stderr: '',
			exitCode: '',
			interval: {
				onEnd: () => {
					console.log('[info] server died or timed out (render)');
					this.closeGame(id);
				},
				latest: setInterval(() => {

				}, 30 * 1000),
			},
		} as IGameEntry;
		let start = Date.now();
		await this.startRcc(game);
		if (!game.rccReference) {
			console.error('undefined RCC reference');
			process.exit(1);
		}
		this.RenderRcc.push(game);
		console.log('[info] started a new RCC instance for renders. time =',(Date.now()-start),'ms');
		return game;
	}

	public removeFromRunningJobs(jobId: string): void {
		this.RunningJobIds = this.RunningJobIds.filter(v => v !== jobId);
	}

	private async runJobQueueTask(rcc: IGameEntry, job: IQueueEntry) {
		if (!rcc || !rcc.rccReference) {
			// fatal error
			console.error('fatal','RCC reference is not available - it was probably closed', new Error().stack);
			process.exit(1);
		}
		// send request
		const result = await axiosClient.request({
			method: 'POST',
			url: 'http://localhost:' + rcc.rccReference.port + '/',
			headers: {
				'Content-Type': 'text/xml; charset=utf-8',
			},
			data: job.request,
			timeout: 2 * 60 * 1000,
		});
		// wait until over
		await awaitResult(job.jobId);
	}

	private async requestRccThumbnailerClose(rcc: IGameEntry) {
		if (rcc.rccReference && !rcc.rccClosed) {
			rcc.rccReference.close();
		}
		// remove dead rcc after killing it
		this.RenderRcc = this.RenderRcc.filter(v => v !== rcc);
	}

	public async runJobQueue() {
		this.JobQueueRunningCount++;
		try {
			while (true) {
				// get our job
				let item = this.JobQueue[0];
				if (!item) {
					console.log('[info] runJobQueue empty, no more jobs left');
					return
				}
				// remove from queue, add to running queue
				if (this.RunningJobIds.includes(item.jobId)) {
					console.log('[info] this job is already running. will skip. id =',item.jobId);
					continue;
				}
				this.JobQueue = this.JobQueue.filter(v => v.jobId !== item.jobId);
				this.RunningJobIds.push(item.jobId);
				let rcc = await this.GetRccForRender();
				let msSinceCreation = Date.now() - item.createdAt;
				// because we are an async function, we should be able to guarantee that doesCallbackExist will only ever return false if 2 minutes has passed, not if the callback was never created in the first place.
				if (!doesCallbackExist(item.jobId)) {
					if (msSinceCreation >= 60*1000) {
						console.log('[warn] skipping job',item.jobId,'because a callback for it does not exist and it was created over 1m ago');
						this.RunningJobIds = this.RunningJobIds.filter(v => v !== item.jobId);
						continue;
					}else{
						console.log('[info] doesCallbackExist returned false, but job was created',msSinceCreation,'ms ago, so run it anyway');
					}
				}
				console.log('[info] [jq] run', item.jobId);
				rcc.runningGames++;
				try {
					// start the task
					await this.runJobQueueTask(rcc, item);
					rcc.renderCount++;
				} catch (e) {
					// timeout error or rcc is not responding to our calls, so it must be killed
					if (e && e.isAxiosError && !e.response) {
						await this.requestRccThumbnailerClose(rcc);
					}
					// runJobQueueTask removes us from job queue, so re-add and try again.
					// if the jobId is removed from RunningJobIds, it means that either the
					// render was cancelled or the render was finished before erroring.
					if (this.RunningJobIds.includes(item.jobId)) {
						this.JobQueue = [item, ...this.JobQueue];
						this.RunningJobIds = this.RunningJobIds.filter(v => v !== item.jobId);
					}
					console.error('[error] [jq]', item.jobId, e);
				}finally{
					rcc.runningGames--;
				}
				console.log('[info] [jq] task', item.jobId, 'finished');
			}
		} catch (e) {
			throw e;
		} finally {
			this.JobQueueRunningCount--;
		}
	}

	public async Cancel(jobId: string): Promise<null> {
		if (this.JobQueue.find(v => v.jobId === jobId)){
			this.JobQueue = this.JobQueue.filter(v => v.jobId !== jobId);
		}else{
			// Already ran or currently running?
			this.removeFromRunningJobs(jobId);
		}
		return null;
	}

	public async GenerateThumbnailAsset(assetId: number): Promise<string> {
		const job = this.createSoapRequest(
			scripts.assetThumbnail
				.replace(/\{1234\}/g, `{${assetId}}`)
				.replace(/_X_RES_/g, (420 * resolutionMultiplier.asset).toString())
				.replace(/_Y_RES_/g, (420 * resolutionMultiplier.asset).toString())
		, uuid.v4());
		this.addToQueue(job);
		return (await getResult(job.jobId, resolutionMultiplier.asset)).thumbnail;
	}

	private async GetTeeShirtThumb(assetId: number): Promise<Buffer> {
		// https://zekoro.org
		const result = await axiosClient.get(`${conf.baseUrl}/asset/?id=${assetId}`, {
			responseType: 'arraybuffer',
			headers: {
				// bot-auth is used to bypass moderation status and encryption
				'bot-auth': conf.websiteBotAuth,
			}
		});
		return Buffer.from(result.data, 'binary');
	}

	private bgBuffer?: Buffer = undefined;

	public async GenerateThumbnailTeeShirt(assetId: number, contentId: number): Promise<string> {
		if (!this.bgBuffer) {
			this.bgBuffer = fs.readFileSync(path.join(__dirname, '../../TeeShirtTemplate.png'));
			console.log('[info] read teeShirtBgBuffer into memory. size =', this.bgBuffer.length, 'bytes');
		}
		const bg = await sharp(this.bgBuffer);
		const content = await this.GetTeeShirtThumb(contentId);
		const image = await sharp(content).resize(250, 250, {
			fit: 'contain',
		}).png().toBuffer();
		bg.composite([
			{
				top: 85,
				left: 85,
				input: image,
			}
		]);
		const buff = await bg.png().toBuffer();
		return buff.toString('base64');
	}

	public async GenerateThumbnailMesh(assetId: number): Promise<string> {
		const job = this.createSoapRequest(
			scripts.meshThumbnail
				.replace(/\{1234\}/g, `{${assetId}}`)
				.replace(/_X_RES_/g, (420 * resolutionMultiplier.asset).toString())
				.replace(/_Y_RES_/g, (420 * resolutionMultiplier.asset).toString())
		, uuid.v4());
		this.addToQueue(job);
		return (await getResult(job.jobId, resolutionMultiplier.asset)).thumbnail;
	}

	public async GenerateThumbnailGame(assetId: number, x = 640, y = 360): Promise<string> {
		const job = this.createSoapRequest(
			scripts.gameThumbnail
				.replace(/\{1234\}/g, `{${assetId}}`)
				.replace(/_X_RES_/g, (x * resolutionMultiplier.game).toString())
				.replace(/_Y_RES_/g, (y * resolutionMultiplier.game).toString())
		, uuid.v4());
		this.addToQueue(job);
		return (await getResult(job.jobId, resolutionMultiplier.game)).thumbnail;
	}

	/**
	 * Generate a thumbnail for a texture (such as a Decal or Texture)
	 * @param assetId
	 * @returns
	 */
	public async GenerateThumbnailTexture(assetId: number, assetTypeId: number): Promise<string> {
		const jobRequest = this.createSoapRequest(
			scripts.imageTexture
				.replace(/65789275746246/g, assetId.toString())
				.replace(/358843/g, assetTypeId.toString())
		, uuid.v4())
		this.addToQueue(jobRequest);
		return (await getResult(jobRequest.jobId, 1)).thumbnail;
	}

	/**
	 * Generate a user avatar headshot
	 * @param user
	 */
	public async GenerateThumbnailHeadshot(user: models.AvatarRenderRequest): Promise<string> {
		console.log(`[info] thumbnail requested`, user);
		const jobRequest = this.createSoapRequest(
			scripts.playerHeadshot
				// set user id
				.replace(/65789275746246/g, user.userId.toString())
				// set user avatar json
				.replace(/JSON_AVATAR/g, JSON.stringify(user).replace(`'`, `\\'`))
				.replace(/_X_RES_/g, (420 * resolutionMultiplier.userHeadshot).toString())
				.replace(/_Y_RES_/g, (420 * resolutionMultiplier.userHeadshot).toString())
		, uuid.v4());
		// create the job
		this.addToQueue(jobRequest);
		// await job
		const result = await getResult(jobRequest.jobId, resolutionMultiplier.userHeadshot);
		// return base64 value
		return result.thumbnail;
	}

	/**
	 * Generate a user avatar thumbnail
	 * @param user
	 */
	public async GenerateThumbnail(user: models.AvatarRenderRequest): Promise<string> {
		console.log(`[info] thumbnail requested`, user);
		const jobRequest = this.createSoapRequest(
			scripts.playerThumbnail
				// set user id
				.replace(/65789275746246/g, "1")
				// set user avatar json
				.replace(/JSON_AVATAR/g, JSON.stringify(user).replace(`'`, `\\'`))
				.replace(/_X_RES_/g, (420 * resolutionMultiplier.userThumbnail).toString())
				.replace(/_Y_RES_/g, (420 * resolutionMultiplier.userThumbnail).toString())
		, uuid.v4());
		// create the job
		this.addToQueue(jobRequest);
		// await job
		const result = await getResult(jobRequest.jobId, resolutionMultiplier.userThumbnail);
		// return base64 value
		return result.thumbnail;
	}

	private async ConvertGeneric(mode: string, base64EncodedFile: string): Promise<string> {
		if (mode !== "convertgame" && mode !== "converthat")
			throw new Error("Bad mode");

		if (dockerEnabled) {
			const scriptPath = path.join(__dirname, '../../start-place-convert.sh');
			// const mode = 'convertgame';
			const dirPath = path.join(__dirname, '../../place-conversion-data');
			if (!fs.existsSync(dirPath)) {
				await fs.promises.mkdir(dirPath);
			}
			// remove anything leftover
			for (const file of await fs.promises.readdir(dirPath)) {
				fs.rmSync(dirPath + '/' + file);
			}
			// write in file
			const inLocation = path.join(dirPath, './in.rbxl');
			const outLocation = path.join(dirPath, './out.rbxl');

			await fs.promises.writeFile(inLocation, Buffer.from(base64EncodedFile, 'base64'));
			// now exec script
			return new Promise((res, rej) => {
				let exec = cp.spawn('/usr/bin/sudo', [scriptPath, mode], {
					stdio: 'inherit',
				});
				exec.on('message', (msg) => {
					console.log('[PlaceConvert]',msg);
				})

				exec.on('exit', (code) => {
					if (code === 0) {
						// read the output
						fs.readFile(outLocation, (err, data) => {
							if (err) {
								return rej(err);
							}
							// delete files
							fs.rmSync(inLocation);
							fs.rmSync(outLocation);
							// return the place as a base64 string
							res(data.toString('base64'));
						});
					}else{
						rej(new Error('Failed with exit code ' + code))
					}
				})
			});
		} else {
			// write to disk
			const p = path.join(__dirname, '../../tmp_place_file.rbxl');
			const out = path.join(__dirname, '../../tmp_place_file_out.rbxl');
			// delete if exists
			try {
				fs.unlinkSync(p);
			} catch (e) { }
			try {
				fs.unlinkSync(out);
			} catch (e) { }
			// Write the base64 place to disk for placeconverter to read...
			await fs.promises.writeFile(p, Buffer.from(base64EncodedFile, 'base64'));
			// confusing argument order: first is output, second is input
			const cmd = `./RobloxPlaceConverter.exe ${mode === "convertgame" ? "game" : "hat"} "${out}" "${p}"`;
			return new Promise((res, rej) => {
				cp.exec(cmd, (err) => {
					if (err) {
						return rej(err);
					}
					// read the output
					fs.readFile(out, (err, data) => {
						if (err) {
							return rej(err);
						}
						// return the place as a base64 string
						res(data.toString('base64'));
					});
				})
			});
		}
	}

	public async ConvertRobloxPlace(placeBase64Encoded: string): Promise<string> {
		return await this.ConvertGeneric('convertgame', placeBase64Encoded);
	}

	public async ConvertHat(hatBase64Encoded: string): Promise<string> {
		return await this.ConvertGeneric('converthat', hatBase64Encoded);
	}
}