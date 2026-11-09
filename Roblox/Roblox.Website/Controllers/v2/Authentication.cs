using System.ComponentModel.DataAnnotations;
using System.Net.Http;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using DSharpPlus.Entities;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.DependencyInjection;
using Roblox.AbuseDetection.Report;
using Roblox.Exceptions;
using Roblox.Libraries.DiscordApi;
using Roblox.Logging;
using Roblox.Models.Sessions;
using Roblox.Dto.Authentication;
using Roblox.Dto.Users;
using Roblox.Models.Assets;
using Roblox.Models.Users;
using Roblox.Services;
using Roblox.Services.App.FeatureFlags;
using Roblox.Services.Exceptions;
using Roblox.Website.WebsiteModels;
using Roblox.Website.WebsiteModels.Authentication;
using BadRequestException = Roblox.Exceptions.BadRequestException;
using ServiceProvider = Microsoft.Extensions.DependencyInjection.ServiceProvider;

namespace Roblox.Website.Controllers;

[ApiController]
[Route("/apisite/auth/v2")]
public class AuthenticationControllerV2 : ControllerBase
{
    private static readonly HttpClient SignupWebhookClient = new();
    private const string SignupChallengeCharacters = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    private const string SignupChallengeProtectorName = "Sansy.SignupTextChallenge.v1";

    private sealed record SignupTextChallenge(string answer, DateTimeOffset expiresAt);

    private IDataProtector SignupChallengeProtector =>
        HttpContext.RequestServices.GetRequiredService<IDataProtectionProvider>()
            .CreateProtector(SignupChallengeProtectorName);

    [HttpPost("login")]
    public async Task<dynamic> Login([Required, FromBody] LoginRequest request)
    {
        FeatureFlags.FeatureCheck(FeatureFlag.LoginEnabled);

        var username = string.IsNullOrWhiteSpace(request.username) ? request.cvalue : request.username;
        var password = request.password;

        if (string.IsNullOrWhiteSpace(username) || string.IsNullOrWhiteSpace(password))
            throw new BadRequestException(3, "Username and Password are required. Please try again.");

        var splitUsername = username.Split('|');
        username = splitUsername[0];
        var totpCode = splitUsername.Length == 2 ? splitUsername[1] : "";

        UserInfo userInfo;
        try
        {
            userInfo = await services.users.GetUserByName(username);
        }
        catch (RecordNotFoundException)
        {
            throw new ForbiddenException(1, "Incorrect username or password. Please try again.");
        }

        try
        {
            if (!await services.users.VerifyPassword(userInfo.userId, password))
                throw new ForbiddenException(1, "Incorrect username or password. Please try again.");
        }
        catch (RecordNotFoundException)
        {
            throw new ForbiddenException(1, "Incorrect username or password. Please try again.");
        }

        if (await services.users.GetTotpStatus(userInfo.userId) == TotpStatus.Enabled)
        {
            if (string.IsNullOrWhiteSpace(totpCode))
            {
                var ticket = await services.users.Generate2SVTicket(new TwoFactorTicket
                {
                    userId = userInfo.userId,
                    hashedIp = GetIP(),
                });

                return new
                {
                    message = "TwoStepVerificationRequired",
                    mediaType = "Email",
                    tl = ticket,
                    code = 6,
                    twoStepVerificationData = new
                    {
                        mediaType = "Email",
                        ticket,
                    },
                    identityVerificationLoginTicket = ticket,
                    user = new
                    {
                        id = userInfo.userId,
                        name = userInfo.username,
                        displayName = userInfo.username,
                    },
                };
            }

            var totpInfo = await services.users.GetTotp(userInfo.userId);
            if (!services.users.VerifyTotp(totpInfo.secret, totpCode))
                throw new ForbiddenException(6, "Incorrect 2FA code. Please try again.");
        }

        await CreateSessionAndSetCookie(userInfo.userId);

        return new
        {
            membershipType = 4,
            userInfo.username,
            name = userInfo.username,
            isUnder13 = false,
            countryCode = "US",
            userId = userInfo.userId,
            id = userInfo.userId,
            displayName = userInfo.username,
            user = new
            {
                id = userInfo.userId,
                name = userInfo.username,
                displayName = userInfo.username,
            },
            isBanned = false,
        };
    }

