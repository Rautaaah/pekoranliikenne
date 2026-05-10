using System.Text.RegularExpressions;
using Dapper;
using Roblox.Models.Assets;
using Roblox.Models.Economy;
using Roblox.Services.Exceptions;
namespace Roblox.Services;

public class PromocodesService : ServiceBase, IService
{
    private static readonly Regex promocodeRegex = new("^[A-Z0-9_-]{3,64}$", RegexOptions.Compiled);

    public class Rewards
    {
        public int? robux { get; set; }
        public long? assetId { get; set; }
    }

    public class PromocodeEntry : Rewards
    {
        public string promocode { get; set; } = "";
        public bool isActive { get; set; }
        public int maxUses { get; set; }
        public int claimedUses { get; set; }
        public long? createdByUserId { get; set; }
        public DateTime createdAt { get; set; }
        public DateTime updatedAt { get; set; }
    }

    private static string NormalizePromocode(string promocode)
    {
        if (string.IsNullOrWhiteSpace(promocode))
            throw new RobloxException(RobloxException.BadRequest, 0, "Promo code is required.");

        var normalized = promocode.Trim().ToUpperInvariant();
        if (!promocodeRegex.IsMatch(normalized))
            throw new RobloxException(RobloxException.BadRequest, 0, "Promo code can only contain letters, numbers, dashes, and underscores.");

        return normalized;
    }

    private static void ValidateReward(int? robux, long? assetId, int maxUses)
    {
        var rewardCount = (robux.HasValue ? 1 : 0) + (assetId.HasValue ? 1 : 0);
        if (rewardCount != 1)
            throw new RobloxException(RobloxException.BadRequest, 0, "Choose either a Robux reward or an asset reward.");
        if (robux.HasValue && robux.Value <= 0)
            throw new RobloxException(RobloxException.BadRequest, 0, "Robux reward must be greater than 0.");
        if (assetId.HasValue && assetId.Value <= 0)
            throw new RobloxException(RobloxException.BadRequest, 0, "Asset reward must be a valid asset ID.");
        if (maxUses <= 0)
            throw new RobloxException(RobloxException.BadRequest, 0, "Max uses must be greater than 0.");
    }

    private async Task<PromocodeEntry?> GetPromocodeInternal(string promocode, bool forUpdate = false)
    {
        var normalized = NormalizePromocode(promocode);
        var query = @"
SELECT
    ap.promocode,
    ap.robux,
    ap.asset_id AS assetId,
    ap.is_active AS isActive,
    ap.max_uses AS maxUses,
    ap.created_by_user_id AS createdByUserId,
    ap.created_at AS createdAt,
    ap.updated_at AS updatedAt,
    (
        SELECT COUNT(*)::int
        FROM user_asset_promocodes uap
        WHERE uap.code = ap.promocode
    ) AS claimedUses
FROM asset_promocodes ap
WHERE ap.promocode = :promocode";
        if (forUpdate)
        {
            query += " FOR UPDATE";
        }

        return await db.QuerySingleOrDefaultAsync<PromocodeEntry?>(query, new
        {
            promocode = normalized,
        });
    }

    public async Task<PromocodeEntry?> GetPromocode(string promocode)
    {
        return await GetPromocodeInternal(promocode);
    }

