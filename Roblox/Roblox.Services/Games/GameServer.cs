using System.Diagnostics;
using System.Text;
using System.Text.Json;
using Dapper;
using Roblox.Dto.Games;
using Roblox.Libraries.EasyJwt;
using Roblox.Libraries.Password;
using Roblox.Models.Assets;
using Roblox.Models.Economy;
using Roblox.Models.GameServer;
using Roblox.Services.Exceptions;
using Roblox.Logging;
using System.Collections.Concurrent;
using Roblox.Dto.Users;

namespace Roblox.Services;



public class GameServerService : ServiceBase
{
    private const string PresenceCacheKeyPrefix = "presence:v1:";

    private static async Task InvalidatePresenceCache(long userId)
    {
        try
        {
            await Cache.distributed.KeyDeleteAsync(PresenceCacheKeyPrefix + userId);
        }
        catch
        {
            // Best-effort cache invalidation.
        }
    }

    public class ArbiterHttpClient : HttpClient
    {
        
        public ArbiterHttpClient()
        {
            // Talks to the local node `game-server` orchestrator (see /game-server, port from
            // game-server/config.json -> "port", default 3040). It auths via the
            // `roblox-server-authorization` header against `conf.authorization`, which mirrors
            // appsettings.json -> GameServerAuthorization.
            this.BaseAddress = new Uri("http://127.0.0.1:3040/");
            this.DefaultRequestHeaders.Add("roblox-server-authorization", Configuration.GameServerAuthorization);
        }
        public async Task<bool> StartGameServer(StartGameServerRequest request)
        {
            var result = await this.PostAsync("start-game-server", new StringContent(JsonSerializer.Serialize(request), Encoding.UTF8, "application/json"));
            return result.IsSuccessStatusCode;
        }
        public async Task<bool> EvictPlayer(EvictPlayerRequest request)
        {
            /*
                This is temporary because the JSON doesnt format well
            */
            var jsonRequest = $"{{ \"gameId\": \"{request.gameId}\", \"userId\": {request.userId}, \"messageVersionId\": {request.messageVersionId} }}";
            var result = await this.PostAsync("evict-player", new StringContent(jsonRequest, Encoding.UTF8, "application/json"));
            return result.IsSuccessStatusCode;
        }
        public async Task<bool> KillGameServer(KillGameServerRequest request, CancellationToken cancellationToken)
        {
            var content = new StringContent(
                JsonSerializer.Serialize(request),
                Encoding.UTF8,
                "application/json");

            var result = await this.PostAsync("kill-game-server", content, cancellationToken);
            return result.IsSuccessStatusCode;
        }
        public static EvictPlayerRequest CreateEvictPlayerRequest(Guid jobId, long userId)
        {
            return new EvictPlayerRequest
            {
                gameId = jobId,
                userId = userId,
                messageVersionId = 0
            };
        }
        public static StartGameServerRequest CreateGameServerRequest(PlaceEntry placeInfo, int rccPort, int networkServerPort, int proxyPort, Guid jobId, int matchmaking)
        {
            return new StartGameServerRequest
            {
                jobId = jobId,
                placeId = placeInfo.placeId,
                universeId = placeInfo.universeId,
                maxPlayerCount = placeInfo.maxPlayerCount,
                gameServerPort = networkServerPort,
                rccPort = rccPort,
                proxyPort = proxyPort,
                creatorId = placeInfo.builderId,
                placeVersion = 1,
                matchmakingContextId = matchmaking,
                year = placeInfo.year,
                gameServerIp = Configuration.GameServerIp,
                baseUrl = Configuration.BaseUrl,
            };
        }
        public static KillGameServerRequest CreateKillGameServerRequest(Guid jobId)
        {
            return new KillGameServerRequest
            {
                jobId = jobId,
            };
        }
        public class EvictPlayerRequest
        {
            public Guid gameId { get; set; }
            public long userId { get; set; }
            public int messageVersionId { get; set; }
        }
        public class StartGameServerRequest
        {
            public Guid jobId { get; set; }
            public long placeId { get; set; }
            public long universeId { get; set; }
            public int maxPlayerCount { get; set; }
            public long gameServerPort { get; set; }
            public long rccPort { get; set; }
            public long proxyPort { get; set; }
            public long creatorId { get; set; }
            public long placeVersion { get; set; }
            public int matchmakingContextId { get; set; }
            public long year { get; set; }
            public string gameServerIp { get; set; } = "";
            public string baseUrl { get; set; } = "";
        }

        public class KillGameServerRequest
        {
            public Guid jobId { get; set; }
        }
    }

    private const string ClientJoinTicketType = "GameJoinTicketV1.1";
    private const string ServerJoinTicketType = "GameServerTicketV2";
    private static ArbiterHttpClient arbiterClient = new ArbiterHttpClient();
    private static GamesService games = new GamesService();
    private static string jwtKey { get; set; } = string.Empty;
    private static EasyJwt jwt { get; } = new();
    private static Random RandomComponent = new Random();
    private static PasswordHasher hasher { get; } = new();
    private static Dictionary<long, long> gamePlayerCounts = new Dictionary<long, long>(); // placeid, playercount
    private static Dictionary<string, Process> jobRccs = new Dictionary<string, Process>(); // jobid, rcc process
    public static Dictionary<string, int> currentGameServerPorts = new Dictionary<string, int>() {}; // networkserver ports, jobid, port
    private static Dictionary<long, string> currentPlaceIdsInUse = new Dictionary<long, string>(); // placeid, jobid
    public static ConcurrentDictionary<long, long> CurrentPlayersInGame = new ConcurrentDictionary<long, long>() { }; // userid, placeid
    public static Dictionary<Process, int> mainRCCPortsInUse = new Dictionary<Process, int>(); // Process, main RCC soap port
    public static Dictionary<string, int> unreadyGameServers = new Dictionary<string, int>(); // Process, network server port
    public static void Configure(string newJwtKey)
    {
        jwtKey = "6EwhjPzM9Kf9pPRgYyCnhmM3v6j9d95vCg+NBeUThw49dcLLs1BvNnErFItWCEjS0e85QaYRcE38sTgkRg";
    }

    private string HashIpAddress(string hashedIpAddress)
    {
        return hasher.Hash(hashedIpAddress);
    }

