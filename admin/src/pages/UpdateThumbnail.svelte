<script lang="ts">
	import Main from "../components/templates/Main.svelte";
	import request from "../lib/request";
	import * as rank from "../stores/rank";

	let assetId = "";
	let thumbnailFile: File | null = null;
	let disabled = false;
	let loading = false;
	let errorMessage: string | undefined;
	let successMessage: string | undefined;

	rank.promise.then(() => {
		if (!rank.hasPermission("SetAssetModerationStatus")) {
			errorMessage = "You don't have permission to change thumbnails.";
			disabled = true;
		}
	});

	async function changeThumbnail() {
		errorMessage = undefined;
		successMessage = undefined;
		if (!assetId || !thumbnailFile) {
			errorMessage = "Both asset ID and thumbnail file are required.";
			return;
		}

		loading = true;
		const formData = new FormData();
		formData.append("assetId", assetId);
		formData.append("thumbnail", thumbnailFile);

		try {
			const response = await request.post(`/asset/thumbnail?assetId=${assetId}`, formData, {
				headers: {
					"Content-Type": "multipart/form-data",
				},
			});
			successMessage = `Thumbnail for asset ${response.data.assetId} updated successfully.`;
		} catch (error: any) {
			errorMessage = error.message || "Failed to change thumbnail.";
		} finally {
			loading = false;
		}
	}

	function handleUpload(event: Event) {
		const input = event.target as HTMLInputElement;
		thumbnailFile = input.files?.[0] ?? null;
	}
</script>

<svelte:head>
	<title>Update Asset Thumbnail</title>
</svelte:head>

<Main>
	<div class="row">
		<div class="col-12">
			<h1>Update Asset Thumbnail</h1>
			{#if errorMessage}
				<div class="alert alert-danger">{errorMessage}</div>
			{/if}
			{#if successMessage}
				<div class="alert alert-success">{successMessage}</div>
			{/if}
		</div>
		<div class="col-12 col-lg-6 mt-3">
			<label for="asset-id" class="form-label">Asset ID</label>
			<input id="asset-id" class="form-control dark-input" type="number" bind:value={assetId} disabled={disabled || loading} />
		</div>
		<div class="col-12 col-lg-6 mt-3">
			<label for="thumbnail" class="form-label">Thumbnail</label>
			<input id="thumbnail" class="form-control dark-input" type="file" accept="image/png,image/jpeg,image/webp" on:change={handleUpload} disabled={disabled || loading} />
		</div>
		<div class="col-12 mt-4">
			<button class="btn btn-success" disabled={disabled || loading || !assetId || !thumbnailFile} on:click|preventDefault={changeThumbnail}>
				{#if loading}Updating...{:else}Apply{/if}
			</button>
		</div>
	</div>
</Main>
