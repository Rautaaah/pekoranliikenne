using System.ComponentModel.DataAnnotations;
using Microsoft.AspNetCore.Mvc;
using Roblox.Dto.Users;
using Roblox.Website.WebsiteModels.Users;

namespace Roblox.Website.Controllers;

[ApiController]
[Route("/apisite/presence/v1")]
public class PresenceControllerV1 : ControllerBase
{
    [HttpPost("presence/register-app-presence")]
    [HttpPostBypass("/v1/presence/register-app-presence")]
    public async Task<object> RegisterAppPresence()
    {
        if (userSession != null)
        {
            await services.users.UpdateOnlineStatus(userSession.userId);
        }
        return new { };
    }

    [HttpPost("presence/register-absence")]
    [HttpPostBypass("/v1/presence/register-absence")]
    public async Task<object> RegisterAbsence()
    {
        if (userSession != null)
        {
            await services.gameServer.ForceRemoveUserFromAllServers(userSession.userId);
        }
        return new { };
    }

    [HttpPost("presence/users")]
    [HttpPostBypass("/v1/presence/users")]
    public async Task<GetPresenceResponse> MultiGetOnlineStatus([Required,FromBody] PresenceRequest req)
    {
        var result = await services.users.MultiGetPresence(req.userIds);
        return new()
        {
            userPresences = result,
        };
    }
}
