using System.Buffers;
using System.Diagnostics;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using System.Web;
using Roblox.Logging;

namespace Roblox.Rendering
{
    public static class CommandHandler
    {
        private static System.Threading.Mutex mux { get; set; } = new();
        private static ClientWebSocket? ws { get; set; }
        private static Dictionary<string, Func<RenderResponse<Stream>,int>> resultListeners { get; } = new();
        private static Uri? wsUrl { get; set; }
        // Guard to make Configure() idempotent. Without this, every SendCommand() that hit
        // a closed websocket would Task.Run a fresh ConnectionManager loop, racing dozens of
        // concurrent reconnect loops over the same static `ws` field. That cascade flooded
        // logs and starved the rendering orchestrator/RCC.
        private static int connectionManagerStarted = 0;

        // Reconnect log throttling. When the renderer service is down, the loop here
        // would emit ~4 lines / 5 s (state-change, ConnectAsync error, ListenForMessages
        // error, "websocket closed"). Over weeks that produced 1.4 GB of spam in
        // website-start.log and pinned the disk on every fsync. We now log the first
        // failure, then at most one "still down" line per minute, plus a single
        // "reconnected after N attempts" line when service returns. Exponential
        // backoff caps reconnect attempts at 60 s.
        private static int consecutiveFailures = 0;
        private static DateTime lastFailureLoggedAt = DateTime.MinValue;

        public static void Configure(string baseUrl, string authorization)
        {
            var url = new Uri(baseUrl + "?key=" + HttpUtility.UrlEncode(authorization));
            wsUrl = url;

            if (System.Threading.Interlocked.Exchange(ref connectionManagerStarted, 1) == 1)
                return;

            Task.Run(async () =>
            {
                await ConnectionManager();
            });
        }

        private static async Task ListenForMessages()
        {
            // allocate 8mb
            using var memory = MemoryPool<byte>.Shared.Rent(1024 * 1024 * 8);

            while (true)
            {
                try
                {
                    if (ws == null)
                    {
                        Console.WriteLine("[info] ws is null, waiting for connection...");
                        await Task.Delay(TimeSpan.FromSeconds(1));
                        continue;
                    }
                    var result = await ws.ReceiveAsync(memory.Memory, CancellationToken.None);
                    if (result.MessageType == WebSocketMessageType.Close)
                    {
                        // Stay quiet here: ConnectionManager owns the "renderer down /
                        // back up" log lines and throttles them. Logging on every close
                        // turned this into the #1 contributor to website-start.log spam.
                        return;
                    }

                    var msg = Encoding.UTF8.GetString(memory.Memory.Span.Slice(0, result.Count));

                    Console.WriteLine("got ws message. result={0}", msg.Substring(0,75)+"...");
                    var decoded = JsonSerializer.Deserialize<RenderResponse<string>>(msg);
                    if (decoded == null)
                    {
                        Console.WriteLine("Got invalid WS message - it was null");
                        continue;
                    }
                    var newResponse = new RenderResponse<Stream>()
                    {
                        id = decoded.id,
                        status = decoded.status,
                        data = null,
                    };

                    // data is null when statusCode != 200
                    if (decoded.data != null)
                    {
                        var bytes = Convert.FromBase64String(decoded.data);
                        newResponse.data = new MemoryStream(bytes);
                    }

                    mux.WaitOne();
                    try
                    {
                        if (!string.IsNullOrEmpty(decoded.id) && resultListeners.ContainsKey(decoded.id))
                        {
                            resultListeners[decoded.id](newResponse);
                            resultListeners.Remove(decoded.id);
                        }
                        else
                        {
                            Console.WriteLine("[warning] got message for item without listener. id = {0}", decoded.id ?? "null");
                        }

                    }
                    finally
                    {
                        mux.ReleaseMutex();
                    }
                }
                catch (System.Exception)
                {
                    // Silent: ConnectionManager's catch is the single owner of
                    // renderer-WS error logging and throttles it. Logging here as
                    // well used to double the spam volume.
                    return;
                }
            }
        }
        
