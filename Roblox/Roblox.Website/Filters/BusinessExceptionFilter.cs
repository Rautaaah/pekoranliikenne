using System.Net;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using Roblox.Exceptions;
using Roblox.Libraries.Exceptions;
using Roblox.Models.Economy;
using Roblox.Services.Exceptions;
using Roblox.Website.WebsiteModels;

namespace Roblox.Website.Filters;

/// <summary>
/// Global MVC exception filter that converts known *business* exceptions
/// (record not found, bad request, forbidden, cooldown, ...) into proper
/// JSON error responses BEFORE they ever reach <c>ExceptionHandlerMiddleware</c>.
///
/// Without this filter every expected validation failure (e.g. "user 999999
/// does not exist", "badge already owned", "asset 2907 does not exist") was
/// emitting a multi-line `fail: Microsoft.AspNetCore.Diagnostics.ExceptionHandlerMiddleware[1]`
/// stack trace into the application log even though `ErrorController` was
/// already mapping them to clean 400/403/404 responses. The redundant
/// logging buried real errors and made every request look like a crash.
///
/// Real bugs (anything that isn't on the recognised exception list) still
/// fall through to the existing global handler at <c>/error</c>, so we only
/// suppress noise — never silence genuine failures.
/// </summary>
public sealed class BusinessExceptionFilter : IExceptionFilter
{
    public void OnException(ExceptionContext ctx)
    {
        var ex = ctx.Exception;
        var errors = new List<ErrorResponseEntry>();
        HttpStatusCode? code = null;

        switch (ex)
        {
            case HttpBaseException http:
                code = http.statusCode;
                foreach (var e in http.errors)
                    errors.Add(new ErrorResponseEntry { code = e.errorCode, message = e.errorMessage });
                break;

            case LogicException logic:
                code = logic.failType switch
                {
                    FailType.BadRequest => HttpStatusCode.BadRequest,
                    FailType.FloodCheck => HttpStatusCode.TooManyRequests,
                    _ => HttpStatusCode.InternalServerError,
                };
                errors.Add(new ErrorResponseEntry { code = logic.errorCode, message = logic.errorMessage });
                break;

            case RecordNotFoundException:
                // Match ErrorController.cs's existing mapping (400 + "NotFound" body).
                code = HttpStatusCode.BadRequest;
                errors.Add(new ErrorResponseEntry { code = 0, message = "NotFound" });
                break;

            case RobloxException rblx:
                code = (HttpStatusCode)rblx.statusCode;
                errors.Add(new ErrorResponseEntry { code = rblx.errorCode, message = rblx.errorMessage });
                break;

            case Roblox.Services.CooldownException:
                code = HttpStatusCode.TooManyRequests;
                errors.Add(new ErrorResponseEntry { code = 0, message = "Too many requests. Try again in a few minutes." });
                break;
        }

        if (code is null)
        {
            // Unknown exception type. Leave it for ExceptionHandlerMiddleware/
            // ErrorController so genuine bugs still get logged with full
            // stack traces.
            return;
        }

        ctx.Result = new ObjectResult(new ErrorResponse { errors = errors })
        {
            StatusCode = (int)code,
        };
        ctx.ExceptionHandled = true;
    }
}
