// this table is for when mods reset a bypass username - if we just reset the username, anybody can sign up again with the exact same username.
exports.up = async (knex) => {
    const tableName = 'moderation_bad_username';
    const tableExists = await knex.schema.hasTable(tableName);

    if (!tableExists) {
        await knex.schema.createTable(tableName, (t) => {
            t.bigIncrements('id').notNullable();
            t.string('username', 512).notNullable();
        });
    } else if (!(await knex.schema.hasColumn(tableName, 'id'))) {
        await knex.schema.alterTable(tableName, (t) => {
            t.bigIncrements('id').notNullable();
        });
    }

    await knex.raw(
        'CREATE INDEX IF NOT EXISTS moderation_bad_username_username_index ON moderation_bad_username (username)'
    );
};

exports.down = async (knex) => {
    await knex.schema.dropTable('moderation_bad_username');
};