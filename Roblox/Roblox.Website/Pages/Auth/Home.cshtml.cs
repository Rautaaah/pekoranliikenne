using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;
using Roblox.Models.Sessions;

namespace Roblox.Website.Pages;

public class Home : RobloxPageModel
{
    public IActionResult OnGet()
    {
        return Redirect("/");
    }
}