    [HttpGet("metadata")]
    public dynamic GetMetadata()
    {
        return new
        {
            cookieLawNoticeTimeout = 20 * 1000,
        };
    }

    [HttpGet("passwords/current-status")]
    public dynamic GetPasswordStatus()
    {
        return new
        {
            valid = true,
        };
    }

    [HttpPost("user/passwords/change")]
    public async Task ChangePassword([Required, FromBody] ChangePasswordRequest request)
    {
        FeatureFlags.FeatureCheck(FeatureFlag.ChangePasswordEnabled);
        var passwordOk = services.users.IsPasswordValid(request.newPassword);
        if (!passwordOk)
        {
            throw new BadRequestException(0, "Invalid password");
        }
        // Pass cooldown check
        if (!await services.cooldown.TryCooldownCheck("change password " + safeUserSession.userId,
                TimeSpan.FromMinutes(1)))
            throw new RobloxException(429, 0, "TooManyRequests");
        // Verify password
        var correctPass = await services.users.VerifyPassword(safeUserSession.userId, request.currentPassword);
        if (!correctPass)
        {
            throw new BadRequestException(8, "Password does not match");
        }
        // We can update the user's password now
        await services.users.UpdatePassword(safeUserSession.userId, request.newPassword);
    }

    [HttpPost("logout")]
    public async Task Logout()
    {
        await services.users.DeleteSession(safeUserSession.sessionId);
        using var sessCache = Roblox.Services.ServiceProvider.GetOrCreate<UserSessionsCache>();
        sessCache.Remove(safeUserSession.sessionId);
        Middleware.SessionMiddleware.DeleteSessionCookies(HttpContext.Response.Cookies);
    }

    // [HttpPost("login")]
    // public async Task Login([Required, FromBody] LoginRequest request)
    // {
    //     throw new RobloxException(503, 0, "Please use https://zekoro.org/auth/accountlogin");
        // FeatureFlags.FeatureCheck(FeatureFlag.LoginEnabled);
        // if (request.ctype != "username")
        // {
        //     throw new BadRequestException(0, "Login type is not supported.");
        // }

        // long userId;
        // try
        // {
        //     userId = await services.users.GetUserIdFromUsername(request.cvalue);
        // }
        // catch (RecordNotFoundException)
        // {
        //     throw new ForbiddenException(1, "Incorrect username or password. Please try again");
        // }

        // var passwordOk = await services.users.VerifyPassword(userId, request.password);
        // if (!passwordOk)
        // {
        //     throw new ForbiddenException(1, "Incorrect username or password. Please try again");
        // }

        // await CreateSessionAndSetCookie(userId);
    //}
    // will never be neabled
    // [HttpPost("signup")]
    // public void Signup([Required] SignUpRequest request)
    // {
    //     throw new RobloxException(503, 0, "Service temporarily unavailable");
        // FeatureFlags.FeatureCheck(FeatureFlag.SignupEnabled);
        // var usernameValid = await services.users.IsUsernameValid(request.username);
        // if (!usernameValid)
        //     throw new BadRequestException(5, "Invalid Username");

        // var nameAvailable = await services.users.IsNameAvailableForSignup(request.username);
        // if (!nameAvailable)
        //     throw new ForbiddenException(6, "Username is already taken");

        // var passwordValid = services.users.IsPasswordValid(request.password);
        // if (!passwordValid)
        //     throw new ForbiddenException(9, "Password is too simple");

        // // Initial cooldown check - to prevent people spamming attempts
        // await services.cooldown.CooldownCheck($"signup:step1:" + GetIP(), TimeSpan.FromSeconds(5));
        // // Now make the account
        // var createdUser =
        //     await services.users.CreateUser(request.username, request.password, Enum.Parse<Gender>(request.gender));

        // await CreateSessionAndSetCookie(createdUser.userId);

        // return new SignupResponse()
        // {
        //     userId = createdUser.userId,
        // };
    //}

    [HttpPost("logoutfromallsessionsandreauthenticate")]
    public async Task LogoutFromAllSessionsAndReAuthenticate()
    {
        // We don't actually re authenticate (for security).
        await services.users.ExpireAllSessions(safeUserSession.userId);
        // remove current session immediately
        using var sessCache = Roblox.Services.ServiceProvider.GetOrCreate<UserSessionsCache>();
        sessCache.Remove(safeUserSession.sessionId);
    }