    public async Task<IEnumerable<PromocodeEntry>> GetPromocodes()
    {
        return await db.QueryAsync<PromocodeEntry>(@"
SELECT
    ap.promocode,
    ap.robux,
    ap.asset_id AS assetId,
    ap.is_active AS isActive,
    ap.max_uses AS maxUses,
    ap.created_by_user_id AS createdByUserId,
    ap.created_at AS createdAt,
    ap.updated_at AS updatedAt,
    COALESCE(COUNT(uap.code), 0)::int AS claimedUses
FROM asset_promocodes ap
LEFT JOIN user_asset_promocodes uap ON uap.code = ap.promocode
GROUP BY
    ap.promocode,
    ap.robux,
    ap.asset_id,
    ap.is_active,
    ap.max_uses,
    ap.created_by_user_id,
    ap.created_at,
    ap.updated_at
ORDER BY ap.created_at DESC, ap.promocode ASC");
    }

    public async Task AddPromocode(string promocode, int? robux, long? assetId, int maxUses, long? createdByUserId = null, bool isActive = true)
    {
        var normalized = NormalizePromocode(promocode);
        ValidateReward(robux, assetId, maxUses);

        if (assetId.HasValue)
        {
            var assetExists = await db.QuerySingleOrDefaultAsync<long?>("SELECT id FROM asset WHERE id = :assetId", new
            {
                assetId = assetId.Value,
            });
            if (assetExists == null)
                throw new RecordNotFoundException("Asset not found.");
        }

        await InsertAsync("asset_promocodes", new
        {
            promocode = normalized,
            asset_id = assetId,
            robux,
            is_active = isActive,
            max_uses = maxUses,
            created_by_user_id = createdByUserId,
            created_at = DateTime.UtcNow,
            updated_at = DateTime.UtcNow,
        });
    }

    public async Task DeletePromocode(string promocode)
    {
        var normalized = NormalizePromocode(promocode);
        await InTransaction(async _ =>
        {
            await db.ExecuteAsync("DELETE FROM user_asset_promocodes WHERE code = :promocode", new
            {
                promocode = normalized,
            });
            await db.ExecuteAsync("DELETE FROM asset_promocodes WHERE promocode = :promocode", new
            {
                promocode = normalized,
            });
            return 0;
        });
    }

    public async Task SetPromocodeActive(string promocode, bool isActive)
    {
        var normalized = NormalizePromocode(promocode);
        var updated = await db.ExecuteAsync(@"
UPDATE asset_promocodes
SET is_active = :isActive,
    updated_at = :updatedAt
WHERE promocode = :promocode", new
        {
            promocode = normalized,
            isActive,
            updatedAt = DateTime.UtcNow,
        });
        if (updated == 0)
            throw new RecordNotFoundException("Invalid promo code.");
    }

    public async Task<Rewards> GetRewards(string promocode)
    {
        var normalized = NormalizePromocode(promocode);
        return await db.QuerySingleOrDefaultAsync<Rewards>("SELECT asset_id as assetId, robux FROM asset_promocodes WHERE promocode = :promocode", new
        {
            promocode = normalized,
        });
    }

    public async Task<bool> IsPromocodeClaimed(string promocode, long userId)
    {
        var normalized = NormalizePromocode(promocode);
        var claimed = await db.QueryFirstOrDefaultAsync<int?>("SELECT 1 FROM user_asset_promocodes WHERE code = :promocode AND user_id = :userId", new
        {
            promocode = normalized,
            userId,
        });
        return claimed == 1;
    }

    public async Task<Rewards> ClaimPromocode(string promocode, long userId)
    {
        var normalized = NormalizePromocode(promocode);
        Rewards reward = null!;
        await InTransaction(async _ =>
        {
            var promo = await GetPromocodeInternal(normalized, true);
            if (promo == null)
                throw new RecordNotFoundException("Invalid promo code.");
            if (!promo.isActive)
                throw new RobloxException(RobloxException.BadRequest, 0, "This promo code is disabled.");
            if (promo.claimedUses >= promo.maxUses)
                throw new RobloxException(RobloxException.BadRequest, 0, "This promo code has reached its usage limit.");
            if (await IsPromocodeClaimed(normalized, userId))
                throw new RobloxException(RobloxException.BadRequest, 0, "You have already redeemed this promo code.");

            await InsertAsync("user_asset_promocodes", new
            {
                user_id = userId,
                code = normalized,
                created_at = DateTime.UtcNow,
            });

            if (promo.assetId != null)
            {
                using var users = ServiceProvider.GetOrCreate<UsersService>(this);
                var ownedCopies = (await users.GetUserAssets(userId, promo.assetId.Value)).ToList();
                if (ownedCopies.Count == 0)
                {
                    await users.CreateUserAsset(userId, promo.assetId.Value);
                }
            }
            if (promo.robux != null)
            {
                using var ec = ServiceProvider.GetOrCreate<EconomyService>(this);
                await ec.IncrementCurrency(CreatorType.User, userId, CurrencyType.Robux, promo.robux.Value);
            }
            reward = new Rewards
            {
                assetId = promo.assetId,
                robux = promo.robux,
            };
            return 0;
        });
        return reward;
    }
    public bool IsReusable()
    {
        return true;
    }

    public bool IsThreadSafe()
    {
        return true;
    }
}
