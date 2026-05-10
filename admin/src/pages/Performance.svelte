<script lang="ts">
	import { onMount } from "svelte";
	import { navigate } from "svelte-routing";
	import { CheckCircleIcon, SearchIcon } from "svelte-feather-icons";
	import dayjs from "dayjs";
	import relativeTime from "dayjs/plugin/relativeTime";
	import Main from "../components/templates/Main.svelte";
	import request from "../lib/request";

	dayjs.extend(relativeTime);

	export let userId: string | undefined = undefined;

	type StaffEntry = {
		userId: number;
		username: string;
		headshotThumbnailUrl?: string;
		permissionCount?: number;
	};

	type PerformanceEntry = {
		user: {
			id: number;
			username: string;
			headshotThumbnailUrl?: string;
			thumbnailUrl?: string;
			isStaff?: boolean;
		};
		stats: {
			totalActions?: number;
			assetsProcessed?: number;
			audiosProcessed?: number;
			signupsModerated?: number;
			reportsProcessed?: number;
			playersModerated?: number;
			earliestPerm?: string;
		};
		permissionCount?: number;
	};

	let searchQuery = "";
	let loading = false;
	let errorMessage: string | undefined;
	let staffEntries: StaffEntry[] = [];
	let performances: PerformanceEntry[] = [];

	const loadAllPerformance = async () => {
		loading = true;
		errorMessage = undefined;
		try {
			const staffRes = await request.get("/staff/list");
			staffEntries = staffRes.data || [];

			const performanceResults = await Promise.all(
				staffEntries.map(async (staff) => {
					const perfRes = await request.get(`/staff/performance?userId=${encodeURIComponent(String(staff.userId))}`);
					return {
						...perfRes.data,
						permissionCount: staff.permissionCount ?? 0,
					} as PerformanceEntry;
				}),
			);

			performances = performanceResults.sort((a, b) => {
				if (userId) {
					if (String(a.user.id) === userId) return -1;
					if (String(b.user.id) === userId) return 1;
				}
				return a.user.username.localeCompare(b.user.username);
			});
		} catch (e) {
			errorMessage = e.message;
		} finally {
			loading = false;
		}
	};

	onMount(() => {
		loadAllPerformance();
	});

	const openFocusedView = (staffId: number) => {
		navigate(`/admin/performance/${staffId}`);
	};

	const formatEarliest = (dateValue) => {
		if (!dateValue) return "No data yet";
		const parsed = dayjs(dateValue);
		if (!parsed.isValid()) return "No data yet";
		return `${parsed.format("MMMM D, YYYY")} - ${parsed.fromNow()}`;
	};

	$: query = searchQuery.trim().toLowerCase();
	$: filteredPerformances = performances.filter((entry) => {
		if (!query) return true;
		return (
			entry.user.username.toLowerCase().includes(query) ||
			String(entry.user.id).includes(query)
		);
	});
</script>

<svelte:head>
	<title>Performance</title>
</svelte:head>

