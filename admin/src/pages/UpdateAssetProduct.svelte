<script lang="ts">
	import dayjs from "dayjs";
	import Permission from "../components/Permission.svelte";
	import Main from "../components/templates/Main.svelte";
	import { hasPermission } from "../stores/rank";
	import { getElementById } from "../lib/dom";
	import request from "../lib/request";
	let disabled = false;
	let errorMessage: string | undefined;
	import * as rank from "../stores/rank";
	import SaleHistory from "../components/SaleHistory.svelte";
	import ProductHistory from "../components/ProductHistory.svelte";
	let queryParams = new URLSearchParams(window.location.search);
	let assetId: number = parseInt(queryParams.get("assetId"), 10) || undefined;
	let dirtyAssetId: string = assetId ? assetId.toString() : ''
	interface IDetailsResponse {
		name: string;
		description: string | null;
		isForSale: boolean;
		isLimited: boolean;
		isLimitedUnique: boolean;
		priceRobux: number | null;
		priceTickets: number|null;
		serialCount: number | null;
		offsaleAt: string | null;
//		hidden: boolean;   [[ will implement at later date - shady ]]
	}
	let assetDetails: Partial<IDetailsResponse> = {};
	let latestFetch;
	const createOffsaleDeadline = (duration: number, unit: string): string => {
		if (unit === "seconds") return dayjs().add(duration, "second").toISOString();
		if (unit === "hours") return dayjs().add(duration, "hour").toISOString();
		if (unit === "days") return dayjs().add(duration, "day").toISOString();
		return dayjs().add(duration, "minute").toISOString();
	};
	$: {
		if (latestFetch) {
			clearTimeout(latestFetch);
		}
		if (assetId) {
			latestFetch = setTimeout(() => {
				disabled = true;
				request
					.get("/product/details?assetId=" + assetId)
					.then((d) => {
						if (d.data.isLimited || d.data.isLimitedUnique) {
							if (!hasPermission('MakeItemLimited')) {
								errorMessage = "You do not have permission to modify limited items.";
								disabled = false;
								return;
							}
						}
						errorMessage = null;
						assetDetails = d.data;
					})
					.finally(() => {
						disabled = false;
					});
			}, 1);
		}
	}
</script>

<style>
	p.err {
		color: red;
	}
</style>

<svelte:head>
	<title>Update Product</title>
</svelte:head>

