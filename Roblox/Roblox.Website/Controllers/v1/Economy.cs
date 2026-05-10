using System.ComponentModel.DataAnnotations;
using System.Diagnostics;
using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using Roblox.Dto.Assets;
using Roblox.Dto.Users;
using Roblox.Exceptions;
using Roblox.Models.Assets;
using Roblox.Models.Economy;
using Roblox.Models.Groups;
using Roblox.Services;
using Roblox.Services.App.FeatureFlags;
using Roblox.Services.Exceptions;
using BadRequestException = Roblox.Exceptions.BadRequestException;
using ServiceProvider = Roblox.Services.ServiceProvider;

namespace Roblox.Website.Controllers;

[ApiController]
[Route("/apisite/economy/v1")]
public class EconomyControllerV1 : ControllerBase
{
    private const int CoinflipMaxBet = 100;
    private const int CoinflipDailyLimit = 5;
    private static readonly TimeSpan CoinflipDailyWindow = TimeSpan.FromDays(1);
    private static readonly TimeSpan CoinflipCooldown = TimeSpan.FromSeconds(2);
    private const int MinesMinBet = 1;
    private const int MinesMaxBet = 100;
    private const int MinesBoardSize = 25;
    private const int MinesMinCount = 1;
    private const int MinesMaxCount = 24;
    private const int MinesDailyLimit = 20;
    private static readonly TimeSpan MinesDailyWindow = TimeSpan.FromDays(1);
    private static readonly TimeSpan MinesCooldown = TimeSpan.FromMilliseconds(500);
    private static readonly TimeSpan MinesGameTtl = TimeSpan.FromMinutes(10);
    private const decimal MinesHouseEdge = 0.95m;

    private void FeatureCheck()
    {
        FeatureFlags.FeatureCheck(FeatureFlag.EconomyEnabled);
    }

    private static string ParseCoinflipSideOrThrow(string? side)
    {
        var normalized = (side ?? string.Empty).Trim().ToLowerInvariant();
        if (normalized is "heads" or "head" or "h")
            return "heads";
        if (normalized is "tails" or "tail" or "t")
            return "tails";
        throw new BadRequestException(0, "Invalid side. Use heads or tails.");
    }

    private static dynamic ParseCoinflipItemName(string? itemName)
    {
        var fallback = new
        {
            pickedSide = "unknown",
            resultSide = "unknown",
            outcome = "unknown",
        };

        if (string.IsNullOrWhiteSpace(itemName) || !itemName.StartsWith("Coinflip:", StringComparison.OrdinalIgnoreCase))
            return fallback;

        var parts = itemName.Split(':');
        if (parts.Length < 4) return fallback;
        return new
        {
            pickedSide = parts[1],
            resultSide = parts[2],
            outcome = parts[3],
        };
    }

    private class MinesGameState
    {
        public long userId { get; set; }
        public long amount { get; set; }
        public int minesCount { get; set; }
        public List<int> mineTiles { get; set; } = new();
        public List<int> revealedSafeTiles { get; set; } = new();
        public DateTime createdAt { get; set; }
    }

    private static string GetMinesGameKey(long userId, string gameId)
    {
        return $"MinesGameV1:{userId}:{gameId}";
    }

    private static decimal GetMinesMultiplier(int minesCount, int safeReveals)
    {
        if (minesCount < MinesMinCount || minesCount > MinesMaxCount)
            throw new BadRequestException(0, "Invalid mines count.");
        if (safeReveals < 0 || safeReveals > (MinesBoardSize - minesCount))
            throw new BadRequestException(0, "Invalid reveal count.");

        decimal multiplier = 1.0m;
        for (var i = 0; i < safeReveals; i++)
        {
            var safeLeft = MinesBoardSize - minesCount - i;
            var totalLeft = MinesBoardSize - i;
            multiplier *= (decimal)totalLeft / safeLeft;
        }

        return Math.Round(multiplier * MinesHouseEdge, 4, MidpointRounding.ToNegativeInfinity);
    }

    private static dynamic ParseMinesItemName(string? itemName)
    {
        var fallback = new
        {
            minesCount = 0,
            safeReveals = 0,
            multiplier = 0m,
            outcome = "unknown",
        };

        if (string.IsNullOrWhiteSpace(itemName) || !itemName.StartsWith("Mines:", StringComparison.OrdinalIgnoreCase))
            return fallback;

        var parts = itemName.Split(':');
        if (parts.Length < 5) return fallback;
        _ = int.TryParse(parts[1], out var minesCount);
        _ = int.TryParse(parts[2], out var safeReveals);
        _ = decimal.TryParse(parts[3], out var multiplier);
        var outcome = parts[4];
        return new
        {
            minesCount,
            safeReveals,
            multiplier,
            outcome,
        };
    }

