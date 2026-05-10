<script lang="ts">
	import dayjs from "dayjs";

	import { navigate } from "svelte-routing";
	import Main from "../components/templates/Main.svelte";
	import request from "../lib/request";
	let disabled = false;
	let errorMessage: string | undefined;
	import * as rank from "../stores/rank";
	rank.promise.then(() => {
		if (!rank.is("admin")) {
			errorMessage = "You must have the administrator permission to do this.";
		}
	});
	let assetTypeId;
	const imageAssetTypeIds = new Set(["1", "13", "21", "34"]);
	$: isImageUpload = imageAssetTypeIds.has(assetTypeId);
	$: uploadLabel = isImageUpload ? "Image File" : ".RBXM File";
	$: uploadAccept = isImageUpload ? ".png,.jpg,.jpeg,image/png,image/jpeg" : ".rbxm,application/octet-stream";

	const createOffsaleDeadline = (duration: number, unit: string): string => {
		if (unit === "seconds") return dayjs().add(duration, "second").toISOString();
		if (unit === "hours") return dayjs().add(duration, "hour").toISOString();
		if (unit === "days") return dayjs().add(duration, "day").toISOString();
		return dayjs().add(duration, "minute").toISOString();
	};
</script>

<svelte:head>
	<title>Create Item</title>
</svelte:head>

<Main>
	<div class="row">
		<div class="col-12">
			<h1>Create Item</h1>
			{#if errorMessage}
				<p class="err">{errorMessage}</p>
			{/if}
		</div>
		<div class="col-6">
			<label for="name">Name</label>
			<input type="text" class="form-control dark-input" id="name" {disabled} />
		</div>
		<div class="col-6">
			<label for="description">Description (Optional)</label>
			<input type="text" class="form-control dark-input" id="description" />
		</div>
		<div class="col-6">
			<label for="assettype">Type</label>
			<select class="form-control" bind:value={assetTypeId}>
				{#await request.get("/asset/types") then data}
					{#each Object.getOwnPropertyNames(data.data) as element}
						{#if !isNaN(parseInt(element))}
							<option value={element}>{data.data[element]}</option>
						{/if}
					{/each}
				{/await}
			</select>
		</div>
		<div class="col-6">
			<label for="assetgenre">Genre</label>
			<select class="form-control" id="assetgenre">
				{#await request.get("/asset/genres") then data}
					{#each Object.getOwnPropertyNames(data.data) as element}
						{#if !isNaN(parseInt(element))}
							<option value={element}>{data.data[element]}</option>
						{/if}
					{/each}
				{/await}
			</select>
		</div>
		{#if assetTypeId === "32"}
			<div class="col-12 mt-4 mb-4">
				<label for="rbxm">CSV of Package Asset IDs (e.g. "1,2,3")</label>
				<input type="text" class="form-control dark-input" id="assetIdsForPackage" />
			</div>
		{:else}
			<div class="col-12 mt-4 mb-4">
				<label for="rbxm">{uploadLabel}</label>
				<input type="file" class="form-control" id="rbxm" accept={uploadAccept} />
			</div>
		{/if}
		<div class="col-12">
			<h3>Economy</h3>
			<div class="row">
				<div class="col-4">
					<label for="name">Price (Optional)</label>
					<input type="text" class="form-control dark-input" id="price" {disabled} />
				</div>
				<div class="col-2 mt-4">
					<label for="is_for_sale">For Sale: </label>
					<input type="checkbox" class="form-check-input" id="is_for_sale" />
				</div>
				<div class="col-6">
					<label for="description">Limited Status</label>
					<select class="form-control" id="limited-status">
						<option value="false">Not Limited</option>
						<option value="limited">Limited</option>
						<option value="limited_u">Limited Unique</option>
					</select>
				</div>
				<div class="col-6">
					<label for="description">Max Copy Count (optional)</label>
					<input type="text" class="form-control dark-input" id="max-copies" />
				</div>
				<div class="col-3">
					<label for="offsale-duration-value">Offsale Timer (optional)</label>
					<input type="number" min="1" class="form-control dark-input" id="offsale-duration-value" placeholder="Duration" />
				</div>
				<div class="col-3">
					<label for="offsale-duration-unit">Duration Unit</label>
					<select class="form-control" id="offsale-duration-unit">
						<option value="seconds">Seconds</option>
						<option value="minutes" selected>Minutes</option>
						<option value="hours">Hours</option>
						<option value="days">Days</option>
					</select>
				</div>
			</div>
		</div>
		<div class="col-12 mt-4">
			<button
				class="btn btn-success"
				{disabled}
				on:click={(e) => {
					e.preventDefault();
					if (disabled) {
						return;
					}
					let bodyFormData = new FormData();
					bodyFormData.append("name", document.getElementById("name").value);
					bodyFormData.append("description", document.getElementById("description").value);
					bodyFormData.append("assetTypeId", assetTypeId);
					bodyFormData.append("genre", document.getElementById("assetgenre").value);
					bodyFormData.append("price", document.getElementById("price").value);
					const offsaleDurationValueRaw = document.getElementById("offsale-duration-value").value;
					const offsaleDurationUnit = document.getElementById("offsale-duration-unit").value;
					if (offsaleDurationValueRaw !== "") {
						const offsaleDurationValue = parseInt(offsaleDurationValueRaw, 10);
						if (!Number.isFinite(offsaleDurationValue) || offsaleDurationValue <= 0) {
							errorMessage = "Offsale timer must be a number greater than 0.";
							return;
						}
						bodyFormData.append("offsaleDeadline", createOffsaleDeadline(offsaleDurationValue, offsaleDurationUnit));
					}
					let limStatus = document.getElementById("limited-status").value;
					if (limStatus === "limited" || limStatus === "limited_u") {
						bodyFormData.append("isLimited", "true");
					}
					if (limStatus === "limited_u") {
						bodyFormData.append("isLimitedUnique", "true");
					}
					let maxCopies = document.getElementById("max-copies").value;
					if (maxCopies !== "") {
						bodyFormData.append("maxCopies", maxCopies);
					}
					bodyFormData.append("isForSale", document.getElementById("is_for_sale").checked ? "true" : "false");
					if (document.getElementById("rbxm")) {
						const selectedFile = document.getElementById("rbxm").files[0];
						if (!selectedFile) {
							errorMessage = isImageUpload ? "Please select a PNG or JPG image to upload." : "Please select an RBXM file to upload.";
							return;
						}
						bodyFormData.append("rbxm", selectedFile);
					}
					if (assetTypeId === "32") {
						bodyFormData.append("packageAssetIds", document.getElementById('assetIdsForPackage').value);
					}
					disabled = true;
					request
						.post("/asset/create", bodyFormData)
						.then((d) => {
							window.location.href = `/catalog/${d.data.assetId}/--`;
						})
						.catch((e) => {
							errorMessage = e.message;
						})
						.finally(() => {
							disabled = false;
						});
				}}>Create Asset</button
			>
		</div>
	</div>
</Main>

<style>
	p.err {
		color: red;
	}
</style>