        private static async Task ConnectionManager()
        {
            while (true)
            {
                try
                {
                    mux.WaitOne();
                    ws ??= new ClientWebSocket();
                    var wsCurrentState = ws.State;
                    mux.ReleaseMutex();
                    
                    if (wsCurrentState is WebSocketState.Aborted or WebSocketState.Closed or WebSocketState.None or WebSocketState.CloseReceived or WebSocketState.CloseSent)
                    {
                        mux.WaitOne();
                        ws = new ClientWebSocket();
                        mux.ReleaseMutex();
                        if (wsUrl == null)
                        {
                            Console.WriteLine("[error] WebSocket URL not configured.");
                            return;
                        }

                        await ws.ConnectAsync(wsUrl, CancellationToken.None);

                        // ConnectAsync didn't throw - we're up. If we were in a
                        // failure streak, surface a single "back online" line.
                        if (consecutiveFailures > 0)
                        {
                            Console.WriteLine("[info] Render WS reconnected after {0} failed attempts.", consecutiveFailures);
                            consecutiveFailures = 0;
                        }
                    }
                    await ListenForMessages();
                }
                catch (Exception e)
                {
                    consecutiveFailures++;
                    // Log first failure immediately, then at most once per minute
                    // until we either reconnect or the operator notices. This is
                    // the fix for the runaway website-start.log growth (~80% of
                    // 1.4 GB was these lines).
                    if (consecutiveFailures == 1
                        || (DateTime.UtcNow - lastFailureLoggedAt) > TimeSpan.FromMinutes(1))
                    {
                        Console.WriteLine("[info] Render WS unreachable (attempt #{0}): {1}", consecutiveFailures, e.Message);
                        lastFailureLoggedAt = DateTime.UtcNow;
                    }
                    // Exponential backoff capped at 60 s. 5, 10, 20, 40, 60, 60...
                    var backoffSec = Math.Min(60, 5 * (1 << Math.Min(consecutiveFailures - 1, 4)));
                    await Task.Delay(TimeSpan.FromSeconds(backoffSec));
                }
            }
        }

        private static async Task<RenderResponse<Stream>> SendCommand(string command, IEnumerable<dynamic> arguments, CancellationToken? cancellationToken)
        {
            var id = Guid.NewGuid().ToString();
            var cmd = new RenderRequest()
            {
                command = command,
                args = arguments,
                id = id,
            };
            var res = new TaskCompletionSource<RenderResponse<Stream>>();
            var responseMutex = new Mutex();
            
            // Setup listener
            mux.WaitOne();
            resultListeners[id] = stream =>
            {
                Console.WriteLine("[info] SendCommand() over");
                lock (responseMutex)
                {
                    res.SetResult(stream);
                }

                return 0; 
            };
            mux.ReleaseMutex();
            // Send message
            var bits = Encoding.UTF8.GetBytes(JsonSerializer.Serialize(cmd));
            // Wait for the ConnectionManager (started once via Configure) to bring the socket
            // up. Do NOT call Configure() here — that previously spawned a fresh reconnect
            // loop on every retry.
            var waitedMs = 0;
            while (ws is not {State: WebSocketState.Open})
            {
                if (waitedMs == 0)
                    Writer.Info(LogGroup.GeneralRender, "Ws not available, waiting for ConnectionManager…");
                await Task.Delay(TimeSpan.FromMilliseconds(500), cancellationToken ?? CancellationToken.None);
                waitedMs += 500;
                if (cancellationToken is {IsCancellationRequested: true})
                    throw new TaskCanceledException();
                if (waitedMs >= 30_000)
                    throw new Exception("Render websocket did not come up within 30s");
            }
            await ws.SendAsync(bits, WebSocketMessageType.Text, true, cancellationToken ?? CancellationToken.None);

            await using var register = cancellationToken?.Register(() =>
            {
                mux.WaitOne();
                resultListeners.Remove(id);
                mux.ReleaseMutex();
                // TODO: Would be nice if we could send a message to WS telling it to cancel the task
                // TrySetCanceled instead of SetCanceled due to WEB-35
                lock (responseMutex)
                {
                    if (res.TrySetCanceled(cancellationToken.Value) && command != "Cancel")
                    {
                        _ = SendCommand("Cancel", new List<dynamic>()
                        {
                            id,
                        }, CancellationToken.None);
                    }
                }
            });
            var resp = await res.Task;
            return resp;
        }
        
        
        private static async Task<Stream> SendCmdWithErrHandlingAsync(string cmd, IEnumerable<dynamic> arguments, CancellationToken? cancellationToken = null)
        {
            var result = await SendCommand(cmd, arguments, cancellationToken);
            if (result.status != 200) throw new Exception("Render failed with status = " + result.status);
            if (result.data == null) throw new Exception("Null stream returned from SendCommand");
            return result.data;
        }

