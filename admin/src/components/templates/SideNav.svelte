<script lang="ts">
	import { link } from "svelte-routing";
	import { HomeIcon, CopyIcon, UsersIcon, UserIcon, UserPlusIcon, ImageIcon, BookOpenIcon, EyeIcon, PlusCircleIcon, EditIcon, FilePlusIcon, RefreshCcwIcon, UploadCloudIcon, CheckSquareIcon, TagIcon, SunriseIcon, FlagIcon, StarIcon, BookIcon, PhoneIcon, ActivityIcon, TabletIcon, ChevronDownIcon, ChevronRightIcon, Trash2Icon, TerminalIcon, TargetIcon, SearchIcon } from "svelte-feather-icons";

	import * as rank from "../../stores/rank";

	let categories = {
		users: JSON.parse(sessionStorage.getItem("nav-users") || "true"),
		moderation: JSON.parse(sessionStorage.getItem("nav-moderation") || "true"),
		web: JSON.parse(sessionStorage.getItem("nav-web") || "true"),
		assets: JSON.parse(sessionStorage.getItem("nav-assets") || "true"),
		catalog: JSON.parse(sessionStorage.getItem("nav-catalog") || "true"),
	};

	const toggleCategory = (category: string) => {
		const newState = !categories[category];
		categories = { ...categories, [category]: newState };
		sessionStorage.setItem(`nav-${category}`, JSON.stringify(newState));
	};

	const navCategories = [
		{
			name: "DASHBOARD",
			link: "/admin/",
			icon: HomeIcon,
		},
		{
			id: "users",
			name: "USERS",
			items: [
				{ name: "Players", link: "/admin/players", icon: UsersIcon, permission: "GetUsersList" },
				{ name: "Performance", link: "/admin/performance", icon: ActivityIcon, permission: "GetUsersList" },
				{ name: "Groups", link: "/admin/groups", icon: ActivityIcon, permission: "GetGroupManageInfo" },
				{ name: "Create Player", link: "/admin/user/create", icon: UserPlusIcon, permission: "CreateUser" },
				{ name: "Forums", link: "/admin/forums", icon: BookIcon, permission: "LockForumThread" },
			],
		},
		{
			id: "moderation",
			name: "MODERATION",
			items: [
				{ name: "Asset Moderation", link: "/admin/asset/approval", icon: CheckSquareIcon, permission: "GetPendingModerationItems" },
				{ name: "Text Moderation", link: "/admin/text-posts", icon: PhoneIcon, permission: "GetAllAssetComments" },
				{ name: "Reports", link: "/admin/reports", icon: StarIcon, permission: "ManageReports" },
				{ name: "Bans", link: "/admin/bans", icon: FlagIcon, permission: "UnbanUser" },
				{ name: "Alt Detector V2", link: "/admin/alt-detector-v2", icon: SearchIcon, permission: "GetUsersList" },
			],
		},
		{
			id: "web",
			name: "WEB",
			items: [
				{ name: "Game History", link: "/admin/game-history", icon: TabletIcon, permission: "GetUsersInGame" },
				{ name: "Logs", link: "/admin/logs", icon: BookOpenIcon, permission: "GetAdminLogs" },
				{ name: "Feature Flags", link: "/admin/feature-flags", icon: FlagIcon, permission: "ManageFeatureFlags" },
				{ name: "Applications", link: "/admin/applications", icon: TerminalIcon, permission: "ManageApplications" },
				{ name: "Force Application", link: "/admin/force-application", icon: TerminalIcon, permission: "ForceApplication" },
				{ name: "Resolve URL", link: "/admin/resolve-url", icon: TargetIcon, permission: "GetDetailsFromThumbnail" },
			],
		},
		{
			id: "assets",
			name: "ASSETS",
			items: [
				{ name: "Update Asset Thumbnail", link: "/admin/asset/thumbnail", icon: ImageIcon, ownerOnly: true },
				{ name: "Delete Asset", link: "/admin/asset/delete", icon: Trash2Icon, ownerOnly: true },
				{ name: "Lottery", link: "/admin/lottery", icon: SunriseIcon, permission: "RunLottery" },
				{ name: "Promocodes", link: "/admin/promocodes", icon: TagIcon, permission: "GiveUserItem" },
				{ name: "Item Releases", link: "/admin/item-releases", icon: SunriseIcon, permission: "SetAssetProduct" },
				{ name: "Copy from ROBLOX", link: "/admin/asset/copy", icon: CopyIcon, permission: "CreateAssetCopiedFromRoblox" },
				{ name: "Copy UGC from ROBLOX", link: "/admin/asset/ugc/copy", icon: CopyIcon, permission: "CreateAssetCopiedFromRoblox" },
				{ name: "Copy Bundle from ROBLOX", link: "/admin/bundle/copy", icon: CopyIcon, permission: "CreateBundleCopiedFromRoblox" },
				{ name: "Copy Animation Bundle from ROBLOX", link: "/admin/animation-bundle/copy", icon: CopyIcon, permission: "CreateBundleCopiedFromRoblox" },
			],
		},
	] as any[];

	let active: string = "/";
	let pageSearch = "";

	$: pageSearchLower = pageSearch.trim().toLowerCase();
	$: pageSearchResults = navCategories
		.filter((category) => !!category.items)
		.flatMap((category) =>
			category.items
				.filter((item) => (!item.ownerOnly || rank.is("owner")) && (!item.permission || rank.hasPermission(item.permission)))
				.map((item) => ({
					name: item.name,
					link: item.link,
					category: category.name,
					icon: item.icon,
				})),
		)
		.concat(
			[
				{ name: "Dashboard", link: "/admin/", category: "GENERAL", icon: HomeIcon, permission: null },
				{ name: "Create Item", link: "/admin/asset/create", category: "CATALOG", icon: FilePlusIcon, permission: "CreateAsset" },
				{ name: "Upload Texture", link: "/admin/asset/upload-texture", category: "CATALOG", icon: UploadCloudIcon, permission: "CreateAsset" },
				{ name: "Update Item Product", link: "/admin/product/update", category: "CATALOG", icon: EditIcon, permission: "SetAssetProduct" },
				{ name: "Item Releases", link: "/admin/item-releases", category: "CATALOG", icon: SunriseIcon, permission: "SetAssetProduct" },
				{ name: "Create Item Asset", link: "/admin/asset/create-for-item", category: "CATALOG", icon: FilePlusIcon, permission: "MigrateAssetFromRoblox" },
				{ name: "Update Item RBXM", link: "/admin/asset/version/create", category: "CATALOG", icon: UploadCloudIcon, permission: "CreateAssetVersion" },
				{ name: "Gift All Users", link: "/admin/giftallusers", category: "CATALOG", icon: PlusCircleIcon, permission: "CreateAssetVersion" },
				{ name: "Get Asset Owners", link: "/admin/asset/track", category: "CATALOG", icon: EyeIcon, permission: "GiveUserItem" },
				{ name: "Re-Render", link: "/admin/asset/re-render", category: "CATALOG", icon: RefreshCcwIcon, permission: "RequestAssetReRender" },
			]
				.filter((item) => !item.permission || rank.hasPermission(item.permission))
				.map(({ permission, ...item }) => item),
		)
		.filter((item, index, arr) => arr.findIndex((entry) => entry.link === item.link) === index)
		.filter((item) => !pageSearchLower || item.name.toLowerCase().includes(pageSearchLower) || item.category.toLowerCase().includes(pageSearchLower))
		.slice(0, 10);
	$: pageSearchHasValue = pageSearchLower.length > 0;
