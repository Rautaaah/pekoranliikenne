/**
 * Per-user Studio key/value blob store, used by Studio's settings sync
 * (e.g. window layout, recent files, last-opened place). Backs
 * `GamesService.GetStudioData` / `SetStudioData` (`SELECT value FROM
 * studio_data WHERE user_id = :userId AND "key" = :clientKey`,
 * `INSERT ... ON CONFLICT (user_id, "key") DO UPDATE`).
 *
 * @param {import('knex')} knex
 */
exports.up = async (knex) => {
    const has = await knex.schema.hasTable('studio_data');
    if (has) return;
    await knex.schema.createTable('studio_data', (t) => {
        t.bigInteger('user_id').notNullable();
        t.text('key').notNullable();
        t.text('value').notNullable().defaultTo('');
        t.primary(['user_id', 'key']);
        t.index('user_id', 'studio_data_user_id_idx');
    });
};

exports.down = async (knex) => {
    const has = await knex.schema.hasTable('studio_data');
    if (has) {
        await knex.schema.dropTable('studio_data');
    }
};
