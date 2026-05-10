/**
 * Catch-up migration for transaction rows created by newer website/service code.
 * @param {import('knex')} knex
 */
exports.up = async (knex) => {
    const hasItemName = await knex.schema.hasColumn('user_transaction', 'item_name');
    if (!hasItemName) {
        await knex.schema.alterTable('user_transaction', (t) => {
            t.string('item_name', 255).nullable();
        });
    }
};

exports.down = async (knex) => {
    const hasItemName = await knex.schema.hasColumn('user_transaction', 'item_name');
    if (hasItemName) {
        await knex.schema.alterTable('user_transaction', (t) => {
            t.dropColumn('item_name');
        });
    }
};
