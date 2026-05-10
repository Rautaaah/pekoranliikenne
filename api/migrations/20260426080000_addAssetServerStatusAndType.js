/**
 * `Roblox.Services.GameServerService` (Roblox/Roblox.Services/Games/GameServer.cs)
 * SELECTs and INSERTs `status` and `type` columns on `asset_server`, but the original
 * createTable migration (20210626110628_addAssetServers.js) doesn't create them.
 *
 *   status -> Roblox.Dto.Games.ServerStatus       { Loading = 1, Ready = 2 }
 *   type   -> Roblox.Services.PlaceLauncher.MatchmakingContextId { Default = 1, ... }
 *
 * Without these columns PlaceLauncher.ashx returns HTTP 500
 * ("column \"status\" does not exist", PG state 42703).
 *
 * @param {import('knex')} knex
 */
exports.up = async (knex) => {
    const hasStatus = await knex.schema.hasColumn('asset_server', 'status');
    const hasType = await knex.schema.hasColumn('asset_server', 'type');
    await knex.schema.alterTable('asset_server', (t) => {
        if (!hasStatus) t.smallint('status').notNullable().defaultTo(1);
        if (!hasType) t.integer('type').notNullable().defaultTo(1);
    });
};

exports.down = async (knex) => {
    await knex.schema.alterTable('asset_server', (t) => {
        t.dropColumn('status');
        t.dropColumn('type');
    });
};