    private bool VerifyIpAddress(string hashedIpAddress, string providedIpAddress)
    {
        return hasher.Verify(hashedIpAddress, providedIpAddress);
    }

    /// <summary>
    /// Create a ticket for joining a game
    /// </summary>
    /// <param name="userId">The ID of the user</param>
    /// <param name="placeId">The ID of the place</param>
    /// <param name="ipHash">The IP Address from ControllerBase.GetIP()</param>
    /// <returns></returns>
    public string CreateTicket(long userId, long placeId, string ipHash)
    {
        var entry = new GameServerJwt
        {
            t = ClientJoinTicketType,
            userId = userId,
            placeId = placeId,
            ip = HashIpAddress(ipHash),
            iat = DateTimeOffset.Now.ToUnixTimeSeconds(),
        };
        return jwt.CreateJwt(entry, jwtKey);
    }

    public bool IsExpired(long issuedAt)
    {
        var createdAt = new DateTime(1970, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc).AddSeconds(issuedAt);
        var notExpired = createdAt.Add(TimeSpan.FromMinutes(5)) > DateTime.UtcNow;
        if (!notExpired)
        {
            return true;
        }

        return false;
    }

    public GameServerJwt DecodeTicket(string ticket)
    {
        var value = jwt.DecodeJwt<GameServerJwt>(ticket, jwtKey);
        if (value.t != ClientJoinTicketType) throw new ArgumentException("Invalid ticket");
        if (IsExpired(value.iat))
        {
            throw new ArgumentException("Invalid ticket");
        }
        return value;
    }

    public string CreateGameServerTicket(long placeId, string domain)
    {
        var ticket = new GameServerTicketJwt
        {
            t = ServerJoinTicketType,
            placeId = placeId,
            domain = domain,
            iat = DateTimeOffset.Now.ToUnixTimeSeconds(),
        };
        return jwt.CreateJwt(ticket, jwtKey);
    }

    public GameServerTicketJwt DecodeGameServerTicket(string ticket)
    {
        var value = jwt.DecodeJwt<GameServerTicketJwt>(ticket, jwtKey);
        if (value.t != ServerJoinTicketType) throw new ArgumentException("Invalid ticket");
        if (IsExpired(value.iat))
        {
            throw new ArgumentException("Invalid ticket");
        }

        return value;
    }

    public async Task OnPlayerJoin(long userId, long placeId, Guid serverId)
    {
        // Idempotent: this method can be invoked from up to three places for the
        // same player+server (eager call from /Game/Join.ashx, the in-game Lua
        // monitor's PlayerAdded -> /gs/players/report Join, and other internal
        // paths). asset_server_player has no unique constraint on
        // (server_id, user_id), so without this guard the second call would
        // double-insert and also double-bump visit_count / play history /
        // creator ticket payout below. Bail early if we already have a row.
        if (await IsUserOnServer(userId, serverId))
            return;

        CurrentPlayersInGame.AddOrUpdate(userId, placeId, (key, oldValue) => placeId);
        await InvalidatePresenceCache(userId);
        await db.ExecuteAsync(
            "INSERT INTO asset_server_player (asset_id, user_id, server_id) VALUES (:asset_id, :user_id, :server_id::uuid)",
            new
            {
                asset_id = placeId,
                user_id = userId,
                server_id = serverId,
            });
        await InsertAsync("asset_play_history", new
        {
            asset_id = placeId,
            user_id = userId,
        });
        await db.ExecuteAsync("UPDATE asset_place SET visit_count = visit_count + 1 WHERE asset_id = :id", new
        {
            id = placeId,
        });
        // give ticket to creator
        await InTransaction(async _ =>
        {
            using var assets = ServiceProvider.GetOrCreate<AssetsService>(this);
            var placeDetails = await assets.GetAssetCatalogInfo(placeId);
            using var ec = ServiceProvider.GetOrCreate<EconomyService>(this);
            using var cooldown = ServiceProvider.GetOrCreate<CooldownService>(this);
            // Per 100 users there is a 1 day cooldown to earn tickets from visits
            if (await cooldown.TryIncrementBucketCooldown("TicketCreatorPlaceVisit:" + placeId, 100, TimeSpan.FromDays(1)))
            {
                if (placeDetails.creatorType == CreatorType.Group)
                {
                    await InsertAsync("user_transaction", new
                    {
                        amount = 10,
                        currency_type = CurrencyType.Tickets,
                        user_id_one = (long?)null,
                        user_id_two = userId,
                        group_id_one = placeDetails.creatorTargetId,
                        type = PurchaseType.PlaceVisit,
                        // store id of the game as well
                        asset_id = placeId,
                    });
                }
                else
                {
                    if (placeDetails.creatorTargetId == userId)
                    {
                        return 0;
                    }
                    await ec.IncrementCurrency(CreatorType.User, placeDetails.creatorTargetId, CurrencyType.Tickets, 10);
                    await InsertAsync("user_transaction", new
                    {
                        amount = 10,
                        currency_type = CurrencyType.Tickets,
                        user_id_one = placeDetails.creatorTargetId,
                        user_id_two = userId,
                        type = PurchaseType.PlaceVisit,
                        // store id of the game as well
                        asset_id = placeId,
                    });
                    /* 
                        Homestead = 6
                        Bricksmith = 7
                    */
                    using var accountService = ServiceProvider.GetOrCreate<AccountInformationService>(this);
                    var badges = await accountService.GetUserBadges(placeDetails.creatorTargetId);
                    switch (await games.GetTotalVisitsFromUser(placeDetails.creatorTargetId))
                    {
                        case 100:
                            if (badges.Any(b => b.id == 6))
                            {
                                return 0;
                            }
                            await db.ExecuteAsync("INSERT INTO user_badge (user_id, badge_id) VALUES (:user_id, :badge_id)", new
                            {
                                user_id = placeDetails.creatorTargetId,
                                badge_id = 6,
                            });
                            break;
                        case 1000:
                            if (badges.Any(b => b.id == 7))
                            {
                                return 0;
                            }
                            await db.ExecuteAsync("INSERT INTO user_badge (user_id, badge_id) VALUES (:user_id, :badge_id)", new
                            {
                                user_id = placeDetails.creatorTargetId,
                                badge_id = 7,
                            });
                            break;
                        default:
                            break;
                    }
                }
            }


            return 0;
        });
    }

