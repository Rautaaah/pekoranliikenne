const TARGET_ASSET_TYPES = [8, 18, 41, 42, 43, 44, 45, 46, 47];
const TARGET_MIN_ID = 2001;

const ASSET_REFERENCE_COLUMNS = [
  ['asset_advertisement', 'advertisement_asset_id'],
  ['asset_badge', 'asset_id'],
  ['asset_comment', 'asset_id'],
  ['asset_datastore', 'asset_id'],
  ['asset_favorite', 'asset_id'],
  ['asset_icon', 'asset_id'],
  ['asset_media', 'asset_id'],
  ['asset_package', 'asset_id'],
  ['asset_package', 'package_asset_id'],
  ['asset_place', 'asset_id'],
  ['asset_play_history', 'asset_id'],
  ['asset_promocodes', 'asset_id'],
  ['asset_server', 'asset_id'],
  ['asset_server_player', 'asset_id'],
  ['asset_thumbnail', 'asset_id'],
  ['asset_version', 'asset_id'],
  ['asset_vote', 'asset_id'],
  ['collectible_sale_logs', 'asset_id'],
  ['moderation_manage_asset', 'asset_id'],
  ['moderation_migrate_asset', 'asset_id'],
  ['moderation_refund_transaction', 'asset_id'],
  ['moderation_update_product', 'asset_id'],
  ['universe_asset', 'asset_id'],
  ['user_asset', 'asset_id'],
  ['user_avatar_asset', 'asset_id'],
  ['user_outfit_asset', 'asset_id'],
  ['user_transaction', 'asset_id'],
];

exports.up = async (knex) => {
  await knex.transaction(async (trx) => {
    const targetAssets = await trx('asset')
      .select('id')
      .whereIn('asset_type', TARGET_ASSET_TYPES)
      .andWhere('id', '<', TARGET_MIN_ID)
      .orderBy('id', 'asc');

    if (targetAssets.length === 0) {
      return;
    }

    const usedIds = new Set(
      (await trx('asset').select('id').where('id', '>=', TARGET_MIN_ID)).map(v => Number(v.id)),
    );

    const remapRows = [];
    let nextId = TARGET_MIN_ID;
    for (const asset of targetAssets) {
      while (usedIds.has(nextId)) {
        nextId += 1;
      }

      remapRows.push({
        old_id: Number(asset.id),
        new_id: nextId,
      });
      usedIds.add(nextId);
      nextId += 1;
    }

    await trx.raw(`
      create temporary table asset_id_remap (
        old_id bigint primary key,
        new_id bigint unique not null
      ) on commit drop
    `);

    await trx.batchInsert('asset_id_remap', remapRows, 100);

    for (const [tableName, columnName] of ASSET_REFERENCE_COLUMNS) {
      await trx.raw(
        `
          update ?? as target
          set ?? = remap.new_id
          from asset_id_remap as remap
          where target.?? = remap.old_id
        `,
        [tableName, columnName, columnName],
      );
    }

    await trx.raw(`
      update asset as target
      set id = remap.new_id
      from asset_id_remap as remap
      where target.id = remap.old_id
    `);

    await trx.raw(`
      select setval(
        pg_get_serial_sequence('asset', 'id'),
        (select max(id) from asset),
        true
      )
    `);
  });
};

exports.down = async () => {
  throw new Error('This migration is irreversible.');
};
