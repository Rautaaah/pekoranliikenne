<script lang="ts">
	import { onMount } from "svelte";
	import Main from "../components/templates/Main.svelte";
	import request from "../lib/request";

	type AltDetectorAccount = {
		userId: number;
		username: string;
		createdAt: string;
		accountCreatedIndex: number;
	};

	type AltDetectorGroup = {
		discordId: string;
		totalAccounts: number;
		accounts: AltDetectorAccount[];
	};

	let loading = true;
	let errorMessage: string | undefined;
	let groups: AltDetectorGroup[] = [];

	const loadGroups = async () => {
		loading = true;
		errorMessage = undefined;
		try {
			const response = await request.get("/alt-detector");
			groups = response.data;
		} catch (e) {
			errorMessage = e.message;
		} finally {
			loading = false;
		}
	};

	const formatCreatedAt = (value: string) => {
		return new Date(value).toLocaleString();
	};

	onMount(() => {
		loadGroups();
	});
</script>

<svelte:head>
	<title>Alt Detector</title>
</svelte:head>

<Main>
	<div class="row">
		<div class="col-12">
			<h3 class="mb-1">Alt Detector</h3>
			<p class="text-muted">Find Discord IDs linked to multiple site accounts.</p>
			{#if errorMessage}
				<p class="text-danger">{errorMessage}</p>
			{/if}
		</div>

		<div class="col-12">
			<div class="card bg-dark text-white border-secondary">
				<div class="card-body">
					<div class="d-flex justify-content-between align-items-center mb-3">
						<h4 class="card-title mb-0">Duplicate Discord Links</h4>
						<button class="btn btn-outline-light btn-sm" disabled={loading} on:click={loadGroups}>Refresh</button>
					</div>

					{#if loading}
						<p class="text-muted mb-0">Loading duplicate Discord links...</p>
					{:else if groups.length === 0}
						<p class="text-muted mb-0">No duplicate Discord-linked site accounts were found.</p>
					{:else}
						<div class="table-responsive">
							<table class="table table-dark table-striped align-middle">
								<thead>
									<tr>
										<th>Discord ID</th>
										<th>Account Order</th>
										<th>User</th>
										<th>Created</th>
									</tr>
								</thead>
								<tbody>
									{#each groups as group}
										{#each group.accounts as account}
											<tr>
												<td class="fw-bold">{group.discordId}</td>
												<td>Account created {account.accountCreatedIndex} of {group.totalAccounts}</td>
												<td>
													<a class="link-light" href={`/admin/manage-user/${account.userId}`}>
														{account.username} (#{account.userId})
													</a>
												</td>
												<td>{formatCreatedAt(account.createdAt)}</td>
											</tr>
										{/each}
									{/each}
								</tbody>
							</table>
						</div>
					{/if}
				</div>
			</div>
		</div>
	</div>
</Main>