    [HttpGet("signup-metadata")]
    public async Task<dynamic> GetSignupMetadata()
    {
        var hasDiscordCookie = Request.Cookies.ContainsKey("MARINE-DISCORD");
        Writer.Info(LogGroup.DiscordApi, "Signup metadata requested. Has Discord cookie: {0}", hasDiscordCookie);

        var discordUser = await GetVerifiedSignupDiscordUser();
        if (discordUser == null)
        {
            Writer.Info(LogGroup.DiscordApi, "Signup metadata returning unverified.");
            return new
            {
                isDiscordVerified = false,
            };
        }

        string? existingUsername = null;
        try
        {
            existingUsername = (await services.users.GetUserByDiscordId(discordUser.Id.ToString())).username;
        }
        catch (RecordNotFoundException)
        {
            existingUsername = null;
        }

        return new
        {
            isDiscordVerified = true,
            discordId = discordUser.Id.ToString(),
            discordUsername = discordUser.Username,
            discordDisplay = discordUser.Username,
            hasExistingAccount = existingUsername != null,
            existingUsername,
        };
    }

    [HttpGet("signup-challenge")]
    public dynamic GetSignupChallenge()
    {
        FeatureFlags.FeatureCheck(FeatureFlag.SignupEnabled);

        var challenge = string.Concat(Enumerable.Range(0, 6)
            .Select(_ => SignupChallengeCharacters[RandomNumberGenerator.GetInt32(SignupChallengeCharacters.Length)]));
        var expiresAt = DateTimeOffset.UtcNow.AddMinutes(5);
        var token = SignupChallengeProtector.Protect(JsonSerializer.Serialize(
            new SignupTextChallenge(challenge, expiresAt)));

        return new
        {
            text = challenge,
            captchaToken = token,
        };
    }

