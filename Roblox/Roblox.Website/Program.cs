using Roblox.Rendering;
using Roblox.Website.Middleware;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.StaticFiles;
using Microsoft.Extensions.FileProviders;
using Microsoft.Net.Http.Headers;
using Roblox;
using Roblox.Services;
using Roblox.Services.App.FeatureFlags;
using Roblox.Website.Hubs;
using System.Reflection;
using Microsoft.OpenApi.Models;
using Microsoft.AspNetCore.Mvc.Formatters;
using Microsoft.AspNetCore.ResponseCompression;
var domain = AppDomain.CurrentDomain;
// Set a timeout interval of 5 seconds.
domain.SetData("REGEX_DEFAULT_MATCH_TIMEOUT", TimeSpan.FromSeconds(5));

IConfiguration configuration = new ConfigurationBuilder()
    .AddJsonFile("appsettings.json", optional: false, reloadOnChange: true)
    .AddEnvironmentVariables()
    .Build();

static string ResolveConfiguredUrl(string baseUrl, string configuredUrl)
{
    if (Uri.TryCreate(configuredUrl, UriKind.Absolute, out var absoluteUri))
        return absoluteUri.ToString();

    return new Uri(new Uri(baseUrl.TrimEnd('/') + "/"), configuredUrl.TrimStart('/')).ToString();
}

static bool IsZekomonsHost(string? host)
{
    if (string.IsNullOrWhiteSpace(host))
        return false;

    return host.Equals("zekomons.xyz", StringComparison.OrdinalIgnoreCase) ||
           host.Equals("www.zekomons.xyz", StringComparison.OrdinalIgnoreCase);
}

var builder = WebApplication.CreateBuilder(args);

// DB
Roblox.Services.Database.Configure(configuration.GetSection("Postgres").Value!);
Roblox.Services.Cache.Configure(configuration.GetSection("Redis").Value!);

// Config
Roblox.Configuration.CdnBaseUrl = configuration.GetSection("CdnBaseUrl").Value!;
Roblox.Configuration.AssetDirectory = configuration.GetSection("Directories:Asset").Value!;
Roblox.Configuration.StorageDirectory = configuration.GetSection("Directories:Storage").Value!;
Roblox.Configuration.ThumbnailsDirectory = configuration.GetSection("Directories:Thumbnails").Value!;
Roblox.Configuration.GroupIconsDirectory = configuration.GetSection("Directories:GroupIcons").Value!;
Roblox.Configuration.PublicDirectory = configuration.GetSection("Directories:Public").Value!;
Roblox.Configuration.XmlTemplatesDirectory = configuration.GetSection("Directories:XmlTemplates").Value!;
Roblox.Configuration.JsonDataDirectory = configuration.GetSection("Directories:JsonData").Value!;
Roblox.Configuration.ScriptDirectory = configuration.GetSection("Directories:ScriptsData").Value!;
Roblox.Configuration.AdminBundleDirectory = configuration.GetSection("Directories:AdminBundle").Value!;
Roblox.Configuration.EconomyChatBundleDirectory = configuration.GetSection("Directories:EconomyChatBundle").Value!;
Roblox.Configuration.BaseUrl = configuration.GetSection("BaseUrl").Value!;
var baseUri = new Uri(Roblox.Configuration.BaseUrl);
Roblox.Configuration.ShortBaseUrl = baseUri.Host.StartsWith("www.", StringComparison.OrdinalIgnoreCase)
    ? baseUri.Host.Substring(4)
    : baseUri.Host;
