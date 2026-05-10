using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Primitives;
using System.Security.Cryptography;
using System;

namespace Roblox.Website.Controllers
{
    [AttributeUsage(AttributeTargets.Method | AttributeTargets.Class)]
    public class BotAuthorizationAttribute : Attribute, IFilterFactory
    {
        public bool IsReusable => true;

        public IFilterMetadata CreateInstance(IServiceProvider serviceProvider)
        {
            return new BotAuthorizationFilter();
        }
    }

    public class BotAuthorizationFilter : IActionFilter
    {
        private static bool FixedTimeEquals(string left, string right)
        {
            var leftBytes = System.Text.Encoding.UTF8.GetBytes(left ?? string.Empty);
            var rightBytes = System.Text.Encoding.UTF8.GetBytes(right ?? string.Empty);
            return CryptographicOperations.FixedTimeEquals(leftBytes, rightBytes);
        }

        private static string? ReadBotAuthHeader(IHeaderDictionary headers)
        {
            if (headers.TryGetValue("PJX-BOTAUTH", out var legacy) && !StringValues.IsNullOrEmpty(legacy))
                return legacy.ToString();
            if (headers.TryGetValue("bot-auth", out var modern) && !StringValues.IsNullOrEmpty(modern))
                return modern.ToString();
            return null;
        }

        public void OnActionExecuting(ActionExecutingContext context)
        {
            var provided = ReadBotAuthHeader(context.HttpContext.Request.Headers);
            if (string.IsNullOrWhiteSpace(provided) || !FixedTimeEquals(provided, Configuration.BotAuthorization))
            {
                context.Result = new StatusCodeResult(StatusCodes.Status403Forbidden);
            }
        }

        public void OnActionExecuted(ActionExecutedContext context)
        {
        }
    }
}
