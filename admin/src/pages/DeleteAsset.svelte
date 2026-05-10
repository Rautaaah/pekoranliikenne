<script lang="ts">
	import Main from "../components/templates/Main.svelte";
	import request from "../lib/request";
	import * as rank from "../stores/rank";

	let disabled = false;
	let errorMessage: string | undefined;
	let successMessage: string | undefined;
	let dirtyAssetId = "";
	let confirmText = "";
	let assetDetails:
		| {
				id: number;
				name: string;
				content_url?: string | null;
				creatorName?: string;
		  }
		| undefined;

	rank.promise.then(() => {
		if (!rank.is("owner")) {
			errorMessage = "You must be the site owner to fully delete assets.";
		}
	});

	const searchAsset = () => {
		if (disabled) return;
		const parsed = parseInt(dirtyAssetId, 10);
		if (!Number.isSafeInteger(parsed) || parsed <= 0) {
			errorMessage = "Enter a valid asset ID.";
			return;
		}
		disabled = true;
		errorMessage = undefined;
		successMessage = undefined;
		assetDetails = undefined;
		confirmText = "";
		request
			.get(`/asset/moderation-details?assetId=${parsed}`)
			.then((d) => {
				assetDetails = d.data;
			})
			.catch((e) => {
				errorMessage = e.message;
			})
			.finally(() => {
				disabled = false;
			});
	};

	const deleteAsset = () => {
		if (disabled || !assetDetails) return;
		if (confirmText !== assetDetails.id.toString()) {
			errorMessage = `Type ${assetDetails.id} to confirm deletion.`;
			return;
		}
		disabled = true;
		errorMessage = undefined;
		successMessage = undefined;
		request
			.post("/asset/delete", { assetId: assetDetails.id })
			.then((d) => {
				successMessage = `Deleted asset ${d.data.assetId} (${d.data.assetName}).`;
				dirtyAssetId = "";
				confirmText = "";
				assetDetails = undefined;
			})
			.catch((e) => {
				errorMessage = e.message;
			})
			.finally(() => {
				disabled = false;
			});
	};
</script>

<svelte:head>
	<title>Delete Asset</title>
</svelte:head>

<Main>
	<div class="row">
		<div class="col-12">
			<h1>Delete Asset</h1>
			<p class="text-warning">
				This permanently removes the asset and related database records. This cannot be undone.
			</p>
			{#if errorMessage}
				<p class="err">{errorMessage}</p>
			{/if}
			{#if successMessage}
				<p class="text-success">{successMessage}</p>
			{/if}
		</div>
		<div class="col-12 col-lg-5">
			<label for="assetid">Asset ID</label>
			<input
				type="text"
				class="form-control dark-input"
				id="assetid"
				bind:value={dirtyAssetId}
				{disabled}
				placeholder="Enter asset ID"
			/>
		</div>
		<div class="col-12 col-lg-3 mt-4 mt-lg-0 d-flex align-items-end">
			<button class="btn btn-primary" on:click|preventDefault={searchAsset} {disabled}>
				Search
			</button>
		</div>

		{#if assetDetails}
			<div class="col-12 mt-4">
				<div class="card bg-dark text-white">
					<div class="card-body">
						<h4 class="mb-3">{assetDetails.name}</h4>
						<p class="mb-1">Asset ID: {assetDetails.id}</p>
						{#if assetDetails.creatorName}
							<p class="mb-1">Creator: {assetDetails.creatorName}</p>
						{/if}
						{#if assetDetails.content_url}
							<p class="mb-3">
								Thumbnail: <a href={assetDetails.content_url} target="_blank" rel="noreferrer">Open</a>
							</p>
						{/if}
						<label for="confirm-delete">Type {assetDetails.id} to confirm</label>
						<input
							type="text"
							class="form-control dark-input"
							id="confirm-delete"
							bind:value={confirmText}
							{disabled}
						/>
						<button class="btn btn-danger mt-3" on:click|preventDefault={deleteAsset} {disabled}>
							Delete Asset
						</button>
					</div>
				</div>
			</div>
		{/if}
	</div>
</Main>

<style>
	p.err {
		color: red;
	}
</style>
