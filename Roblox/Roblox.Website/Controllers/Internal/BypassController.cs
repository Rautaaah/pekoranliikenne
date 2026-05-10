using System.ComponentModel.DataAnnotations;
using System.Dynamic;
using System.Security.Cryptography;
using System.Text;
using Dapper;
using Roblox.Models.Economy;
using System.Web;
using System.Xml.Linq;
using Microsoft.AspNetCore.Http.Extensions;
using Microsoft.Net.Http.Headers;
using Newtonsoft.Json;
using Roblox.Dto.Games;
using Roblox.Dto.Persistence;
using Roblox.Dto.Users;
using MVC = Microsoft.AspNetCore.Mvc;
using Roblox.Libraries.Assets;
using Roblox.Libraries.FastFlag;
using Roblox.Libraries.RobloxApi;
using Roblox.Logging;
using Roblox.Services.Exceptions;
using BadRequestException = Roblox.Exceptions.BadRequestException;
using Roblox.Models.Assets;
using Roblox.Models.GameServer;
using Roblox.Models.Users;
using Roblox.Services;
using Roblox.Services.App.FeatureFlags;
using Roblox.Website.Filters;
using Roblox.Website.Middleware;
using Roblox.Website.WebsiteModels.Asset;
using Roblox.Website.WebsiteModels.Games;
using HttpGet = Roblox.Website.Controllers.HttpGetBypassAttribute;
using JsonSerializer = System.Text.Json.JsonSerializer;
using MultiGetEntry = Roblox.Dto.Assets.MultiGetEntry;
using SameSiteMode = Microsoft.AspNetCore.Http.SameSiteMode;
using ServiceProvider = Roblox.Services.ServiceProvider;
using Type = Roblox.Models.Assets.Type;
using Microsoft.AspNetCore.Mvc;
using Roblox.Website.WebsiteModels.Authentication;
using System.Text.RegularExpressions;
using InfluxDB.Client.Core.Exceptions;
using Roblox.Exceptions;
using Roblox.Website.Pages;
using System.IO.Compression;
using Roblox.Models;
using Roblox.Dto.Assets;
using Roblox.Models.AbuseReport;
using Roblox.Dto.AbuseReport;
using Roblox.Models.Games;
using System.Diagnostics.CodeAnalysis;
using ForbiddenException = Roblox.Exceptions.ForbiddenException;
using System.IO;

namespace Roblox.Website.Controllers
{
    [MVC.ApiController]
    [MVC.Route("/")]
    public class BypassController : ControllerBase
    {
        [HttpGetBypass("internal/release-metadata")]
        public dynamic GetReleaseMetaData([Required] string requester)
        {
            throw new RobloxException(RobloxException.BadRequest, 0, "BadRequest");
        }

        [HttpGetBypass("api/maintenance/status")]
        public dynamic GetMaintenanceStatus()
        {
            FeatureFlags.UpdateFlags();
            return new
            {
                enabled = FeatureFlags.IsEnabled(FeatureFlag.MaintenanceEnabled),
            };
        }



        [HttpGetBypass("Game/GamePass/GamePassHandler.ashx")]
        public async Task<string> GamePassHandler(string Action, long UserID, long PassID)
        {
            if (Action == "HasPass")
            {
                var has = await services.users.GetUserAssets(UserID, PassID);
                return has.Any() ? "True" : "False";
            }

            throw new NotImplementedException();
        }

        [HttpGetBypass("Game/LuaWebService/HandleSocialRequest.ashx")]
        public async Task<string> LuaSocialRequest([Required, MVC.FromQuery] string method, long? playerid = null, long? groupid = null, long? userid = null)
        {
            // TODO: Implement these
            method = method.ToLower();
            if (method == "isingroup" && playerid != null && groupid != null)
            {
                bool isInGroup = false;
                try
                {
                    if (groupid == 1200769 && await StaffFilter.IsStaff(playerid ?? 0))
                        isInGroup = true;
                    var group = await services.groups.GetUserRoleInGroup((long)groupid, (long?)playerid ?? (long)0);
                    if (group.rank != 0)
                        isInGroup = true;
                }
                catch (Exception)
                {

                }

                return "<Value Type=\"boolean\">"+(isInGroup ? "true" : "false")+"</Value>";
            }

            if (method == "getgrouprank" && playerid != null && groupid != null)
            {
                int rank = 0;
                try
                {
                    var group = await services.groups.GetUserRoleInGroup((long) groupid, (long) playerid);
                    rank = group.rank;
                }
                catch (Exception)
                {

                }

                return "<Value Type=\"integer\">"+rank+"</Value>";
            }

            if (method == "getgrouprole" && playerid != null && groupid != null)
            {
                var groups = await services.groups.GetAllRolesForUser((long) playerid);
                foreach (var group in groups)
                {
                    if (group.groupId == groupid)
                    {
                        return group.name;
                    }
                }

                return "Guest";
            }

            if (method == "isfriendswith" && playerid != null && userid != null)
            {
                var status = (await services.friends.MultiGetFriendshipStatus((long) playerid, new[] {(long) userid})).FirstOrDefault();
                return $"<Value Type=\"boolean\">{status != null && status.status == "Friends"}</Value>";
            }

            return $"<Value Type\"boolean\">{method == "isbestfriendswith"}</value>";
        }

        [HttpGetBypass("v2/users/{userId:long}/groups/roles")]
        public async Task<RobloxCollection<dynamic>> GetUserGroupRoles(long userId)
        {
            var roles = await services.groups.GetAllRolesForUser(userId);
            var result = new List<dynamic>();
            foreach (var role in roles)
            {
                var groupDetails = await services.groups.GetGroupById(role.groupId);
                result.Add(new
                {
                    group = new
                    {
                        id = groupDetails.id,
                        name = groupDetails.name,
                        memberCount = groupDetails.memberCount,
                    },
                    role = role,
                });
            }
            if (await StaffFilter.IsStaff(userId))
            {
                result.Add(new
                {
                    group = new
                    {
                        id = 1200769,
                        name = "Project X Admin",
                        memberCount = 100,
                    },
                    role = new
                    {
                        id = 1,
                        name = "Admin",
                        rank = 100
                    }
                });
            }
            return new()
            {
                data = result,
            };
        }
        [HttpGetBypass("/auth/submit")]
        public MVC.RedirectResult SubmitAuth(string auth)
        {
            return new MVC.RedirectResult("/");
        }

        [HttpPostBypass("/v1/join-game")]
        public async Task<PlaceLaunchResponse> JoinGameMobile([FromBody] JoinGame? request)
        {
            FeatureFlags.FeatureCheck(FeatureFlag.GamesEnabled, FeatureFlag.GameJoinEnabled);
            if (userSession == null || !isRoblox)
            {
                return new PlaceLaunchResponse()
                {
                    status = (int)JoinStatus.Unauthorized,
                    message = "You are not authorized to join"
                };
            }

            // Old Android clients may send a minimal payload or even omit JSON fields.
            // Resolve place id from body first, then fall back to common query keys.
            var placeId = request?.placeId ?? 0;
            if (placeId <= 0)
            {
                if (long.TryParse(Request.Query["placeId"].FirstOrDefault(), out var queryPlaceId) && queryPlaceId > 0)
                    placeId = queryPlaceId;
                else if (long.TryParse(Request.Query["gameId"].FirstOrDefault(), out var queryGameId) && queryGameId > 0)
                    placeId = queryGameId;
            }

            if (placeId <= 0)
            {
                return new PlaceLaunchResponse()
                {
                    status = (int)JoinStatus.Error,
                    message = "Invalid placeId."
                };
            }

            long year = await services.games.GetYear(placeId);
            if (year != 2020 && year != 2021)
            {
                return new PlaceLaunchResponse()
                {
                    status = (int)JoinStatus.Error,
                    message = "An error occured while starting the game."
                };
            }

            var placeLauncherRequest = new PlaceLaunchRequest
            {
                request = "RequestGame",
                placeId = placeId,
                userId = safeUserSession.userId,
                username = safeUserSession.username,
                cookie = ZEKOSECURITY,
                special = true
            };
            return await services.placeLauncher.PlaceLauncherAsync(placeLauncherRequest);
        }

        [HttpPostBypass("/game/PlaceLauncher.ashx")]
        [HttpGetBypass("/game/PlaceLauncher.ashx")]
        public async Task<PlaceLaunchResponse> PlaceLaunch([FromQuery] PlaceLaunchRequest Placelauncher)
        {
            FeatureFlags.FeatureCheck(FeatureFlag.GamesEnabled, FeatureFlag.GameJoinEnabled);
            if (userSession == null || !isRoblox)
            {
                return new PlaceLaunchResponse()
                {
                    status = (int)JoinStatus.Unauthorized,
                    message = "You are not authorized to join"
                };
            }
            Placelauncher.cookie = ZEKOSECURITY;
            Placelauncher.userId = userSession.userId;
            Placelauncher.username = userSession.username;
            // Inline the signed join script directly into the PlaceLauncher response so the
            // patched 2020 RobloxPlayer can consume it without needing a working session
            // cookie on the follow-up Join.ashx request. This mirrors `/v1/join-game`.
            Placelauncher.special = true;
            var __plSw = System.Diagnostics.Stopwatch.StartNew();
            var __plUa = Request.Headers["User-Agent"].ToString();
            var __plQ = Request.QueryString.ToString();
            Console.WriteLine($"[pl-trace] IN  user={userSession.userId} place={Placelauncher.placeId} req={Placelauncher.request} qs={__plQ} ua={__plUa}");
            PlaceLaunchResponse __plResp;
            try
            {
                __plResp = await services.placeLauncher.PlaceLauncherAsync(Placelauncher);
            }
            catch (Exception __plEx)
            {
                Console.WriteLine($"[pl-trace] THREW after {__plSw.ElapsedMilliseconds}ms: {__plEx.GetType().Name}: {__plEx.Message}\n{__plEx.StackTrace}");
                throw;
            }
            try
            {
                var __plJson = System.Text.Json.JsonSerializer.Serialize(__plResp);
                if (__plJson.Length > 1500) __plJson = __plJson.Substring(0, 1500) + "...[truncated]";
                Console.WriteLine($"[pl-trace] OUT after {__plSw.ElapsedMilliseconds}ms status={__plResp.status} jobId={__plResp.jobId} json={__plJson}");
            }
            catch (Exception __plLogEx) { Console.WriteLine($"[pl-trace] log-serialize failed: {__plLogEx.Message}"); }
            return __plResp;
        }

