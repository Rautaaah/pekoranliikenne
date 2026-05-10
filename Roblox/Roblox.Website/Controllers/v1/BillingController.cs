using System.ComponentModel.DataAnnotations;
using Microsoft.AspNetCore.Mvc;
using Roblox.Exceptions;

namespace Roblox.Website.Controllers;

[ApiController]
[Route("/apisite/billing/v1")]
public class BillingControllerV1 : ControllerBase
{
    public class RedeemPromocodeRequest
    {
        [Required]
        public string? promoCode { get; set; }
    }

    [HttpGet("credit")]
    public dynamic GetUserCredit()
    {
        return new
        {
            balance = 0,
            robuxAmount = 0,
            canRedeemCreditForRobux = false,
        };
    }

    [HttpGet("paymentmethods")]
    public dynamic GetPaymentMethods()
    {
        return new
        {
            redirectUrl = "https://www.roblox.com:443/premium/membership",
            selectedProduct = (string?)null,
            loggedIn = false,
            currentCredit = 0,
            paymentMethodsVisibility = (string?)null,
            isNewRobuxIconEnabled = false,
            isStarcodeV2Enabled = false,
            allowCreditForRenewingPurchases = false,
            isU13FraudMessageV2Enabled = false,
            isParentalAuthorization13To17Enabled = false,
        };
    }

    [HttpPost("promocodes/redeem")]
    public async Task<dynamic> RedeemPromoCode([FromBody] RedeemPromocodeRequest request)
    {
        if (request == null || string.IsNullOrWhiteSpace(request.promoCode))
        {
            return new
            {
                success = false,
                errorMsg = "Promo code is required.",
                successMsg = (string?)null,
                reward = (object?)null,
            };
        }

        if (userSession == null)
        {
            return new
            {
                success = false,
                errorMsg = "You must be logged in to redeem promo codes.",
                successMsg = (string?)null,
                reward = (object?)null,
            };
        }

        try
        {
            var reward = await services.promocodes.ClaimPromocode(request.promoCode, userSession.userId);
            string successMessage;
            string? assetName = null;
            if (reward.assetId != null)
            {
                var assetInfo = await services.assets.GetAssetCatalogInfo(reward.assetId.Value);
                assetName = assetInfo.name;
            }

            if (reward.assetId != null && reward.robux != null)
            {
                successMessage = $"You redeemed {assetName} and {reward.robux} Robux.";
            }
            else if (reward.assetId != null)
            {
                successMessage = $"You redeemed {assetName}.";
            }
            else
            {
                successMessage = $"You redeemed {reward.robux} Robux.";
            }

            return new
            {
                success = true,
                errorMsg = (string?)null,
                successMsg = successMessage,
                reward = new
                {
                    reward.assetId,
                    assetName,
                    reward.robux,
                },
            };
        }
        catch (Roblox.Services.Exceptions.RobloxException ex)
        {
            return new
            {
                success = false,
                errorMsg = ex.errorMessage,
                successMsg = (string?)null,
                reward = (object?)null,
            };
        }
        catch (Exception ex)
        {
            return new
            {
                success = false,
                errorMsg = ex.Message,
                successMsg = (string?)null,
                reward = (object?)null,
            };
        }
    }
    
    
    
    
}
