using System.Text.Json;
using System.Text.Json.Serialization;
using System.Net;
using JWT;
using JWT.Algorithms;
using JWT.Exceptions;
using JWT.Serializers;
using Microsoft.AspNetCore.Http.Extensions;
using Roblox.Dto.Users;
using Roblox.Models.Sessions;
using Roblox.Models.Users;
using Roblox.Services;
using Roblox.Services.Exceptions;
using Roblox.Website.Controllers;
using Roblox.Website.Filters;
using Roblox.Website.Lib;
using ServiceProvider = Roblox.Services.ServiceProvider;

namespace Roblox.Website.Middleware;

public class JwtEntry
{
    public string sessionId { get; set; }
    public long createdAt { get; set; }
}

public class SessionMiddleware
{
    private RequestDelegate _next;
    public const string CookieName = ".ZEKOSECURITY";
    // Read-only alias: accept the real Roblox cookie name (.ROBLOSECURITY, no "X") as
    // a valid session token so legacy clients / cookie imports keep working, but NEVER
    // write it back. Only `.ZEKOSECURITY` (CookieName above) is set on responses.
    public const string RobloxCookieName = ".ROBLOSECURITY";
    // JWT Config
    private static readonly IJwtAlgorithm Algorithm = new HMACSHA512Algorithm();
    private static readonly IJsonSerializer Serializer = new JsonNetSerializer();
    private static readonly IBase64UrlEncoder UrlEncoder = new JwtBase64UrlEncoder();
    private static readonly IDateTimeProvider DateTimeProvider = new UtcDateTimeProvider();
    private static readonly IJwtValidator Validator = new JwtValidator(Serializer, DateTimeProvider);

    private static readonly IJwtEncoder Encoder = new JwtEncoder(Algorithm, Serializer, UrlEncoder);
    private static readonly IJwtDecoder Decoder = new JwtDecoder(Serializer, Validator, UrlEncoder, Algorithm);

    private static string cookieJwtKey { get; set; }

    public static void Configure(string newJwtKey)
    {
        if (cookieJwtKey != null) throw new Exception("Already configured");
        cookieJwtKey = newJwtKey;
    }

    public static IEnumerable<string> GetReadableCookieNames()
    {
        yield return CookieName;
        yield return RobloxCookieName;
    }

    public static IEnumerable<string> GetLegacyCookieNames()
    {
        yield break;
    }

    public static string? GetSessionCookieValue(IRequestCookieCollection cookies)
    {
        foreach (var cookieName in GetReadableCookieNames())
        {
            if (cookies.TryGetValue(cookieName, out var cookieValue) && !string.IsNullOrWhiteSpace(cookieValue))
                return cookieValue;
        }

        return null;
    }