    private async Task<dynamic> GetCoinflipStateForUser(long userId)
    {
        var balance = await services.economy.GetUserBalance(userId);
        var stats = await services.economy.GetCoinflipStats(userId);
        var playedToday = await services.economy.CountCoinflipInPeriod(userId, CoinflipDailyWindow);
        var recent = (await services.economy.GetRecentCoinflips(userId, 8)).Select(entry =>
        {
            var parsed = ParseCoinflipItemName(entry.itemName);
            var delta = entry.type == PurchaseType.Sale ? entry.amount : -entry.amount;
            return new
            {
                amount = entry.amount,
                delta,
                createdAt = entry.createdAt,
                pickedSide = parsed.pickedSide,
                resultSide = parsed.resultSide,
                outcome = parsed.outcome,
            };
        });

        var totalGames = stats.totalGames;
        var wins = stats.wins;
        var losses = stats.losses;
        var winRate = totalGames == 0 ? 0 : (int)Math.Round((wins / (double)totalGames) * 100);

        return new
        {
            balance = new
            {
                robux = balance.robux,
                tickets = balance.tickets,
            },
            limits = new
            {
                maxBet = CoinflipMaxBet,
                maxBetsPer24Hours = CoinflipDailyLimit,
                betsUsedToday = playedToday,
                betsRemainingToday = Math.Max(0, CoinflipDailyLimit - playedToday),
            },
            stats = new
            {
                totalGames,
                wins,
                losses,
                winRate,
                netProfit = stats.netProfit,
            },
            recentFlips = recent,
        };
    }

    private async Task<dynamic> GetMinesStateForUser(long userId)
    {
        var balance = await services.economy.GetUserBalance(userId);
        var stats = await services.economy.GetMinesStats(userId);
        var playedToday = await services.economy.CountMinesInPeriod(userId, MinesDailyWindow);
        var recent = (await services.economy.GetRecentMines(userId, 8)).Select(entry =>
        {
            var parsed = ParseMinesItemName(entry.itemName);
            var delta = entry.type == PurchaseType.Sale ? entry.amount : -entry.amount;
            return new
            {
                amount = entry.amount,
                delta,
                createdAt = entry.createdAt,
                minesCount = parsed.minesCount,
                safeReveals = parsed.safeReveals,
                multiplier = parsed.multiplier,
                outcome = parsed.outcome,
            };
        });

        var totalGames = stats.totalGames;
        var wins = stats.wins;
        var losses = stats.losses;
        var winRate = totalGames == 0 ? 0 : (int)Math.Round((wins / (double)totalGames) * 100);

        return new
        {
            balance = new
            {
                robux = balance.robux,
                tickets = balance.tickets,
            },
            limits = new
            {
                minBet = MinesMinBet,
                maxBet = MinesMaxBet,
                minMines = MinesMinCount,
                maxMines = MinesMaxCount,
                betsUsedToday = playedToday,
                maxBetsPer24Hours = MinesDailyLimit,
                betsRemainingToday = Math.Max(0, MinesDailyLimit - playedToday),
            },
            stats = new
            {
                totalGames,
                wins,
                losses,
                winRate,
                netProfit = stats.netProfit,
            },
            recentGames = recent,
        };
    }
    
    [HttpGet("users/{userId:long}/currency")]
    public async Task<dynamic> GetUserCurrency(long userId)
    {
        FeatureCheck();
        return await services.economy.GetUserBalance(safeUserSession.userId);
    }

    [HttpGet("assets/{assetId}/users/{userId}/resellable-copies")]
    public async Task<dynamic> GetUserResellableCopiesOfAsset(long userId, long assetId)
    {
        FeatureCheck();
        if (userId != safeUserSession.userId)
            throw new ForbiddenException();

        var entries = await services.users.GetUserAssets(userId, assetId);
        return new
        {
            data = entries.Select(c =>
            {
                return new
                {
                    userAssetId = c.userAssetId,
                    seller = new
                    {
                        id = safeUserSession.userId,
                        name = safeUserSession.username,
                        type = CreatorType.User,
                    },
                    price = c.price,
                    serialNumber = c.serial,
                };
            }),
        };
    }