    public async Task OnPlayerLeave(long userId, long placeId, Guid serverId)
    {
        CurrentPlayersInGame.TryRemove(userId, out _);
        await InvalidatePresenceCache(userId);

        await db.ExecuteAsync(
            "DELETE FROM asset_server_player WHERE user_id = :user_id AND server_id = :server_id::uuid", new
            {
                server_id = serverId,
                user_id = userId,
            });
        Console.WriteLine("deleted from db line 195 onplayerleave");

        // Safety net: if the in-game Lua's own shutdown call failed (network
        // hiccup, ungraceful crash, abandoned launcher) the RCC will keep
        // running forever and presence will stay stuck on "InGame". After
        // the player row is gone, kick off an async empty-server check that
        // shuts the RCC down if no one else is left. Re-checks after a short
        // delay so a teleport / quick rejoin doesn't trip it.
        _ = Task.Run(async () =>
        {
            try
            {
                if ((await GetGameServerPlayers(serverId)).Any()) return;
                await Task.Delay(TimeSpan.FromSeconds(5));
                if ((await GetGameServerPlayers(serverId)).Any()) return;

                Console.WriteLine($"[OnPlayerLeave] server {serverId} is empty after last player left; shutting down RCC.");
                await ShutDownServerAsync(serverId);
            }
            catch (Exception e)
            {
                Console.WriteLine($"[OnPlayerLeave] empty-server shutdown failed for {serverId}: {e.Message}");
            }
        });
        var latestSession = await db.QuerySingleOrDefaultAsync<AssetPlayEntry>(
            "SELECT id, created_at as createdAt FROM asset_play_history WHERE user_id = :user_id AND asset_id = :asset_id AND ended_at IS NULL ORDER BY asset_play_history.id DESC LIMIT 1",
            new
            {
                user_id = userId,
                asset_id = placeId,
            });
        if (latestSession != null)
        {
            await db.ExecuteAsync("UPDATE asset_play_history SET ended_at = now() WHERE id = :id", new
            {
                id = latestSession.id,
            });

            if (latestSession.createdAt.Year != DateTime.UtcNow.Year) return;

            var playTimeMinutes = (long)Math.Truncate((DateTime.UtcNow - latestSession.createdAt).TotalMinutes);
            var ticketableMinutes = Math.Min(playTimeMinutes, 5);
            var earnedTickets = ticketableMinutes * 6;
            if (earnedTickets <= 0)
                return;

            var cooldownKey = "GameplayTicketsCooldownV1:" + userId;
            if ((await redis.StringGetAsync(cooldownKey)) != null)
                return;

            const long maxEarningsPerPeriod = 30;
            using (var ec = ServiceProvider.GetOrCreate<EconomyService>(this))
            {
                var earningsToday =
                    await ec.CountTransactionEarningsOfType(userId, PurchaseType.PlayingGame, null, TimeSpan.FromMinutes(30));

                if (earningsToday >= maxEarningsPerPeriod)
                    return;
                earnedTickets = Math.Min(earnedTickets, maxEarningsPerPeriod - earningsToday);
            }

            await InTransaction(async _ =>
            {
                using var ec = ServiceProvider.GetOrCreate<EconomyService>(this);
                await ec.IncrementCurrency(CreatorType.User, userId, CurrencyType.Tickets, earnedTickets);
                await InsertAsync("user_transaction", new
                {
                    amount = earnedTickets,
                    currency_type = CurrencyType.Tickets,
                    user_id_one = userId,
                    user_id_two = 1,
                    type = PurchaseType.PlayingGame,
                    // store id of the game they played as well
                    asset_id = placeId,
                });

                return 0;
            });

            if (ticketableMinutes >= 5)
                await redis.StringSetAsync(cooldownKey, "{}", TimeSpan.FromMinutes(10));
        }
    }

    public async Task ForceRemoveUserFromAllServers(long userId)
    {
        var sessions = (await db.QueryAsync<(Guid serverId, long placeId)>(
            "SELECT server_id as serverId, asset_id as placeId FROM asset_server_player WHERE user_id = :user_id",
            new { user_id = userId })).ToList();

        if (sessions.Count == 0)
        {
            CurrentPlayersInGame.TryRemove(userId, out _);
            await InvalidatePresenceCache(userId);
            return;
        }

        foreach (var session in sessions)
        {
            try
            {
                await OnPlayerLeave(userId, session.placeId, session.serverId);
            }
            catch (Exception e)
            {
                Console.WriteLine($"[ForceRemoveUserFromAllServers] leave failed user={userId} place={session.placeId} server={session.serverId}: {e.Message}");
            }
        }

        await db.ExecuteAsync("DELETE FROM asset_server_player WHERE user_id = :user_id", new { user_id = userId });
        CurrentPlayersInGame.TryRemove(userId, out _);
        await InvalidatePresenceCache(userId);
    }

    // private async Task<T> PostToGameServer<T>(string ipAddress, string port, string methodName, List<dynamic>? args = null, CancellationToken? cancelToken = null)
    // {
    //     var jsonRequest = new
    //     {
    //         method = methodName,
    //         arguments = args ?? new List<dynamic>(),
    //     };
    //     var content = new StringContent(JsonSerializer.Serialize(jsonRequest));
    //     content.Headers.Add("roblox-server-authorization", Configuration.GameServerAuthorization);
    //     content.Headers.ContentType = new MediaTypeHeaderValue("application/json");

    //     if (cancelToken == null)
    //     {
    //         var source = new CancellationTokenSource();
    //         source.CancelAfter(TimeSpan.FromSeconds(30));
    //         cancelToken = source.Token;
    //     }

    //     var result = await client.PostAsync("http://" + ipAddress + ":" + port + "/api/public-method/", content,
    //         cancelToken.Value);
    //     if (!result.IsSuccessStatusCode) throw new Exception("Unexpected statusCode: " + result.StatusCode + "\nIP = " + ipAddress + "\nPort = " + port);
    //     var response = JsonSerializer.Deserialize<T>(await result.Content.ReadAsStringAsync(cancelToken.Value));
    //     if (response == null)
    //     {
    //         throw new Exception("Null response from PostToGameServer");
    //     }
    //     return response;
    // }

