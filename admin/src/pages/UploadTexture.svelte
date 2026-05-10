<script lang="ts">
	import Main from "../components/templates/Main.svelte";
	import request from "../lib/request";
	import * as rank from "../stores/rank";

	let disabled = false;
	let errorMessage: string | undefined;
	let textureType = "1";

	rank.promise.then(() => {
		if (!rank.is("admin")) {
			errorMessage = "You must have the administrator permission to do this.";
		}
	});
</script>

<svelte:head>
	<title>Upload Texture</title>
</svelte:head>

<Main>
	<div class="row">
		<div class="col-12">
			<h1>Upload Texture</h1>
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
			<input type="text" class="form-control dark-input" id="description" {disabled} />
		</div>
		<div class="col-6 mt-4">
			<label for="texture-type">Type</label>
			<select class="form-control" id="texture-type" bind:value={textureType}>
				<option value="1">Image</option>
				<option value="13">Decal</option>
				<option value="18">Face</option>
				<option value="21">Badge</option>
				<option value="34">GamePass</option>
			</select>
		</div>
		<div class="col-6 mt-4">
			<label for="texture-file">Texture File</label>
			<input type="file" class="form-control" id="texture-file" accept=".png,.jpg,.jpeg,image/png,image/jpeg" />
		</div>
		<div class="col-12 mt-4">
			<button
				class="btn btn-success"
				{disabled}
				on:click={(e) => {
					e.preventDefault();
					const textureFile = document.getElementById("texture-file").files[0];
					if (!textureFile) {
						errorMessage = "Please select a PNG or JPG texture to upload.";
						return;
					}

					const bodyFormData = new FormData();
					bodyFormData.append("name", document.getElementById("name").value);
					bodyFormData.append("description", document.getElementById("description").value);
					bodyFormData.append("assetTypeId", textureType);
					bodyFormData.append("genre", "0");
					bodyFormData.append("price", "");
					bodyFormData.append("isForSale", "false");
					bodyFormData.append("rbxm", textureFile);

					disabled = true;
					errorMessage = undefined;
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
				}}>Upload Texture</button
			>
		</div>
	</div>
</Main>

<style>
	p.err {
		color: red;
	}
</style>
