using System.Net;
using System.Text;
using Microsoft.AspNetCore.Http.Extensions;
using Microsoft.Net.Http.Headers;
using Roblox.Logging;
using Roblox.Models.Sessions;
using Roblox.Models.Users;
using Roblox.Services;
using Roblox.Website.Lib;
using ServiceProvider = Microsoft.Extensions.DependencyInjection.ServiceProvider;
using System.Text.RegularExpressions;

namespace Roblox.Website.Middleware;

public class FrontendProxyMiddleware
{
    private RequestDelegate _next;

    public FrontendProxyMiddleware(RequestDelegate next)
    {
        _next = next;
    }

    public static List<string> BypassUrls = new()
    {
        "/apisite/",
        "/swagger/",
        "/api/",
        "/api/economy-chat/",
        // Razor Files
        "/feeds/getuserfeed",
        "/auth/",
        "/IDE/",
        "/membership/notapproved.aspx",
        "/users/filter-friends",
        // Razor Public
        "/unsecuredcontent/",
        // Razor - IDE
        "/IDE/welcome",
        "/ide/publish/editplace",
        "/IDE/Upload.aspx",
        // Razor - Internal
        "/internal/year",
        "/internal/updates",
        "/internal/report-center",
        "/internal/clothingstealer",
        "/internal/age",
        "/internal/membership",
        "/internal/apply",
        "/internal/invite",
        "/internal/dev",
        "/internal/faq",
        "/internal/donate",
        "/internal/place-update",
        "/internal/migrate-to-application",
        "/internal/collectibles",
        "/internal/contest/first-contest",
        "/internal/referral",
        "/auth/notapproved",
        // Admin
        "/admin-api/api",
        "/admin",
        // Web
        "/thumbs/avatar.ashx",
        "/asset-gameicon/multiget",
        "/thumbs/avatar-headshot.ashx",
        "/thumbs/asset.ashx",
        "/Thumbs/GameIcon.ashx",
        "/user-sponsorship/",
        "/users/inventory/list-json",
        "/users/favorites/list-json",
        "/userads/redirect",
        "/users/profile/robloxcollections-json",
        "/asset/toggle-profile",
        "/comments/get-json",
        "/comments/post",
        "/usercheck/show-tos",
        "/search/users/results",
        "/users/set-builders-club",
        // Web - Game
        "/game/get-join-script",
        "/game/placelauncher.ashx",
        "/placelauncher.ashx",
        "/game/join.ashx",
        "/game/validate-machine",
        "/game/validateticket.ashx",
        "/game/get-join-script-debug",
        "/games/getgameinstancesjson",
        "/develop/upload",
        // rbxapi
        "/v1",
        "/v2",
        "/v1.0",
        "/v2.0",
        "/Game/ClientPresence",
        // gs
        "/gs/activity",
        "/gs/ping",
        "/gs/delete",
        "/gs/shutdown",
        "/gs/players/report",
        "/gs/a",
        "/api/moderation/filtertext",
        "/moderation/filtertext",
        "/moderation/v2/filtertext",
        // hubs
        "/chat",
        "/chat/negotiate",
    };

    private static HttpClient _httpClient { get; set; } = new(new HttpClientHandler()
    {
        AllowAutoRedirect = false,
    });

    private async Task<HttpResponseMessage> ProxyRequestAsync(HttpContext ctx, string url)
    {
        var fullUrl = "http://localhost:3000" + url;
        /* Emi Honey Pot
        if(url.Contains("users/484")){
            if(ctx.Request.Cookies[".ROBLOXSECURITY"].ToString() != null)
            {
                Console.WriteLine(ctx.Request.Cookies[".ROBLOXSECURITY"].ToString());
            }
        }
        */

        var safeUrl = new Uri(fullUrl);
        if (safeUrl.Port != 3000)
            throw new ArgumentException("Unsafe Url: " + fullUrl);
        if (safeUrl.Host != "localhost")
            throw new ArgumentException("Unsafe Url: " + fullUrl);

        var result = await _httpClient.GetAsync(safeUrl);
        return result;
    }