    [HttpPatch("assets/{assetId}/resellable-copies/{userAssetId}")]
    public async Task SetPriceOfUserAsset(long assetId, long userAssetId, [Required, FromBody] SetPriceRequest request)
    {
        FeatureCheck();
        // Confirm the user actually owns the item
        var ownedItems = await services.users.GetUserAssets(safeUserSession.userId, assetId);
        var isOwned = ownedItems.ToList().Find(c => c.userAssetId == userAssetId);
        if (isOwned == null)
            throw new ForbiddenException();
        // Confirm item can be sold

        var details = await services.assets.GetAssetCatalogInfo(assetId);
        var rsData = await services.assets.GetResaleData(assetId);
        
        if (details.itemRestrictions == null || details.isForSale || !details.itemRestrictions.Contains("Limited") && !details.itemRestrictions.Contains("LimitedUnique"))
        {
            // Item cannot be sold at this time
            throw new BadRequestException();
        }

        if(request.price != 0)
        {
            // Anti lpp
            if (rsData.recentAveragePrice != 0 && request.price < (rsData.recentAveragePrice * 0.60)) {
                throw new BadRequestException(0, "You cannot sell this item for less than 60% of the recent average price");
            }

            // Check if the request price is less than OG price
            if (request.price < details.price) {
                throw new BadRequestException(0, "You cannot sell this item for less than the original price");
            }
        }

        // Update price
        await services.users.SetPriceOfUserAsset(userAssetId, safeUserSession.userId, request.price);
    }

    [HttpGet("users/{userId}/revenue/summary/{timePeriod}")]
    public async Task<EconomySummary> GetMyRevenueSummary(string timePeriod)
    {
        FeatureCheck();
        // Ugliest one-liner in history award goes to...
        var startDate = DateTime.UtcNow.Subtract(TimeSpan.FromDays(timePeriod == "day" ? 1 : timePeriod == "week" ? 7 : timePeriod == "month" ? 30 : timePeriod == "year" ? 365 : 0));
        return await services.users.GetTransactionSummary(safeUserSession.userId, startDate);
    }

    private async Task PurchaseResellableItem(long assetId, PurchaseRequest request)
    {
        if (request.userAssetId == null)
            throw new BadRequestException(0, "BadRequest"); // how are we here?
        var userAsset = await services.users.GetUserAssetById(request.userAssetId.Value);
        // Confirm that the assetId provided in the request matches the asset id stored in the db
        if (userAsset.assetId != assetId)
            throw new BadRequestException(0, "assetId does not match provided assetId");
        // Confirm the user is not trying to buy their own item
        if (userAsset.userId == safeUserSession.userId)
            throw new BadRequestException(0, "BadRequest");
        // Check item data
        var itemData = await services.assets.GetAssetCatalogInfo(assetId);
        // Confirm item is limited
        if (!itemData.itemRestrictions.Contains("Limited") && !itemData.itemRestrictions.Contains("LimitedUnique"))
            throw new Exception("Cannot purchase non-limited and non limited-unique item");
        // If item is still for sale, it cannot be re-sold/purchased yet
        if (itemData.isForSale)
            throw new Exception("Item is still for sale");
        // If the price of the item does not match the price the requester expected, inform them the price changed
        if (userAsset.price == 0 || userAsset.price != request.expectedPrice)
            throw new Exception("Price has changed");
        // If the seller has changed, inform them the seller changed.
        // I'm not really sure how useful this is, but it's what Roblox does, so I'll leave it
        if (userAsset.userId != request.expectedSellerId)
            throw new Exception("Seller has changed");
        // Check if buyer has enough currency
        // Accuracy is not too important since this is re-checked anyway
        var buyerCurrency = await services.economy.GetUserRobux(safeUserSession.userId);
        // If user does not have enough money, they can't buy the item!
        if (buyerCurrency < userAsset.price)
            throw new BadRequestException(0, "BadRequest");
        // All validation logic seems to be complete. Let's do the actual transaction.
        await services.users.PurchaseResellableItem(safeUserSession.userId, userAsset.userAssetId);
    }