Roblox.Configuration.HCaptchaPublicKey = configuration.GetSection("HCaptcha:Public").Value!;
Roblox.Configuration.HCaptchaPrivateKey = configuration.GetSection("HCaptcha:Private").Value!;
// Discord OAuth related Stuff
Roblox.Configuration.DiscordClientId = configuration.GetSection("Discord:ClientId").Value!;
Roblox.Configuration.DiscordClientSecret = configuration.GetSection("Discord:ClientSecret").Value!;
Roblox.Configuration.DiscordGuildId = configuration.GetSection("Discord:GuildId").Value!;
Roblox.Configuration.DiscordBotToken = configuration.GetSection("Discord:BotToken").Value!;
Roblox.Configuration.DiscordLogChannelId = configuration.GetSection("Discord:LogChannelId").Value!;
Roblox.Configuration.DiscordApplicationCallback = ResolveConfiguredUrl(Roblox.Configuration.BaseUrl, configuration.GetSection("Discord:ApplicationCallback").Value!);
Roblox.Configuration.DiscordLoginCallback = ResolveConfiguredUrl(Roblox.Configuration.BaseUrl, configuration.GetSection("Discord:LoginCallback").Value!);
Roblox.Configuration.DiscordLinkCallback = ResolveConfiguredUrl(Roblox.Configuration.BaseUrl, configuration.GetSection("Discord:LinkCallback").Value!);
Roblox.Configuration.DiscordInviteUrl = configuration.GetSection("Discord:InviteUrl").Value ?? "https://discord.gg/7yUx9C3hCc";
Roblox.Configuration.DiscordSignupWebhookUrl = configuration.GetSection("Discord:SignupWebhookUrl").Value!;
Roblox.Configuration.DiscordLinkWebhookUrl = configuration.GetSection("Discord:LinkWebhookUrl").Value ?? Roblox.Configuration.DiscordSignupWebhookUrl;
Roblox.Configuration.ItemReleaseWebhookUrl = configuration.GetSection("ItemRelease:WebhookUrl").Value ?? "";
Roblox.Configuration.ItemReleasePingRoleId = configuration.GetSection("ItemRelease:PingRoleId").Value ?? "";
Roblox.Configuration.GameServerAuthorization = configuration.GetSection("GameServerAuthorization").Value!;
Roblox.Configuration.BotAuthorization = configuration.GetSection("BotAuthorization").Value!;
Roblox.Configuration.RccAuthorization = configuration.GetSection("RccAuthorization").Value!;
Roblox.Configuration.ArbiterAuthorization = configuration.GetSection("ArbiterAuthorization").Value!;
Roblox.Configuration.GameServerIp = configuration.GetSection("GameServerIp").Value!;
Roblox.Configuration.UserAgentBypassSecret = configuration.GetSection("UserAgentBypassSecret").Value!;
Roblox.Configuration.VerificationSecret = configuration.GetSection("VerificationSecret").Value!;
Roblox.Configuration.LuaScriptsDirectory = configuration.GetSection("Directories:RCCLuaScripts").Value!;
IConfiguration gameServerConfig = new ConfigurationBuilder().AddJsonFile("game-servers.json").Build();
Roblox.Configuration.GameServerIpAddresses = gameServerConfig.GetSection("GameServers").Get<IEnumerable<GameServerConfigEntry>>()!;
Roblox.Configuration.AssetValidationServiceUrl =
    configuration.GetSection("AssetValidation:BaseUrl").Value!;
Roblox.Configuration.AssetValidationServiceAuthorization =
    configuration.GetSection("AssetValidation:Authorization").Value!;
GameServerService.Configure(string.Join(Guid.NewGuid().ToString(), new int [16].Select(_ => Guid.NewGuid().ToString()))); // More TODO: If we every load balance, this will break
Roblox.Configuration.PackageShirtAssetId = long.Parse(configuration.GetSection("PackageShirtAssetId").Value!);
Roblox.Configuration.PackagePantsAssetId = long.Parse(configuration.GetSection("PackagePantsAssetId").Value!);
Roblox.Libraries.TwitterApi.TwitterApi.Configure(configuration.GetSection("Twitter:Bearer").Value!);
// Sign up asset ids
var assetIdsStart = configuration.GetSection("SignupAssetIds").GetChildren().Select(assetIdStr => long.Parse(assetIdStr.Value!));
Roblox.Configuration.SignupAssetIds = assetIdsStart;
Roblox.Configuration.SignupAvatarAssetIds =
    configuration.GetSection("SignupAvatarAssetIds").GetChildren().Select(c => long.Parse(c.Value!));
