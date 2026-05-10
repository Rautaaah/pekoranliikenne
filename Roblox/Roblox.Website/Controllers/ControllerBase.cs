using System.Diagnostics;
using System.IO.Compression;
using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Roblox.Models.Sessions;
using Roblox.Services.Exceptions;
using Roblox.Website.Middleware;
namespace Roblox.Website.Controllers
{
    public class ControllerBase : Microsoft.AspNetCore.Mvc.ControllerBase
    {
        protected ControllerServices services { get; set; }
        
#if DEBUG
        public UserSession? userSessionForTests { get; set; }
#endif
        protected Roblox.Models.Sessions.UserSession? userSession
        {
            get
            {
#if DEBUG
                if (userSessionForTests != null)
                    return userSessionForTests;
#endif
                var dict = HttpContext.Items;
                if (dict.ContainsKey(Roblox.Website.Middleware.SessionMiddleware.CookieName))
                {
                    return (UserSession?)dict[Middleware.SessionMiddleware.CookieName];
                }

                return null;
            }
        }

        /// <summary>
        /// Equivalent to userSession but it will throw "Unauthorized" if user is not logged in.
        /// </summary>
        /// <exception cref="RobloxException"></exception>
        protected Roblox.Models.Sessions.UserSession safeUserSession
        {
            get
            {
                try
                {
                    if (userSession == null)
                    {
                        // No log here -- this fires on every anonymous request
                        // hitting an authed endpoint (bots, health checks, the
                        // unauth'd /login flow polling). Synchronous Console
                        // writes are serialised on Windows; this was a measurable
                        // CPU drag at scale. The 401 already conveys the info.
                        throw new RobloxException(401, 0, "Unauthorized");
                    }
                    return userSession;
                }
                catch(Exception)
                {
                    throw new RobloxException(401, 0, "Unauthorized");
                }
            }
        }

        protected string? ZEKOSECURITY
        {
            get
            {
                return SessionMiddleware.GetSessionCookieValue(Request.Cookies);
            }
        }

        protected bool isGzip
        {
            get
            {
                return Request.Headers["Content-Encoding"].ToString() == "gzip";
            }
        }
        protected string UserAgent
        {
            get
            {
                return Request.Headers["User-Agent"].ToString();
            }
        }
        protected bool isPasswordLeaked
        {
            get
            {
                return Request.Headers["Exposed-Credential-Check"].ToString() == "4";
            }
        }
        protected bool isRCC
        {
            get
            {
                // Patched 2020 RCCService sends the auth key in different forms per call:
                //   - `accesskey` header
                //   - `apiKey` query string (any casing)
                //   - `apiKey` form field (any casing)
                // Headers are already case-insensitive in ASP.NET; query/form are not.
                string? key = null;
                if (Request.Headers.TryGetValue("accesskey", out var h)) key = h.ToString();
                if (string.IsNullOrEmpty(key))
                {
                    foreach (var kv in Request.Query)
                    {
                        if (string.Equals(kv.Key, "apiKey", StringComparison.OrdinalIgnoreCase) ||
                            string.Equals(kv.Key, "accesskey", StringComparison.OrdinalIgnoreCase))
                        {
                            key = kv.Value.ToString();
                            break;
                        }
                    }
                }
                if (string.IsNullOrEmpty(key) && Request.HasFormContentType)
                {
                    foreach (var kv in Request.Form)
                    {
                        if (string.Equals(kv.Key, "apiKey", StringComparison.OrdinalIgnoreCase) ||
                            string.Equals(kv.Key, "accesskey", StringComparison.OrdinalIgnoreCase))
                        {
                            key = kv.Value.ToString();
                            break;
                        }
                    }
                }
                var ok = !string.IsNullOrEmpty(key) && key == Configuration.RccAuthorization;
                if (!ok)
                {
                    Console.WriteLine($"[isRCC] denied path={Request.Path} keyPresent={!string.IsNullOrEmpty(key)} keyMatches={key == Configuration.RccAuthorization} querykeys={string.Join(',', Request.Query.Keys)} headers=accesskey:{Request.Headers.ContainsKey("accesskey")}");
                }
                return ok;
            }
        }

        protected bool isRoblox
        {
            get
            {
                return Request.Headers["User-Agent"].ToString().ToLower().Contains("roblox");
            }
        }
        protected string? discordAccessToken
        {
            get
            {
                string key = "MARINE-DISCORD";
                var tokenEncoded = Request.Headers.ContainsKey(key)
                    ? Request.Headers[key].ToString()
                    : Request.Cookies[key];
                if (tokenEncoded == null)
                {
                    return null;
                }
                return Encoding.UTF8.GetString(Convert.FromBase64String(tokenEncoded));
            }
        }
        public string currentGameId
        {
            get
            {
                if (Request.Headers.TryGetValue("Roblox-Game-Id", out var gameId))
                {
                    return gameId.ToString();
                }
                return "";
            }
        }
        public long currentPlaceId
        {
            get
            {
                if (!Request.Headers.TryGetValue("Roblox-Place-Id", out var placeId))
                {
                    return 0;
                }

                if (long.TryParse(placeId.ToString(), out var parsedPlaceId))
                {
                    return parsedPlaceId;
                }
                
                return 0;
            }
        }
        public ControllerBase()
        {
            services = new ControllerServicesExtended();
        }

        public static string GetRequesterIpRaw(HttpContext ctx)
        {
            Debug.Assert(ctx != null);
            // Check for cloudflare
            var headers = ctx.Request.Headers;
            if (headers.ContainsKey("cf-connecting-ip"))
            {
                return headers["cf-connecting-ip"]!;
            }

            var ipString = ctx.Connection.RemoteIpAddress?.ToString();
            if (string.IsNullOrEmpty(ipString))
                throw new Exception("Bad IP address - empty or null string");
            return ipString;
        }

