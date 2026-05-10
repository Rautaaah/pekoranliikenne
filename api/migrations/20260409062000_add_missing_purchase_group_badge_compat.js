/**
 * Catch-up migration for schemas that exist in website/service code
 * but were missing from this local database lineage.
 * @param {import('knex')} knex
 */
exports.up = async (knex) => {
    const hasGroupVerified = await knex.schema.hasColumn('group', 'verified');
    if (!hasGroupVerified) {
        await knex.schema.alterTable('group', (t) => {
            t.boolean('verified').notNullable().defaultTo(false);
        });
    }

    const hasTransactionDeleted = await knex.schema.hasColumn('user_transaction', 'deleted');
    if (!hasTransactionDeleted) {
        await knex.schema.alterTable('user_transaction', (t) => {
            t.boolean('deleted').notNullable().defaultTo(false);
        });
    }

    const hasAssetBadge = await knex.schema.hasTable('asset_badge');
    if (!hasAssetBadge) {
        await knex.schema.createTable('asset_badge', (t) => {
            t.bigInteger('asset_id').notNullable().unsigned();
            t.bigInteger('universe_id').notNullable().unsigned();
            t.boolean('enabled').notNullable().defaultTo(true);

            t.unique(['asset_id']);
            t.index(['universe_id']);
        });
    }
};

exports.down = async (knex) => {
    const hasAssetBadge = await knex.schema.hasTable('asset_badge');
    if (hasAssetBadge) {
        await knex.schema.dropTable('asset_badge');
    }

    const hasTransactionDeleted = await knex.schema.hasColumn('user_transaction', 'deleted');
    if (hasTransactionDeleted) {
        await knex.schema.alterTable('user_transaction', (t) => {
            t.dropColumn('deleted');
        });
    }

    const hasGroupVerified = await knex.schema.hasColumn('group', 'verified');
    if (hasGroupVerified) {
        await knex.schema.alterTable('group', (t) => {
            t.dropColumn('verified');
        });
    }
};