    [HttpPost("signup")]
    public async Task<dynamic> Signup([Required, FromBody] DiscordSignupRequest request)
    {
        FeatureFlags.FeatureCheck(FeatureFlag.SignupEnabled);

        if (userSession != null)
            throw new BadRequestException(0, "You are already logged in.");

        if (!IsSignupChallengeValid(request))
            throw new ForbiddenException(11, "Please verify the text exactly as shown.");

        var discordUser = await GetVerifiedSignupDiscordUser();
        if (discordUser == null)
            throw new ForbiddenException(12, "Discord verification is required before signup.");

        if (!await services.cooldown.TryCooldownCheck($"signup:step1:{GetIP()}", TimeSpan.FromSeconds(5)))
            throw new RobloxException(429, 0, "Too many attempts. Try again in about 5 seconds.");

        if (string.Equals(request.username, "ROBLOX", StringComparison.OrdinalIgnoreCase))
            throw new BadRequestException(5, "ROBLOX is a reserved username.");

        if (!await services.users.IsUsernameValid(request.username))
            throw new BadRequestException(5, "Username must be 3-20 characters, use letters and numbers with at most one underscore, and not contain inappropriate words.");

        if (!await services.users.IsNameAvailableForSignup(request.username))
            throw new ForbiddenException(6, "Username is already taken");

        if (!services.users.IsPasswordValid(request.password))
            throw new ForbiddenException(9, "Password is too simple");

        if (string.Equals(request.password, request.username, StringComparison.OrdinalIgnoreCase))
            throw new ForbiddenException(9, "Password cannot be the same as your username.");

        if (request.gender is not (Gender.Female or Gender.Male or Gender.NonBinary))
            throw new BadRequestException(7, "Please select a gender.");

        if (discordUser != null && await services.users.IsDiscordIdLinkedToUser(discordUser.Id.ToString()))
            throw new ForbiddenException(10, "This Discord account is already linked to an existing user.");

        if (!await UsersAbuse.ShouldAllowCreation(new(GetIP())))
            throw new BadRequestException(0, "Registration is not available at this time. Try again in a few hours, or contact a staff member.");

        var challengeReplayKey = "signup:challenge:" +
                                 Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(request.captchaToken)));
        if (!await services.cooldown.TryCooldownCheck(challengeReplayKey, TimeSpan.FromMinutes(5)))
            throw new ForbiddenException(11, "Please request a new text challenge.");

        var signupFinalKey = "signup:step2:" + GetIP();
        if (!await services.cooldown.TryCooldownCheck(signupFinalKey, TimeSpan.FromMinutes(5)))
        {
            await services.cooldown.ResetCooldown(challengeReplayKey);
            throw new RobloxException(429, 0, "Too many attempts. Try again in about 5 minutes.");
        }

        UserId createdUser;
        try
        {
            createdUser = await services.users.CreateUser(request.username, request.password, request.gender);
            if (discordUser != null)
                await services.users.LinkDiscordAccount(discordUser.Id.ToString(), createdUser.userId);
        }
        catch
        {
            await services.cooldown.ResetCooldown(signupFinalKey);
            await services.cooldown.ResetCooldown(challengeReplayKey);
            throw;
        }

        await CreateSessionAndSetCookie(createdUser.userId);

        if (FeatureFlags.IsEnabled(FeatureFlag.CreatePlaceSelfService))
        {
            try
            {
                var asset = await services.assets.CreatePlace(createdUser.userId, request.username, CreatorType.User, createdUser.userId);
                await services.games.CreateUniverse(asset.placeId);
            }
            catch
            {
                // Ignore post-signup place creation failures so account creation still succeeds.
            }
        }

        _ = Task.Run(async () =>
        {
            try
            {
                await SendSignupWebhookAsync(createdUser.userId, request.username, discordUser);
            }
            catch
            {
                // Ignore webhook failures.
            }
        });

        return new
        {
            userId = createdUser.userId,
            username = request.username,
        };
    }

    private bool IsSignupChallengeValid(DiscordSignupRequest request)
    {
        if (string.IsNullOrEmpty(request.captchaToken) || string.IsNullOrEmpty(request.captchaAnswer))
            return false;

        try
        {
            var challenge = JsonSerializer.Deserialize<SignupTextChallenge>(
                SignupChallengeProtector.Unprotect(request.captchaToken));
            return challenge != null &&
                   challenge.expiresAt > DateTimeOffset.UtcNow &&
                   string.Equals(challenge.answer, request.captchaAnswer, StringComparison.Ordinal);
        }
        catch (CryptographicException)
        {
            return false;
        }
        catch (JsonException)
        {
            return false;
        }
    }

    private async Task CreateSessionAndSetCookie(long userId)
    {
        var sessionCookie = Middleware.SessionMiddleware.CreateJwt(new Middleware.JwtEntry
        {
            sessionId = await services.users.CreateSession(userId),
            createdAt = DateTimeOffset.Now.ToUnixTimeSeconds(),
        });

        Middleware.SessionMiddleware.AppendSessionCookies(HttpContext.Response.Cookies, sessionCookie, secure: true);
    }

    private async Task<DiscordUser?> GetVerifiedSignupDiscordUser()
    {
        string? accessToken;
        try
        {
            accessToken = discordAccessToken;
        }
        catch (Exception ex)
        {
            Writer.Info(LogGroup.DiscordApi, "Discord signup cookie could not be decoded: {0}", ex.Message);
            return null;
        }

        if (string.IsNullOrWhiteSpace(accessToken))
            return null;

        var discordApi = new DiscordApi(accessToken, Configuration.DiscordApplicationCallback);
        var userInfo = await discordApi.GetUserInfo();
        if (userInfo == null)
        {
            Writer.Info(LogGroup.DiscordApi, "Discord signup token did not return user info.");
            return null;
        }

        return userInfo;
    }

    private static async Task SendSignupWebhookAsync(long userId, string username, DiscordUser? discordUser)
    {
        if (string.IsNullOrWhiteSpace(Configuration.DiscordSignupWebhookUrl))
            return;

        var payload = new
        {
            username = "Zekoro Signups",
            embeds = new[]
            {
                new
                {
                    title = "New Zekoro Signup",
                    color = 0x8C5A4B,
                    fields = new object[]
                    {
                        new { name = "Username", value = username, inline = true },
                        new { name = "User ID", value = userId.ToString(), inline = true },
                        new
                        {
                            name = "Discord",
                            value = discordUser == null ? "Not linked" : $"{discordUser.Username} ({discordUser.Id})",
                            inline = false
                        },
                    },
                    timestamp = DateTime.UtcNow.ToString("O"),
                }
            }
        };

        var content = new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json");
        await SignupWebhookClient.PostAsync(Configuration.DiscordSignupWebhookUrl, content);
    }
}
