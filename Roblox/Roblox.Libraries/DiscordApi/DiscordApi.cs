using System.Net;
using System.Net.Http.Headers;
using System.Text;
using DSharpPlus.Entities;
using Newtonsoft.Json;
using Roblox.Logging;

#pragma warning disable IDE1006
#pragma warning disable CS8618

namespace Roblox.Libraries.DiscordApi;

public class DiscordApi
{
    private class DiscordHttpClient : HttpClient
    {
        public DiscordHttpClient(string token) 
            : base(new HttpClientHandler { AutomaticDecompression = DecompressionMethods.All })
        {
            BaseAddress = new Uri("https://discord.com/api/");
            SetToken(token);
        }

        public void SetToken(string token)
        {
            DefaultRequestHeaders.Authorization = string.IsNullOrWhiteSpace(token)
                ? null
                : new AuthenticationHeaderValue("Bearer", token);
        }
    }

    private readonly DiscordHttpClient discordClient;

    public string AccessToken { get; private set; }
    public string? RefreshToken { get; private set; }
    public int ExpiresIn { get; private set; }
    public string RedirectUri { get; private set; }

    public static async Task<DiscordApi?> CreateFromOAuthCode(string code, string redirectUri)
    {
		Writer.Info(LogGroup.DiscordApi, "CreateFromOAuthCode with redirectUri: {0}", redirectUri);
		
        var api = new DiscordApi(string.Empty, redirectUri);
        var tokenResponse = await api.RequestAccessToken(code, useRefreshToken: false);
        if (tokenResponse == null)
        {
			Writer.Info(LogGroup.DiscordApi, "RedirectUri at failure: {0}", redirectUri);
            return null;
        }

        api.AccessToken = tokenResponse.accessToken;
        api.RefreshToken = tokenResponse.refreshToken;
        api.ExpiresIn = tokenResponse.expiresIn;
        api.discordClient.SetToken(api.AccessToken);

        Writer.Info(LogGroup.DiscordApi, "Access token received, expire time {0}", api.ExpiresIn);
        return api;
    }

    public DiscordApi(string accessToken, string redirectUri)
    {
        RedirectUri = redirectUri;
        AccessToken = accessToken;
        discordClient = new DiscordHttpClient(accessToken);
    }
    public async Task<DiscordUser?> GetUserInfo()
    {
        var response = await discordClient.GetAsync("users/@me");
        if (!response.IsSuccessStatusCode)
        {
            Writer.Info(LogGroup.DiscordApi, "GetUserInfo failed with {0}", response.StatusCode);
            return null;
        }

        string content = await response.Content.ReadAsStringAsync();
        return JsonConvert.DeserializeObject<DiscordUser>(content);
    }

    public async Task<DiscordMember?> GetGuildMember(ulong guildId)
    {
        var response = await discordClient.GetAsync($"users/@me/guilds/{guildId}/member");
        if (!response.IsSuccessStatusCode)
        {
            Writer.Info(LogGroup.DiscordApi, "GetGuildMember failed with {0}", response.StatusCode);
            return null;
        }

        string content = await response.Content.ReadAsStringAsync();
        return JsonConvert.DeserializeObject<DiscordMember>(content);
    }

    public async Task<bool> AddCurrentUserToGuild(ulong guildId, ulong userId)
    {
        if (string.IsNullOrWhiteSpace(Configuration.DiscordBotToken))
            return false;

        var payload = new Dictionary<string, string>
        {
            { "access_token", AccessToken },
        };
        var request = new HttpRequestMessage(HttpMethod.Put, $"guilds/{guildId}/members/{userId}")
        {
            Content = new StringContent(JsonConvert.SerializeObject(payload), Encoding.UTF8, "application/json"),
        };
        request.Headers.Add("Authorization", "Bot " + Configuration.DiscordBotToken);

        var response = await discordClient.SendAsync(request);
        if (response.IsSuccessStatusCode)
            return true;

        var body = await response.Content.ReadAsStringAsync();
        Writer.Info(LogGroup.DiscordApi, "AddCurrentUserToGuild failed with {0}: {1}", response.StatusCode, body);
        return false;
    }

    public async Task<bool> IsValid()
    {
        return await GetUserInfo() != null;
    }

    private async Task<DiscordTokenResponse?> RequestAccessToken(string codeOrRefreshToken, bool useRefreshToken)
    {
        var form = new Dictionary<string, string>
        {
            { "client_id", Configuration.DiscordClientId.ToString() },
            { "client_secret", Configuration.DiscordClientSecret.ToString() },
            { "grant_type", useRefreshToken ? "refresh_token" : "authorization_code" },
            { "redirect_uri", RedirectUri },
            { "scope", "identify guilds guilds.members.read guilds.join" },
            { useRefreshToken ? "refresh_token" : "code", codeOrRefreshToken }
        };

        var response = await discordClient.PostAsync("oauth2/token", new FormUrlEncodedContent(form));


        string body = await response.Content.ReadAsStringAsync();
        if (!response.IsSuccessStatusCode)
        {
            Writer.Info(LogGroup.DiscordApi, "Failed to get access token: {0} - {1}", response.StatusCode, body);
            return null;
        }

        return JsonConvert.DeserializeObject<DiscordTokenResponse>(body);
    }
}
