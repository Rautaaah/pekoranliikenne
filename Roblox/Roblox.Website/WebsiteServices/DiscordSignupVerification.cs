using System.Security.Cryptography;
using System.Text.Json;
using DSharpPlus.Entities;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.Extensions.DependencyInjection;

namespace Roblox.Website.WebsiteServices;

public sealed record DiscordSignupIdentity(string id, string username, DateTimeOffset expiresAt);

public static class DiscordSignupVerification
{
    public const string CookieName = "MARINE-DISCORD-VERIFIED";
    private const string ProtectorName = "Sansy.DiscordSignupVerification.v1";

    public static string Protect(HttpContext context, DiscordUser user, DateTimeOffset expiresAt)
    {
        var protector = GetProtector(context);
        var identity = new DiscordSignupIdentity(user.Id.ToString(), user.Username, expiresAt);
        return protector.Protect(JsonSerializer.Serialize(identity));
    }

    public static DiscordSignupIdentity? Read(HttpContext context)
    {
        if (!context.Request.Cookies.TryGetValue(CookieName, out var value) ||
            string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        try
        {
            var json = GetProtector(context).Unprotect(value);
            var identity = JsonSerializer.Deserialize<DiscordSignupIdentity>(json);
            if (identity == null ||
                string.IsNullOrWhiteSpace(identity.id) ||
                string.IsNullOrWhiteSpace(identity.username) ||
                identity.expiresAt <= DateTimeOffset.UtcNow)
            {
                return null;
            }

            return identity;
        }
        catch (CryptographicException)
        {
            return null;
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private static IDataProtector GetProtector(HttpContext context)
    {
        return context.RequestServices.GetRequiredService<IDataProtectionProvider>()
            .CreateProtector(ProtectorName);
    }
}