<Main>
	<div class="performance-page">
		<div class="page-header">
			<div>
				<h1 class="performance-heading">Staff Performance</h1>
				<p class="performance-subheading">Every account with permissions, shown as a full overview card.</p>
			</div>
		</div>

		<div class="search-row">
			<div class="search-input-wrap">
				<SearchIcon size="18" />
				<input class="form-control performance-search" type="text" bind:value={searchQuery} placeholder="Search staff by username or user ID" />
			</div>
			<div class="search-count">{filteredPerformances.length} staff</div>
		</div>

		{#if errorMessage}
			<p class="error-text">{errorMessage}</p>
		{/if}

		{#if loading}
			<div class="empty-panel">Loading staff performance...</div>
		{:else if filteredPerformances.length === 0}
			<div class="empty-panel">No staff matched your search.</div>
		{:else}
			<div class="performance-wall">
				{#each filteredPerformances as entry}
					<button class:focused={userId && String(entry.user.id) === userId} class="performance-card" on:click={() => openFocusedView(entry.user.id)}>
						<p class="overview-label">Overview</p>
						<div class="performance-grid">
							<div class="profile-column">
								<div class="avatar-frame">
									{#if entry.user.headshotThumbnailUrl || entry.user.thumbnailUrl}
										<img src={entry.user.headshotThumbnailUrl || entry.user.thumbnailUrl} alt={entry.user.username} class="avatar-image" />
									{:else}
										<div class="avatar-placeholder"></div>
									{/if}
								</div>
								<div class="staff-line">
									<span>{entry.user.username}</span>
									<CheckCircleIcon size="14" />
								</div>
							</div>

							<div class="stats-column">
								<div class="hero-stat">
									<div class="hero-label">Total Actions</div>
									<div class="hero-value">{entry.stats.totalActions ?? 0}</div>
								</div>

								<div class="stats-grid">
									<div class="stat-box">
										<div class="stat-label">Assets Processed</div>
										<div class="stat-value">{entry.stats.assetsProcessed ?? 0}</div>
									</div>
									<div class="stat-box">
										<div class="stat-label">Audios Processed</div>
										<div class="stat-value">{entry.stats.audiosProcessed ?? 0}</div>
									</div>
									<div class="stat-box">
										<div class="stat-label">Signups Moderated</div>
										<div class="stat-value">{entry.stats.signupsModerated ?? 0}</div>
									</div>
									<div class="stat-box">
										<div class="stat-label">Reports Processed</div>
										<div class="stat-value">{entry.stats.reportsProcessed ?? 0}</div>
									</div>
									<div class="stat-box">
										<div class="stat-label">Players Moderated</div>
										<div class="stat-value">{entry.stats.playersModerated ?? 0}</div>
									</div>
									<div class="stat-box">
										<div class="stat-label">Earliest Perm.</div>
										<div class="stat-subvalue">{formatEarliest(entry.stats.earliestPerm)}</div>
									</div>
								</div>
							</div>
						</div>
					</button>
				{/each}
			</div>
		{/if}
	</div>
</Main>

<style>
	.performance-page {
		color: #f5f5f5;
	}

	.page-header {
		margin-bottom: 1.5rem;
	}

	.performance-heading {
		font-size: 2.9rem;
		font-weight: 800;
		line-height: 1.05;
		margin: 0;
	}

	.performance-subheading {
		margin: 0.5rem 0 0;
		color: #aeb6bf;
		font-size: 1rem;
	}

	.search-row {
		display: flex;
		gap: 12px;
		align-items: center;
		margin-bottom: 1.25rem;
	}

	.search-input-wrap {
		display: flex;
		align-items: center;
		gap: 10px;
		background: #202429;
		border: 1px solid #2d343c;
		padding: 0 14px;
		border-radius: 8px;
		flex: 1;
		max-width: 760px;
	}

	.performance-search {
		background: transparent;
		border: none;
		color: #f5f5f5;
		height: 48px;
		box-shadow: none;
	}

	.performance-search:focus {
		background: transparent;
		color: #f5f5f5;
		box-shadow: none;
	}

	.search-count {
		font-size: 0.92rem;
		color: #aeb6bf;
		padding: 0.75rem 1rem;
		background: #202429;
		border: 1px solid #2d343c;
		border-radius: 8px;
	}

	.performance-wall {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 22px;
	}

	.performance-card {
		background: #22272d;
		border: 1px solid #2d343c;
		border-radius: 0;
		padding: 18px 18px 16px;
		text-align: left;
		color: #f5f5f5;
		box-shadow: 0 5px 0 rgba(0, 0, 0, 0.22);
		transition: transform 120ms ease, border-color 120ms ease, background 120ms ease;
	}

	.performance-card:hover {
		transform: translateY(-2px);
		border-color: #3d4650;
		background: #252b32;
	}

	.performance-card.focused {
		border-color: #4a82ff;
		box-shadow: 0 5px 0 rgba(0, 0, 0, 0.22), 0 0 0 1px rgba(74, 130, 255, 0.35);
	}

	.overview-label {
		font-size: 0.82rem;
		font-weight: 800;
		margin-bottom: 0.9rem;
	}

	.performance-grid {
		display: grid;
		grid-template-columns: 84px 1fr;
		gap: 18px;
		align-items: start;
	}

	.profile-column {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding-top: 0.45rem;
	}

	.avatar-frame {
		width: 72px;
		height: 72px;
		display: flex;
		align-items: center;
		justify-content: center;
		overflow: hidden;
	}

	.avatar-image,
	.avatar-placeholder {
		width: 72px;
		height: 72px;
		object-fit: cover;
	}

	.avatar-placeholder {
		background: #313840;
	}

	.staff-line {
		display: flex;
		align-items: center;
		gap: 4px;
		margin-top: 8px;
		font-size: 0.72rem;
		color: #edf3fb;
		text-align: center;
		line-height: 1.2;
		word-break: break-word;
	}

	.stats-column {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}

	.hero-stat {
		margin-bottom: 1rem;
	}

	.hero-label {
		font-size: 0.9rem;
		font-weight: 800;
		line-height: 1.1;
		margin-bottom: 0.25rem;
	}

	.hero-value {
		font-size: 0.92rem;
		line-height: 1.1;
	}

	.stats-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.8rem 1rem;
	}

	.stat-box {
		text-align: center;
	}

	.stat-label {
		font-size: 0.76rem;
		font-weight: 800;
		line-height: 1.15;
		margin-bottom: 0.2rem;
	}

	.stat-value {
		font-size: 0.86rem;
		line-height: 1.1;
	}

	.stat-subvalue {
		font-size: 0.78rem;
		line-height: 1.25;
		color: #eef2f7;
	}

	.empty-panel {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 140px;
		color: #aeb6bf;
		background: #202429;
		border: 1px solid #2d343c;
		border-radius: 8px;
	}

	.error-text {
		color: #ff9090;
		margin-bottom: 1rem;
	}

	@media (max-width: 1250px) {
		.performance-wall {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}

	@media (max-width: 760px) {
		.search-row {
			flex-direction: column;
			align-items: stretch;
		}

		.search-count {
			width: 100%;
			text-align: center;
		}

		.performance-wall {
			grid-template-columns: 1fr;
		}
	}
</style>
