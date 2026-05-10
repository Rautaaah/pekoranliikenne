/**
 * Add per-place gear enable toggle used by universe configuration.
 * @param {import('knex')} knex
 */
exports.up = async (knex) => {
    const hasGearsEnabled = await knex.schema.hasColumn('asset_place', 'gears_enabled');
    if (!hasGearsEnabled) {
        await knex.schema.alterTable('asset_place', (t) => {
            t.boolean('gears_enabled').notNullable().defaultTo(false);
        });
    }
};

exports.down = async (knex) => {
    const hasGearsEnabled = await knex.schema.hasColumn('asset_place', 'gears_enabled');
    if (hasGearsEnabled) {
        await knex.schema.alterTable('asset_place', (t) => {
            t.dropColumn('gears_enabled');
        });
    }
};