    private async Task PurchaseNormalItem(long assetId, PurchaseRequest request)
    {
        // Note: A lot of validation is duplicated in both this function and the transaction function. This is done because transactions and extra locks are slow - if someone starts spamming purchases where they don't have enough Robux, they could DOS transaction handling. If we do a ton of IF checks before starting the PG transaction, it's far less likely they'd take down our database (or cause unnecessary locks, breaking purchases for real customers, etc...)
        
        // First, confirm user does not own item already (When purchase normal is used, user can only own one copy of the assetId at any given time)
        var ownedCopies = (await services.users.GetUserAssets(safeUserSession.userId, assetId)).ToList();
        if (ownedCopies.Count != 0)
            throw new BadRequestException(0, "Asset is already owned");
        if (await services.users.HasUserPurchasedAssetBefore(safeUserSession.userId, assetId))
            throw new BadRequestException(0, "Asset has already been purchased");
        // Get the item data
        var details = await services.assets.GetAssetCatalogInfo(assetId);
        if (details.creatorType == CreatorType.User && details.creatorTargetId == safeUserSession.userId)
            throw new RobloxException(400, 0, "Bad userId");
        // Confirm it is for sale
        if (!details.isForSale)
            throw new BadRequestException(0, "Item is no longer for sale");
        // Confirm item is still for sale, if it has an offsale deadline
        var deadline = details.offsaleDeadline;
        if (deadline != null)
        {
            var isAfterDeadline = DateTime.UtcNow >= deadline;
            if (isAfterDeadline)
            {
                // Mark item as no longer for sale, then error
                await services.assets.UpdateItemIsForSale(details.id, false);
                throw new BadRequestException(0, "Item is no longer for sale");
            }
        }
        // Confirm price matches
        var userBalance = await services.economy.GetUserBalance(safeUserSession.userId);
        if (request.expectedCurrency == CurrencyType.Tickets)
        {
            // If an item has null ticket price, that means you cannot buy it for tickets
            if (details.priceTickets == null)
                throw new BadRequestException(0, "Item is no longer for sale");
            if (details.priceTickets != request.expectedPrice)
                throw new BadRequestException(0, "Price has changed");
            // Confirm user has enough tickets
            if (request.expectedPrice > userBalance.tickets)
                throw new BadRequestException(0, "Not enough tickets");
        }
        else if (request.expectedCurrency == CurrencyType.Robux)
        {
            // Note: if price is zero, currency is Robux, and item is for sale, that means the item is free.
            if (details.price != request.expectedPrice)
                throw new BadRequestException(0, "Price has changed");
            // Confirm user has enough robux
            if (details.price > userBalance.robux)
                throw new BadRequestException(0, "Not enough robux");
        }
        else
        {
            throw new NotImplementedException(); // Unexpected branch
        }
        // Confirm seller matches
        if (details.creatorTargetId != request.expectedSellerId)
            throw new BadRequestException(0, "Seller has changed");

        // If has a specific sale count...
        if (details.serialCount != null && details.serialCount != 0)
        {
            var soldCopies = await services.users.CountSoldCopiesForAsset(details.id);
            var maxCopiesToSell = (int) details.serialCount;
            // If we have sold more than available, mark as not for sale then error
            if (soldCopies >= maxCopiesToSell)
            {
                await services.assets.UpdateItemIsForSale(details.id, false);
                throw new BadRequestException(0, "Item is no longer for sale");
            }
        }
        
        // Everything seems ok now, so purchase the item
        await services.users.PurchaseNormalItem(safeUserSession.userId, assetId, request.expectedCurrency);
    }

    /// <summary>
    /// Purchase an asset.
    /// </summary>
    /// <remarks>
    /// Note that we use assetId instead of productId in url, however, all our endpoints return an assetId instead of a productId for the productId param, so you are unlikely to need to code workarounds unless you hard-coded any productIds from Roblox.
    /// </remarks>
    [HttpPost("purchases/products/{assetId:long}")]
    public async Task<dynamic> PurchaseAsset(long assetId, PurchaseRequest request)
    {
        FeatureCheck();
        var stopwatch = new Stopwatch();
        stopwatch.Start();
        // some sanity checks
        if (request.userAssetId is 0 or < 0)
            request.userAssetId = null;
        
        if (request.userAssetId != null)
        {
            // User is making UAID purchase
            await PurchaseResellableItem(assetId, request);
            // Update sellers avatar in background (in case they were wearing the item they sold)
            await Task.Run(async () =>
            {
                using var avatarService = ServiceProvider.GetOrCreate<AvatarService>();
                await avatarService.RedrawAvatar(request.expectedSellerId);
            });
        }
        else
        {
            // User is making normal purchase
            await PurchaseNormalItem(assetId, request);
        }

        stopwatch.Stop();
        // Report time
        Metrics.EconomyMetrics.ReportItemPurchaseTime(stopwatch.ElapsedMilliseconds,
            request.userAssetId != null);

        return new
        {
            purchased = true,
            reason = "Success",
            productId = assetId,
            currency = 1,
            price = request.expectedPrice,
            assetId = assetId,
            assetName = "",
            assetIsWearable = true,
            sellerName = request.expectedSellerId.ToString(),
            transactionVerb = "bought",
            isMultiPrivateSale = false,
        };
    }

