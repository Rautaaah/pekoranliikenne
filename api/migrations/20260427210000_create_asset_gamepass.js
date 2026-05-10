/**
 * Per-universe game pass index. Each row maps a game-pass asset
 * (`asset_id`) to the universe (`universe_id`) it belongs to. Backs
 * `GamesService.GetGamePassesForUniverse`, `GetGamePassInfo`,
 * `GetUniverseGamePassCount`, and `AssetsService.CreateGamePassAsset`.
 *
 * @param {import('knex')} knex
 */
exports.up = async (knex) => {
    const has = await knex.schema.hasTable('asset_gamepass');
    if (has) return;
    await knex.schema.createTable('asset_gamepass', (t) => {
        t.bigInteger('asset_id').notNullable().primary();
        t.bigInteger('universe_id').notNullable();
        t.index('universe_id', 'asset_gamepass_universe_id_idx');
    });
};

exports.down = async (knex) => {
    const has = await knex.schema.hasTable('asset_gamepass');
    if (has) {
        await knex.schema.dropTable('asset_gamepass');
    }
};