#if DEBUG
Roblox.Configuration.RobloxAppPrefix = "rbxeconsimdev:";
#endif
FeatureFlags.StartUpdateFlagTask();
var ownerUserIdConfig = configuration.GetSection("OwnerUserId");
List<long> ownerUserIds = ownerUserIdConfig.Get<List<long>>()!;
Roblox.Website.Filters.StaffFilter.Configure(ownerUserIds!);
//Roblox.Website.Controllers.ThumbnailsControllerV1.StartThumbnailFixLoop();

// Self-cleaning background loop: thumbnail GC, log trimming, tmp sweeps,
// periodic GC.Collect. See Roblox.Website.BackgroundJobs.JanitorService
// for the per-task knobs (overridable in appsettings.json under "Janitor").
builder.Services.AddHostedService<Roblox.Website.BackgroundJobs.JanitorService>();
builder.Services.AddRazorPages();
builder.Services.AddRequestDecompression();
builder.Services.AddControllers(options =>
{
    options.InputFormatters.Add(new XmlSerializerInputFormatter(options));
    options.RespectBrowserAcceptHeader = true;
    // Convert known business exceptions (record-not-found, bad-request,
    // forbidden, cooldown, ...) into proper JSON responses *inside* the MVC
    // pipeline so they never bubble to ExceptionHandlerMiddleware and spam
    // the log with stack traces. Real / unexpected exceptions still fall
    // through to /error.
    options.Filters.Add<Roblox.Website.Filters.BusinessExceptionFilter>();
})
.AddJsonOptions(o =>
{
    o.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter());
    o.JsonSerializerOptions.PropertyNamingPolicy = null;
});
builder.Services.AddSignalR();
builder.Services.AddResponseCompression(options =>
{
    options.EnableForHttps = true;
    options.Providers.Add<BrotliCompressionProvider>();
    options.Providers.Add<GzipCompressionProvider>();
    options.MimeTypes = ResponseCompressionDefaults.MimeTypes.Concat(new[]
    {
        "application/json",
        "application/javascript",
        "text/css",
        "image/svg+xml",
    });
});
// Learn more about configuring Swagger/OpenAPI at https://aka.ms/aspnetcore/swashbuckle
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c =>
{
    c.ResolveConflictingActions(apiDescriptions => apiDescriptions.First());
    c.IgnoreObsoleteActions();
    c.IgnoreObsoleteProperties();
    c.CustomSchemaIds(type => type.FullName);
    c.EnableAnnotations();
    c.SwaggerDoc("UserV1", new OpenApiInfo
    {
        Version = "v1",
        Title = "Users Api v1",
    });
    c.SchemaGeneratorOptions.SchemaIdSelector = type => type.ToString();
    c.OperationFilter<SwaggerFileOperationFilter>();
    var xmlFilename = $"{Assembly.GetExecutingAssembly().GetName().Name}.xml";
    c.IncludeXmlComments(Path.Combine(AppContext.BaseDirectory, xmlFilename));
});
builder.Services.AddMvc(c =>
    c.Conventions.Add(new ApiExplorerGetsOnlyConvention())
);

// Allow up to 50 MB request bodies / multipart uploads so users can publish
// reasonably-sized .rbxl place files (default Kestrel cap is 30 MB).
const long MaxUploadBytes = 50L * 1024 * 1024;
builder.WebHost.ConfigureKestrel(o => o.Limits.MaxRequestBodySize = MaxUploadBytes);
builder.Services.Configure<Microsoft.AspNetCore.Http.Features.FormOptions>(o =>
{
    o.MultipartBodyLengthLimit = MaxUploadBytes;
    o.ValueLengthLimit         = (int)MaxUploadBytes;
    o.BufferBodyLengthLimit    = MaxUploadBytes;
});
var app = builder.Build();
app.UseRouting();
app.UseResponseCompression();
app.Use(async (context, next) =>
{
    context.Response.Headers["X-Content-Type-Options"] = "nosniff";
    context.Response.Headers["Referrer-Policy"] = "strict-origin-when-cross-origin";
    context.Response.Headers["X-Frame-Options"] = "SAMEORIGIN";
    await next();
});