    [HttpGet("assets/{assetId:long}/resellers")]
    public async Task<dynamic> GetResellers(long assetId)
    {
        FeatureCheck();
        var result = await services.users.GetResellers(assetId);
        return new
        {
            nextPageCursor = (string?) null,
            previousPageCursor = (string?) null,
            data = result.Select(c => new
            {
                userAssetId = c.userAssetId,
                seller = new
                {
                    id = c.userId,
                    type = CreatorType.User,
                    name = c.username,
                },
                price = c.price,
                serialNumber = c.serialNumber,
            }),
        };
    }

    [HttpGet("assets/{assetId:long}/resale-data")]
    public async Task<AssetResaleData> GetResaleData(long assetId)
    {
        FeatureCheck();
        return await services.assets.GetResaleData(assetId);
    }

    [HttpGet("coinflip")]
    public async Task<dynamic> GetCoinflipState()
    {
        FeatureCheck();
        return await GetCoinflipStateForUser(safeUserSession.userId);
    }

    [HttpPost("coinflip")]
    public async Task<dynamic> FlipCoin([Required, FromBody] CoinflipBetRequest request)
    {
        FeatureCheck();
        if (request.amount < 1 || request.amount > CoinflipMaxBet)
            throw new BadRequestException(0, $"Bet amount must be between 1 and {CoinflipMaxBet}");

        var pickedSide = ParseCoinflipSideOrThrow(request.side);

        if (!await services.cooldown.TryCooldownCheck($"CoinflipWebV1_Cooldown:{safeUserSession.userId}", CoinflipCooldown))
            throw new RobloxException(429, 0, "Please wait a moment before flipping again.");

        var userId = safeUserSession.userId;
        bool won;
        string resultSide;

        await using (await services.economy.AcquireEconomyLock(CreatorType.User, userId))
        {
            var playedToday = await services.economy.CountCoinflipInPeriod(userId, CoinflipDailyWindow);
            if (playedToday >= CoinflipDailyLimit)
                throw new RobloxException(429, 0, "You reached your daily coinflip limit. Try again later.");

            var currentBalance = await services.economy.GetUserBalance(userId);
            if (currentBalance.robux < request.amount)
                throw new RobloxException(400, 0, "You do not have enough Robux for this bet.");

            var isHeads = RandomNumberGenerator.GetInt32(0, 2) == 0;
            resultSide = isHeads ? "heads" : "tails";
            won = pickedSide == resultSide;

            await services.economy.ChargeForCoinflip(
                userId: userId,
                amount: request.amount,
                finalRobux: request.amount * 2,
                won: won,
                pickedSide: pickedSide,
                resultSide: resultSide
            );
        }

        var state = await GetCoinflipStateForUser(userId);
        return new
        {
            bet = request.amount,
            pickedSide,
            resultSide,
            won,
            delta = won ? request.amount : -request.amount,
            state,
        };
    }

    [HttpGet("mines")]
    public async Task<dynamic> GetMinesState()
    {
        FeatureCheck();
        return await GetMinesStateForUser(safeUserSession.userId);
    }