<Main>
	<div class="row">
		<div class="col-12">
			<h1>Update Product</h1>
			{#if errorMessage}
				<p class="err">{errorMessage}</p>
			{/if}
		</div>
		<div class="col-12">
			<label for="name">AssetID</label>
		</div>
		<div class="col-4">
			<input
				type="text"
				class="form-control"
				id="asset_id"
				{disabled}
				bind:value={dirtyAssetId}
			/>
		</div>
		<div class="col-4">
			<button
			class="btn btn-success"
			disabled={disabled}
			on:click={(e) => {
				assetId = parseInt(dirtyAssetId, 10);
			}}>Search</button>
		</div>
		<div class="col-12">
			{#if assetDetails && assetDetails.name}
				<div class="row">
					<div class="col-12">
						<h2 class="mt-2 mb-2">Editing "{assetDetails.name}"</h2>
					</div>
					<div class="col-2">
						<label for="name">Name</label>
						<input type="text" class="form-control dark-input" id="assetName" {disabled} value={assetDetails.name || ""} />
					</div>
					<div class="col-12">
						<label for="description">Description</label>
						<input type="text" class="form-control dark-input" id="description" {disabled} value={assetDetails.description || ""} />
					</div>
					<div class="col-2">
						<label for="name">R$ Price (Optional)</label>
						<input type="text" class="form-control dark-input" id="priceRobux" {disabled} value={assetDetails.priceRobux || ""} />
					</div>
					<div class="col-2">
						<label for="name">TX$ Price (Optional)</label>
						<input type="text" class="form-control dark-input" id="priceTickets" {disabled} value={assetDetails.priceTickets || ""} />
					</div>
					<div class="col-2 mt-4">
						<label for="is_for_sale">For Sale: </label>
						<input type="checkbox" class="form-check-input" id="is_for_sale" checked={assetDetails.isForSale || false} />
					</div>
				</div>
				<div class="row">
					<Permission p="MakeItemLimited">
						<div class="col-6">
							<label for="description">Limited Status</label>
							<select class="form-control" id="limited-status" value={assetDetails.isLimited ? "limited" : assetDetails.isLimitedUnique ? "limited_u" : "false"}>
								<option value="false">Not Limited</option>
								<option value="limited">Limited</option>
								<option value="limited_u">Limited Unique</option>
							</select>
						</div>
					</Permission>
					<div class="col-6">
						<label for="description">Max Copy Count (optional)</label>
						<input type="text" class="form-control dark-input" id="max-copies" value={assetDetails.serialCount || ""} />
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
					{#if assetDetails.offsaleAt}
						<div class="col-12 mt-2">
							<small class="text-muted">Current offsale deadline: {dayjs(assetDetails.offsaleAt).format("YYYY-MM-DD HH:mm:ss")} UTC</small>
						</div>
					{/if}
				</div>
			{/if}
		</div>
		<div class="col-12 mt-4">
			<button
				class="btn btn-success"
				disabled={disabled || !assetDetails.name}
				on:click={(e) => {
					e.preventDefault();
					if (disabled) {
						return;
					}
					const offsaleDurationValueRaw = getElementById("offsale-duration-value").value;
					const offsaleDurationUnit = getElementById("offsale-duration-unit").value;
					let offsaleDeadline;
					if (offsaleDurationValueRaw !== "") {
						const offsaleDurationValue = parseInt(offsaleDurationValueRaw, 10);
						if (!Number.isFinite(offsaleDurationValue) || offsaleDurationValue <= 0) {
							errorMessage = "Offsale timer must be a number greater than 0.";
							return;
						}
						offsaleDeadline = createOffsaleDeadline(offsaleDurationValue, offsaleDurationUnit);
					}

					let isLimited = false;
					let isLimitedUnique = false;
					if (getElementById("limited-status")) {
						let limStatus = getElementById("limited-status").value;
						if (limStatus === "limited" || limStatus === "limited_u") {
							isLimited = true;
						}
						if (limStatus === "limited_u") {
							isLimitedUnique = true;
						}
					}
					let maxSerial = null;
					if (document.getElementById("max-copies")) {
    					let maxSerialValue = document.getElementById("max-copies").value;
    					if (Number.isSafeInteger(parseInt(maxSerialValue, 10))) {
        					maxSerial = parseInt(maxSerialValue, 10);
    				}
				}

					let price = getElementById("priceRobux").value;
					if (Number.isSafeInteger(parseInt(price, 10))) {
						price = parseInt(price, 10);
					}else{
						price = null;
					}

					let priceTickets = getElementById('priceTickets').value;
					if (Number.isSafeInteger(parseInt(priceTickets, 10))) {
						priceTickets = parseInt(priceTickets, 10);
					}else{
						priceTickets = null;
					}

					let description = getElementById('description').value
					if (description === null) {
						description = "No description available."
					}

					let assetName = getElementById('assetName').value
					if (assetName === null) {
						assetName = assetDetails.name
					}
					
					disabled = true;
					request
						.patch("/asset/product", {
							assetId,
							assetName,
							description,
							isForSale: getElementById("is_for_sale").checked,
							maxCopies: maxSerial,
							priceRobux: price,
							priceTickets: priceTickets,
							offsaleDeadline,
							isLimited,
							isLimitedUnique,
						})
						.then((d) => {
							window.location.href = `/catalog/${assetId}/--`;
						})
						.catch((e) => {
							console.log('[error]',e);
							errorMessage = e.message;
						})
						.finally(() => {
							disabled = false;
						});
				}}>Update Product</button
			>
		</div>
		{#if assetDetails}
			<div class="col-12">
				<hr />
				<Permission p="GetSaleHistoryForAsset">
					<ProductHistory assetId={assetId}></ProductHistory>
				</Permission>
				<SaleHistory assetId={assetId}></SaleHistory>
			</div>
		{/if}
	</div>
</Main>

