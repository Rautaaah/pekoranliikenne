<script lang="ts">
	import { link } from 'svelte-routing';
	import Main from "../components/templates/Main.svelte";
	import request from "../lib/request";

	let disabled = false;
	let errorMessage: string | undefined;
	let createdAssetId: number | undefined;
	let force = 'false';
	let didError = false;
</script>

<svelte:head>
	<title>Copy Roblox Animation</title>
</svelte:head>

<Main>
	<div class="row">
		<div class="col-12">
			<h1>Copy Roblox Animation</h1>
			{#if errorMessage}
				<p class="err">{errorMessage}</p>
			{/if}
			{#if createdAssetId !== undefined}
				<p>Link: <a href={`/catalog/${createdAssetId}/--`}>View on site</a></p>
				<p>Product: <a use:link href={`/admin/product/update?assetId=${createdAssetId}`}>Update Product</a></p>
			{/if}
		</div>
		<div class="col-6">
			<label for="url">Roblox Animation URL</label>
			<input type="text" class="form-control dark-input" id="url" {disabled} placeholder="Example: https://www.roblox.com/catalog/1234567890/My-Animation" />
		</div>
		<div class="col-6">
			{#if didError}
				<label for="force">Force Upload</label>
				<select class="form-control" bind:value={force}>
					<option value="false">No</option>
					<option value="true">Yes</option>
				</select>
			{/if}
		</div>
		<div class="col-6 mt-4">
			<button
				class="btn btn-success"
				{disabled}
				on:click={(e) => {
					e.preventDefault();
					if (disabled) {
						return;
					}
					disabled = true;
					errorMessage = undefined;
					createdAssetId = undefined;
					request
						.post("/asset/copy-from-roblox", {
							// @ts-ignore
							assetId: parseInt(document.getElementById("url").value.match(/[0-9]+/)[0], 10),
							force: force === 'true',
						})
						.then((d) => {
							createdAssetId = d.data.assetId;
							didError = false;
							force = 'false';
						})
						.catch((e) => {
							errorMessage = e.message;
							didError = true;
						})
						.finally(() => {
							disabled = false;
						});
				}}>Create Animation</button
			>
		</div>
	</div>
</Main>

<style>
	p.err {
		color: red;
	}
</style>
