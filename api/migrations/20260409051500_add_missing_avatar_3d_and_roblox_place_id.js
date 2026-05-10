/**
 * Catch up schema drift for avatar 3D thumbnails and place impersonation.
 * @param {import('knex')} knex
 */
exports.up = async (knex) => {
    await knex.raw('ALTER TABLE user_avatar ADD COLUMN IF NOT EXISTS thumbnail_3d_url character varying(255) NULL');
    await knex.raw("ALTER TABLE asset_place ADD COLUMN IF NOT EXISTS roblox_place_id bigint NOT NULL DEFAULT 0");
};

exports.down = async (knex) => {
    const hasThumbnail3DUrl = await knex.schema.hasColumn('user_avatar', 'thumbnail_3d_url');
    if (hasThumbnail3DUrl) {
        await knex.schema.alterTable('user_avatar', (t) => {
            t.dropColumn('thumbnail_3d_url');
        });
    }

    const hasRobloxPlaceId = await knex.schema.hasColumn('asset_place', 'roblox_place_id');
    if (hasRobloxPlaceId) {
        await knex.schema.alterTable('asset_place', (t) => {
            t.dropColumn('roblox_place_id');
        });
    }
};
