<script lang="ts">
	import Main from "../components/templates/Main.svelte";
	import request from "../lib/request";
	import { chunk } from "lodash";

	let bans: any[] = [];
	let disabled = false;
	let searchQuery = "";
	let limit = 50;
	let offset = 0;
	let total = 0;
	let errorMessage: string | null = null;

	const loadBans = () => {
		disabled = true;
		errorMessage = null;
		request
			.get(`/bans?limit=${limit}&offset=${offset}&query=${encodeURIComponent(searchQuery)}`)
			.then((res) => {
				bans = (res.data?.data || []).map((b) => ({ ...b, checked: false }));
				total = res.data?.total || 0;
			})
			.catch((e) => {
				errorMessage = e.message || "Failed to load bans.";
			})
			.finally(() => {
				disabled = false;
			});
	};

	const formatDate = (value: string | null) => {
		if (!value) return "Never";
		try {
			return new Date(value).toLocaleString();
		} catch {
			return value;
		}
	};

	const selectedBans = () => bans.filter((b) => b.checked);

	const unbanUsers = async (userIds: number[]) => {
		const grouped = chunk(userIds, 50);
		for (const group of grouped) {
			await Promise.all(
				group.map((userId) =>
					request.post("/unban", {
						userId,
					}),
				),
			);
		}
	};

	const unbanSelected = async () => {
		const selected = selectedBans();
		if (selected.length === 0) return;
		if (!confirm(`Unban ${selected.length} selected user(s)?`)) return;
		disabled = true;
		errorMessage = null;
		try {
			await unbanUsers(selected.map((b) => b.user_id));
			loadBans();
		} catch (e) {
			errorMessage = e.message || "Failed to unban selected users.";
			disabled = false;
		}
	};

	const unbanAllListed = async () => {
		if (bans.length === 0) return;
		if (!confirm(`Unban all ${bans.length} users on this page?`)) return;
		disabled = true;
		errorMessage = null;
		try {
			await unbanUsers(bans.map((b) => b.user_id));
			loadBans();
		} catch (e) {
			errorMessage = e.message || "Failed to unban all listed users.";
			disabled = false;
		}
	};

	loadBans();
</script>

<svelte:head>
	<title>Bans</title>
</svelte:head>

<Main>
	<div class="row">
		<div class="col-12">
			<h1>Bans</h1>
			<p class="text-muted">Manage active bans and unban users in bulk.</p>
			{#if errorMessage}
				<div class="alert alert-danger">{errorMessage}</div>
			{/if}
		</div>

		<div class="col-12 col-md-4">
			<label for="ban-search">Search Username / User ID</label>
			<input id="ban-search" class="form-control" bind:value={searchQuery} />
		</div>
		<div class="col-12 col-md-2">
			<label for="ban-limit">Limit</label>
			<select id="ban-limit" class="form-control" bind:value={limit}>
				<option value={25}>25</option>
				<option value={50}>50</option>
				<option value={100}>100</option>
			</select>
		</div>
		<div class="col-12 col-md-2 d-flex align-items-end">
			<button class="btn btn-primary w-100" disabled={disabled} on:click={loadBans}>Search</button>
		</div>
		<div class="col-12 col-md-4 d-flex align-items-end gap-2">
			<button class="btn btn-warning w-50" disabled={disabled || selectedBans().length === 0} on:click={unbanSelected}>
				Unban Selected
			</button>
			<button class="btn btn-danger w-50" disabled={disabled || bans.length === 0} on:click={unbanAllListed}>
				Unban All Listed
			</button>
		</div>

		<div class="col-12 mt-3">
			<p class="mb-2">{total.toLocaleString()} active ban(s)</p>
			<table class="table">
				<thead>
					<tr>
						<th>
							<input
								class="form-check-input"
								type="checkbox"
								on:change={(e) => {
									const checked = e.currentTarget.checked;
									bans = bans.map((b) => ({ ...b, checked }));
								}}
							/>
						</th>
						<th>User ID</th>
						<th>Username</th>
						<th>Reason</th>
						<th>Moderator</th>
						<th>Banned At</th>
						<th>Expires</th>
					</tr>
				</thead>
				<tbody>
					{#each bans as ban}
						<tr>
							<td>
								<input
									class="form-check-input"
									type="checkbox"
									checked={ban.checked}
									on:change={(e) => {
										const checked = e.currentTarget.checked;
										bans = bans.map((b) => (b.user_id === ban.user_id ? { ...b, checked } : b));
									}}
								/>
							</td>
							<td>{ban.user_id}</td>
							<td>{ban.username}</td>
							<td>{ban.reason || "No reason"}</td>
							<td>{ban.author_username || ban.author_user_id || "Unknown"}</td>
							<td>{formatDate(ban.created_at)}</td>
							<td>{formatDate(ban.expired_at)}</td>
						</tr>
					{/each}
					{#if bans.length === 0}
						<tr>
							<td colspan="7">No active bans found.</td>
						</tr>
					{/if}
				</tbody>
			</table>
		</div>

		<div class="col-12">
			<ul class="pagination">
				<li class={`page-item${disabled || offset <= 0 ? " disabled" : ""}`}>
					<a
						class="page-link"
						href="#!"
						on:click={(e) => {
							e.preventDefault();
							if (offset <= 0 || disabled) return;
							offset = Math.max(0, offset - limit);
							loadBans();
						}}>Previous</a
					>
				</li>
				<li class="page-item active">
					<a class="page-link" href="#!">{Math.floor(offset / limit) + 1}</a>
				</li>
				<li class={`page-item${disabled || offset + limit >= total ? " disabled" : ""}`}>
					<a
						class="page-link"
						href="#!"
						on:click={(e) => {
							e.preventDefault();
							if (disabled || offset + limit >= total) return;
							offset += limit;
							loadBans();
						}}>Next</a
					>
				</li>
			</ul>
		</div>
	</div>
</Main>