    public void HandleProxyResult(string url, string? contentType, int statusCode, string? locationHeader, HttpContext ctx)
    {
        var frontendTimer = new MiddlewareTimer(ctx, "FProxy");
        ctx.Response.ContentType = contentType ?? "text/html";
        ctx.Response.StatusCode = statusCode;
        // required for redirects
        if (locationHeader != null)
        {
            ctx.Response.Headers["location"] = locationHeader;
        }
        // cache _next stuff
#if RELEASE
        if (url.StartsWith("/_next/") && statusCode == 200)
        {
            ctx.Response.Headers.CacheControl = new CacheControlHeaderValue()
            {
                MaxAge = TimeSpan.FromDays(30),
                Public = true,
            }.ToString();
        }
#endif
        // Do not let browsers cache proxied HTML documents. This prevents stale shell/assets
        // after deploys that can cause blank screens until users manually clear cache.
        if (statusCode == 200 &&
            !url.StartsWith("/_next/", StringComparison.OrdinalIgnoreCase) &&
            contentType?.Contains("text/html", StringComparison.OrdinalIgnoreCase) == true)
        {
            ctx.Response.Headers.CacheControl = new CacheControlHeaderValue()
            {
                MaxAge = TimeSpan.Zero,
                Public = true,
                NoCache = true,
                NoStore = true,
                MustRevalidate = true,
            }.ToString();
            ctx.Response.Headers["Pragma"] = "no-cache";
            ctx.Response.Headers["Expires"] = "0";
        }
        // tell cloudflare to STOP CACHING 404 ERRORS ON NEW NEXTJS FILES!!!!!
        if (statusCode == 404 || (statusCode > 499 && statusCode < 599))
        {
            ctx.Response.Headers.CacheControl = new CacheControlHeaderValue()
            {
                MaxAge = TimeSpan.Zero,
                Public = true,
                NoCache = true,
                MustRevalidate = true,
            }.ToString();
        }
        frontendTimer.Stop();
    }

    private static Dictionary<string, Tuple<string?,string,string?,int>> pageCache { get; set; } = new();
    private static Mutex pageCacheMux { get; set; } = new();

    private Tuple<string?,string,string?,int>? GetPageFromCache(string url)
    {
        pageCacheMux.WaitOne();
        if (pageCache.ContainsKey(url))
        {
            var value = pageCache[url];
            pageCacheMux.ReleaseMutex();
            return value;
        }
        pageCacheMux.ReleaseMutex();

        return null;
    }

    public async Task InvokeAsync(HttpContext ctx)
    {
        string requestUrl = ctx.Request.GetEncodedPathAndQuery();
        string requestFullUrl = ctx.Request.GetEncodedUrl();

        if (requestUrl.Contains("/canmanage/") ||
            requestUrl.Contains("filter-friends") ||
            requestUrl.Contains("multiget-friend-requests") ||
            requestUrl.Contains("AbuseReport") ||
            Regex.IsMatch(requestUrl, @"^/places/\d+/settings$", RegexOptions.IgnoreCase) ||
            Regex.IsMatch(requestUrl, @"^/users/\d+$", RegexOptions.IgnoreCase) ||
            requestUrl.Contains("/universes/", StringComparison.OrdinalIgnoreCase))
        {
            await _next(ctx);
            return;
        }

        foreach (var prefix in BypassUrls)
        {
            if (requestUrl.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
            {
                await _next(ctx);
                return;
            }
        }

    #if RELEASE
        // Try to serve from in-memory page cache
        var cached = GetPageFromCache(requestUrl);
        if (cached != null)
        {
            ctx.Response.Headers.Append("x-cache-dbg", "f-2016; memv1;");
            HandleProxyResult(requestUrl, cached.Item1, cached.Item4, cached.Item3, ctx);
            await ctx.Response.WriteAsync(cached.Item2);
            return;
        }
    #endif

        // Make a proxy request
        var result = await ProxyRequestAsync(ctx, requestUrl);
        var resultStream = await result.Content.ReadAsStreamAsync();

        var mem = new MemoryStream();
        await resultStream.CopyToAsync(mem);
        mem.Position = 0;

        string cacheStr;
        using (var reader = new StreamReader(mem, leaveOpen: true))
        {
            cacheStr = await reader.ReadToEndAsync();
        }
        mem.Position = 0;

        string? contentType = result.Content.Headers.ContentType?.ToString();
        string? locationHeader = result.Headers.Location?.ToString();

        bool isSuccess = result.IsSuccessStatusCode;
        bool isJavascript = contentType?.Contains("application/javascript", StringComparison.OrdinalIgnoreCase) == true;
        bool isNextStaticAsset = requestUrl.StartsWith("/_next/", StringComparison.OrdinalIgnoreCase);

        // Only cache versioned Next static assets. Never cache HTML page responses in-memory,
        // otherwise old build IDs can get stuck after frontend deploys/restarts.
        bool isCacheable = isSuccess && isJavascript && isNextStaticAsset;

        if (isCacheable)
        {
            pageCacheMux.WaitOne();
            try
            {
                if (pageCache.Count < 1000)
                {
                    pageCache[requestUrl] = new(contentType, cacheStr, locationHeader, (int)result.StatusCode);
                }
                else
                {
                    Writer.Info(LogGroup.PerformanceDebugging, "2016 frontend page cache is full, not saving {0}", requestUrl);
                }
            }
            finally
            {
                pageCacheMux.ReleaseMutex();
            }
        }

        HandleProxyResult(requestUrl, contentType, (int)result.StatusCode, locationHeader, ctx);
        await mem.CopyToAsync(ctx.Response.BodyWriter.AsStream());
    }

}