    // public async Task<GameServerInfoResponse?> GetGameServerInfo(string ipAddress, string port)
    // {
    //     try
    //     {
    //         using var cancelToken = new CancellationTokenSource();
    //         cancelToken.CancelAfter(TimeSpan.FromSeconds(5));
    //         return await PostToGameServer<GameServerInfoResponse>(ipAddress, port, "getStatus", default, cancelToken.Token);
    //     }
    //     catch (Exception e) when (e is TaskCanceledException or TimeoutException or HttpRequestException)
    //     {
    //         return null;
    //     }
    // }
    public async Task KickPlayer(long userId, Guid? jobId = null)
    {
        try
        {
            if (jobId == null)
            {
                jobId = await GetJobIdByUserId(userId);
            }

        }
        catch (Exception e)
        {
            Console.WriteLine($"Error getting jobId for user {userId}: {e.Message}");
            return;
        }
        await arbiterClient.EvictPlayer(ArbiterHttpClient.CreateEvictPlayerRequest(jobId.Value, userId));
    }
    // public async Task StartGame(string ipAddress, string port, long placeId, string gameServerId, int gameServerPort)
    // {
    //     await PostToGameServer<GameServerEmptyResponse>(ipAddress, port, "startGame",
    //         new List<dynamic> {placeId, gameServerId, gameServerPort});
    // }

    public async Task ShutDownServerAsync(Guid serverId)
    {
        using var serverCreationLock = await Cache.redLock.CreateLockAsync($"CloseGameServer:{serverId.ToString()}", TimeSpan.FromSeconds(10));
        if (!serverCreationLock.IsAcquired)
        {
            // Silence.
            return;
        }
        try
        {
            Stopwatch stopwatch = new Stopwatch();
            stopwatch.Start();

            using (var cts = new CancellationTokenSource(TimeSpan.FromSeconds(15)))
            {
                await arbiterClient.KillGameServer(
                    ArbiterHttpClient.CreateKillGameServerRequest(serverId),
                    cts.Token);
            }

            Console.WriteLine($"Gameserver {serverId} was successfully closed in {stopwatch.ElapsedMilliseconds}ms!");

            await DeleteGameServer(serverId);
        }
        catch (OperationCanceledException)
        {
            Console.Error.WriteLine($"KillGameServer timed out after 15 seconds for server {serverId}.");
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"Error shutting down server {serverId}: {ex}");
        }
    }


    public static void RemoveAllPlayersFromPlaceId(long placeId)
    {
        List<long> playersToRemove = CurrentPlayersInGame.Where(kvp => kvp.Value == placeId).Select(kvp => kvp.Key).ToList();

        foreach (var userId in playersToRemove)
        {
            CurrentPlayersInGame.TryRemove(userId, out _);
        }
    }

    public static long GetUserPlaceId(long userId) // get user game is in
    {
        bool isInGame = CurrentPlayersInGame.ContainsKey(userId);
        if (!isInGame)
            return 0;

        return CurrentPlayersInGame[userId];
    }

    public static long GetPlaceIdByJobId(string jobId)
    {
        foreach (var kvp in currentPlaceIdsInUse)
        {
            if (kvp.Value == jobId)
            {
                return kvp.Key;
            }
        }

        return 0; // we never throw exceptions. EVER.
    }

    public async Task<DateTime> GetLastServerPing(string serverId)
    {
        var result = await db.QuerySingleOrDefaultAsync("SELECT updated_at FROM asset_server WHERE id = :id::uuid", new
        {
            id = serverId,
        });

        return (DateTime) result.updated_at;
    }
    public async Task<long> GetServerStat(Guid serverId)
    {
        var result = await db.QuerySingleOrDefaultAsync<long>("SELECT ping FROM asset_server WHERE id = :id::uuid", new
        {
            id = serverId,
        });

        if (result == 0)
            return -1;

        return result;
    }

    public async Task SetServerStats(string serverId, long ping, long fps)
    {
        // RCC's /v2/CreateOrUpdate is the earliest, most reliable signal that the server is
        // up. /v2.0/Refresh is only fired once the game loop is fully running, which (pre-
        // player) may take a long time on a patched 2020 RCC. Treat CreateOrUpdate as a
        // "Ready" heartbeat too so that PlaceLauncher can flip players into Joining instead
        // of looping in Loading forever.
        await db.ExecuteAsync(
            "UPDATE asset_server SET ping = :ping, fps = :fps, status = :stat, updated_at = :u WHERE id = :id::uuid",
            new
            {
                ping,
                fps,
                stat = (int)ServerStatus.Ready,
                u = DateTime.UtcNow,
                id = serverId,
            });
    }
    /// <summary>
    /// Reconcile asset_server_player against the authoritative player list
    /// reported by the RCC's Lua heartbeat. Deletes any row for this server
    /// whose user_id is *not* in <paramref name="connectedUserIds"/> AND whose
    /// row is older than <paramref name="graceWindow"/>. The grace window
    /// protects rows that were just created by the eager insert at
    /// /Game/Join.ashx but for which the player hasn't had time to connect to
    /// the RCC yet.
    /// </summary>
    public async Task ReconcileServerPlayers(Guid serverId, IEnumerable<long> connectedUserIds, TimeSpan graceWindow)
    {
        var connected = (connectedUserIds ?? Array.Empty<long>()).ToArray();
        var cutoff = DateTime.UtcNow.Subtract(graceWindow);

        // First find which users we are about to evict, so we can invalidate
        // their presence cache. Without this the friends list would keep
        // showing them as InGame for up to PresenceCacheTtl (15s) after the
        // row is gone -- which is exactly the "still showing playing after
        // they left" symptom we kept seeing.
        var evicted = (await db.QueryAsync<long>(@"
            SELECT user_id FROM asset_server_player
            WHERE server_id = :sid::uuid
              AND created_at < :cutoff
              AND NOT (user_id = ANY(:connected))",
            new { sid = serverId, cutoff, connected })).ToList();

        // Postgres `= ANY(:arr)` works fine even for empty arrays.
        await db.ExecuteAsync(@"
            DELETE FROM asset_server_player
            WHERE server_id = :sid::uuid
              AND created_at < :cutoff
              AND NOT (user_id = ANY(:connected))",
            new { sid = serverId, cutoff, connected });

        foreach (var uid in evicted)
        {
            CurrentPlayersInGame.TryRemove(uid, out _);
            await InvalidatePresenceCache(uid);
        }
    }

    public async Task SetServerPing(Guid serverId)
    {
        await db.ExecuteAsync("UPDATE asset_server SET updated_at = :u, status = :stat WHERE id = :id::uuid", new
        {
            u = DateTime.UtcNow,
            stat = (int)ServerStatus.Ready,
            id = serverId,
        });
    }

    public async Task DeleteGameServer(Guid serverId)
    {
        // Capture player rows before delete so we can invalidate their
        // presence cache. Otherwise gs/shutdown leaves users "InGame" in the
        // friends-list cache until PresenceCacheTtl elapses.
        var evicted = (await db.QueryAsync<long>(
            "SELECT user_id FROM asset_server_player WHERE server_id = :id::uuid",
            new { id = serverId })).ToList();

        await db.ExecuteAsync("DELETE FROM asset_server_player WHERE server_id = :id::uuid", new {id = serverId});
        await db.ExecuteAsync("DELETE FROM asset_server WHERE id = :id::uuid", new {id = serverId});

        foreach (var uid in evicted)
        {
            CurrentPlayersInGame.TryRemove(uid, out _);
            await InvalidatePresenceCache(uid);
        }
    }

    private static readonly IEnumerable<int> GameServerPorts = new []
    {
        // this must always stay in sync with nginx config file
        53640, // es1-1
        53641, // es1-2, etc
        53642, // 3
        53643, // 4
        53644, // 5
        53645, // 6
        53646, // 7
        53647, // 8
        53648, // 9
        53649, // 10
#if false
        53650,
        53651,
        53652,
        53653,
        53654,
        53655,
#endif
    };

    private GameServerPort GetPreferredPortForGameServer(IEnumerable<GameServerMultiRunEntry> runningGames)
    {
        var games = runningGames.ToList();
        var ports = GameServerPorts.ToArray();
        // Find a port that's not in use
        int port = 0;
        int id = 0;
        for (var i = 0; i < ports.Length; i++)
        {
            var portOk = games.Find(c => c.port == ports[i]) == null;
            if (portOk)
            {
                port = ports[i];
                id = i + 1;
                break;
            }
        }

        if (port == 0)
        {
            throw new Exception("Cannot find a free port for game server");
        }

        return new GameServerPort(port, id);
    }

    private GameServerPort GetPortByPortNumber(int port)
    {
        var ports = GameServerPorts.ToArray();
        for (int i = 0; i < ports.Length; i++)
        {
            if (ports[i] == port)
            {
                return new GameServerPort(ports[i], i + 1);
            }
        }

        throw new ArgumentOutOfRangeException();
    }

    // public async Task<List<Tuple<GameServerInfoResponse,GameServerConfigEntry>>> GetAllGameServers()
    // {
    //     var getServerDataTasks = new List<Task<GameServerInfoResponse?>>();
    //     foreach (var entry in Configuration.GameServerIpAddresses)
    //     {
    //         var data = entry.ip.Split(":");
    //         var ip = data[0];
    //         var port = data[1];
    //         getServerDataTasks.Add(GetGameServerInfo(ip, port));
    //     }

    //     var getServerDataResults = await Task.WhenAll(getServerDataTasks);

    //     var serverData =getServerDataResults.Select((c, idx) =>
    //             new Tuple<GameServerInfoResponse?, GameServerConfigEntry>(c, Configuration.GameServerIpAddresses.ToArray()[idx]))
    //         .Where(v => v.Item1 != null)
    //         .ToList();
    //     return serverData!;
    // }
