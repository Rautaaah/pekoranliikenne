/**
 * Catch-up migration for universe/game schema expected by current website/service code.
 * @param {import('knex')} knex
 */
exports.up = async (knex) => {
    const hasPrivacyType = await knex.schema.hasColumn('universe', 'privacy_type');
    if (!hasPrivacyType) {
        await knex.schema.alterTable('universe', (t) => {
            t.integer('privacy_type').notNullable().defaultTo(3);
        });
        await knex.raw(`
            UPDATE universe
            SET privacy_type = CASE
                WHEN is_public = TRUE THEN 1
                ELSE 3
            END
        `);
    }

    const hasCloudedit = await knex.schema.hasColumn('universe', 'cloudedit');
    if (!hasCloudedit) {
        await knex.schema.alterTable('universe', (t) => {
            t.boolean('cloudedit').notNullable().defaultTo(false);
        });
    }

    const hasForceMorphType = await knex.schema.hasColumn('universe', 'forcemorph_type');
    if (!hasForceMorphType) {
        await knex.schema.alterTable('universe', (t) => {
            t.integer('forcemorph_type').notNullable().defaultTo(1);
        });
    }

    const hasUniversePermission = await knex.schema.hasTable('universe_permission');
    if (!hasUniversePermission) {
        await knex.schema.createTable('universe_permission', (t) => {
            t.integer('action').notNullable().defaultTo(0);
            t.integer('subject_type').notNullable();
            t.bigInteger('subject_id').unsigned().notNullable();
            t.bigInteger('universe_id').unsigned().notNullable();

            t.unique(['subject_type', 'subject_id', 'universe_id']);
            t.index(['universe_id']);
            t.index(['subject_id']);
        });
    }

    const hasTeamcreateMemberships = await knex.schema.hasTable('teamcreate_memberships');
    if (!hasTeamcreateMemberships) {
        await knex.schema.createTable('teamcreate_memberships', (t) => {
            t.bigInteger('universe_id').unsigned().notNullable();
            t.bigInteger('user_id').unsigned().notNullable();
            t.dateTime('created_at').notNullable().defaultTo(knex.fn.now());

            t.unique(['universe_id', 'user_id']);
            t.index(['universe_id']);
            t.index(['user_id']);
        });
    }
};

exports.down = async (knex) => {
    const hasTeamcreateMemberships = await knex.schema.hasTable('teamcreate_memberships');
    if (hasTeamcreateMemberships) {
        await knex.schema.dropTable('teamcreate_memberships');
    }

    const hasUniversePermission = await knex.schema.hasTable('universe_permission');
    if (hasUniversePermission) {
        await knex.schema.dropTable('universe_permission');
    }

    const hasForceMorphType = await knex.schema.hasColumn('universe', 'forcemorph_type');
    if (hasForceMorphType) {
        await knex.schema.alterTable('universe', (t) => {
            t.dropColumn('forcemorph_type');
        });
    }

    const hasCloudedit = await knex.schema.hasColumn('universe', 'cloudedit');
    if (hasCloudedit) {
        await knex.schema.alterTable('universe', (t) => {
            t.dropColumn('cloudedit');
        });
    }

    const hasPrivacyType = await knex.schema.hasColumn('universe', 'privacy_type');
    if (hasPrivacyType) {
        await knex.schema.alterTable('universe', (t) => {
            t.dropColumn('privacy_type');
        });
    }
};