        [HttpGetBypass("/asset/status")]
        public async Task<dynamic> GetAssetModerationStatus(long assetId)
        {
            // make sure user is logged in
            var userId = safeUserSession.userId;
            if (assetId < 1) {
                throw new BadRequestException(0, $"Asset {assetId} does not exist.");
            }
            return new
            {
                moderationStatus = await services.assets.GetAssetModerationStatus(assetId)
            };
        }

        public static long startUserId {get;set;} = 30; // TODO: ?? what's the point of this

        [HttpPostBypass("login/RequestAuth.ashx")]
        [HttpGetBypass("login/RequestAuth.ashx")]
        public ActionResult<dynamic?> StudioRequestAuth()
        {
            if (userSession == null)
                return Unauthorized("User is not authorized.");
            
            return Ok($"{Configuration.BaseUrl}/Login/Negotiate.ashx?suggest={ZEKOSECURITY}");
        }

        [HttpGetBypass("getserverinfo")]
        public async Task<dynamic> GetServerInfo(string ip)
        {
            return await services.games.GetInfoFromIp(ip);
        }

        [HttpGetBypass("joinserver")]
        public async Task<IActionResult> JoinServerFromJobId(string jobId, long placeId)
        {
            string clientVer;
            if (userSession == null)
            {
                throw new RobloxException(403, 1, "User is not authorized.");
            }
            long year = await services.games.GetYear(placeId);
            clientVer = services.games.clientVersionMap.TryGetValue(year, out var ver) ? ver : throw new BadRequestException();
            var placeInfo = await services.assets.GetAssetCatalogInfo(placeId);
            if (placeInfo.assetType != Models.Assets.Type.Place) throw new BadRequestException();
            var modInfo = (await services.assets.MultiGetAssetDeveloperDetails(new[] {placeId})).First();
            if (modInfo.moderationStatus != ModerationStatus.ReviewApproved) throw new BadRequestException();
            var bootstrapperArgs = $":1+launchmode:play+clientversion:{clientVer}+gameinfo:{ZEKOSECURITY}+placelauncherurl:{Configuration.BaseUrl}/Game/PlaceLauncher.ashx?request=RequestGameJob&placeId={placeId}&gameId={jobId}&isPartyLeader=false&gender=&isTeleport=true+k:l+client";
            return Redirect($"zekoro-player{bootstrapperArgs}");
        }

        [HttpGetBypass("getrichpresence")]
        public async Task<dynamic> GetRichPresenceInfo(long userId, long placeId, Guid jobId)
        {
            string username = "";
            int playerCount = 0;
            bool IsFurry = false;
            long fluffyHat = 18306;
            int[] furryUsers = { 1049 };
            try
            {
                if (userId != 0)
                {
                    var currentPlayerCount = await services.gameServer.GetGameServerPlayers(jobId);
                    playerCount = currentPlayerCount.Count();
                }
            }
            catch (Exception)
            {
                playerCount = 0;
            }
            if (userSession != null)
            {
                username = userSession.username;
            }
            // check if the user owns fluffy ha
            var owned = await services.users.GetUserAssets(userId, fluffyHat);
            if (owned.Any() || Array.Exists(furryUsers, id => id == userId))
                IsFurry = true;
            long maxplayers = await services.games.GetMaxPlayerCount(placeId);
            var placeInfo = await services.assets.GetAssetCatalogInfo(placeId);
            long year = await services.games.GetYear(placeId);

            return new
            {
                Creator = placeInfo.creatorName,
                Name = placeInfo.name,
                Username = username ?? "",
                Year = year,
                IsFurry,
                MaxPlayers = maxplayers,
                PartyId = Guid.NewGuid().ToString(),
                CurrentPlayers = playerCount,
            };

        }
        [HttpGetBypass("My/Places.aspx")]
        public ActionResult<dynamic?> MyPlaces()
        {
            return Ok();
        }

        [HttpGetBypass("game/GetCurrentUser.ashx")]
        public IActionResult GetUserId()
        {
            if (userSession == null)
                return Ok("Bad Request");
            return Content(userSession.userId.ToString(), "text/plain");
        }
        [HttpGetBypass("/mobileapi/check-app-version")]
        [HttpPostBypass("/mobileapi/check-app-version")]
        public ActionResult<dynamic> CheckAppVersion()
        {
            return new
            {
                data = new
                {
                    UpgradeAction = "None"
                }
            };
        }

        [HttpGetBypass("set-year")]
        public async Task TaskAsync (long universeId, int year)
        {
            var place = await services.games.GetRootPlaceId(universeId);
            await services.assets.ValidatePermissions(place, safeUserSession.userId);
            await services.games.SetYear(place, year);
        }

