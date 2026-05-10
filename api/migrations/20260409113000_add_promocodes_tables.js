/**
 * Adds promo-code tables used by the website and admin panel.
 * @param {import('knex')} knex
 */
exports.up = async (knex) => {
    const hasPromocodesTable = await knex.schema.hasTable('asset_promocodes');
    if (!hasPromocodesTable) {
        await knex.schema.createTable('asset_promocodes', (t) => {
            t.string('promocode', 255).notNullable().primary();
            t.bigInteger('asset_id').nullable();
            t.integer('robux').nullable();
            t.boolean('is_active').notNullable().defaultTo(true);
            t.integer('max_uses').notNullable().defaultTo(1);
            t.bigInteger('created_by_user_id').nullable();
            t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
            t.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
        });
    } else {
        const hasAssetId = await knex.schema.hasColumn('asset_promocodes', 'asset_id');
        const hasRobux = await knex.schema.hasColumn('asset_promocodes', 'robux');
        const hasIsActive = await knex.schema.hasColumn('asset_promocodes', 'is_active');
        const hasMaxUses = await knex.schema.hasColumn('asset_promocodes', 'max_uses');
        const hasCreatedByUserId = await knex.schema.hasColumn('asset_promocodes', 'created_by_user_id');
        const hasCreatedAt = await knex.schema.hasColumn('asset_promocodes', 'created_at');
        const hasUpdatedAt = await knex.schema.hasColumn('asset_promocodes', 'updated_at');

        await knex.schema.alterTable('asset_promocodes', (t) => {
            if (!hasAssetId) t.bigInteger('asset_id').nullable();
            if (!hasRobux) t.integer('robux').nullable();
            if (!hasIsActive) t.boolean('is_active').notNullable().defaultTo(true);
            if (!hasMaxUses) t.integer('max_uses').notNullable().defaultTo(1);
            if (!hasCreatedByUserId) t.bigInteger('created_by_user_id').nullable();
            if (!hasCreatedAt) t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
            if (!hasUpdatedAt) t.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
        });
    }

    const hasUserPromocodesTable = await knex.schema.hasTable('user_asset_promocodes');
    if (!hasUserPromocodesTable) {
        await knex.schema.createTable('user_asset_promocodes', (t) => {
            t.bigIncrements('id').primary();
            t.bigInteger('user_id').notNullable();
            t.string('code', 255).notNullable();
            t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
            t.unique(['user_id', 'code'], 'user_asset_promocodes_user_code_unique');
            t.index(['code'], 'user_asset_promocodes_code_idx');
        });
    } else {
        const hasCreatedAt = await knex.schema.hasColumn('user_asset_promocodes', 'created_at');
        if (!hasCreatedAt) {
            await knex.schema.alterTable('user_asset_promocodes', (t) => {
                t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
            });
        }
    }

    await knex.raw(`
        CREATE UNIQUE INDEX IF NOT EXISTS user_asset_promocodes_user_code_unique
        ON user_asset_promocodes (user_id, code)
    `);
    await knex.raw(`
        CREATE INDEX IF NOT EXISTS user_asset_promocodes_code_idx
        ON user_asset_promocodes (code)
    `);
};

exports.down = async (knex) => {
    const hasUserPromocodesTable = await knex.schema.hasTable('user_asset_promocodes');
    if (hasUserPromocodesTable) {
        await knex.schema.dropTable('user_asset_promocodes');
    }

    const hasPromocodesTable = await knex.schema.hasTable('asset_promocodes');
    if (hasPromocodesTable) {
        await knex.schema.dropTable('asset_promocodes');
    }
};
