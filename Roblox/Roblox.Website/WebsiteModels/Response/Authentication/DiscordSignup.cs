namespace Roblox.Website.WebsiteModels.Authentication;

public class DiscordSignupRequest
{
    public string username { get; set; } = string.Empty;
    public string password { get; set; } = string.Empty;
    public string captchaToken { get; set; } = string.Empty;
}