app.Use(async (context, next) =>
{
    if (IsZekomonsHost(context.Request.Host.Host))
    {
        context.Response.StatusCode = StatusCodes.Status200OK;
        context.Response.ContentType = "text/html; charset=utf-8";
        await context.Response.WriteAsync("""
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Zekomons - Coming Soon</title>
  <link rel="icon" type="image/png" href="/img/zekorooooo.png">
  <style>
    * {
      box-sizing: border-box;
    }
    html,
    body {
      margin: 0;
      min-height: 100vh;
      font-family: Arial, Helvetica, sans-serif;
      color: #f5f7fb;
      background: #0b1824;
      background-image:
        linear-gradient(rgba(6, 14, 22, 0.5), rgba(6, 14, 22, 0.62)),
        url('/img/landing/signupbackground.png');
      background-repeat: no-repeat;
      background-size: cover;
      background-position: center center;
    }
    body {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }
    .wrap {
      width: min(760px, 100%);
    }
    .card {
      background: rgba(20, 27, 35, 0.92);
      border: 1px solid rgba(255, 255, 255, 0.12);
      box-shadow: 0 24px 50px rgba(0, 0, 0, 0.28);
      padding: 44px 38px;
      text-align: center;
    }
    .logo {
      width: 110px;
      height: 110px;
      object-fit: contain;
      margin-bottom: 20px;
    }
    .eyebrow {
      margin: 0 0 10px;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.28em;
      text-transform: uppercase;
      color: #9dc7ff;
    }
    h1 {
      margin: 0 0 14px;
      font-size: clamp(34px, 7vw, 62px);
      font-weight: 700;
      letter-spacing: 0.02em;
      color: #ffffff;
    }
    p {
      margin: 0 auto;
      max-width: 520px;
      font-size: 18px;
      line-height: 1.7;
      color: #d7deea;
    }
    .status {
      margin-top: 24px;
      display: inline-block;
      padding: 10px 16px;
      border: 1px solid rgba(157, 199, 255, 0.32);
      background: rgba(157, 199, 255, 0.08);
      color: #cfe2ff;
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    @media (max-width: 640px) {
      body {
        padding: 16px;
      }
      .card {
        padding: 34px 22px;
      }
      .logo {
        width: 88px;
        height: 88px;
      }
      p {
        font-size: 16px;
      }
    }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <img class="logo" src="/img/zekorooooo.png" alt="Zekomons">
      <div class="eyebrow">Coming Soon</div>
      <h1>Zekomons</h1>
      <p>Zekomons is being prepared right now. We are getting everything ready for launch, and the full experience will be live soon.</p>
      <div class="status">Zekomons.xyz is under construction</div>
    </div>
  </div>
</body>
</html>
""");
        return;
    }

    await next();
});

var prepareResponseForCache = (StaticFileResponseContext ctx) =>
{
    const int durationInSeconds = 86400 * 365;
    ctx.Context.Response.Headers[HeaderNames.CacheControl] = "public,max-age=" + durationInSeconds;
    ctx.Context.Response.Headers.Remove(HeaderNames.LastModified);
};
app.UseStaticFiles(new StaticFileOptions
{
    FileProvider = new PhysicalFileProvider(Roblox.Configuration.PublicDirectory + "css/roblox/"),
    RequestPath = "/css",
    OnPrepareResponse = prepareResponseForCache,
});
app.UseStaticFiles(new StaticFileOptions
{
    FileProvider = new PhysicalFileProvider(Roblox.Configuration.PublicDirectory + "js/"),
    RequestPath = "/js",
    OnPrepareResponse = prepareResponseForCache,
});
// Should be public
app.UseStaticFiles(new StaticFileOptions
{
    FileProvider = new PhysicalFileProvider(Roblox.Configuration.PublicDirectory + "UnsecuredContent/"),
    RequestPath = "/UnsecuredContent",
    OnPrepareResponse = prepareResponseForCache,
});