        private string GetRequesterIpRaw()
        {
            return GetRequesterIpRaw(HttpContext);
        }

        private static Dictionary<string, string> ipToKeyMap { get; } = new();
        private static Mutex ipToKeyMux { get; } = new();

        private class RedisIpHashSetupV1
        {
            public Dictionary<string,string> digitToGuid { get; set; }
            public string endKey { get; set; }
        }
        
        private static RedisIpHashSetupV1? redisIpHashSetup { get; set; }
        private static Mutex redisIpHashSetupMux = new();
        public static void InitializeIpHashSetup()
        {
            if (redisIpHashSetup != null)
                return;
            
            lock (redisIpHashSetupMux)
            {
                if (redisIpHashSetup != null)
                    return;

                var key = "IpHashKeyV1";
                var data = Roblox.Services.Cache.distributed.StringGet(key);
                if (data == null)
                {
                    var c = new RedisIpHashSetupV1
                    {
                        digitToGuid = new Dictionary<string, string>()
                    };
                    for (var i = 0; i < 10; i++)
                    {
                        c.digitToGuid[i.ToString()] = Guid.NewGuid().ToString() + Guid.NewGuid();
                    }

                    c.endKey = Guid.NewGuid().ToString() + Guid.NewGuid();
                    Roblox.Services.Cache.distributed.StringSet(key, JsonSerializer.Serialize(c));
                    redisIpHashSetup = c;
                }
                else
                {
                    redisIpHashSetup = JsonSerializer.Deserialize<RedisIpHashSetupV1>(data);
                }
            }
        }
        
        public static ulong ConvertFromIpAddressToInteger(string ipAddress)
        {
            var address = IPAddress.Parse(ipAddress);
            address = address.MapToIPv6();
            byte[] bytes = address.GetAddressBytes();

            // flip big-endian(network order) to little-endian
            if (BitConverter.IsLittleEndian)
            {
                Array.Reverse(bytes);
            }
            
            return BitConverter.ToUInt64(bytes, 0);
        }
        

        /// <summary>
        /// GetIP returns a hashed version of the current user's IP address.
        /// </summary>
        /// <remarks>
        /// The specific hash format should not matter, in case we need to update this some day.
        /// </remarks>
        /// <returns>A hash of an arbitrary size</returns>
        public static string GetIP(string trueIp, string? salt = null)
        {
            InitializeIpHashSetup();
            // Convert IP to a unit
            var ip = ConvertFromIpAddressToInteger(trueIp);
            // Get first digit in ip
            var first = ip.ToString().Substring(0, 1);
            // Get last digit in ip
            var last = ip.ToString().Substring(ip.ToString().Length - 1);
            var keyToUse = redisIpHashSetup!.digitToGuid[first];
            // randomize
            if (first is "2" or "6" or "3" or "7")
                keyToUse = new string(keyToUse.ToCharArray().Reverse().ToArray());
            
            var key = keyToUse + ip;
            if (last != "9")
                key += redisIpHashSetup.digitToGuid[last];
            else
                key += redisIpHashSetup.digitToGuid[last].ToUpper();
            
            for (var i = 0; i < ip.ToString().Length; i++)
            {
                var toAdd = redisIpHashSetup.digitToGuid[ip.ToString()[i].ToString()];
                if (toAdd.Length >= i)
                {
                    toAdd = toAdd.Substring(i, i+1);
                }
                else
                {
                    toAdd = toAdd.Substring(0, 2);
                }
                key += toAdd;
            }

            if (salt != null)
                key += salt;

            using var alg = SHA512.Create();
            var hash = alg.ComputeHash(Encoding.UTF8.GetBytes(key + redisIpHashSetup.endKey));
            return Convert.ToBase64String(hash);
        }
        protected async Task<string> GetRequestBody()
        {
            var encoding = Request.Headers["Content-Encoding"].ToString().ToLowerInvariant();
            if (encoding.Contains("gzip"))
            {
                using var decompressionStream = new GZipStream(Request.Body, CompressionMode.Decompress);
                using var gzipReader = new StreamReader(decompressionStream);
                return await gzipReader.ReadToEndAsync();
            }
            if (encoding.Contains("deflate"))
            {
                using var decompressionStream = new DeflateStream(Request.Body, CompressionMode.Decompress);
                using var deflateReader = new StreamReader(decompressionStream);
                return await deflateReader.ReadToEndAsync();
            }

            using var reader = new StreamReader(Request.Body);
            return await reader.ReadToEndAsync();
        }

        protected async Task<MemoryStream> GetRequestBodyAsMemoryStream()
        {
            var ms = new MemoryStream();
            var encoding = Request.Headers["Content-Encoding"].ToString().ToLowerInvariant();
            if (encoding.Contains("gzip"))
            {
                using var decompressionStream = new GZipStream(Request.Body, CompressionMode.Decompress);
                await decompressionStream.CopyToAsync(ms);
            }
            else if (encoding.Contains("deflate"))
            {
                using var decompressionStream = new DeflateStream(Request.Body, CompressionMode.Decompress);
                await decompressionStream.CopyToAsync(ms);
            }
            else
            {
                await Request.Body.CopyToAsync(ms);
            }
            ms.Position = 0;
            return ms;
        }

        /// <summary>
        /// Get the request's IP hash
        /// </summary>
        /// <returns></returns>
        protected string GetIP(string? salt = null)
        {
            return GetIP(GetRequesterIpRaw(), salt);
        }
    }
}
