<script lang="ts">
	import { onMount } from "svelte";
	import { link } from "svelte-routing";
	import Main from "../components/templates/Main.svelte";
	import request from "../lib/request";
	import * as rank from "../stores/rank";

	type RobuxRow = {
		altUserId: number;
		altUsername: string;
		altCreatedAt: string;
		altStatus: number;
		receiverUserId: number;
		receiverUsername: string;
		receiverCreatedAt: string;
		receiverStatus: number;
		robuxSent: number;
		transactionCount: number;
		firstSentAt: string;
		lastSentAt: string;
	};

	type IpAccount = {
		userId: number;
		username: string;
		createdAt: string;
		lastSeen?: string;
		status: number;
		robuxBalance?: number;
	};

	type IpGroup = {
		hashedIp: string;
		totalAccounts: number;
		accounts: IpAccount[];
	};

	type DormantAccount = {
		userId: number;
		username: string;
		createdAt: string;
		onlineAt: string;
		status: number;
		robuxBalance: number;
		transactionCount: number;
	};

	let activeTab: "robux" | "ip" | "dormant" = "robux";
	let robuxRows: RobuxRow[] = [];
	let ipGroups: IpGroup[] = [];
	let dormantRows: DormantAccount[] = [];
	let selected = new Set<number>();
	let loading = false;
	let banning = false;
	let errorMessage: string | undefined;
	let banMessage: string | undefined;
	let minRobux = 80;
	let maxRobux = 100;
	let minAgeDays = 2;
	let inactiveDays = 1;
	let banReason = "This account has been closed due to violating Zekoro terms of service.";
	let internalReason = "Alt account detected by Alt Detector V2.";

	const formatDate = (value?: string) => value ? new Date(value).toLocaleString() : "Never";
	const statusText = (status: number) => {
		if (status === 1) return "OK";
		if (status === 2) return "Suppressed";
		if (status === 3 || status === 4 || status === 6) return "Deleted";
		if (status === 5) return "Locked";
		return `Status ${status}`;
	};

	$: visibleIds = activeTab === "robux"
		? robuxRows.map(row => row.altUserId)
		: activeTab === "ip"
			? ipGroups.flatMap(group => group.accounts.map(account => account.userId))
			: dormantRows.map(row => row.userId);
	$: selectedVisibleCount = visibleIds.filter(id => selected.has(id)).length;

	function setSelected(userId: number, checked: boolean) {
		const next = new Set(selected);
		if (checked) next.add(userId);
		else next.delete(userId);
		selected = next;
	}

	function selectVisible() {
		const next = new Set(selected);
		for (const id of visibleIds) next.add(id);
		selected = next;
	}

	function clearVisible() {
		const next = new Set(selected);
		for (const id of visibleIds) next.delete(id);
		selected = next;
	}

	async function loadRobuxRows() {
		const response = await request.get(`/users/alt-detector-v2?minRobux=${encodeURIComponent(minRobux)}&maxRobux=${encodeURIComponent(maxRobux)}`);
		robuxRows = response.data?.data || [];
	}

	async function loadIpGroups() {
		const response = await request.get("/users/alt-detector-v2/ip-bound");
		ipGroups = response.data?.data || [];
	}

	async function loadDormantRows() {
		const response = await request.get(`/users/alt-detector-v2/dormant-robux?minAgeDays=${encodeURIComponent(minAgeDays)}&inactiveDays=${encodeURIComponent(inactiveDays)}`);
		dormantRows = response.data?.data || [];
	}

	async function refresh() {
		if (!rank.hasPermission("GetUsersList")) {
			errorMessage = "You don't have permission to view this page.";
			return;
		}
		loading = true;
		errorMessage = undefined;
		banMessage = undefined;
		try {
			if (activeTab === "robux") await loadRobuxRows();
			else if (activeTab === "ip") await loadIpGroups();
			else await loadDormantRows();
		} catch (error: any) {
			errorMessage = error.message || "Failed to load Alt Detector V2.";
		} finally {
			loading = false;
		}
	}

	async function banSelected() {
		const userIds = Array.from(selected);
		if (userIds.length === 0) {
			errorMessage = "Select at least one account to ban.";
			return;
		}
		if (internalReason.trim().length < 3) {
			errorMessage = "Internal reason is required.";
			return;
		}
		if (!confirm(`Ban ${userIds.length} selected account${userIds.length === 1 ? "" : "s"}?`)) return;

		banning = true;
		errorMessage = undefined;
		banMessage = undefined;
		try {
			const response = await request.post("/ban/mass", {
				userIds,
				reason: banReason,
				internalReason,
				expires: "",
			});
			const banned = response.data?.banned || [];
			const failed = response.data?.failed || [];
			banMessage = `Banned ${banned.length} account${banned.length === 1 ? "" : "s"}. ${failed.length ? `${failed.length} failed.` : ""}`;
			selected = new Set();
			await refresh();
		} catch (error: any) {
			errorMessage = error.message || "Failed to ban selected accounts.";
		} finally {
			banning = false;
		}
	}

	onMount(() => {
		refresh();
	});