app.UseStaticFiles(new StaticFileOptions
{
    FileProvider = new PhysicalFileProvider(Roblox.Configuration.ThumbnailsDirectory),
    RequestPath = "/images/thumbnails",
    OnPrepareResponse = prepareResponseForCache,
});

app.UseStaticFiles(new StaticFileOptions
{
    FileProvider = new PhysicalFileProvider(Roblox.Configuration.GroupIconsDirectory),
    RequestPath = "/images/groups",
    OnPrepareResponse = prepareResponseForCache,
});

app.UseStaticFiles(new StaticFileOptions
{
    FileProvider = new PhysicalFileProvider(Roblox.Configuration.PublicDirectory + "img/"),
    RequestPath = "/img",
    OnPrepareResponse = prepareResponseForCache,
});

#if FALSE
app.UseStaticFiles(new StaticFileOptions
{
    FileProvider = new PhysicalFileProvider(Roblox.Configuration.EconomyChatBundleDirectory),
    RequestPath = "/chat",
    ServeUnknownFileTypes = false,
    OnPrepareResponse = prepareResponseForCache,
});
#endif

app.UseRobloxSessionMiddleware();
app.UseMiddleware<ThumbnailMiddleware>(Roblox.Configuration.ThumbnailsDirectory);
app.UseMiddleware<RobloxLoggingMiddleware>();
app.UseRobloxPlayerCorsMiddleware(); // cors varies depending on authentication status, so it must be after session middleware

app.UseRobloxCsrfMiddleware();
app.UseApplicationGuardMiddleware();
Roblox.Website.Middleware.ApplicationGuardMiddleware.Configure(configuration.GetSection("Authorization").Value!);
Roblox.Website.Middleware.CsrfMiddleware.Configure(Guid.NewGuid().ToString() + Guid.NewGuid().ToString() + Guid.NewGuid().ToString()); // TODO: This would break if we ever load balance

if (app.Environment.IsDevelopment() || configuration.GetSection("Swagger:Enabled").Get<bool>())
{
    app.UseSwagger();
    app.UseSwaggerUI(c =>
    {
        c.ShowCommonExtensions();
        c.SwaggerEndpoint("/swagger/UserV1/swagger.json", "UserV1");
    });
}

app.UseMiddleware<FrontendProxyMiddleware>();
//app.UseMiddleware<RobloxLoggingMiddleware>();
//app.UseRobloxLoggingMiddleware();

app.UseExceptionHandler("/error");
//await CommandHandler.Configure("ws://localhost:3189", "hello world of deving 1234");
//CommandHandler.Configure(configuration.GetSection("Render:BaseUrl").Value, configuration.GetSection("Render:Authorization").Value); // will be removed soon

RenderingHandler.Configure(configuration.GetSection("Render:HttpBaseUrl").Value);
SessionMiddleware.Configure(configuration.GetSection("Jwt:Sessions").Value!);
app.UseTimerMiddleware(); // Must always be last
Roblox.Services.Signer.SignService.Setup();
_ = Task.Run(async () =>
{
    using var assets = Roblox.Services.ServiceProvider.GetOrCreate<AssetsService>();
    await assets.FixAssetImagesWithoutMetadata();
});
_ = Task.Run(AvatarService.StartTimerClear3D);
app.MapControllers();
app.MapRazorPages();
app.UseWebSockets();
app.UseRequestDecompression();
app.MapHub<MessageRouterHub>("/v1/router/signalr");
app.Run();
