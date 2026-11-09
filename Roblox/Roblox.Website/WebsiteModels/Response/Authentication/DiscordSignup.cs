using Roblox.Models.Users;

namespace Roblox.Website.WebsiteModels.Authentication;

public class DiscordSignupRequest
{
    public string username { get; set; } = string.Empty;
    public string password { get; set; } = string.Empty;
    public Gender gender { get; set; } = Gender.Unknown;
    public string captchaToken { get; set; } = string.Empty;
    public string captchaAnswer { get; set; } = string.Empty;
}