        public static async Task<Stream> RequestPlayerThumbnail(AvatarData data, CancellationToken? cancellationToken = null)
        {
            if (data.playerAvatarType != "R6")
                throw new Exception("Invalid PlayerAvatarType");
            
            // todo: do we need to get assetTypeId here, or can we just expect caller to get it for us?
            var w = new Stopwatch();
            w.Start();
            
            var result = await SendCommand("GenerateThumbnail",
                new List<dynamic> {data}, cancellationToken);
            w.Stop();
            if (result.status != 200 || result.data == null)
            {
                if (result.data == null && result.status == 200)
                    Roblox.Metrics.RenderMetrics.ReportRenderAvatarThumbnailFailureDueToNullBody(data.userId);
                Roblox.Metrics.RenderMetrics.ReportRenderAvatarThumbnailFailure(data.userId);
                throw new Exception("Render failed with status = " + result.status);
            }
            Metrics.RenderMetrics.ReportRenderAvatarThumbnailTime(data.userId, w.ElapsedMilliseconds);
            return result.data;
        }

        public static async Task<Stream> RequestPlayerHeadshot(AvatarData data, CancellationToken? cancellationToken = null)
        {
            if (data.playerAvatarType != "R6")
                throw new Exception("Invalid PlayerAvatarType");
            
            // todo: do we need to get assetTypeId here, or can we just expect caller to get it for us?
            return await SendCmdWithErrHandlingAsync("GenerateThumbnailHeadshot", new List<dynamic> {data}, cancellationToken);
        }

        public static async Task<Stream> RequestTextureThumbnail(long assetId, int assetTypeId, CancellationToken? cancellationToken = null)
        {
            return await SendCmdWithErrHandlingAsync("GenerateThumbnailTexture", new List<dynamic>
            {
                assetId, 
                assetTypeId
            }, cancellationToken);
        }
        
        public static async Task<Stream> RequestAssetThumbnail(long assetId, CancellationToken? cancellationToken = null)
        {
            return await SendCmdWithErrHandlingAsync("GenerateThumbnailAsset", new List<dynamic>
            {
                assetId, 
            }, cancellationToken);
        }
        
        public static async Task<Stream> RequestAssetMesh(long assetId, CancellationToken? cancellationToken = null)
        {
            return await SendCmdWithErrHandlingAsync("GenerateThumbnailMesh", new List<dynamic>
            {
                assetId, 
            }, cancellationToken);
        }

        public static async Task<Stream> RequestPlaceConversion(string base64EncodedPlace, CancellationToken? cancellationToken = null)
        {
            return await SendCmdWithErrHandlingAsync("ConvertRobloxPlace", new List<dynamic>
            {
                base64EncodedPlace, 
            }, cancellationToken);
        }

        public static async Task<Stream> RequestHatConversion(string base64EncodedHat,
            CancellationToken? cancellationToken = null)
        {
            return await SendCmdWithErrHandlingAsync("ConvertHat", new List<dynamic>()
            {
                base64EncodedHat,
            });
        }
        
        public static async Task<Stream> RequestAssetGame(long assetId, int x, int y, CancellationToken? cancellationToken = null)
        {
            return await SendCmdWithErrHandlingAsync("GenerateThumbnailGame", new List<dynamic>
            {
                assetId,
                x,
                y,
            }, cancellationToken);
        }

        public static async Task<Stream> RequestAssetTeeShirt(long assetId, long contentId, CancellationToken? cancellationToken = null)
        {
            return await SendCmdWithErrHandlingAsync("GenerateThumbnailTeeShirt", new List<dynamic>
            {
                assetId,
                contentId,
            }, cancellationToken);
        }
    }
}