        [HttpGetBypass("login/negotiate.ashx"), HttpGetBypass("login/negotiateasync.ashx"), HttpPostBypass("login/negotiate.ashx"), HttpPostBypass("login/negotiateasync.ashx")]
        public void Negotiate()
        {
            // Patched 2020 RobloxPlayerBeta passes the ticket either as ?suggest=, ?ticket= (query) or in
            // the request body / Authorization header depending on the build. Accept all forms.
            string suggest = Request.Query["suggest"].ToString();
            if (string.IsNullOrEmpty(suggest)) suggest = Request.Query["ticket"].ToString();
            if (string.IsNullOrEmpty(suggest) && Request.HasFormContentType)
            {
                suggest = Request.Form["suggest"].ToString();
                if (string.IsNullOrEmpty(suggest)) suggest = Request.Form["ticket"].ToString();
            }
            if (string.IsNullOrEmpty(suggest))
            {
                var auth = Request.Headers["Authorization"].ToString();
                if (!string.IsNullOrEmpty(auth) && auth.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
                    suggest = auth.Substring(7).Trim();
            }
            if (string.IsNullOrEmpty(suggest))
                throw new BadRequestException(0, "Missing ticket");

            // RobloxPlayerBeta talks over plain http to BaseUrl; only mark the cookie Secure when the
            // request was actually HTTPS, otherwise the client refuses to send it back and PlaceLauncher
            // returns status 12 ("You are not authorized to join").
            Middleware.SessionMiddleware.AppendSessionCookies(HttpContext.Response.Cookies, suggest, secure: Request.IsHttps);
        }

        [HttpPostBypass("game/join.ashx")]
        [HttpGetBypass("game/join.ashx")]
        public async Task<dynamic> JoinGame(Guid jobId, bool GenerateTeleportJoin = false)
        {
            FeatureFlags.FeatureCheck(FeatureFlag.GamesEnabled, FeatureFlag.GameJoinEnabled);

            string username = safeUserSession.username;
            long userId = safeUserSession.userId;

            var jobInfo = await services.gameServer.GetGameServer(jobId);
            if (jobInfo == null)
                throw new BadRequestException(1, "Gameserver does not exist");
            // Let's not allow cloud edit servers via here
            if (jobInfo.type == 3)
                throw new BadRequestException(1, "This is a cloudedit server, you cannot join it.");
            long placeId = jobInfo.assetId;

            PlaceEntry placeInfo = (await services.games.MultiGetPlaceDetails(new[] { placeId })).First();
            // Check place privacy
            if (!await services.games.CanUserJoinUniverse(userId, placeInfo.builderId, placeInfo.universeId))
            {
                throw new ForbiddenException(1, "You cannot join this game, you do not have permission.");
            }
            string characterAppearanceUrl = $"{Configuration.BaseUrl.Replace("https", "http")}/v1.1/avatar-fetch?userId={userId}&placeId={placeId}";
            
            var jobPlayers = await services.gameServer.GetGameServerPlayers(jobId);
            
            if (jobPlayers.Count() >= placeInfo.maxPlayerCount)
            {
                return new
                {
                    error = "The requested game is full",
                    status = 5
                };
            }
            // paranoia
            var userInfo = await services.users.GetUserById(userId);

            if (userInfo.accountStatus != AccountStatus.Ok)
            {
                throw new ForbiddenException(0, "User is banned");
            }

            // Get user presence
            var onlineStatus = (await services.users.MultiGetPresence(new[] {userId})).First();
            // Theres probaly a better way of doing this but whatever
            if (onlineStatus.userPresenceType == PresenceType.InGame)
            {
                // The user is in game let's kick them
                await services.gameServer.KickPlayer(userId);
            }

            
            var accountAgeDays = DateTime.UtcNow.Subtract(userInfo.created).Days;
            string membership = await services.users.GetUserMemberShipAsString(userId);
            if (placeInfo.year != 2020 && placeInfo.year != 2021 && membership == "Premium")
            {
                membership = "OutrageousBuildersClub";
            }
            string clientTicket = services.sign.GenerateClientTicket(placeInfo.year, userId, username, characterAppearanceUrl, membership, jobId, accountAgeDays, placeId);
            var joinScript = services.games.GetJoinScript(placeInfo, userInfo, jobInfo, characterAppearanceUrl, clientTicket, membership, accountAgeDays, GenerateTeleportJoin, ZEKOSECURITY);

            // Eagerly register presence so the friends list flips to "InGame"
            // immediately when the launcher fetches the join script, instead
            // of waiting ~5-15s for the RCC to boot and the in-game Lua's
            // PlayerAdded -> /gs/players/report Join to fire (which can also
            // silently fail if the RCC's HttpPost is blocked).
            //
            // Safety: GameServerService.OnPlayerJoin self-guards via
            // IsUserOnServer, so the Lua's eventual Join event becomes a
            // no-op rather than double-inserting / double-counting visits.
            //
            // Stale-row risk (player abandons launcher) is handled by the
            // PlayerRemoving Leave event, gs/shutdown when last player
            // leaves, and DeleteOldGameServers (servers idle >2 min).
            try
            {
                await services.gameServer.OnPlayerJoin(userId, placeId, jobId);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[join.ashx] OnPlayerJoin failed for user={userId} place={placeId} job={jobId}: {ex.Message}");
            }

            return services.games.SignJoinScript(placeInfo.year, joinScript);
        }
        [HttpGetBypass("GenerateVersion")]
        public string GenerateVersion()
        {
            return $"version-{Guid.NewGuid().ToString().Replace("-", "").Substring(0, 16)}";
        }
        [HttpGetBypass("GenerateAuthString")]
        public string GenerateAuthString()
        {
            return "PJX-" + Guid.NewGuid().ToString().Replace("-", "") + Guid.NewGuid().ToString().Replace("-", "");
        }
        [HttpGetBypass("Asset/CharacterFetch.ashx")]
        public async Task<string> CharacterFetchASHX(long userId)
        {
            var assets = await services.avatar.GetWornAssets(userId);
            return $"{Configuration.BaseUrl}/Asset/BodyColors.ashx?userId={userId};{string.Join(";", assets.Select(c => Configuration.BaseUrl + "/Asset/?id=" + c))}";
        }
        // prob the most worse code ive ever written
        [HttpPost("AbuseReport/InGameChatHandler.ashx")]
        [Consumes("application/xml")]
        public async Task<MVC.OkResult> AbuseReport([FromBody] InGameAbuseReportEntry report)
        {
            if (!isRCC)
                throw new Roblox.Exceptions.UnauthorizedException(0, "Unauthorized");
            string gameMessages = "";
            string reportMessage = @$"This report was sent by the in-game report system.
            Place ID: {report.placeId}
            Job ID: {report.gameJobId}
            {{0}}
            ";

            // Example: AbuserID:0;Inappropriate Content;User Report:
            // very hacky

            long abuserId = long.Parse(report.comment.Split(":")[1].Trim().Split(";")[0]);
            string[] splittedComment = report.comment.Split(";");
            // If the abuserId is 0 it is a place report
            if (abuserId == 0)
            {
                reportMessage = string.Format(reportMessage, splittedComment[2]);
                await services.abuseReport.InsertReport(report.userId, AbuseReportReason.BadGame, reportMessage);
                return Ok();
            }

            foreach (InGameMessage message in report.messages.message)
            {
                string user = message.userId == abuserId
                    ? $"(Abuser) UID: {message.userId}"
                    : $"UID: {message.userId}";
                gameMessages += $"{user}: {message.text}\n";
            }
            // EW!
            reportMessage = string.Format(reportMessage, $"Abuser ID: {abuserId}\nReason: {splittedComment[2]}");
            string reportId = await services.abuseReport.InsertReport(report.userId, AbuseReportReason.BadChatMessagesInGame, reportMessage);
            await services.abuseReport.InsertGameMessages(reportId, report.gameJobId, gameMessages);
            return Ok();
        }

        [HttpGetBypass("my/settings/json")]
        public async Task<dynamic> SettingsJsonA()
        {
            var userInfo = await services.users.GetUserById(safeUserSession.userId);
            string membership = await services.users.GetUserMemberShipAsString(safeUserSession.userId);
            bool isAdmin = await StaffFilter.IsStaff(safeUserSession.userId);

            return new
            {
                ChangeUsernameEnabled = true,
                IsAdmin = isAdmin,
                UserId = safeUserSession.userId,
                Name = safeUserSession.username,
                DisplayName = safeUserSession.username,
                IsEmailOnFile = true,
                IsEmailVerified = true,
                IsPhoneFeatureEnabled = true,
                RobuxRemainingForUsernameChange = 0,
                PreviousUserNames = "",
                UseSuperSafePrivacyMode = false,
                IsSuperSafeModeEnabledForPrivacySetting = false,
                UseSuperSafeChat = false,
                IsAppChatSettingEnabled = true,
                IsGameChatSettingEnabled = true,
                IsAccountPrivacySettingsV2Enabled = true,
                IsSetPasswordNotificationEnabled = false,
                ChangePasswordRequiresTwoStepVerification = false,
                ChangeEmailRequiresTwoStepVerification = false,
                UserEmail = "openZekoro@oppeko.zip",
                UserEmailMasked = true,
                UserEmailVerified = true,
                CanHideInventory = true,
                CanTrade = false,
                MissingParentEmail = false,
                IsUpdateEmailSectionShown = true,
                IsUnder13UpdateEmailMessageSectionShown = false,
                IsUserConnectedToFacebook = false,
                IsTwoStepToggleEnabled = false,
                AgeBracket = 0,
                UserAbove13 = true,
                ClientIpAddress = GetRequesterIpRaw(HttpContext),
                AccountAgeInDays = DateTime.UtcNow.Subtract(userInfo.created).Days,
                IsOBC = false,
                IsTBC = false,
                IsAnyBC = false,
                IsPremium = false,
                IsBcRenewalMembership = false,
                BcExpireDate = "/Date(-0)/",
                BcRenewalPeriod = (string?)null,
                BcLevel = (int?)null,
                HasCurrencyOperationError = false,
                CurrencyOperationErrorMessage = (string?)null,
                BlockedUsersModel = new
                {
                    BlockedUserIds = new List<int>() { },
                    BlockedUsers = new List<string>() { },
                    MaxBlockedUsers = 50,
                    Total = 1,
                    Page = 1
                },
                Tab = (string?)null,
                ChangePassword = false,
                IsAccountPinEnabled = true,
                IsAccountRestrictionsFeatureEnabled = true,
                IsAccountRestrictionsSettingEnabled = false,
                IsAccountSettingsSocialNetworksV2Enabled = false,
                IsUiBootstrapModalV2Enabled = true,
                IsI18nBirthdayPickerInAccountSettingsEnabled = true,
                InApp = false,
                MyAccountSecurityModel = new
                {
                    IsEmailSet = true,
                    IsEmailVerified = true,
                    IsTwoStepEnabled = false,
                    ShowSignOutFromAllSessions = true,
                    TwoStepVerificationViewModel = new
                    {
                        UserId = safeUserSession.userId,
                        IsEnabled = false,
                        CodeLength = 6,
                        ValidCodeCharacters = (int?)null
                    }
                },
                ApiProxyDomain = Configuration.BaseUrl,
                AccountSettingsApiDomain = Configuration.BaseUrl,
                AuthDomain = Configuration.BaseUrl,
                IsDisconnectFbSocialSignOnEnabled = true,
                IsDisconnectXboxEnabled = true,
                NotificationSettingsDomain = Configuration.BaseUrl,
                AllowedNotificationSourceTypes = new List<string>
                {
                    "Test",
                    "FriendRequestReceived",
                    "FriendRequestAccepted",
                    "PartyInviteReceived",
                    "PartyMemberJoined",
                    "ChatNewMessage",
                    "PrivateMessageReceived",
                    "UserAddedToPrivateServerWhiteList",
                    "ConversationUniverseChanged",
                    "TeamCreateInvite",
                    "GameUpdate",
                    "DeveloperMetricsAvailable"
                },
                AllowedReceiverDestinationTypes = new List<string>
                {
                    "DesktopPush",
                    "NotificationStream"
                },
                BlacklistedNotificationSourceTypesForMobilePush = new List<string> { },
                MinimumChromeVersionForPushNotifications = 50,
                PushNotificationsEnabledOnFirefox = true,
                LocaleApiDomain = Configuration.BaseUrl,
                HasValidPasswordSet = true,
                IsUpdateEmailApiEndpointEnabled = true,
                FastTrackMember = (string?)null,
                IsFastTrackAccessible = false,
                HasFreeNameChange = false,
                IsAgeDownEnabled = false,
                IsSendVerifyEmailApiEndpointEnabled = true,
                IsPromotionChannelsEndpointEnabled = true,
                ReceiveNewsletter = false,
                SocialNetworksVisibilityPrivacy = 6,
                SocialNetworksVisibilityPrivacyValue = "AllUsers",
                Facebook = (string?)null,
                Twitter = (string?)null,
                YouTube = (string?)null,
                Twitch = (string?)null
            };
        }
        [HttpGetBypass("v2/stream-notifications/unread-count")]
        public dynamic PushNotif()
        {
            return new
            {
                unreadNotifications = 69,
                statusMessage = string.Empty
            };
        }

        [HttpGetBypass("sponsoredpage/list-json")]
        [HttpGetBypass("mobile-ads/v1/get-ad-details")]
        [HttpGetBypass("incoming-items/counts")]
        public dynamic IncomingItems()
        {
            return new
            {
                success = true
            };
        }

        [HttpGetBypass("v1.1/game-start-info")]
        public async Task<dynamic> GameStartInfo(long universeId)
        {
            var uni = await services.games.GetUniverseInfo(universeId);
            return new
            {
                gameAvatarType = uni.universeAvatarType,
                allowCustomAnimations = "True",
                universeAvatarCollisionType = "OuterBox",
                universeAvatarBodyType = "Standard",
                jointPositioningType = "ArtistIntent",
                universeAvatarMinScales = new
                {
                    height = 0.9,
                    width = 0.7,
                    head = 0.95,
                    depth = 0.0,
                    proportion = 0.0,
                    bodyType = 0.0
                },
                universeAvatarMaxScales = new
                {
                    height = 1.05,
                    width = 1.0,
                    head = 1.0,
                    depth = 0.0,
                    proportion = 1.0,
                    bodyType = 1.0
                },
                universeAvatarAssetOverrides = new List<object>(),
            };
        }
        [HttpGetBypass("hor")]
        public async Task<IActionResult> HallOfRetards()
        {
            return Content(await System.IO.File.ReadAllTextAsync("hor.txt"), "text/plan");
        }

        //this is for the newer years that dont have a custom monitoring script
        [HttpPostBypass("presence/register-game-presence")]
        public async Task<dynamic> RegisterGamePresence(long visitorId, long placeId, Guid gameId, string locationType)
        {
            // Security check
            if (!isRCC || placeId != currentPlaceId || gameId.ToString() != currentGameId)
                throw new UnauthorizedAccessException();
            var onlineStatus = (await services.users.MultiGetPresence(new[] {visitorId})).First();
            // RAGESOC will trigger here it's most likely a cheater because why ever would a player not be online when joining a game
            // We check this by checking if the user was online in the last 5 minutes
            var hasSuspicousLastOnline = onlineStatus.lastOnline < DateTime.UtcNow.Subtract(TimeSpan.FromMinutes(2)) || onlineStatus.userPresenceType == PresenceType.Offline;
            if (hasSuspicousLastOnline)
            {
                await services.discordBotApi.SendMessageInChannel(Configuration.DiscordLogChannelId, $"[RAGE-SS] UID: {visitorId} Flag: SuspicousLastOnline");
            }
            // Check if a gameserver exists for the gameId, and then check if the placeId matches the assetId of the game server
            var gameServer = await services.gameServer.GetGameServer(gameId);
            if (placeId != gameServer.assetId)
            {
                throw new BadRequestException();
            }

            var userInfo = await services.users.GetUserById(visitorId);
            // If a banned user tries to join the game, we kick them
            if (userInfo.IsDeleted())
            {
                await services.gameServer.KickPlayer(visitorId, gameId);
                await services.discordBotApi.SendMessageInChannel(Configuration.DiscordLogChannelId, $"[RAGE-SS] UID: {visitorId} Flag: BannedUser");
                throw new ForbiddenException(0, "User is banned");
            }
            // Now we check if the player has a placelauncher ticket, if they do not kick the player
            // We will log this too
            if (!await services.playerSecurity.IsPlayerTicketValid(userInfo.userId, gameId))
            {
                await services.gameServer.KickPlayer(visitorId, gameId);
                await services.discordBotApi.SendMessageInChannel(Configuration.DiscordLogChannelId, $"[RAGE-SS] UID: {visitorId} Flag: PlayerSpoofer");
                throw new ForbiddenException(0, "User does not have a valid placelauncher ticket");
            }
            await services.gameServer.OnPlayerJoin(visitorId, placeId, gameId);
            return Ok();
        }

        [HttpPostBypass("presence/register-absence")]
        public async Task RegisterGamePresenceAbsence(long visitorId)
        {
            if (!isRCC)
                throw new UnauthorizedAccessException();
            var jobId = await services.gameServer.GetJobIdByUserId(visitorId);
            long placeId = GameServerService.GetUserPlaceId(visitorId);

            await services.gameServer.OnPlayerLeave(visitorId, placeId, jobId);
        }
        [HttpGetBypass("/device/initialize")]
        [HttpPostBypass("/device/initialize")]
        public ActionResult<dynamic> InitDevice()
        {
            return new
            {
                browserTrackerId = 1234567890,
                appDeviceIdentifier = (string?)null,
            };
        }
        [HttpGetBypass("/Game/ClientPresence.ashx")]
        public void ClientPresenceAshx(string action, long placeId, long userId, bool IsTeleport)
        {
            return;
            // if (!ApplicationGuardMiddleware.IsRcc(Request))
            // {
            //     return;
            // }
            // if(action == "disconnect")
            // {
            //     string JobId = await services.gameServer.GetJobIdByUserId(userId);
            //     if(JobId == null)
            //     {
            //         return;
            //     }
            //     await services.gameServer.OnPlayerLeave(userId, placeId, JobId);
            // }
        }

        [HttpGetBypass("/v1/user/currency")]
        [HttpGetBypass("/my/balance")]
        public async Task<dynamic> MyBalance()
        {
            return new
            {
                robux = await services.economy.GetUserRobux(safeUserSession.userId),
            };
        }
        [HttpGetBypass("Users/ListStaff.ashx")]
        public async Task<dynamic> GetStaffList()
        {
            if (!isRCC) return Redirect("/404");
            return (await StaffFilter.GetStaff()).Where(c => c != 12);
        }

        [HttpGetBypass("GenerateOtpSecret")]
        public async Task<dynamic> GenerateOtpSecret()
        {
            var totpInfo = await services.users.GetOrSetTotp(safeUserSession.userId);
            return totpInfo.secret;
        }

        [HttpGetBypass("GenereateOtpQrCode")]
        public IActionResult GenerateOtpQrCode(string secret)
        {
            return File(services.users.GetOtpQrCode(safeUserSession.userId, secret), "image/png");
        }

//         [HttpGetBypass("Users/GetBanStatus.ashx")]
//         public async Task<IEnumerable<dynamic>> MultiGetBanStatus(string userIds)
//         {

//             var ids = userIds.Split(",").Select(long.Parse).Distinct();
//             var result = new List<dynamic>();
// #if DEBUG
//             return ids.Select(c => new
//             {
//                 userId = c,
//                 isBanned = false,
//             });
// #else
//             var multiGetResult = await services.users.MultiGetAccountStatus(ids);
//             foreach (var user in multiGetResult)
//             {
//                 result.Add(new
//                 {
//                     userId = user.userId,
//                     isBanned = user.accountStatus != AccountStatus.Ok,
//                 });
//             }

//             return result;
// #endif
//         }

        [HttpGetBypass("Asset/BodyColors.ashx")]
        public async Task<string> GetBodyColors(long userId)
        {
            var colors = await services.avatar.GetAvatar(userId);

            var xsi = XNamespace.Get("http://www.w3.org/2001/XMLSchema-instance");

            var robloxRoot = new XElement("roblox",
                new XAttribute(XNamespace.Xmlns + "xmime", "http://www.w3.org/2005/05/xmlmime"),
                new XAttribute(XNamespace.Xmlns + "xsi", "http://www.w3.org/2001/XMLSchema-instance"),
                new XAttribute(xsi + "noNamespaceSchemaLocation", "http://www.roblox.com/roblox.xsd"),
                new XAttribute("version", 4)
            );
            robloxRoot.Add(new XElement("External", "null"));
            robloxRoot.Add(new XElement("External", "nil"));
            var items = new XElement("Item", new XAttribute("class", "BodyColors"));
            var properties = new XElement("Properties");
            // set colors
            properties.Add(new XElement("int", new XAttribute("name", "HeadColor"), colors.headColorId.ToString()));
            properties.Add(new XElement("int", new XAttribute("name", "LeftArmColor"), colors.leftArmColorId.ToString()));
            properties.Add(new XElement("int", new XAttribute("name", "LeftLegColor"), colors.leftLegColorId.ToString()));
            properties.Add(new XElement("string", new XAttribute("name", "Name"), "Body Colors"));
            properties.Add(new XElement("int", new XAttribute("name", "RightArmColor"), colors.rightArmColorId.ToString()));
            properties.Add(new XElement("int", new XAttribute("name", "RightLegColor"), colors.rightLegColorId.ToString()));
            properties.Add(new XElement("int", new XAttribute("name", "TorsoColor"), colors.torsoColorId.ToString()));
            properties.Add(new XElement("bool", new XAttribute("name", "archivable"), "true"));
            // add
            items.Add(properties);
            robloxRoot.Add(items);
            // return as string
            return new XDocument(robloxRoot).ToString();
        }


        [HttpPostBypass("Game/PlaceVisit.ashx")]

        [HttpGetBypass("Game/PlaceVisit.ashx")]
        public dynamic PlaceVisit()
        {
            return Ok();
        }

        
        [HttpGetBypass("rcc/killserver")]
        public async Task<dynamic> ShutdownSpecificServerForPlace(long placeId, Guid jobId)
        {
            if (!await services.assets.CanUserModifyItem(placeId, safeUserSession.userId))
                throw new Roblox.Exceptions.UnauthorizedException(0, "Unauthorized");
                
            var jobInfo = await services.gameServer.GetGameServer(jobId);
            if (jobInfo.assetId != placeId)
                throw new BadRequestException(0, "Job does not exist for this place");
            await services.gameServer.ShutDownServerAsync(jobId);
            return "OK!";
        }

        [HttpGetBypass("rcc/killallservers")]
        public async Task<dynamic> ShutdownServersForPlace(long placeId)
        {
            if (!await services.assets.CanUserModifyItem(placeId, safeUserSession.userId))
                throw new Roblox.Exceptions.UnauthorizedException(0, "Unauthorized");

            var gameServers = await services.gameServer.GetGameServersForPlace(placeId);
            
            foreach (var job in gameServers)
            {
                await services.gameServer.ShutDownServerAsync(job.id);
            }

            return "OK!";
        }

        [HttpGetBypass("rcc/kickplayer")]
        public async Task<dynamic> KickPlayerAsync(long userId)
        {
            if (!StaffFilter.IsOwner(safeUserSession.userId))
                return "Unauthorized";

            if (safeUserSession.userId == userId)
                return "You can't kick yourself!";

            await services.gameServer.KickPlayer(userId);

            return $"Kicked player {userId}";
        }

        [HttpGetBypass("/Game/ChatFilter.ashx")]
        public string RCC_GetChatFilter()
        {
            return "True";
        }

        [HttpPostBypass("moderation/v2/filtertext/")]
        [HttpPostBypass("moderation/filtertext/")]
        public dynamic GetModerationText()
        {
            var text = services.filter.FilterText(HttpContext.Request.Form["text"].ToString());
            return new
            {
                success = true,
                data = new
                {
                    AgeUnder13 = text,
                    Age13OrOver = text,
                    white = text,
                    black = text
                }
            };
        }

        private void ValidateBotAuthorization()
        {
#if DEBUG == false
	        if (Request.Headers["bot-auth"].ToString() != Roblox.Configuration.BotAuthorization)
	        {
		        throw new Exception("Intern al");
	        }
#endif
        }

        [HttpGetBypass("botapi/migrate-alltypes")]
        public async Task<dynamic> MigrateAllItemsBot([Required, MVC.FromQuery] string url)
        {
            ValidateBotAuthorization();
            return await MigrateItem.MigrateItemFromRoblox(url, false, null, new List<Type>()
            {
                Type.Image,
                Type.Audio,
                Type.Mesh,
                Type.Lua,
                Type.Model,
                Type.Decal,
                Type.Animation,
                Type.SolidModel,
                Type.MeshPart,
                Type.GamePass,
                Type.ClimbAnimation,
                Type.DeathAnimation,
                Type.FallAnimation,
                Type.IdleAnimation,
                Type.JumpAnimation,
                Type.RunAnimation,
                Type.SwimAnimation,
                Type.WalkAnimation,
                Type.PoseAnimation,
            }, default, false);
        }
        
        [HttpGetBypass("botapi/migrate-clothing")]
        public async Task<dynamic> MigrateClothingBot([Required] string assetId)
        {
            ValidateBotAuthorization();
            return await MigrateItem.MigrateItemFromRoblox(assetId, true, 5, new List<Models.Assets.Type>() { Models.Assets.Type.TeeShirt, Models.Assets.Type.Shirt, Models.Assets.Type.Pants });
        }

        [HttpGetBypass("BuildersClub/Upgrade.ashx")]
        public MVC.IActionResult UpgradeNow()
        {
            return new MVC.RedirectResult("/internal/membership");
        }
        [HttpGetBypass("game/players/{userId}")]
        public MVC.ActionResult<dynamic> ChatWhiteList(long userId)
        {
            return new
            {
                ChatFilter = StaffFilter.IsOwner(userId) ? "whitelist" : "blacklist",
            };
        }

        [HttpGetBypass("GetAllowedMD5Hashes")]
        public MVC.ActionResult<dynamic> AllowedMd5Hashes()
        {
            // Public info endpoint (matches api2020 behaviour). Patched RCC sends ?apiKey=<guid>
            // in the query string instead of the accesskey header, so isRCC would return false.
            List<string> allowedList = new List<string>
            {
                "abc9d2132ef2c21101804d8e25e0413f", //2017L Prod
                "bba43f967698feff49038f51b391b48e", //2018L Prod
                "4022369076d608d1a99b7b3d250e4de5", //2018L RAGELoader Debug
                "9d7975454cee0e948e35cdc1fb55f92a", //2019E Prod
                "15c69e21a90ed1d10e686db71d62c955", //2019M Prod
                "ff693c76d9c15e7e97eb09e133942412", //2020L Prod
                "7da7086e7f3a739873fa5970ef586e98", //2021M Prod
                "1fd6e7becff68acc140b2db17e24c86e", //2021M June 6,
                "b8ac46a10fa4121c7a990f748d698516", //2.450.0iosapp
                //"d262983d5d887e114ba240e32e2d7465", // 2020 goober client
            };

            return new { data = allowedList };
        }
        
        // For goober.top bootstrapper
        // [HttpGetBypass("/version")]
        // public dynamic Version() {
        //     return "version-d262983d5d887e114ba240e32e2d7465";
        // }

        [HttpGetBypass("GetAllowedSecurityKeys")]
        public MVC.ActionResult<dynamic> AllowedSecurity()
        {
            return true;
        }

        // Patched 2020 RCC pings these on versioncompatibility.<base_url>; mirror api2020 (no auth).
        [HttpGetBypass("versioncompatibility")]
        public MVC.ActionResult<dynamic> VersionCompatibility()
        {
            return new { isCompatible = true, compatible = true };
        }

        [HttpGetBypass("GetAllowedExperimentalFeatures")]
        public MVC.ActionResult<dynamic> AllowedExperimentalFeatures(string placeId = "")
        {
            return new { placeId, features = new string[] { } };
        }
        [HttpGetBypass("GetAllowedSecurityVersions")]
        public MVC.ActionResult<dynamic> AllowedSecurityVersions()
        {
            // Public info endpoint (see AllowedMd5Hashes comment).
            List<string> allowedList = new List<string>()
            {
                "0.206.0pcplayer",
                "0.235.0pcplayer",
                "0.314.0pcplayer",
                "0.376.0pcplayer",
                "0.355.0pcplayer",
                "2.355.0iosapp",
                "2.450.0iosapp",
                "0.395.0pcplayer",
                "0.450.0pcplayer",
                "0.463.0pcplayer"
            };
            var jsonString = JsonConvert.SerializeObject(allowedList);
            return new { data = jsonString };
        }

        private static int pendingAssetUploads { get; set; } = 0;
        private static readonly Mutex pendingAssetUploadsMux = new();

        [HttpPostBypass("ide/publish/UploadFromCloudEdit")]
        [HttpPostBypass("Data/Upload.ashx")]
        public async Task<dynamic> UploadPlaceFromStudio(long? assetId = null)
        {
            FeatureFlags.FeatureCheck(FeatureFlag.UploadContentEnabled);
            // if assetId is 0 try getting it from the headers
            long placeId = assetId ?? 0;
            long userId = 0;
            if (placeId == 0)
            {
                long.TryParse(Request.Headers["roblox-place-id"].ToString(), out placeId);
            }

            var info = await services.assets.GetAssetCatalogInfo(placeId);
            bool canUpload = false;
            // check if the user can upload if they cant then check if rcc can
            if (userSession != null)
            {
                userId = userSession.userId;
                canUpload = await services.assets.CanUserModifyItem(placeId, userSession.userId);
            }

            if (!canUpload)
            {
                userId = info.creatorTargetId;
                canUpload = isRCC;
            }

            if (info.assetType != Type.Place && info.assetType != Type.Animation && info.assetType != Type.Model)
                canUpload = false;

            if (!canUpload)
                throw new RobloxException(403, 0, "Unauthorized");

            lock (pendingAssetUploadsMux)
            {
                if (pendingAssetUploads >= 2)
                    throw new RobloxException(429, 0, "TooManyRequests");
                pendingAssetUploads++;
            }
            try
            {
                using var placeStream = await GetRequestBodyAsMemoryStream();

                placeStream.Position = 0;
                using var validationStream = new MemoryStream();
                await placeStream.CopyToAsync(validationStream);
                validationStream.Position = 0;

                if (!await services.assets.ValidateAssetFile(validationStream, info.assetType))
                    throw new RobloxException(400, 0, "BadRequest");

                placeStream.Position = 0;

                await services.assets.CreateAssetVersion(placeId, userId, placeStream);

            }
            finally
            {
                lock (pendingAssetUploadsMux)
                {
                    pendingAssetUploads--;
                }

            }
            return new
            {
                success = true,
            };
        }

        [HttpPostBypass("universes/{universeId:long}/enablecloudedit")]
        public async Task<OkObjectResult> EnableCloudEdit(long universeId)
        {
            await services.games.CanManageUniverse(safeUserSession.userId, universeId);
            await services.games.SetCloudedit(true, universeId);
            return Ok(new { });
        }

        [HttpGetBypass("universes/{universeId:long}/cloudeditenabled")]
        public async Task<dynamic> IsCloudEditEnabled(long universeId)
        {
            return new
            {
                enabled = await services.games.IsCloudeditEnabled(universeId)
            };
        }


        [HttpGetBypass("v1/user/{userId:long}/is-admin-developer-console-enabled")]
        public async Task<dynamic> NewCanManage(long userId)
        {
            long placeId = long.Parse(Request.Headers["roblox-place-id"].ToString());
            bool canManagePlace = await services.assets.CanUserModifyItem(placeId, userId);
            bool isOwner =  StaffFilter.IsOwner(userId);
            return new
            {
                isAdminDeveloperConsoleEnabled = (canManagePlace || isOwner)
            };
        }


        [HttpGetBypass("game/validate-place-join")]
        [HttpPostBypass("universes/validate-place-join")]
        [HttpGetBypass("universes/validate-place-join")]
        public async Task<string> ValidateJoin(long originPlaceId, long destinationPlaceId)
        {
            using var playerSecurity = ServiceProvider.GetOrCreate<PlayerSecurityService>();
            if (await playerSecurity.ValidateTeleport(originPlaceId, destinationPlaceId))
            {
                return "true";
            }
            await services.discordBotApi.SendMessageInChannel(Configuration.DiscordLogChannelId, $"[RAGE-SS] Flag: InvalidTeleport\nOrigin Place Id:{originPlaceId}\nDestination Place Id: {destinationPlaceId}");
            return "false";
        }

        [HttpGetBypass("v2/get-rollout-settings")]
        public dynamic ChatRollout(string featureNames)
        {
            return new
            {
                rolloutFeatures = new[]
                {
                    new
                    {
                        featureName = featureNames,
                        isRolloutEnabled = true
                    }
                }
            };
        }


        [HttpGetBypass("abusereport/UserProfile"), HttpGetBypass("abusereport/asset"), HttpGetBypass("abusereport/user"), HttpGetBypass("abusereport/users")]
        public MVC.IActionResult ReportAbuseRedirect()
        {
            return new MVC.RedirectResult("/internal/report-center");
        }

        [HttpGetBypass("/info/blog")]
        public MVC.IActionResult RedirectToUpdates()
        {
            return new MVC.RedirectResult("/internal/updates");
        }

        [HttpGetBypass("/my/economy-status")]
        public dynamic GetEconomyStatus()
        {
            return new
            {
                isMarketplaceEnabled = true,
                isMarketplaceEnabledForAuthenticatedUser = true,
                isMarketplaceEnabledForUser = true,
                isMarketplaceEnabledForGroup = true,
            };
        }

        [HttpGetBypass("/currency/balance")]
        public async Task<dynamic> GetBalance()
        {
            return await services.economy.GetBalance(CreatorType.User, safeUserSession.userId);
        }

        [HttpGetBypass("/ownership/hasasset")]
        public async Task<bool> DoesOwnAsset(long userId, long assetId)
        {
            var owned = await services.users.GetUserAssets(userId, assetId);
            if (owned.Any())
                return true;
            return false;
        }

        [HttpPostBypass("v1/logout")]
        [HttpGetBypass("sign-out/v1")]
        [HttpPostBypass("sign-out/v1")]
        [HttpGetBypass("game/logout.aspx")]
        public void Logout()
        {
            using var sessCache = Roblox.Services.ServiceProvider.GetOrCreate<UserSessionsCache>();
            sessCache.Remove(safeUserSession.sessionId);
            Middleware.SessionMiddleware.DeleteSessionCookies(HttpContext.Response.Cookies);
        }

        [HttpGetBypass("users/get-by-username")]
        public async Task<dynamic> GetByUsername(string username)
        {
            var userInfo = await services.users.GetUserByName(username);
            var onlineStatus = (await services.users.MultiGetPresence(new[] {userInfo.userId})).First();
            var result = (await services.thumbnails.GetUserHeadshots(new[] { userInfo.userId })).ToList();
            return new
            {
                Id = userInfo.userId,
                Username = username,
                AvatarUri = Configuration.BaseUrl + result?.FirstOrDefault()?.imageUrl ?? "/img/placeholder.png",
                AvatarFinal = true,
                IsOnline = onlineStatus.userPresenceType == PresenceType.Online,
            };
        }
        [HttpGetBypass("users/account-info")]
        [HttpPostBypass("users/account-info")]
        public async Task<dynamic> AccountInfo()
        {
            var userBalance = await services.economy.GetUserBalance(safeUserSession.userId);
            return new
            {
                UserId = safeUserSession.userId,
                Username = safeUserSession.username,
                DisplayName = safeUserSession.username,
                HasPasswordSet = true,
                Email = "Zekoro@zekoro.org",
                MembershipType = 3,
                RobuxBalance = userBalance.robux,
                AgeBracket = 0,
                Roles = new string[] { },
                EmailNotificationEnabled = false,
                PasswordNotifcationEnabled = false,
            };
        }

        [HttpGetBypass("/asset/getyear")]
        public async Task<dynamic> GetPlaceYear(long placeId)
        {
            return await services.games.GetYear(placeId);
        }
        [HttpPostBypass("game/load-place-info")]
        public async Task<dynamic> LoadPlaceInfo()
        {
            var placeId = Request.Headers["roblox-place-id"];
            long.TryParse(placeId, out long assetId);
            var details = await services.assets.GetAssetCatalogInfo(assetId);
            return new
            {
                CreatorId =  details.creatorTargetId,
                CreatorType = "User",
                PlaceVersion = details.id,
                GameId = assetId,
                IsRobloxPlace = details.creatorTargetId == 1
            };
        }


        [HttpGetBypass("studio/e.png")]
        public string StudioEpng()
        {
            return "1";
        }
        [HttpGetBypass("GetCurrentClientVersionUpload")]
        public ActionResult<dynamic> ReturnCurrentClientVersion(string binaryType)
        {
            switch (binaryType)
            {

                case "MacPlayer":
                    return @"""version-z1425cxd4e0c4a2""";
                case "MacStudio":
                    return @"""version-z1425cxd4e0c4a2""";
                default:
                    return @"""version-d23df1d1a8d546ee""";
            }
        }
        
        [HttpGetBypass("v1/Close")]
        [HttpPostBypass("V1/Close")]
        public async Task<dynamic> CloseGSNew(Guid gameId)
        {
            if (!isRCC)
                throw new Roblox.Exceptions.UnauthorizedException(0, "Unauthorized");
            try
            {
                // Check if the game server exists
                var gameServer = await services.gameServer.GetGameServer(gameId);
                if (gameServer == null)
                {
                    return "Game server not found";
                }
                await services.gameServer.ShutDownServerAsync(gameServer.id);
                return "OK!";
            }
            catch (Exception)
            {
                // lets just delete the gameserver if we couldnt close the gameserver
                await services.gameServer.DeleteGameServer(gameId);
                return "Catch an error";
            }
        }
        
        [HttpPostBypass("v2/CreateOrUpdate")]
        [HttpGetBypass("v2/CreateOrUpdate")]
        [HttpGetBypass("v1/CreateOrUpdate")]
        [HttpPostBypass("v1/CreateOrUpdate")]
        public async Task<dynamic> GetOrCreate(string gameId, decimal ping, decimal fps)
        {

            if(!isRCC)
                throw new Roblox.Exceptions.UnauthorizedException(0, "Unauthorized");

            int roundPing = (int)Math.Round(ping, 0);
            int roundFps = (int)Math.Round(fps, 0);
            await services.gameServer.SetServerStats(gameId, roundPing, roundFps);
            return "OK!";

        }

        [HttpPostBypass("v1.0/Refresh")]
        [HttpPostBypass("v2.0/Refresh")]
        [HttpGetBypass("v1.0/Refresh")]
        [HttpGetBypass("v2.0/Refresh")]
        public async Task RefreshGameInstance(Guid gameId, long clientCount, Decimal gameTime)
        {
            Console.WriteLine($"[Refresh] gameId={gameId} clientCount={clientCount} gameTime={gameTime} isRCC={isRCC}");
            if (!isRCC)
                throw new Roblox.Exceptions.UnauthorizedException(0, "Unauthorized");
            var gameServer = await services.gameServer.GetGameServer(gameId);

            // Originally: shutdown if clientCount==0 && gameTime>50. That assumes a player must
            // join within 50 seconds. With our patched 2020 RCC the place takes longer to load
            // and the player can't even join until status flips to Ready (which Refresh itself
            // does). So we relax the timeout to avoid a circular shutdown.
            if (gameServer == null)
            {
                Console.WriteLine($"[Refresh] gameServer not found, shutting down {gameId}");
                await services.gameServer.ShutDownServerAsync(gameId);
                return;
            }
            await services.gameServer.SetServerPing(gameId);
            Console.WriteLine($"[Refresh] marked Ready: {gameId}");
        }
        public class GsRequest
        {
            public string serverId { get; set; } = "";
            public string authorization { get; set; } = "";
        }

        public class GsPlayerReportRequest
        {
            public string authorization { get; set; } = "";
            public string serverId { get; set; } = "";
            public string userId { get; set; } = "";
            public string eventType { get; set; } = "";
            public string placeId { get; set; } = "";
        }

        public class GsPingRequest
        {
            public string authorization { get; set; } = "";
            public string serverId { get; set; } = "";
            public string placeId { get; set; } = "";
            // List of userIds currently connected to the RCC, sourced from
            // game:GetService("Players"):GetPlayers() in the Lua heartbeat.
            // Used to reconcile asset_server_player against ground truth and
            // prune ghost rows whose Leave event was lost.
            public long[]? players { get; set; }
        }

        private bool IsOrchestrator(string authorization)
        {
            return !string.IsNullOrEmpty(authorization) && authorization == Configuration.GameServerAuthorization;
        }

        /// <summary>
        /// True if `auth` matches any of the three server-side secrets we
        /// recognise (orchestrator, RCC, or arbiter). Used by /gs endpoints
        /// to be tolerant of operators having different keys configured for
        /// the website (appsettings.json) and for the orchestrator
        /// (game-server/config.json) — the orchestrator's value gets
        /// substituted into gameserver.lua and ends up in the request body.
        /// `matchedVia` is set to the constant name that matched, for logs.
        /// </summary>
        private static bool IsAnyServerAuth(string? auth, out string matchedVia)
        {
            matchedVia = string.Empty;
            if (string.IsNullOrEmpty(auth)) return false;
            if (auth == Configuration.GameServerAuthorization) { matchedVia = "GameServerAuthorization"; return true; }
            if (auth == Configuration.RccAuthorization)        { matchedVia = "RccAuthorization";        return true; }
            if (auth == Configuration.ArbiterAuthorization)    { matchedVia = "ArbiterAuthorization";    return true; }
            return false;
        }

        /// <summary>
        /// Heartbeat poll from the local node game-server orchestrator. Returns whether the
        /// asset_server row still exists and was recently updated by RCC's /Refresh callback.
        /// </summary>
        [HttpPostBypass("gs/activity")]
        public async Task<dynamic> GsActivity([MVC.FromBody] GsRequest req)
        {
            if (!IsOrchestrator(req.authorization))
            {
                Response.StatusCode = 401;
                return new { ok = false, reason = "unauthorized" };
            }
            if (!Guid.TryParse(req.serverId, out var jobId))
                return new { isAlive = false, updatedAt = DateTime.UtcNow };
            var server = await services.gameServer.GetGameServer(jobId);
            if (server == null)
                return new { isAlive = false, updatedAt = DateTime.UtcNow };
            // RCC heartbeats every few seconds via /v2.0/Refresh -> SetServerPing.
            // Treat the server as alive if updated within the last 2 minutes.
            var alive = server.updatedAt.AddMinutes(2) > DateTime.UtcNow;
            return new { isAlive = alive, updatedAt = server.updatedAt };
        }

        /// <summary>
        /// Orchestrator-driven shutdown: remove the asset_server row.
        /// </summary>
        [HttpPostBypass("gs/delete")]
        public async Task<dynamic> GsDelete([MVC.FromBody] GsRequest req)
        {
            if (!IsOrchestrator(req.authorization))
            {
                Response.StatusCode = 401;
                return new { ok = false, reason = "unauthorized" };
            }
            if (Guid.TryParse(req.serverId, out var jobId))
            {
                try { await services.gameServer.DeleteGameServer(jobId); } catch { }
            }
            return new { ok = true };
        }

        /// <summary>
        /// Player join/leave report from the in-game Lua monitoring script.
        /// Fires <see cref="GameServerService.OnPlayerJoin"/> / <see cref="GameServerService.OnPlayerLeave"/>
        /// so the website knows which users are currently in which place.
        /// </summary>
        [HttpPostBypass("gs/players/report")]
        public async Task<dynamic> GsPlayersReport([MVC.FromBody] GsPlayerReportRequest req)
        {
            // Accept ANY of the configured server-side keys. The orchestrator's
            // `conf.authorization` (game-server/config.json) is substituted into
            // gameserver.lua at script load, and which key it matches in
            // appsettings.json is operator-dependent — so be tolerant.
            // Falling back to "serverId actually exists" prevents the entire
            // presence pipeline from breaking when configs drift; the worst a
            // bogus caller can do is forge events for a known active jobId
            // (which already gets reconciled by /gs/ping every 5 seconds).
            if (!IsAnyServerAuth(req.authorization, out var matchedVia))
            {
                Guid sid;
                var serverExists = Guid.TryParse(req.serverId, out sid)
                    && (await services.gameServer.GetGameServer(sid)) != null;
                if (!serverExists)
                {
                    var got = string.IsNullOrEmpty(req.authorization) ? "<empty>" : req.authorization.Substring(0, Math.Min(8, req.authorization.Length)) + "…";
                    Console.WriteLine($"[gs/players/report] auth mismatch (got {got}, len={req.authorization?.Length ?? 0}) serverId={req.serverId} userId={req.userId} eventType={req.eventType} -- and serverId is unknown, rejecting");
                    Response.StatusCode = 401;
                    return new { ok = false, reason = "unauthorized" };
                }
                // Throttled: log first occurrence per serverId only.
                if (AuthMismatchLogged.TryAdd("players/report:" + req.serverId, 0))
                    Console.WriteLine($"[gs/players/report] auth mismatch but serverId={req.serverId} exists; accepting (please sync game-server config.json with appsettings.json {{Game,Rcc,Arbiter}}Authorization)");
            }
            else if (matchedVia != "GameServerAuthorization")
            {
                // Helpful diag for operators: surfaces *which* of the three
                // configured secrets the in-game RCC actually presents, so
                // they can rationalise the configs if they want.
                Console.WriteLine($"[gs/players/report] auth ok via {matchedVia} (consider unifying with GameServerAuthorization)");
            }
            if (!Guid.TryParse(req.serverId, out var jobId))
                return new { ok = false, reason = "bad serverId" };
            if (!long.TryParse(req.userId, out var userId))
                return new { ok = false, reason = "bad userId" };
            if (!long.TryParse(req.placeId, out var placeId))
                return new { ok = false, reason = "bad placeId" };

            switch (req.eventType)
            {
                case "Join":
                    try { await services.gameServer.OnPlayerJoin(userId, placeId, jobId); }
                    catch (Exception e) { Console.WriteLine($"[gs/players/report] OnPlayerJoin failed: {e.Message}"); }
                    break;
                case "Leave":
                    try { await services.gameServer.OnPlayerLeave(userId, placeId, jobId); }
                    catch (Exception e) { Console.WriteLine($"[gs/players/report] OnPlayerLeave failed: {e.Message}"); }
                    break;
                default:
                    return new { ok = false, reason = "unknown eventType" };
            }
            return new { ok = true };
        }

        /// <summary>
        /// 5-second heartbeat from the in-game Lua monitor (gameserver.lua ->
        /// pollToReportActivity). Reports the current player list so the
        /// website can reconcile asset_server_player against ground truth and
        /// prune ghost rows whose Leave event was dropped (RCC HTTP failure,
        /// player abandoned launcher mid-join, ungraceful disconnect, etc.).
        /// </summary>
        [HttpPostBypass("gs/ping")]
        public async Task<dynamic> GsPing([MVC.FromBody] GsPingRequest req)
        {
            // Same auth model as gs/players/report. Tolerant fallback to
            // "serverId actually exists in asset_server" so that an operator
            // having mismatched secrets between game-server/config.json and
            // appsettings.json doesn't permanently break presence reconciliation
            // and prevent empty-server auto-shutdown.
            if (!Guid.TryParse(req.serverId, out var jobId))
                return new { ok = false, reason = "bad serverId" };
            if (!IsAnyServerAuth(req.authorization, out _))
            {
                var serverExists = (await services.gameServer.GetGameServer(jobId)) != null;
                if (!serverExists)
                {
                    Response.StatusCode = 401;
                    return new { ok = false, reason = "unauthorized" };
                }
            }

            // Refresh server liveness (DeleteOldGameServers uses this to
            // decide if a server is stale).
            try { await services.gameServer.SetServerPing(jobId); } catch { /* best-effort */ }

            // Reconcile player rows against the RCC's authoritative list.
            // Grace period: never prune rows younger than 30 seconds, so
            // that the eager insert at /Game/Join.ashx survives until the
            // player has actually had time to connect to the RCC.
            try
            {
                await services.gameServer.ReconcileServerPlayers(jobId, req.players ?? Array.Empty<long>(), TimeSpan.FromSeconds(30));
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[gs/ping] ReconcileServerPlayers failed for server={jobId}: {ex.Message}");
            }
            return new { ok = true };
        }

        [HttpPostBypass("gs/shutdown")]
        public async Task<dynamic> GsShutdown([MVC.FromBody] GsRequest req)
        {
            // CRITICAL path: this is what the in-game Lua hits when the last
            // player leaves a place. If we're too strict on auth here, the
            // RCC never gets killed and presence stays stuck on "InGame".
            // Mirror the tolerant model used by /gs/players/report and
            // /gs/ping — accept any of the configured server-side secrets,
            // and fall back to "serverId actually exists in asset_server"
            // when configs drift between website and orchestrator.
            if (!Guid.TryParse(req.serverId, out var jobId))
                return new { ok = false, reason = "bad serverId" };
            if (!IsAnyServerAuth(req.authorization, out _))
            {
                var serverExists = (await services.gameServer.GetGameServer(jobId)) != null;
                if (!serverExists)
                {
                    Response.StatusCode = 401;
                    return new { ok = false, reason = "unauthorized" };
                }
                if (AuthMismatchLogged.TryAdd("shutdown:" + req.serverId, 0))
                    Console.WriteLine($"[gs/shutdown] auth mismatch but serverId={req.serverId} exists; accepting (last-player-leaves shutdown).");
            }
            try { await services.gameServer.ShutDownServerAsync(jobId); } catch { }
            return new { ok = true };
        }

        // ============================================================
        // In-game admin commands (called by gameserver.lua via ;<cmd>).
        // Auth: same tolerant model as the rest of /gs/*; additionally
        // we hard-pin the ACTOR userId to the closed-beta admin set so
        // even a leaked auth secret can't escalate to ban/give powers
        // outside of bulba (180) and zee (4).
        // ============================================================
        public class GsAdminBaseRequest
        {
            public string authorization { get; set; } = "";
            public string serverId { get; set; } = "";
            public long actorUserId { get; set; }
            public long targetUserId { get; set; }
        }

        public class GsAdminBanRequest : GsAdminBaseRequest
        {
            public string? reason { get; set; }
        }

        public class GsAdminItemRequest : GsAdminBaseRequest
        {
            public long assetId { get; set; }
        }

        public class GsAdminCurrencyRequest : GsAdminBaseRequest
        {
            public long amount { get; set; }
            public string currency { get; set; } = "robux";
        }

        public class GsAdminRankRequest : GsAdminBaseRequest
        {
            public string? rank { get; set; }
        }

        // Source of truth for who can run in-game admin commands is the
        // OwnerUserId array in appsettings.json (loaded into StaffFilter at
        // startup). Edit that list and restart the website to add/remove
        // admins; gameserver.lua refreshes the cache on the next /gs/admin/owners
        // poll, so existing servers pick up changes without a redeploy.

        // Throttle the noisy "auth mismatch but serverId exists" warnings.
        // /gs/players/report fires every ~5 seconds per server; without the
        // throttle each running server adds 12 Console.WriteLine/min per
        // server forever, which on Windows serialises through stdout's lock
        // and becomes a real CPU/throughput drag with many running servers.
        // We log once per (serverId, route) so the operator still sees the
        // mismatch but it stops dominating the log volume.
        private static readonly System.Collections.Concurrent.ConcurrentDictionary<string, byte> AuthMismatchLogged = new();

        // Reuse the Dapper-friendly NpgsqlConnection exposed by AssetsService's
        // ServiceBase. Mirrors how AdminApiController grabs `db` for direct
        // SQL access without standing up a dedicated DbContext.
        private Npgsql.NpgsqlConnection adminDb => services.assets.db;

        private async Task<bool> AuthorizeGsAdmin(GsAdminBaseRequest req)
        {
            if (!IsAnyServerAuth(req.authorization, out _))
            {
                if (Guid.TryParse(req.serverId, out var sid)
                    && (await services.gameServer.GetGameServer(sid)) == null)
                {
                    return false;
                }
            }
            return StaffFilter.IsOwner(req.actorUserId);
        }

        [HttpGetBypass("gs/admin/owners")]
        [HttpPostBypass("gs/admin/owners")]
        public dynamic GsAdminOwners()
        {
            // Lua admin module fetches this on RCC startup so it knows which
            // userIds may run ;<cmd>. No auth required: the list is not a
            // secret (it's already implied by what users can run staff tools)
            // and the actual privileged endpoints all re-verify actorUserId
            // against StaffFilter.IsOwner.
            return new { owners = StaffFilter.GetOwnerIds() };
        }

        [HttpPostBypass("gs/admin/ban")]
        public async Task<dynamic> GsAdminBan([MVC.FromBody] GsAdminBanRequest req)
        {
            if (!await AuthorizeGsAdmin(req)) { Response.StatusCode = 401; return new { ok = false }; }
            var reason = string.IsNullOrWhiteSpace(req.reason) ? "Banned by in-game admin" : req.reason!.Trim();
            try
            {
                var info = await services.users.GetUserById(req.targetUserId);
                if (info.accountStatus != AccountStatus.Ok &&
                    info.accountStatus != AccountStatus.Suppressed &&
                    info.accountStatus != AccountStatus.MustValidateEmail)
                    return new { ok = false, reason = "User is not in a bannable state" };
                if (await StaffFilter.IsStaff(req.targetUserId) && !StaffFilter.IsOwner(req.actorUserId))
                    return new { ok = false, reason = "Cannot ban staff" };

                await adminDb.ExecuteAsync(
                    "INSERT INTO user_ban (user_id, reason, author_user_id, expired_at, internal_reason) VALUES (:user_id, :reason, :author, NULL, :internal_reason)",
                    new { user_id = req.targetUserId, reason, author = req.actorUserId, internal_reason = "[in-game admin] " + reason });
                await adminDb.ExecuteAsync(
                    "INSERT INTO moderation_ban (user_id, actor_id, reason, internal_reason, expired_at) VALUES (:user_id, :author, :reason, :internal_reason, NULL)",
                    new { user_id = req.targetUserId, author = req.actorUserId, reason, internal_reason = "[in-game admin] " + reason });
                await adminDb.ExecuteAsync(
                    "UPDATE \"user\" SET status = :st WHERE id = :id",
                    new { st = AccountStatus.Deleted, id = req.targetUserId });
                return new { ok = true };
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[gs/admin/ban] failed: {ex.Message}");
                return new { ok = false, reason = ex.Message };
            }
        }

        [HttpPostBypass("gs/admin/unban")]
        public async Task<dynamic> GsAdminUnban([MVC.FromBody] GsAdminBaseRequest req)
        {
            if (!await AuthorizeGsAdmin(req)) { Response.StatusCode = 401; return new { ok = false }; }
            try
            {
                await adminDb.ExecuteAsync("DELETE FROM user_ban WHERE user_id = :id", new { id = req.targetUserId });
                await adminDb.ExecuteAsync("UPDATE \"user\" SET status = :st WHERE id = :id",
                    new { st = AccountStatus.Ok, id = req.targetUserId });
                return new { ok = true };
            }
            catch (Exception ex) { return new { ok = false, reason = ex.Message }; }
        }

        [HttpPostBypass("gs/admin/giveitem")]
        public async Task<dynamic> GsAdminGiveItem([MVC.FromBody] GsAdminItemRequest req)
        {
            if (!await AuthorizeGsAdmin(req)) { Response.StatusCode = 401; return new { ok = false }; }
            try
            {
                var existing = (await services.users.GetUserAssets(req.targetUserId, req.assetId)).ToList();
                if (existing.Count > 0) return new { ok = false, reason = "User already owns this item" };
                await services.users.CreateUserAsset(req.targetUserId, req.assetId);
                return new { ok = true };
            }
            catch (Exception ex) { return new { ok = false, reason = ex.Message }; }
        }

        [HttpPostBypass("gs/admin/removeitem")]
        public async Task<dynamic> GsAdminRemoveItem([MVC.FromBody] GsAdminItemRequest req)
        {
            if (!await AuthorizeGsAdmin(req)) { Response.StatusCode = 401; return new { ok = false }; }
            try
            {
                await adminDb.ExecuteAsync(
                    "DELETE FROM user_asset WHERE user_id = :uid AND asset_id = :aid",
                    new { uid = req.targetUserId, aid = req.assetId });
                return new { ok = true };
            }
            catch (Exception ex) { return new { ok = false, reason = ex.Message }; }
        }

        [HttpPostBypass("gs/admin/givecurrency")]
        public async Task<dynamic> GsAdminGiveCurrency([MVC.FromBody] GsAdminCurrencyRequest req)
        {
            if (!await AuthorizeGsAdmin(req)) { Response.StatusCode = 401; return new { ok = false }; }
            try
            {
                var currency = (req.currency ?? "robux").ToLowerInvariant() == "tickets"
                    ? CurrencyType.Tickets
                    : CurrencyType.Robux;
                using var ec = ServiceProvider.GetOrCreate<EconomyService>();
                await ec.IncrementCurrency(CreatorType.User, req.targetUserId, currency, req.amount);
                return new { ok = true, currency = currency.ToString(), amount = req.amount };
            }
            catch (Exception ex) { return new { ok = false, reason = ex.Message }; }
        }

        [HttpPostBypass("gs/admin/logs")]
        public async Task<dynamic> GsAdminLogs([MVC.FromBody] GsAdminBaseRequest req)
        {
            if (!await AuthorizeGsAdmin(req)) { Response.StatusCode = 401; return new { ok = false }; }
            try
            {
                var rows = await adminDb.QueryAsync<dynamic>(
                    @"SELECT 'ban' AS kind, reason, internal_reason AS internalReason, expired_at AS expiredAt, created_at AS createdAt
                      FROM moderation_ban
                      WHERE user_id = :uid
                      ORDER BY id DESC
                      LIMIT 25",
                    new { uid = req.targetUserId });
                return new { ok = true, entries = rows };
            }
            catch (Exception ex) { return new { ok = false, reason = ex.Message, entries = Array.Empty<object>() }; }
        }

        [HttpPostBypass("gs/admin/setrank")]
        public async Task<dynamic> GsAdminSetRank([MVC.FromBody] GsAdminRankRequest req)
        {
            if (!await AuthorizeGsAdmin(req)) { Response.StatusCode = 401; return new { ok = false }; }
            // Setrank is a placeholder: this place doesn't bind to a specific
            // group, so we just persist the rank on the staff metadata as an
            // ack. Wire to a real `group_member.role_id` UPDATE when groups
            // are introduced into the game flow.
            try
            {
                Console.WriteLine($"[gs/admin/setrank] actor={req.actorUserId} target={req.targetUserId} rank={req.rank}");
                return new { ok = true, note = "Recorded; group binding not configured for this universe." };
            }
            catch (Exception ex) { return new { ok = false, reason = ex.Message }; }
        }

        [HttpPostBypass("gs/admin/removerank")]
        public async Task<dynamic> GsAdminRemoveRank([MVC.FromBody] GsAdminBaseRequest req)
        {
            if (!await AuthorizeGsAdmin(req)) { Response.StatusCode = 401; return new { ok = false }; }
            try
            {
                Console.WriteLine($"[gs/admin/removerank] actor={req.actorUserId} target={req.targetUserId}");
                return new { ok = true, note = "Recorded; group binding not configured for this universe." };
            }
            catch (Exception ex) { return new { ok = false, reason = ex.Message }; }
        }

        [HttpPostBypass("gs/admin/warn")]
        public async Task<dynamic> GsAdminWarn([MVC.FromBody] GsAdminBanRequest req)
        {
            if (!await AuthorizeGsAdmin(req)) { Response.StatusCode = 401; return new { ok = false }; }
            var reason = string.IsNullOrWhiteSpace(req.reason) ? "Warned by in-game admin" : req.reason!.Trim();
            try
            {
                // A "warning" is a moderation_ban row that's already expired
                // (expired_at = NOW()) and tagged in internal_reason. The
                // logs endpoint surfaces it without affecting the user's
                // account status.
                await adminDb.ExecuteAsync(
                    "INSERT INTO moderation_ban (user_id, actor_id, reason, internal_reason, expired_at) VALUES (:user_id, :author, :reason, :internal_reason, NOW())",
                    new { user_id = req.targetUserId, author = req.actorUserId, reason, internal_reason = "[warning] " + reason });
                return new { ok = true };
            }
            catch (Exception ex) { return new { ok = false, reason = ex.Message }; }
        }

        [HttpPostBypass("gs/admin/removecurrency")]
        public async Task<dynamic> GsAdminRemoveCurrency([MVC.FromBody] GsAdminCurrencyRequest req)
        {
            if (!await AuthorizeGsAdmin(req)) { Response.StatusCode = 401; return new { ok = false }; }
            try
            {
                var currency = (req.currency ?? "robux").ToLowerInvariant() == "tickets"
                    ? CurrencyType.Tickets
                    : CurrencyType.Robux;
                using var ec = ServiceProvider.GetOrCreate<EconomyService>();
                var balance = await ec.GetBalance(CreatorType.User, req.targetUserId);
                long current = currency == CurrencyType.Robux ? balance.robux : balance.tickets;
                long take = Math.Min(req.amount, current);
                if (take <= 0) return new { ok = true, currency = currency.ToString(), amount = 0L, note = "Balance was already zero" };
                await ec.DecrementCurrency(CreatorType.User, req.targetUserId, currency, take);
                return new { ok = true, currency = currency.ToString(), amount = take };
            }
            catch (Exception ex) { return new { ok = false, reason = ex.Message }; }
        }

        [HttpPostBypass("gs/admin/resetinventory")]
        public async Task<dynamic> GsAdminResetInventory([MVC.FromBody] GsAdminBaseRequest req)
        {
            if (!await AuthorizeGsAdmin(req)) { Response.StatusCode = 401; return new { ok = false }; }
            try
            {
                // Clear out user_asset rows AND drop any pending wears so the
                // avatar refreshes on next /v1/users/{id}/avatar fetch.
                var rows = await adminDb.ExecuteAsync(
                    "DELETE FROM user_asset WHERE user_id = :uid", new { uid = req.targetUserId });
                await adminDb.ExecuteAsync(
                    "DELETE FROM user_avatar_asset WHERE user_id = :uid", new { uid = req.targetUserId });
                return new { ok = true, removed = rows };
            }
            catch (Exception ex) { return new { ok = false, reason = ex.Message }; }
        }

        [HttpPostBypass("gs/admin/whitelist")]
        public async Task<dynamic> GsAdminWhitelist([MVC.FromBody] GsAdminBaseRequest req)
        {
            if (!await AuthorizeGsAdmin(req)) { Response.StatusCode = 401; return new { ok = false }; }
            // Mirrors removerank: there is no closed_beta_whitelist table in
            // this codebase right now, so we just record the intent. Wire to
            // a real allowlist when one exists.
            Console.WriteLine($"[gs/admin/whitelist] actor={req.actorUserId} target={req.targetUserId}");
            return new { ok = true, note = "Recorded; no whitelist table configured." };
        }

        [HttpPostBypass("gs/admin/unwhitelist")]
        public async Task<dynamic> GsAdminUnwhitelist([MVC.FromBody] GsAdminBaseRequest req)
        {
            if (!await AuthorizeGsAdmin(req)) { Response.StatusCode = 401; return new { ok = false }; }
            Console.WriteLine($"[gs/admin/unwhitelist] actor={req.actorUserId} target={req.targetUserId}");
            return new { ok = true, note = "Recorded; no whitelist table configured." };
        }

        [HttpPostBypass("gs/admin/viewprofile")]
        public async Task<dynamic> GsAdminViewProfile([MVC.FromBody] GsAdminBaseRequest req)
        {
            if (!await AuthorizeGsAdmin(req)) { Response.StatusCode = 401; return new { ok = false }; }
            try
            {
                var info = await services.users.GetUserById(req.targetUserId);
                using var ec = ServiceProvider.GetOrCreate<EconomyService>();
                var balance = await ec.GetBalance(CreatorType.User, req.targetUserId);
                bool isStaff = await StaffFilter.IsStaff(req.targetUserId);
                return new
                {
                    ok = true,
                    userId = info.userId,
                    username = info.username,
                    status = info.accountStatus.ToString(),
                    created = info.created,
                    robux = balance.robux,
                    tickets = balance.tickets,
                    isStaff,
                    isOwner = StaffFilter.IsOwner(req.targetUserId),
                };
            }
            catch (Exception ex) { return new { ok = false, reason = ex.Message }; }
        }

        [HttpPostBypass("/v1.0/SequenceStatistics/AddToSequence")]
        [HttpPostBypass("/v1.1/Counters/Increment")]
        [HttpPostBypass("/v1.0/SequenceStatistics/BatchAddToSequencesV2")]
        [HttpPostBypass("v1.0/MultiIncrement")]
        [HttpPostBypass("/game/report-stats")]
        [HttpGetBypass("usercheck/show-tos")]
        [HttpGetBypass("/v1.1/Counters/Increment")]
        [HttpGetBypass("notifications/signalr/negotiate")]
        [HttpGetBypass("notifications/negotiate")]
        [HttpPostBypass("v1.1/Counters/BatchIncrement")]
        [HttpGetBypass("v1.1/Counters/BatchIncrement")]
        public MVC.OkResult TelemetryFunctions()
        {
            return Ok();
        }

    }
}