    public static IEnumerable<string> GetSessionCookieCandidates(HttpContext ctx)
    {
        var yielded = new HashSet<string>(StringComparer.Ordinal);

        foreach (var cookieName in GetReadableCookieNames())
        {
            if (ctx.Request.Cookies.TryGetValue(cookieName, out var cookieValue) && !string.IsNullOrWhiteSpace(cookieValue))
            {
                if (yielded.Add(cookieValue))
                    yield return cookieValue;
            }
        }

        // Patched 2020 RobloxPlayer doesn't reliably persist Set-Cookie from /Login/Negotiate.ashx
        // before the next request to /Game/Join.ashx (especially when Cloudflare is in front).
        // Also accept the JWT ticket via the URL (?suggest= / ?ticket=) or the
        // `Authorization: Bearer <jwt>` header, mirroring how `Negotiate` itself reads the ticket.
        foreach (var key in new[] { "suggest", "ticket" })
        {
            var v = ctx.Request.Query[key].ToString();
            if (!string.IsNullOrWhiteSpace(v) && yielded.Add(v))
                yield return v;
        }
        var auth = ctx.Request.Headers["Authorization"].ToString();
        if (!string.IsNullOrWhiteSpace(auth) && auth.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
        {
            var bearer = auth.Substring(7).Trim();
            if (!string.IsNullOrWhiteSpace(bearer) && yielded.Add(bearer))
                yield return bearer;
        }

        var rawCookieHeader = ctx.Request.Headers.Cookie.ToString();
        if (string.IsNullOrWhiteSpace(rawCookieHeader))
            yield break;

        var readableNames = GetReadableCookieNames().ToArray();
        foreach (var part in rawCookieHeader.Split(';', StringSplitOptions.RemoveEmptyEntries))
        {
            var trimmed = part.Trim();
            foreach (var cookieName in readableNames)
            {
                var prefix = cookieName + "=";
                if (!trimmed.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
                    continue;

                var cookieValue = trimmed.Substring(prefix.Length).Trim();
                if (string.IsNullOrWhiteSpace(cookieValue))
                    continue;

                if (yielded.Add(cookieValue))
                    yield return cookieValue;
            }
        }
    }

    public static void DeleteSessionCookies(IResponseCookies cookies)
    {
        var deleteOptions = new CookieOptions
        {
            Path = "/",
        };
        var domain = GetCookieDomain();
        if (!string.IsNullOrWhiteSpace(domain))
            deleteOptions.Domain = domain;

        foreach (var cookieName in GetReadableCookieNames())
        {
            cookies.Delete(cookieName, deleteOptions);
        }
    }

    public static string? GetCookieDomain()
    {
        var host = Configuration.ShortBaseUrl;
        if (string.IsNullOrWhiteSpace(host))
            return null;
        if (host.Equals("localhost", StringComparison.OrdinalIgnoreCase))
            return null;
        if (IPAddress.TryParse(host, out _))
            return null;

        return "." + host;
    }

    public static CookieOptions CreateSessionCookieOptions(bool secure, bool httpOnly = true)
    {
        var options = new CookieOptions
        {
            Secure = secure,
            Expires = DateTimeOffset.Now.Add(TimeSpan.FromDays(364)),
            IsEssential = true,
            HttpOnly = httpOnly,
            Path = "/",
            SameSite = SameSiteMode.Lax,
        };

        var domain = GetCookieDomain();
        if (!string.IsNullOrWhiteSpace(domain))
            options.Domain = domain;

        return options;
    }

    public static void AppendSessionCookies(IResponseCookies cookies, string value, bool secure, bool httpOnly = true)
    {
        // Only the primary `.ZEKOSECURITY` cookie is written. The Roblox-name alias
        // (.ROBLOSECURITY) is accepted on the way IN (see GetSessionCookieCandidates)
        // but never set, so there's exactly one source of truth for browser sessions.
        var options = CreateSessionCookieOptions(secure, httpOnly);
        cookies.Append(CookieName, value, options);
    }


    public SessionMiddleware(RequestDelegate next)
    {
        _next = next;
    }

    public static string CreateJwt<T>(T obj)
    {
        var token = Encoder.Encode(obj, cookieJwtKey);
        if (token == null) throw new NullReferenceException();
        return token;
    }

    public static T DecodeJwt<T>(string token)
    {
        var json = Decoder.Decode(token, cookieJwtKey, verify: true);
        if (json == null) throw new NullReferenceException();
        var result = JsonSerializer.Deserialize<T>(json);
        if (result == null) throw new NullReferenceException();
        return result;
    }

    private async Task OnBadSession(HttpContext ctx)
    {
        DeleteSessionCookies(ctx.Response.Cookies);
        await _next(ctx);
    }

    public async Task InvokeAsync(HttpContext ctx)
    {
        var authTimer = new MiddlewareTimer(ctx, "au");
        var currentPath = ctx.Request.Path.ToString().ToLower();
        try
        {
            var cookieCandidates = GetSessionCookieCandidates(ctx).ToArray();
            if (cookieCandidates.Length > 0)
            {
                string? cookie = null;
                JwtEntry? decodedResult = null;
                foreach (var candidate in cookieCandidates)
                {
                    try
                    {
                        var decodedCandidate = DecodeJwt<JwtEntry>(candidate);
                        if (!string.IsNullOrWhiteSpace(decodedCandidate.sessionId))
                        {
                            cookie = candidate;
                            decodedResult = decodedCandidate;
                            break;
                        }
                    }
                    catch (System.Exception e) when (e is InvalidTokenPartsException or NullReferenceException or FormatException or SignatureVerificationException)
                    {
                        // Try the next cookie candidate. Some clients may send stale/duplicate auth cookies.
                    }
                }

                if (decodedResult == null || string.IsNullOrWhiteSpace(cookie))
                {
                    authTimer.Stop();
                    await _next(ctx);
                    return;
                }

                var usedLegacyCookie = GetLegacyCookieNames()
                    .Any(cookieName => ctx.Request.Cookies.TryGetValue(cookieName, out var legacyCookieValue) &&
                                       !string.IsNullOrWhiteSpace(legacyCookieValue));

                if (!string.IsNullOrEmpty(decodedResult.sessionId))
                {
                    using var users = ServiceProvider.GetOrCreate<UsersService>();
                    using var accountInformation = ServiceProvider.GetOrCreate<AccountInformationService>();
                    
                    UserInfo userInfo;
                    try
                    {
                        var sessResult = await users.GetSessionById(decodedResult.sessionId);
                        userInfo = await users.GetUserById(sessResult.userId);
                    }
                    catch (RecordNotFoundException)
                    {
                        authTimer.Stop();
                        await OnBadSession(ctx);
                        return;
                    }
                    if (userInfo.accountStatus is AccountStatus.Forgotten or AccountStatus.MustValidateEmail)
                    {
                        authTimer.Stop();
                        await OnBadSession(ctx);
                        return; // Don't add session - pretend user doesn't exist
                    }

                    ctx.Items[CookieName] = new UserSession(userInfo.userId, userInfo.username, userInfo.created, userInfo.accountStatus, 0, false, decodedResult.sessionId);

                    if (userInfo.accountStatus is AccountStatus.Suppressed or AccountStatus.Poisoned
                        or AccountStatus.Deleted)
                    {
                        // allow access to other auth pages, as well as "discord" url
                        if (!currentPath.StartsWith("/auth/"))
                        {
                            authTimer.Stop();
                            ctx.Response.StatusCode = 302;
                            ctx.Response.Headers.Append("location", "/auth/notapproved");
                            return;
                        }
                    }
                    // Check if user filled out new app
                    var appStatus = await users.IsUserApproved(userInfo.userId);
                    if (!appStatus && !userInfo.isAdmin && !userInfo.isModerator && !StaffFilter.IsOwner(userInfo.userId))
                    {
                        if (!currentPath.StartsWith("/auth/"))
                        {
                            authTimer.Stop();
                            ctx.Response.StatusCode = 302;
                            ctx.Response.Headers.Append("location", "/auth/application");
                            return;
                        }
                    }

                    // robux increment
                    if (!currentPath.StartsWith("/thumbs/") && !currentPath.StartsWith("/images/"))
                    {
                        await users.EarnDailyRobuxNoVirusNoScamHindiSubtitles(userInfo.userId, await StaffFilter.IsStaff(userInfo.userId));
                        await users.EarnDailyTickets(userInfo.userId);
                        if (users.TrySetOnlineTimeUpdated(userInfo.userId))
                        {
                            await users.UpdateOnlineStatus(userInfo.userId);
                        }
                    }

                    try
                    {
                        await users.UpsertUserHashedIp(userInfo.userId, ControllerBase.GetIP(ControllerBase.GetRequesterIpRaw(ctx)));
                    }
                    catch (Exception ex)
                    {
                        Roblox.Logging.Writer.Info(Roblox.Logging.LogGroup.AbuseDetection,
                            "Failed to update user_hashed_ips for user {0}: {1}", userInfo.userId, ex.Message);
                    }

                    if (currentPath == "/")
                    {
                        // Redirect to homepage
                        ctx.Response.StatusCode = 302;
                        ctx.Response.Headers.Append("location", "/home");
                        return;
                    }

                    if (usedLegacyCookie)
                    {
                        AppendSessionCookies(ctx.Response.Cookies, cookie, secure: true);
                        var deleteOptions = new CookieOptions
                        {
                            Path = "/",
                        };
                        var domain = GetCookieDomain();
                        if (!string.IsNullOrWhiteSpace(domain))
                            deleteOptions.Domain = domain;

                        foreach (var legacyCookieName in GetLegacyCookieNames())
                        {
                            ctx.Response.Cookies.Delete(legacyCookieName, deleteOptions);
                        }
                    }

                    authTimer.Stop();
                }
            }
        }
        catch (System.Exception e) when (e is InvalidTokenPartsException or NullReferenceException or FormatException or SignatureVerificationException)
        {
            // Ignore invalid cookie parsing and proceed without forcing a logout.
        }
        await _next(ctx);
    }
}

public static class SessionMiddlewareExtensions
{
    public static IApplicationBuilder UseRobloxSessionMiddleware(this IApplicationBuilder builder)
    {
        return builder.UseMiddleware<SessionMiddleware>();
    }
}