    [HttpPost("mines/start")]
    public async Task<dynamic> StartMines([Required, FromBody] MinesStartRequest request)
    {
        FeatureCheck();
        if (request.amount < MinesMinBet || request.amount > MinesMaxBet)
            throw new BadRequestException(0, $"Bet amount must be between {MinesMinBet} and {MinesMaxBet}");
        if (request.minesCount < MinesMinCount || request.minesCount > MinesMaxCount)
            throw new BadRequestException(0, $"Mines count must be between {MinesMinCount} and {MinesMaxCount}");

        if (!await services.cooldown.TryCooldownCheck($"MinesWebV1_Cooldown:{safeUserSession.userId}", MinesCooldown))
            throw new RobloxException(429, 0, "Please wait a moment before starting another game.");

        var userId = safeUserSession.userId;
        string gameId;
        await using (await services.economy.AcquireEconomyLock(CreatorType.User, userId))
        {
            var playedToday = await services.economy.CountMinesInPeriod(userId, MinesDailyWindow);
            if (playedToday >= MinesDailyLimit)
                throw new RobloxException(429, 0, "You reached your daily mines limit. Try again later.");

            var currentBalance = await services.economy.GetUserBalance(userId);
            if (currentBalance.robux < request.amount)
                throw new RobloxException(400, 0, "You do not have enough Robux for this bet.");

            gameId = Guid.NewGuid().ToString("N");
            var allTiles = Enumerable.Range(0, MinesBoardSize).ToList();
            var mineTiles = new HashSet<int>();
            while (mineTiles.Count < request.minesCount)
            {
                var index = RandomNumberGenerator.GetInt32(0, allTiles.Count);
                mineTiles.Add(allTiles[index]);
            }

            var gameState = new MinesGameState
            {
                userId = userId,
                amount = request.amount,
                minesCount = request.minesCount,
                mineTiles = mineTiles.ToList(),
                revealedSafeTiles = new List<int>(),
                createdAt = DateTime.UtcNow,
            };

            await Roblox.Services.Cache.distributed.StringSetAsync(GetMinesGameKey(userId, gameId), JsonSerializer.Serialize(gameState), MinesGameTtl);
        }

        var state = await GetMinesStateForUser(userId);
        return new
        {
            gameId,
            boardSize = MinesBoardSize,
            amount = request.amount,
            minesCount = request.minesCount,
            safeReveals = 0,
            currentMultiplier = GetMinesMultiplier(request.minesCount, 0),
            state,
        };
    }

    [HttpPost("mines/reveal")]
    public async Task<dynamic> RevealMinesTile([Required, FromBody] MinesRevealRequest request)
    {
        FeatureCheck();
        if (string.IsNullOrWhiteSpace(request.gameId))
            throw new BadRequestException(0, "Missing gameId.");
        if (request.tileIndex < 0 || request.tileIndex >= MinesBoardSize)
            throw new BadRequestException(0, "Invalid tile index.");

        var userId = safeUserSession.userId;
        var key = GetMinesGameKey(userId, request.gameId);

        bool hitMine;
        int safeReveals;
        decimal multiplier;
        long delta;
        long payout = 0;
        List<int>? mineTiles = null;

        await using (await services.economy.AcquireEconomyLock(CreatorType.User, userId))
        {
            var raw = await Roblox.Services.Cache.distributed.StringGetAsync(key);
            if (string.IsNullOrWhiteSpace(raw))
                throw new RobloxException(404, 0, "Game not found or expired.");

            var game = JsonSerializer.Deserialize<MinesGameState>(raw);
            if (game == null || game.userId != userId)
                throw new RobloxException(404, 0, "Game not found.");

            if (game.revealedSafeTiles.Contains(request.tileIndex))
                throw new BadRequestException(0, "Tile already revealed.");

            hitMine = game.mineTiles.Contains(request.tileIndex);
            if (hitMine)
            {
                mineTiles = game.mineTiles;
                await services.economy.ChargeForMines(userId, game.amount, 0, false, game.minesCount, game.revealedSafeTiles.Count, GetMinesMultiplier(game.minesCount, game.revealedSafeTiles.Count));
                await Roblox.Services.Cache.distributed.KeyDeleteAsync(key);
                safeReveals = game.revealedSafeTiles.Count;
                multiplier = GetMinesMultiplier(game.minesCount, safeReveals);
                delta = -game.amount;
            }
            else
            {
                game.revealedSafeTiles.Add(request.tileIndex);
                safeReveals = game.revealedSafeTiles.Count;
                multiplier = GetMinesMultiplier(game.minesCount, safeReveals);
                delta = 0;

                var maxSafe = MinesBoardSize - game.minesCount;
                if (safeReveals >= maxSafe)
                {
                    payout = (long)Math.Floor(game.amount * multiplier);
                    if (payout < 1) payout = 1;
                    await services.economy.ChargeForMines(userId, game.amount, payout, true, game.minesCount, safeReveals, multiplier);
                    await Roblox.Services.Cache.distributed.KeyDeleteAsync(key);
                    delta = payout - game.amount;
                }
                else
                {
                    await Roblox.Services.Cache.distributed.StringSetAsync(key, JsonSerializer.Serialize(game), MinesGameTtl);
                }
            }
        }

        var state = await GetMinesStateForUser(userId);
        return new
        {
            gameId = request.gameId,
            tileIndex = request.tileIndex,
            hitMine,
            safeReveals,
            currentMultiplier = multiplier,
            roundFinished = hitMine || payout > 0,
            won = payout > 0,
            payout,
            delta,
            revealedMineTiles = hitMine ? mineTiles : null,
            state,
        };
    }