</script>

<div class="row">
	<nav id="sidebarMenu" class="col-md-3 col-lg-2 d-md-block bg-dark text-white sidebar collapse">
		<div class="position-sticky pt-3">
			<div class="px-3 mb-3">
				<label class="page-search-label" for="admin-page-search">Search Pages</label>
				<div class="page-search-wrap">
					<SearchIcon size="16" />
					<input id="admin-page-search" class="page-search-input" type="text" bind:value={pageSearch} placeholder="Search admin pages" />
				</div>
				<p class="page-search-hint">{pageSearchHasValue ? `${pageSearchResults.length} result${pageSearchResults.length === 1 ? "" : "s"}` : "Jump to any admin page"}</p>
				{#if pageSearchHasValue}
					<div class="page-search-results">
						{#if pageSearchResults.length > 0}
							{#each pageSearchResults as result}
								<a use:link class="page-search-result" href={result.link}>
									<div class="page-search-result-icon">
										<svelte:component this={result.icon} size="15" />
									</div>
									<div class="page-search-result-body">
										<div class="page-search-result-top">
											<div class="page-search-title">{result.name}</div>
											<div class="page-search-category">{result.category}</div>
										</div>
										<div class="page-search-link">{result.link}</div>
									</div>
								</a>
							{/each}
						{:else}
							<p class="page-search-empty">No pages matched your search.</p>
						{/if}
					</div>
				{/if}
			</div>
			<ul class="nav flex-column">
				{#each navCategories as category}
					{#if !category.id || (category.items && category.items.some(item => (!item.ownerOnly || rank.is("owner")) && (!item.permission || rank.hasPermission(item.permission))))}
						{#if category.link}
							<li class="nav-item">
								<a use:link class={`nav-link${category.link === active ? " active" : ""}`} href={category.link}>
									<svelte:component this={category.icon} />
									{category.name}
								</a>
							</li>
						{:else}
							<li class="nav-item">
								<a class="nav-link d-flex justify-content-between align-items-center" href="#!" on:click|preventDefault={() => toggleCategory(category.id)}>
									<span>{category.name}</span>
									<svelte:component this={categories[category.id] ? ChevronDownIcon : ChevronRightIcon} size="16" />
								</a>
								{#if categories[category.id]}
									<ul class="nav flex-column ml-4 pl-3" style="border-left: 1px solid rgba(255,255,255,0.1);">
										{#each category.items as item}
											{#if (!item.ownerOnly || rank.is("owner")) && (!item.permission || rank.hasPermission(item.permission))}
												<li class="nav-item">
													<a use:link class={`nav-link${item.link === active ? " active" : ""}`} href={item.link}>
														<svelte:component this={item.icon} />
														{item.name}
													</a>
												</li>
											{/if}
										{/each}
									</ul>
								{/if}
							</li>
						{/if}
					{/if}
				{/each}

				{#if rank.hasPermission("CreateAsset") || rank.hasPermission("SetAssetProduct") || rank.hasPermission("MigrateAssetFromRoblox") || rank.hasPermission("CreateAssetVersion") || rank.hasPermission("RequestAssetReRender") || rank.hasPermission("CreateBundleCopiedFromRoblox") || rank.hasPermission("CreateAssetCopiedFromRoblox")}
					<li class="nav-item">
						<a class="nav-link d-flex justify-content-between align-items-center" href="#!" on:click|preventDefault={() => toggleCategory("catalog")}>
							<span>CATALOG</span>
							<svelte:component this={categories.catalog ? ChevronDownIcon : ChevronRightIcon} size="16" />
						</a>
						{#if categories.catalog}
							<ul class="nav flex-column ml-4 pl-3" style="border-left: 1px solid rgba(255,255,255,0.1);">
								{#if rank.hasPermission("CreateAsset")}
									<li class="nav-item">
										<a use:link class="nav-link" href="/admin/asset/create"><FilePlusIcon /> Create Item</a>
									</li>
									<li class="nav-item">
										<a use:link class="nav-link" href="/admin/asset/upload-texture"><UploadCloudIcon /> Upload Texture</a>
									</li>
								{/if}
				{#if rank.hasPermission("SetAssetProduct")}
					<li class="nav-item">
						<a use:link class="nav-link" href="/admin/product/update"><EditIcon /> Update Item Product</a>
					</li>
					<li class="nav-item">
						<a use:link class="nav-link" href="/admin/item-releases"><SunriseIcon /> Item Releases</a>
					</li>
				{/if}
								{#if rank.hasPermission("MigrateAssetFromRoblox")}
									<li class="nav-item">
										<a use:link class="nav-link" href="/admin/asset/create-for-item"><FilePlusIcon /> Create Item Asset</a>
									</li>
								{/if}
								{#if rank.hasPermission("CreateAssetVersion")}
									<li class="nav-item">
										<a use:link class="nav-link" href="/admin/asset/version/create"><UploadCloudIcon /> Update Item RBXM</a>
									</li>
									<li class="nav-item">
										<a use:link class="nav-link" href="/admin/giftallusers"><PlusCircleIcon /> Gift All Users</a>
									</li>
								{/if}
								{#if rank.hasPermission("GiveUserItem")}
									<li class="nav-item">
										<a use:link class="nav-link" href="/admin/asset/track"><EyeIcon /> Get Asset Owners</a>
									</li>
								{/if}
								{#if rank.hasPermission("RequestAssetReRender")}
									<li class="nav-item">
										<a use:link class="nav-link" href="/admin/asset/re-render"><RefreshCcwIcon /> Re-Render</a>
									</li>
								{/if}
							</ul>
						{/if}
					</li>
				{/if}

				<li class="nav-item mt-2 d-md-none d-block">
					<a class="nav-link" href="/">Back to Zekoro</a>
				</li>
			</ul>
		</div>
	</nav>
</div>

<style>
	nav#sidebarMenu.sidebar {
		top: 0 !important;
	}

	.page-search-label {
		display: block;
		font-size: 0.72rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: rgba(255, 255, 255, 0.72);
		margin-bottom: 0.55rem;
	}

	.page-search-wrap {
		display: flex;
		align-items: center;
		gap: 10px;
		background: linear-gradient(180deg, rgba(255, 255, 255, 0.07), rgba(255, 255, 255, 0.045));
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 8px;
		padding: 0 12px;
		box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
	}

	.page-search-wrap :global(svg) {
		color: rgba(255, 255, 255, 0.45);
		flex-shrink: 0;
	}

	.page-search-input {
		width: 100%;
		height: 42px;
		background: transparent;
		border: none;
		color: white;
		outline: none;
		font-size: 0.92rem;
	}

	.page-search-input::placeholder {
		color: rgba(255, 255, 255, 0.35);
	}

	.page-search-hint {
		font-size: 0.76rem;
		color: rgba(255, 255, 255, 0.48);
		margin: 0.55rem 0 0;
	}

	.page-search-results {
		display: grid;
		gap: 8px;
		margin-top: 12px;
	}

	.page-search-result {
		display: flex;
		align-items: flex-start;
		gap: 10px;
		background: linear-gradient(180deg, rgba(255, 255, 255, 0.055), rgba(255, 255, 255, 0.035));
		border: 1px solid rgba(255, 255, 255, 0.07);
		border-radius: 8px;
		padding: 11px 12px;
		color: #f4f7fb;
		text-decoration: none;
		transition: background 120ms ease, border-color 120ms ease, transform 120ms ease;
	}

	.page-search-result:hover {
		background: linear-gradient(180deg, rgba(54, 123, 255, 0.18), rgba(54, 123, 255, 0.1));
		border-color: rgba(84, 145, 255, 0.45);
		transform: translateY(-1px);
		text-decoration: none;
	}

	.page-search-result-icon {
		width: 30px;
		height: 30px;
		border-radius: 8px;
		background: rgba(255, 255, 255, 0.06);
		border: 1px solid rgba(255, 255, 255, 0.07);
		display: flex;
		align-items: center;
		justify-content: center;
		color: rgba(255, 255, 255, 0.82);
		flex-shrink: 0;
		margin-top: 1px;
	}

	.page-search-result-body {
		min-width: 0;
		flex: 1;
	}

	.page-search-result-top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
	}

	.page-search-title {
		font-size: 0.9rem;
		font-weight: 700;
		line-height: 1.2;
		color: #f7fbff;
		word-break: break-word;
	}

	.page-search-category {
		font-size: 0.67rem;
		font-weight: 700;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		color: #9dbdff;
		background: rgba(65, 130, 255, 0.13);
		border: 1px solid rgba(95, 150, 255, 0.22);
		border-radius: 999px;
		padding: 3px 8px;
		flex-shrink: 0;
	}

	.page-search-link {
		font-size: 0.73rem;
		color: rgba(255, 255, 255, 0.46);
		margin-top: 4px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.page-search-empty {
		font-size: 0.83rem;
		color: rgba(255, 255, 255, 0.56);
		margin: 4px 0 0;
		padding: 10px 2px 0;
	}

	.nav-link {
		padding-left: 1rem !important;
		padding-right: 1rem !important;
	}

	.nav-link.active {
		background-color: rgba(255, 255, 255, 0.1);
	}
</style>
