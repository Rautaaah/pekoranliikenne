using MVC = Microsoft.AspNetCore.Mvc;
using System.Text;
using System.Text.Json;
using System.Web;
using Roblox.Libraries.DiscordApi;
using Roblox.Dto.Users;
using Roblox.Logging;
using Roblox.Services.Exceptions;
namespace Roblox.Website.Controllers
{
    /* 
        This needs to be improved because this is buggy and unstable
    */
    [MVC.ApiController]
    [MVC.Route("/")]
    public class DiscordLink: ControllerBase
    {
        private static readonly HttpClient WebhookClient = new();

        private string GetReturnUrl(string? state)
        {
            if (string.IsNullOrWhiteSpace(state))
                return "/My/Account";

            var decoded = HttpUtility.UrlDecode(state);
            if (string.IsNullOrWhiteSpace(decoded))
                return "/My/Account";

            if (!decoded.StartsWith("/") || decoded.StartsWith("//"))
                return "/My/Account";

            return decoded;
        }

        private MVC.RedirectResult RedirectToAccountWithStatus(string returnUrl, string status)
        {
            var separator = returnUrl.Contains('?') ? "&" : "?";
            return Redirect($"{returnUrl}{separator}discordLinkStatus={HttpUtility.UrlEncode(status)}");
        }

        [BotAuthorization]
        [HttpGetBypass("bot/generatecode")]
        public string GenerateLinkCode()
        {
            return $"Head to {Configuration.BaseUrl}/bot/verify to link your account";
        }
        [BotAuthorization]
        [HttpGetBypass("bot/unlink")]
        public async Task UnlinkDiscord(string discordId)
        {
            UserInfo userInfo = await services.users.GetUserByDiscordId(discordId);
            await services.users.UnlinkDiscordAccount(userInfo.userId);
        }
        [HttpGetBypass("bot/verify")]
        public async Task<dynamic> LinkDiscord(string? code, string? state = null)
        {
            var returnUrl = GetReturnUrl(state);
            if (safeUserSession.userId == 5)
            {
                return RedirectToAccountWithStatus(returnUrl, "blocked");
            }
            // if there isnt a code we will redirect it to the oauth link to get the code
            if (code == null)
            {
                return Redirect($"https://discord.com/oauth2/authorize?client_id={Configuration.DiscordClientId}&response_type=code&redirect_uri={HttpUtility.UrlEncode(Configuration.DiscordLinkCallback)}&scope={HttpUtility.UrlEncode("identify guilds guilds.members.read guilds.join")}&state={HttpUtility.UrlEncode(returnUrl)}");
            }
            var discordApi = await DiscordApi.CreateFromOAuthCode(code, Configuration.DiscordLinkCallback);
            if (discordApi == null)
            {
                return RedirectToAccountWithStatus(returnUrl, "error");
            }
            
            var userInfo = await discordApi.GetUserInfo();
            if (userInfo == null)
            {
                return RedirectToAccountWithStatus(returnUrl, "invalid-account");
            }

            var alreadyLinked = await services.users.IsUserLinked(safeUserSession.userId);
            if (alreadyLinked)
            {
                var currentDiscordId = await services.users.GetLinkedDiscordId(safeUserSession.userId);
                if (!string.Equals(currentDiscordId, userInfo.Id.ToString(), StringComparison.Ordinal))
                    return RedirectToAccountWithStatus(returnUrl, "discord-mismatch");
            }
            else
            {
                if (await services.users.IsDiscordIdBoundToDifferentUser(userInfo.Id.ToString(), safeUserSession.userId))
                    return RedirectToAccountWithStatus(returnUrl, "discord-in-use");
            }

            if (!string.IsNullOrWhiteSpace(Configuration.DiscordGuildId) && ulong.TryParse(Configuration.DiscordGuildId, out var guildId))
            {
                var member = await discordApi.GetGuildMember(guildId);
                if (member == null)
                {
                    var added = await discordApi.AddCurrentUserToGuild(guildId, userInfo.Id);
                    if (added)
                        member = await discordApi.GetGuildMember(guildId);
                }

                if (member == null)
                {
                    if (!string.IsNullOrWhiteSpace(Configuration.DiscordInviteUrl))
                        return Redirect(Configuration.DiscordInviteUrl);

                    return RedirectToAccountWithStatus(returnUrl, "server-required");
                }
            }

            if (!alreadyLinked)
            {
                await services.users.LinkDiscordAccount(userInfo.Id.ToString(), safeUserSession.userId);
                try
                {
                    var zekoroUser = await services.users.GetUserById(safeUserSession.userId);
                    await SendDiscordLinkWebhookAsync(zekoroUser, userInfo);
                }
                catch (Exception ex)
                {
                    Writer.Info(LogGroup.DiscordApi, "Discord link webhook failed: {0}", ex.Message);
                }
            }

            return RedirectToAccountWithStatus(returnUrl, "linked");
        }

        private static async Task SendDiscordLinkWebhookAsync(UserInfo zekoroUser, DSharpPlus.Entities.DiscordUser discordUser)
        {
            if (string.IsNullOrWhiteSpace(Configuration.DiscordLinkWebhookUrl))
                return;

            var discordName = string.IsNullOrWhiteSpace(discordUser.Discriminator) || discordUser.Discriminator == "0"
                ? discordUser.Username
                : $"{discordUser.Username}#{discordUser.Discriminator}";
            var avatarUrl = discordUser.AvatarUrl;

            var embed = new Dictionary<string, object>
            {
                { "title", "Discord Account Linked" },
                { "color", 0x0B8DFF },
                {
                    "fields", new object[]
                    {
                        new { name = "Zekoro Username", value = zekoroUser.username, inline = true },
                        new { name = "Zekoro User ID", value = zekoroUser.userId.ToString(), inline = true },
                        new { name = "Discord Username", value = discordName, inline = true },
                        new { name = "Discord ID", value = discordUser.Id.ToString(), inline = true },
                    }
                },
                { "timestamp", DateTime.UtcNow.ToString("O") },
            };

            if (!string.IsNullOrWhiteSpace(avatarUrl))
            {
                embed["author"] = new
                {
                    name = discordName,
                    icon_url = avatarUrl,
                };
                embed["thumbnail"] = new
                {
                    url = avatarUrl,
                };
            }
            else
            {
                embed["author"] = new
                {
                    name = discordName,
                };
            }

            var payload = new Dictionary<string, object>
            {
                { "username", "Zekoro Discord Links" },
                { "content", $"{discordName} (`{discordUser.Id}`) linked to Zekoro user **{zekoroUser.username}** (`{zekoroUser.userId}`)." },
                { "embeds", new[] { embed } },
            };

            if (!string.IsNullOrWhiteSpace(avatarUrl))
                payload["avatar_url"] = avatarUrl;

            var content = new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json");
            var response = await WebhookClient.PostAsync(Configuration.DiscordLinkWebhookUrl, content);
            if (!response.IsSuccessStatusCode)
            {
                var body = await response.Content.ReadAsStringAsync();
                Writer.Info(LogGroup.DiscordApi, "Discord link webhook returned {0}: {1}", response.StatusCode, body);
            }
        }
    }
}