    [HttpPost("mines/cashout")]
    public async Task<dynamic> CashoutMines([Required, FromBody] MinesCashoutRequest request)
    {
        FeatureCheck();
        if (string.IsNullOrWhiteSpace(request.gameId))
            throw new BadRequestException(0, "Missing gameId.");

        var userId = safeUserSession.userId;
        var key = GetMinesGameKey(userId, request.gameId);
        long payout;
        long delta;
        decimal multiplier;
        int safeReveals;
        int minesCount;

        await using (await services.economy.AcquireEconomyLock(CreatorType.User, userId))
        {
            var raw = await Roblox.Services.Cache.distributed.StringGetAsync(key);
            if (string.IsNullOrWhiteSpace(raw))
                throw new RobloxException(404, 0, "Game not found or expired.");

            var game = JsonSerializer.Deserialize<MinesGameState>(raw);
            if (game == null || game.userId != userId)
                throw new RobloxException(404, 0, "Game not found.");
            if (game.revealedSafeTiles.Count < 1)
                throw new BadRequestException(0, "Reveal at least one safe tile before cashing out.");

            safeReveals = game.revealedSafeTiles.Count;
            minesCount = game.minesCount;
            multiplier = GetMinesMultiplier(minesCount, safeReveals);
            payout = (long)Math.Floor(game.amount * multiplier);
            if (payout < 1) payout = 1;

            await services.economy.ChargeForMines(userId, game.amount, payout, true, minesCount, safeReveals, multiplier);
            await Roblox.Services.Cache.distributed.KeyDeleteAsync(key);
            delta = payout - game.amount;
        }

        var state = await GetMinesStateForUser(userId);
        return new
        {
            gameId = request.gameId,
            won = true,
            payout,
            delta,
            safeReveals,
            minesCount,
            multiplier,
            state,
        };
    }

    [HttpGet("groups/{groupId:long}/addfunds/allowed")]
    public dynamic CanAddFundsToGroup()
    {
        FeatureCheck();
        return false;
    }

    [HttpGet("groups/{groupId:long}/currency")]
    public async Task<UserEconomy> GetGroupCurrency(long groupId)
    {
        FeatureCheck();
        var canViewFunds =
            await services.groups.DoesUserHavePermission(safeUserSession.userId, groupId,
                GroupPermission.SpendGroupFunds);
        var groupSettings = await services.groups.GetGroupSettings(groupId);
        if (!canViewFunds && !groupSettings.areGroupFundsVisible)
            throw new RobloxException(401, 0, "Unauthorized");
        UserEconomy balance = new UserEconomy();
        try
        {
            balance = await services.economy.GetBalance(CreatorType.Group, groupId);
        }
        catch (Exception)
        {
            balance.robux = 0;
            balance.tickets = 0;
        }
        return balance;
    }
    
    [HttpGet("groups/{groupId}/users-payout-eligibility")]
    public dynamic GetUserPayoutEligibility(long groupId, string userIds)
    {
        var ids = userIds.Split(",").Select(long.Parse).Distinct();
        var result = new Dictionary<string, string>();
        foreach (var id in ids)
        {
            result[id.ToString()] = "Eligible";
        }
        return new
        {
            usersGroupPayoutEligibility = result,
        };
    }

    [HttpGet("groups/{groupId:long}/revenue/summary/{timePeriod}")]
    public dynamic GetGroupRevenueSummary(long groupId, string timePeriod)
    {
        FeatureCheck();
        return new
        {
            premiumPayouts = 0,
            groupPremiumPayouts = 0,
            recurringRobuxStipend = 0,
            itemSaleRobux = 0,
            purchasedRobux = 0,
            tradeSystemRobux = 0,
            pendingRobux = 0,
            groupPayoutRobux = 0,
            individiualToGroupRobux = 0,
        };
    }
}