/*
    public async Task<GameServerGetOrCreateResponse> GetServerForPlaceV2(long placeId, long year)
    {
        await using var serverCreationLock = await Cache.redLock.CreateLockAsync("CreateGameServerV1", TimeSpan.FromSeconds(30));
        if (!serverCreationLock.IsAcquired)
            return new GameServerGetOrCreateResponse
            {
                status = JoinStatus.Waiting,
            };

        var serverData = await GetAllGameServers();

        long maxPlayerCount;
        using (var gs = ServiceProvider.GetOrCreate<GamesService>())
        {
            maxPlayerCount = await gs.GetMaxPlayerCount(placeId);
        }
        // First, try to see if this game is already running. If it is, we should make the player join that.
        foreach (var (serverInfo, entry) in serverData)
        {
            var runningGames = serverInfo!.data.ToList();
            var runningPlaces = runningGames.ToArray();
            if (runningPlaces.Length == 0) continue;
            foreach (var runningPlace in runningPlaces)
            {
                // check if this is the right place
                if (runningPlace.placeId != placeId)
                    continue;
                // check if server has too many players
                var currentPlayerCount = await GetGameServerPlayers(runningPlace.id);
                if (currentPlayerCount.Count() >= maxPlayerCount)
                    continue;
                // We found a good place! Tell them to join...
                var joinUrl = GetPortByPortNumber(runningPlace.port).ApplyIdToUrl(entry.domain);
                Writer.Info(LogGroup.GameServerJoin, "Found a good place! placeId = {0} port = {1} url = {2}", placeId, runningPlace.port, joinUrl);
                return new()
                {
                    status = JoinStatus.Joining,
                    job = CreateGameServerTicket(placeId, joinUrl),
                };
            }
        }
        // Sort by least loaded
        serverData = serverData.Where(a => a.Item1 != null && a.Item1.data != null).ToList();
        serverData.Sort((a, b) =>
        {
            var cOne = a.Item1!.data.Count();
            var cTwo = b.Item1!.data.Count();
            return cOne > cTwo ? 1 : cOne == cTwo ? 0 : -1;
        });
        Writer.Info(LogGroup.GameServerJoin, "Least loaded server is {0} with {1} games running", serverData[0].Item2.ip, serverData[0].Item1!.data.Count());
        foreach (var (serverInfo, entry) in serverData)
        {

            string ip = "85.125.186.154";

            int mainRCCPort = RandomComponent.Next(30000, 40000);
            int networkServerPort = RandomComponent.Next(50000, 60000);
            var runningCount = serverInfo!.data.Count();
            if (runningCount >= entry.maxServerCount)
            {
                Writer.Info(LogGroup.GameServerJoin, "cannot start server on {0} since it has too many games running ({1} vs {2})", entry.ip, runningCount, entry.maxServerCount);
                continue;
            }
            // Create the server
            var id = Guid.NewGuid().ToString();
            var gamePort = GetPreferredPortForGameServer(serverInfo.data);
            await db.ExecuteAsync(
                "INSERT INTO asset_server (id, asset_id, ip, port, server_connection) VALUES (:id::uuid, :asset_id, :ip, :port, :server_connection)",
                new
                {
                    id,
                    asset_id = placeId,
                    ip,
                    networkServerPort,
                    server_connection = $"{ip}:{networkServerPort}", // ip:port
                });
            try
            {
                var watch = new Stopwatch();
                watch.Start();
                await StartGameServer(placeId, mainRCCPort, networkServerPort, id, year, 43200);
                //await StartGame(ip, port, placeId, id, gamePort.port);
                watch.Stop();
                //GameMetrics.ReportTimeToStartGameServer(ip, mainRCCPort, watch.ElapsedMilliseconds);
            }
            catch (Exception e)
            {
                await db.ExecuteAsync("DELETE FROM asset_server WHERE id = :id::uuid", new {id});
                throw new Exception("Cannot start game server", e);
            }

            Writer.Info(LogGroup.GameServerJoin, "Created server for {0} at {1}:{2}. Join url = {3}", placeId, entry.domain, gamePort.port, gamePort.ApplyIdToUrl(entry.domain));

            return new()
            {
                status = JoinStatus.Joining,
                job = CreateGameServerTicket(placeId, gamePort.ApplyIdToUrl(entry.domain)),
            };
        }

        // Default
        return new()
        {
            status = JoinStatus.Waiting,
        };
    }
*/

    public async Task<Guid> GetJobIdByUserId(long userId)
    {
        var result = await db.QueryFirstOrDefaultAsync<Guid?>("SELECT server_id FROM asset_server_player WHERE user_id = :userId", new
        {
            userId
        });

        return result ?? throw new RecordNotFoundException();
    }

    public async Task<bool> IsUserOnServer(long userId, Guid serverId)
    {
        var count = await db.QueryFirstOrDefaultAsync<long>(
            "SELECT COUNT(*) FROM asset_server_player WHERE user_id = :user_id AND server_id = :server_id::uuid",
            new { user_id = userId, server_id = serverId });
        return count > 0;
    }
    public async Task<GameServerDb> GetGameServer(Guid jobId)
    {
        return await db.QueryFirstOrDefaultAsync<GameServerDb>(
            "SELECT id, asset_id as assetId, port, updated_at as updatedAt, status, type FROM asset_server WHERE id = :id::uuid",
            new
            {
                id = jobId,
            });
    }

    public async Task<bool> IsPortTaken(int port)
    {
        int result = await db.QueryFirstOrDefaultAsync<int>(
            "SELECT port FROM asset_server WHERE port = :gsport",
            new
            {
                gsport = port,
            });
        return result != 0;
    }
    public async Task<IEnumerable<GameServerDb>> GetGameServersForPlace(long placeId, int? matchmaking = 1)
    {
        var result = await db.QueryAsync<GameServerDb>(
            "SELECT id, asset_id as assetId, port, updated_at as updatedAt, status, type FROM asset_server WHERE asset_id = :assetid AND type = :type",
            new
            {
                assetid = placeId,
                type = matchmaking,
            });
        if (result == null)
            return new List<GameServerDb>();
        return result;
    }

    /// <summary>
    /// Internal candidate row for the matchmaker. Returned by a single batched
    /// SQL query so we don't issue N+1 GetGameServerPlayers calls per join.
    /// </summary>
    private class MatchmakerCandidate
    {
        public Guid id { get; set; }
        public long port { get; set; }
        public DateTime updatedAt { get; set; }
        public int status { get; set; }
        public long playerCount { get; set; }
    }

    public async Task<GameServerGetOrCreateResponse> GetServerForPlace(PlaceEntry placeInfo, int matchmaking)
    {
        // === Matchmaker ===
        //
        // Goal: pick the *best* existing server with room, not just the first one.
        //
        // Strategy: fill-up matchmaking (the same heuristic Roblox itself uses).
        // Prefer the server with the *most* players that still has at least one
        // open slot. This keeps games feeling populated instead of spreading
        // joiners thinly across many half-empty instances, and mobile players
        // (who care most about landing in active games quickly) benefit the
        // most.
        //
        // Previous implementation iterated all servers and ran one
        // `GetGameServerPlayers` SELECT COUNT(*) per server (N+1 round trips
        // per join). For a popular game with 50 servers that's 50 sequential
        // queries on the join hot path. We now collect every candidate plus
        // its current player count in one query.
        var now = DateTime.UtcNow;
        var staleCutoff = now.Subtract(TimeSpan.FromMinutes(5));

        // NB: must list every non-aggregated column in GROUP BY. Postgres only
        // permits grouping by `s.id` alone if it's recognised as a declared
        // primary key, which `asset_server.id` is not in this schema -- so the
        // shorter form raised "column \"s.port\" must appear in the GROUP BY
        // clause" and the entire join hot path returned HTTP 500.
        var candidates = (await db.QueryAsync<MatchmakerCandidate>(@"
            SELECT
                s.id,
                s.port,
                s.updated_at AS updatedAt,
                s.status,
                COUNT(p.user_id) AS playerCount
            FROM asset_server s
            LEFT JOIN asset_server_player p ON p.server_id = s.id
            WHERE s.asset_id = :placeId AND s.type = :matchmaking
            GROUP BY s.id, s.port, s.updated_at, s.status",
            new { placeId = placeInfo.placeId, matchmaking })).ToList();

        // Pass 1: fire-and-forget shutdown on any server that hasn't pinged in
        // 5 min. We do NOT await it on the join hot path -- the orphan sweeper
        // (DeleteOldGameServers, see WebController.cs) catches anything we
        // miss, and the player should not pay the latency cost of a kill RPC.
        var staleIds = candidates.Where(c => c.updatedAt < staleCutoff).Select(c => c.id).ToList();
        if (staleIds.Count > 0)
        {
            _ = Task.Run(async () =>
            {
                foreach (var id in staleIds)
                {
                    try { await ShutDownServerAsync(id); } catch { /* swallowed; sweeper handles it */ }
                }
            });
        }

        // Pass 2: among non-stale, not-full servers, pick the fullest one with
        // room. Ordering is descending by playerCount so an existing populated
        // server gets priority over an idle empty one.
        var best = candidates
            .Where(c => c.updatedAt >= staleCutoff)
            .Where(c => c.playerCount < placeInfo.maxPlayerCount)
            .OrderByDescending(c => c.playerCount)
            .ThenBy(c => c.updatedAt) // tiebreak: oldest server first to drain old instances
            .FirstOrDefault();

        if (best != null)
        {
            // === Server-side long-poll for Ready ===
            //
            // Previously this returned `Loading` immediately whenever the
            // server existed but wasn't Ready yet, forcing the client into a
            // 5-second poll cycle on PlaceLauncher.ashx. With RCC startup
            // taking 10-20s, players ate 3-4 poll cycles for every join,
            // which felt like "forever". We now poll the DB every 500ms for
            // up to ~20s; the moment Ready fires we return Joining in this
            // same HTTP request. Falls back to Loading on timeout so the
            // client still has its own poll loop as a safety net.
            //
            // This is async/await on a Task.Delay -- it does NOT pin a
            // request thread. ASP.NET Core handles thousands of these
            // concurrently with no thread-pool growth.
            var readyResp = await WaitForServerReady(best.id, best.port, TimeSpan.FromSeconds(20));
            if (readyResp != null) return readyResp;

            return new GameServerGetOrCreateResponse()
            {
                job = best.id,
                ip = Configuration.GameServerIp,
                port = best.port,
                status = JoinStatus.Loading
            };
        }
        // Fall through: every existing server is full or stale -> spin up a new one.

        int mainRCCPort = RandomComponent.Next(30000, 40000);
        // IMPORTANT: clients can only connect to game ports that are exposed by
        // infra/proxy/firewall. Do NOT use random high ports here.
        // Pick from the known game-server port pool instead.
        var usedPorts = new HashSet<int>((await db.QueryAsync<int>(
            "SELECT port FROM asset_server WHERE type = :type",
            new { type = matchmaking })).ToList());
        int networkServerPort = 0;
        foreach (var p in GameServerPorts)
        {
            if (!usedPorts.Contains(p))
            {
                networkServerPort = p;
                break;
            }
        }
        if (networkServerPort == 0)
        {
            return new GameServerGetOrCreateResponse()
            {
                status = JoinStatus.Waiting,
            };
        }
        int proxyPort = 0;
        do
        {
            proxyPort = RandomComponent.Next(7000, 8000);
            if (!await IsPortTaken(proxyPort))
                break;
            
        } while (true);

        Guid jobId = Guid.NewGuid();
        // We need to create a lock to prevent multiple requests from creating the same game server
        using var serverCreationLock = await Cache.redLock.CreateLockAsync($"CreateGameServerV1:{placeInfo.placeId}", TimeSpan.FromSeconds(3));
        if (!serverCreationLock.IsAcquired)
        {
            return new GameServerGetOrCreateResponse
            {
                status = JoinStatus.Loading,
            };
        }

        _ = Task.Run(async () => await StartGameServer(placeInfo, mainRCCPort, networkServerPort, proxyPort, jobId, matchmaking));

        // The Node orchestrator (game-server/src/server.ts) binds RCC on
        // `gameServerPort` (== networkServerPort) and does NOT actually run a
        // separate proxy on `proxyPort`; that field is currently dead.
        // Persist the network-server port -- that's what the client connects
        // to via the join script (`Games.GetJoinScript` -> `jobInfo.port`).
        await db.ExecuteAsync(
            "INSERT INTO asset_server (id, asset_id, ip, port, server_connection, type) VALUES (:id::uuid, :asset_id, :ip, :port, :server_connection, :type)",
        new
        {
            id = jobId,
            asset_id = placeInfo.placeId,
            ip = Configuration.GameServerIp,
            port = networkServerPort,
            server_connection = $"{Configuration.GameServerIp}:{networkServerPort}",
            type = matchmaking
        });

        // Same long-poll trick as the existing-server branch above. RCC boot
        // is ~10-20s; we wait inside this single HTTP request so the player
        // doesn't have to round-trip PlaceLauncher 3-4 times before Ready.
        var readyAfterCreate = await WaitForServerReady(jobId, networkServerPort, TimeSpan.FromSeconds(25));
        if (readyAfterCreate != null) return readyAfterCreate;

        return new GameServerGetOrCreateResponse()
        {
            job = jobId,
            ip = Configuration.GameServerIp,
            port = networkServerPort,
            status = JoinStatus.Waiting
        };
    }

    /// <summary>
    /// Poll <c>asset_server.status</c> for <paramref name="jobId"/> every
    /// 500ms until it becomes <see cref="ServerStatus.Ready"/> or the timeout
    /// elapses. Returns a <c>Joining</c> response on success and <c>null</c>
    /// on timeout (caller should fall through to a <c>Loading</c> /
    /// <c>Waiting</c> response so the client's own poll loop takes over).
    /// </summary>
    private async Task<GameServerGetOrCreateResponse?> WaitForServerReady(Guid jobId, long port, TimeSpan timeout)
    {
        var deadline = DateTime.UtcNow + timeout;
        // Cheap status SELECT -- no joins, indexed by primary key.
        const string statusSql = "SELECT status FROM asset_server WHERE id = :id::uuid";
        // Initial probe so we don't pay 500ms even if it's already Ready
        // (matchmaker may have read the row a few ms before the heartbeat).
        while (true)
        {
            var status = await db.QuerySingleOrDefaultAsync<int?>(statusSql, new { id = jobId });
            if (status.HasValue && (ServerStatus)status.Value == ServerStatus.Ready)
            {
                return new GameServerGetOrCreateResponse()
                {
                    job = jobId,
                    ip = Configuration.GameServerIp,
                    port = port,
                    status = JoinStatus.Joining,
                };
            }
            if (DateTime.UtcNow >= deadline) return null;
            await Task.Delay(500);
        }
    }


    public async Task<string> StartGameServer(PlaceEntry placeInfo, int RCCPort, int networkServerPort, int proxyPort, Guid jobId, int matchmaking)
    {
        // Single, useful log instead of an empty banner. Captures jobId/place
        // so the line is greppable in production logs.
        Console.WriteLine("[GameServer] starting jobId={0} placeId={1} netPort={2} rccPort={3}", jobId, placeInfo.placeId, networkServerPort, RCCPort);
        var request = ArbiterHttpClient.CreateGameServerRequest(placeInfo, RCCPort, networkServerPort, proxyPort, jobId, matchmaking);
        await arbiterClient.StartGameServer(request);
        return "OK";
    }

    [Obsolete]
    public async Task DeleteOldGameServers()
    {
        // === Stale-server sweeper (runs every 30 s from WebController) ===
        //
        // Previous implementation was an N+1 nightmare on the cleanup path:
        // for each stale server it ran a SELECT for players, then awaited an
        // OnPlayerLeave per player (which itself does a presence-cache
        // invalidation per user), then a DELETE on player rows, then a DELETE
        // on the server row. With 20 stale rows * 5 players you'd serialise
        // ~140 awaits on every sweep, blocking the sweeper thread and (more
        // importantly) holding NpgsqlConnections that other request paths
        // wanted. Now we:
        //
        //   1. Find stale servers and the user-IDs about to lose presence in
        //      ONE batched SELECT.
        //   2. Fire-and-forget the presence-cache invalidations (they're best
        //      effort and don't need to block the sweeper).
        //   3. Delete all stale player + server rows in TWO batched DELETEs
        //      (= ANY(:ids)).
        //   4. Sweep orphan player rows in a single anti-join DELETE.
        var staleCutoff = DateTime.UtcNow.Subtract(TimeSpan.FromMinutes(2));
        var stale = (await db.QueryAsync<GameServerEntry>(
            "SELECT id::uuid, asset_id as assetId FROM asset_server WHERE updated_at <= :t",
            new { t = staleCutoff })).ToList();

        if (stale.Count > 0)
        {
            Console.WriteLine("[GameServer] sweeping {0} stale servers", stale.Count);
            var staleIds = stale.Select(s => s.id).ToArray();

            // Capture user-IDs we are about to evict so we can invalidate
            // their presence caches. Without this they keep showing as InGame
            // for up to PresenceCacheTtl after their server row is gone.
            var evictedUserIds = (await db.QueryAsync<long>(
                "SELECT p.user_id FROM asset_server_player p WHERE p.server_id = ANY(:ids)",
                new { ids = staleIds })).ToList();

            // Bulk delete player rows + server rows.
            await db.ExecuteAsync(
                "DELETE FROM asset_server_player WHERE server_id = ANY(:ids)",
                new { ids = staleIds });
            await db.ExecuteAsync(
                "DELETE FROM asset_server WHERE id = ANY(:ids)",
                new { ids = staleIds });

            // Best-effort presence-cache invalidation. Detached so the
            // sweeper doesn't have to wait on Redis round-trips.
            if (evictedUserIds.Count > 0)
            {
                _ = Task.Run(async () =>
                {
                    foreach (var uid in evictedUserIds)
                    {
                        try
                        {
                            CurrentPlayersInGame.TryRemove(uid, out _);
                            await InvalidatePresenceCache(uid);
                        }
                        catch { /* best-effort */ }
                    }
                });
            }
        }

        // Orphan player rows whose server_id no longer exists. Single DELETE.
        await db.ExecuteAsync(
            "DELETE FROM asset_server_player WHERE server_id NOT IN (SELECT id FROM asset_server)");
    }

    public async Task<IEnumerable<GameServerPlayer>> GetGameServerPlayers(Guid serverId)
    {
        return await db.QueryAsync<GameServerPlayer>(
            "SELECT user_id as userId, u.username FROM asset_server_player INNER JOIN \"user\" u ON u.id = asset_server_player.user_id WHERE server_id = :id::uuid", new
            {
               id = serverId,
            });
    }

    public async Task<IEnumerable<GameServerEntryWithPlayers>> GetGameServers(long placeId, int offset, int limit, int type = 1)
    {
        // Batched: 1 SELECT for the page of servers, 1 SELECT for all the
        // player rows attached to that page (joined to `user` for username).
        // Replaces the previous N+1 -- every game-detail page hit was firing
        // (1 + page-size) SQL round trips, dominating query volume on a busy
        // place.
        var result = (await db.QueryAsync<GameServerEntryWithPlayers>(
            "SELECT id::uuid, asset_id as assetId FROM asset_server WHERE asset_id = :id AND type = :type LIMIT :limit OFFSET :offset",
            new { id = placeId, type, limit, offset })).ToList();

        if (result.Count == 0)
            return result;

        var serverIds = result.Select(s => s.id).ToArray();
        var allPlayers = (await db.QueryAsync<PlayerWithServerId>(
            "SELECT p.server_id AS serverId, p.user_id AS userId, u.username FROM asset_server_player p INNER JOIN \"user\" u ON u.id = p.user_id WHERE p.server_id = ANY(:ids)",
            new { ids = serverIds })).ToList();

        var byServer = allPlayers.GroupBy(p => p.serverId)
            .ToDictionary(g => g.Key, g => (IEnumerable<GameServerPlayer>)g.Select(p => new GameServerPlayer { userId = p.userId, username = p.username }).ToList());

        foreach (var server in result)
        {
            server.players = byServer.TryGetValue(server.id, out var ps) ? ps : Array.Empty<GameServerPlayer>();
        }
        return result;
    }

    private class PlayerWithServerId
    {
        public Guid serverId { get; set; }
        public long userId { get; set; }
        public string username { get; set; } = "";
    }

    public async Task<IEnumerable<GameServerEntry>> GetGamesUserIsPlaying(long userId)
    {
       return await db.QueryAsync<GameServerEntry>(
            "SELECT s.id::uuid, s.asset_id as assetId FROM asset_server_player p INNER JOIN asset_server s ON s.id = p.server_id WHERE p.user_id = :id",
            new
            {
                id = userId,
            });
    }

}
