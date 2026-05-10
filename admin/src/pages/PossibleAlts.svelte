<script lang="ts">
	import { link } from "svelte-routing";
	import Main from "../components/templates/Main.svelte";
	import request from "../lib/request";
	import * as rank from "../stores/rank";

	type AltRow = {
		hashedIp: string;
		reason?: string;
		originalUser: {
			userId: number;
			username: string;
			createdAt: string;
			lastSeen?: string;
		};
		altUser: {
			userId: number;
			username: string;
			createdAt: string;
			lastSeen?: string;
		};
		robuxTransfer?: {
			totalRobuxSentToOriginal: number;
			transactionCount: number;
			firstSentAt?: string;
			lastSentAt?: string;
			sentStartingRobuxToOriginal: boolean;
		};
	};

	let rows: AltRow[] = [];
	let loading = false;
	let errorMessage: string | undefined;

	$: suspiciousRows = rows.filter((row) => row.robuxTransfer?.sentStartingRobuxToOriginal);

	async function loadRows() {
		if (!rank.hasPermission("GetUsersList")) {
			errorMessage = "You don't have permission to view this page.";
			return;
		}
		loading = true;
		errorMessage = undefined;
		try {
			const response = await request.get("/users/alts");
			rows = (response.data?.data || []).sort((a: AltRow, b: AltRow) => {
				const aSus = a.robuxTransfer?.sentStartingRobuxToOriginal ? 1 : 0;
				const bSus = b.robuxTransfer?.sentStartingRobuxToOriginal ? 1 : 0;
				const robuxDiff = (b.robuxTransfer?.totalRobuxSentToOriginal || 0) - (a.robuxTransfer?.totalRobuxSentToOriginal || 0);
				return bSus - aSus || robuxDiff;
			});
		} catch (error: any) {
			errorMessage = error.message || "Failed to load possible alts.";
		} finally {
			loading = false;
		}
	}

	$: if (rank.hasPermission("GetUsersList")) {
		loadRows();
	}
</script>

<svelte:head>
	<title>Possible Alts</title>
</svelte:head>

<Main>
	<div class="row">
		<div class="col-12">
			<h1>Possible Alts</h1>
			<p>Accounts are grouped by shared hashed IP. The first-created account is treated as the original account.</p>
			{#if suspiciousRows.length > 0}
				<div class="alert alert-warning">
					<strong>{suspiciousRows.length}</strong> alt{suspiciousRows.length === 1 ? "" : "s"} sent 1-100 Robux to the original account.
				</div>
			{/if}
			{#if errorMessage}
				<div class="alert alert-danger">{errorMessage}</div>
			{/if}
		</div>
		<div class="col-12 mt-3">
			{#if loading}
				<p>Loading...</p>
			{:else if rows.length === 0}
				<div class="alert alert-info">Nothing found.</div>
			{:else}
				<div class="table-responsive">
					<table class="table table-striped">
						<thead>
								<tr>
								<th>Evidence</th>
								<th>Original Account</th>
								<th>Possible Alt</th>
								<th>Original Created</th>
								<th>Alt Created</th>
								<th>Robux Sent To Original</th>
								<th>Status</th>
							</tr>
						</thead>
						<tbody>
							{#each rows as row}
								<tr class:table-warning={row.robuxTransfer?.sentStartingRobuxToOriginal}>
									<td>
										{row.reason || "Shared IP"}
										{#if row.hashedIp}
											<span class="text-muted">({row.hashedIp.slice(0, 10)}...)</span>
										{/if}
									</td>
									<td>
										<a use:link href={`/admin/manage-user/${row.originalUser.userId}`}>{row.originalUser.username} (ID: {row.originalUser.userId})</a>
									</td>
									<td>
										<a use:link href={`/admin/manage-user/${row.altUser.userId}`}>{row.altUser.username} (ID: {row.altUser.userId})</a>
									</td>
									<td>{new Date(row.originalUser.createdAt).toLocaleString()}</td>
									<td>{new Date(row.altUser.createdAt).toLocaleString()}</td>
									<td>
										{row.robuxTransfer?.totalRobuxSentToOriginal || 0}
										{#if row.robuxTransfer && row.robuxTransfer.transactionCount > 0}
											<span class="text-muted">({row.robuxTransfer.transactionCount} tx)</span>
										{/if}
									</td>
									<td>
										{#if row.robuxTransfer?.sentStartingRobuxToOriginal}
											<span class="badge bg-warning text-dark">Sus Robux Alt</span>
										{:else if (row.robuxTransfer?.totalRobuxSentToOriginal || 0) > 0}
											<span class="badge bg-info text-dark">Robux Linked</span>
										{:else}
											<span class="badge bg-secondary">Shared IP</span>
										{/if}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</div>
	</div>
</Main>