</script>

<svelte:head>
	<title>Alt Detector V2</title>
</svelte:head>

<Main>
	<div class="row">
		<div class="col-12">
			<div class="d-flex justify-content-between align-items-center">
				<div>
					<h1>Alt Detector V2</h1>
					<p>Super suspicious starter-Robux transfers, dormant starter-balance accounts, and IP-bound account groups.</p>
				</div>
				<div>
					<button class="btn btn-outline-secondary me-2" on:click={selectVisible}>Select Visible</button>
					<button class="btn btn-primary" disabled={loading} on:click={refresh}>Refresh</button>
				</div>
			</div>
			{#if errorMessage}
				<div class="alert alert-danger">{errorMessage}</div>
			{/if}
			{#if banMessage}
				<div class="alert alert-success">{banMessage}</div>
			{/if}
		</div>

		<div class="col-12 mt-3">
			<div class="btn-group">
				<button class={`btn ${activeTab === "robux" ? "btn-primary" : "btn-outline-primary"}`} on:click={() => { activeTab = "robux"; refresh(); }}>Robux Transfers</button>
				<button class={`btn ${activeTab === "dormant" ? "btn-primary" : "btn-outline-primary"}`} on:click={() => { activeTab = "dormant"; refresh(); }}>Dormant 100 Robux</button>
				<button class={`btn ${activeTab === "ip" ? "btn-primary" : "btn-outline-primary"}`} on:click={() => { activeTab = "ip"; refresh(); }}>IP Bound</button>
			</div>
		</div>

		<div class="col-12 mt-3">
			<div class="card">
				<div class="card-body">
					<div class="row">
						<div class="col-12 col-lg-3">
							<label class="form-label">Selected</label>
							<div>
								<strong>{selected.size}</strong> total, <strong>{selectedVisibleCount}</strong> visible
							</div>
						</div>
						<div class="col-12 col-lg-3">
							<label class="form-label">Public Ban Reason</label>
							<input class="form-control" bind:value={banReason} />
						</div>
						<div class="col-12 col-lg-4">
							<label class="form-label">Internal Reason</label>
							<input class="form-control" bind:value={internalReason} />
						</div>
						<div class="col-12 col-lg-2 d-flex align-items-end">
							<button class="btn btn-danger w-100" disabled={banning || selected.size === 0} on:click={banSelected}>Ban Selected</button>
						</div>
					</div>
					<div class="mt-3">
						<button class="btn btn-sm btn-outline-secondary" on:click={selectVisible}>Select Visible</button>
						<button class="btn btn-sm btn-outline-secondary ms-2" on:click={clearVisible}>Clear Visible</button>
						<button class="btn btn-sm btn-primary ms-2" disabled={loading} on:click={refresh}>Refresh</button>
						<button class="btn btn-sm btn-danger ms-2" disabled={banning || selected.size === 0} on:click={banSelected}>Ban Selected</button>
					</div>
				</div>
			</div>
		</div>

		{#if activeTab === "robux"}
			<div class="col-12 mt-3">
				<div class="row">
					<div class="col-6 col-lg-2">
						<label class="form-label">Min Robux</label>
						<input class="form-control" type="number" bind:value={minRobux} />
					</div>
					<div class="col-6 col-lg-2">
						<label class="form-label">Max Robux</label>
						<input class="form-control" type="number" bind:value={maxRobux} />
					</div>
					<div class="col-12 col-lg-3 d-flex align-items-end">
						<button class="btn btn-primary me-2" disabled={loading} on:click={refresh}>Refresh</button>
						<button class="btn btn-danger" disabled={banning || selected.size === 0} on:click={banSelected}>Ban Selected</button>
					</div>
				</div>
			</div>
			<div class="col-12 mt-3">
				{#if loading}
					<p>Loading...</p>
				{:else if robuxRows.length === 0}
					<div class="alert alert-info">No super suspicious starter-Robux transfers found.</div>
				{:else}
					<div class="table-responsive">
						<table class="table table-striped align-middle">
							<thead>
								<tr>
									<th></th>
									<th>Alt To Ban</th>
									<th>Receiver</th>
									<th>Robux Sent</th>
									<th>Tx</th>
									<th>Alt Created</th>
									<th>Last Sent</th>
									<th>Status</th>
								</tr>
							</thead>
							<tbody>
								{#each robuxRows as row}
									<tr class:table-warning={row.robuxSent >= 90}>
										<td>
											<input type="checkbox" checked={selected.has(row.altUserId)} on:change={(e) => setSelected(row.altUserId, e.currentTarget.checked)} />
										</td>
										<td>
											<a use:link href={`/admin/manage-user/${row.altUserId}`}>{row.altUsername} (ID: {row.altUserId})</a>
										</td>
										<td>
											<a use:link href={`/admin/manage-user/${row.receiverUserId}`}>{row.receiverUsername} (ID: {row.receiverUserId})</a>
										</td>
										<td>{row.robuxSent}</td>
										<td>{row.transactionCount}</td>
										<td>{formatDate(row.altCreatedAt)}</td>
										<td>{formatDate(row.lastSentAt)}</td>
										<td>{statusText(row.altStatus)}</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{/if}
			</div>
		{:else if activeTab === "dormant"}
			<div class="col-12 mt-3">
				<div class="row">
					<div class="col-6 col-lg-2">
						<label class="form-label">Min Age Days</label>
						<input class="form-control" type="number" bind:value={minAgeDays} />
					</div>
					<div class="col-6 col-lg-2">
						<label class="form-label">Inactive Days</label>
						<input class="form-control" type="number" bind:value={inactiveDays} />
					</div>
					<div class="col-12 col-lg-3 d-flex align-items-end">
						<button class="btn btn-primary me-2" disabled={loading} on:click={refresh}>Refresh</button>
						<button class="btn btn-danger" disabled={banning || selected.size === 0} on:click={banSelected}>Ban Selected</button>
					</div>
				</div>
			</div>
			<div class="col-12 mt-3">
				{#if loading}
					<p>Loading...</p>
				{:else if dormantRows.length === 0}
					<div class="alert alert-info">No dormant 100 Robux accounts found.</div>
				{:else}
					<div class="alert alert-warning">
						These accounts have exactly 100 Robux, zero transactions, were created at least {minAgeDays} day{minAgeDays === 1 ? "" : "s"} ago, and have not been online for at least {inactiveDays} day{inactiveDays === 1 ? "" : "s"}.
					</div>
					<div class="mb-2">
						<button class="btn btn-sm btn-outline-secondary" on:click={selectVisible}>Select Visible</button>
						<button class="btn btn-sm btn-outline-secondary ms-2" on:click={clearVisible}>Clear Visible</button>
						<button class="btn btn-sm btn-danger ms-2" disabled={banning || selected.size === 0} on:click={banSelected}>Ban Selected</button>
					</div>
					<div class="table-responsive">
						<table class="table table-striped align-middle">
							<thead>
								<tr>
									<th></th>
									<th>Account</th>
									<th>Robux</th>
									<th>Transactions</th>
									<th>Created</th>
									<th>Last Online</th>
									<th>Status</th>
								</tr>
							</thead>
							<tbody>
								{#each dormantRows as row}
									<tr>
										<td>
											<input type="checkbox" checked={selected.has(row.userId)} on:change={(e) => setSelected(row.userId, e.currentTarget.checked)} />
										</td>
										<td>
											<a use:link href={`/admin/manage-user/${row.userId}`}>{row.username} (ID: {row.userId})</a>
										</td>
										<td>{row.robuxBalance}</td>
										<td>{row.transactionCount}</td>
										<td>{formatDate(row.createdAt)}</td>
										<td>{formatDate(row.onlineAt)}</td>
										<td>{statusText(row.status)}</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{/if}
			</div>
		{:else}
			<div class="col-12 mt-3">
				{#if loading}
					<p>Loading...</p>
				{:else if ipGroups.length === 0}
					<div class="alert alert-info">No shared-IP account groups found.</div>
				{:else}
					{#each ipGroups as group}
						<div class="mb-2">
							<button class="btn btn-sm btn-outline-secondary" on:click={selectVisible}>Select Visible</button>
							<button class="btn btn-sm btn-outline-secondary ms-2" on:click={clearVisible}>Clear Visible</button>
							<button class="btn btn-sm btn-primary ms-2" disabled={loading} on:click={refresh}>Refresh</button>
							<button class="btn btn-sm btn-danger ms-2" disabled={banning || selected.size === 0} on:click={banSelected}>Ban Selected</button>
						</div>
						<div class="card mb-3">
							<div class="card-header">
								<strong>{group.totalAccounts}</strong> accounts on IP {group.hashedIp.slice(0, 12)}...
							</div>
							<div class="table-responsive">
								<table class="table table-striped mb-0 align-middle">
									<thead>
										<tr>
											<th></th>
											<th>User</th>
											<th>Created</th>
											<th>Last Seen On IP</th>
											<th>Robux Balance</th>
											<th>Status</th>
										</tr>
									</thead>
									<tbody>
										{#each group.accounts as account}
											<tr>
												<td>
													<input type="checkbox" checked={selected.has(account.userId)} on:change={(e) => setSelected(account.userId, e.currentTarget.checked)} />
												</td>
												<td>
													<a use:link href={`/admin/manage-user/${account.userId}`}>{account.username} (ID: {account.userId})</a>
												</td>
												<td>{formatDate(account.createdAt)}</td>
												<td>{formatDate(account.lastSeen)}</td>
												<td>{account.robuxBalance ?? 0}</td>
												<td>{statusText(account.status)}</td>
											</tr>
										{/each}
									</tbody>
								</table>
							</div>
						</div>
					{/each}
				{/if}
			</div>
		{/if}
	</div>
</Main>
