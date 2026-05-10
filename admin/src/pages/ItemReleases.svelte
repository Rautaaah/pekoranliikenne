<script lang="ts">
	import Main from "../components/templates/Main.svelte";
	import request from "../lib/request";

	type ReleaseKind = "Onsale" | "Offsale" | "Limited" | "LimitedUnique";
	type OffsaleDurationUnit = "Seconds" | "Minutes" | "Hours" | "Days";
	type ReleaseRow = {
		id: number;
		itemInput: string;
		releaseKind: ReleaseKind;
		isFree: boolean;
		robuxAmount: string;
		stock: string;
		offsaleDurationValue: string;
		offsaleDurationUnit: OffsaleDurationUnit;
		applySaleSettings: boolean;
	};

	let disabled = false;
	let errorMessage: string | null = null;
	let successMessage: string | null = null;
	let rows: ReleaseRow[] = [
		{
			id: 1,
			itemInput: "",
			releaseKind: "Onsale",
			isFree: false,
			robuxAmount: "",
			stock: "",
			offsaleDurationValue: "",
			offsaleDurationUnit: "Minutes",
			applySaleSettings: true,
		},
	];
	let nextId = 2;

	const parseAssetId = (input: string): number | null => {
		if (!input) return null;
		const fromCatalogUrl = input.match(/\/catalog\/([0-9]+)/i);
		if (fromCatalogUrl && fromCatalogUrl[1]) return parseInt(fromCatalogUrl[1], 10);
		const anyNumber = input.match(/([0-9]+)/);
		if (anyNumber && anyNumber[1]) return parseInt(anyNumber[1], 10);
		return null;
	};

	const addRow = () => {
		rows = [
			...rows,
			{
				id: nextId++,
				itemInput: "",
			releaseKind: "Onsale",
			isFree: false,
			robuxAmount: "",
			stock: "",
			offsaleDurationValue: "",
			offsaleDurationUnit: "Minutes",
			applySaleSettings: true,
		},
	];
	};

	const removeRow = (rowId: number) => {
		if (rows.length === 1) return;
		rows = rows.filter((r) => r.id !== rowId);
	};

	const releaseKindToEnum = (kind: ReleaseKind) => {
		if (kind === "Onsale") return 1;
		if (kind === "Offsale") return 2;
		if (kind === "Limited") return 3;
		return 4;
	};

	const offsaleDurationUnitToEnum = (unit: OffsaleDurationUnit) => {
		if (unit === "Seconds") return 1;
		if (unit === "Minutes") return 2;
		if (unit === "Hours") return 3;
		return 4;
	};

	const submit = async () => {
		errorMessage = null;
		successMessage = null;

		const payloadRows = rows.map((row, index) => {
			const assetId = parseAssetId(row.itemInput);
			if (!assetId) throw new Error(`Row ${index + 1}: enter a valid item URL or asset ID.`);
			if (!row.isFree && (row.robuxAmount === "" || isNaN(parseInt(row.robuxAmount, 10)))) {
				throw new Error(`Row ${index + 1}: set a valid Robux amount or enable Free.`);
			}
			if ((row.releaseKind === "Limited" || row.releaseKind === "LimitedUnique") && (row.stock === "" || isNaN(parseInt(row.stock, 10)) || parseInt(row.stock, 10) <= 0)) {
				throw new Error(`Row ${index + 1}: stock is required for Limited and Limited/U.`);
			}
			if (row.releaseKind === "Offsale" && (row.offsaleDurationValue === "" || isNaN(parseInt(row.offsaleDurationValue, 10)) || parseInt(row.offsaleDurationValue, 10) <= 0)) {
				throw new Error(`Row ${index + 1}: offsale timer is required for Offsale.`);
			}
			return {
				assetId,
				releaseKind: releaseKindToEnum(row.releaseKind),
				isFree: row.isFree,
				robuxAmount: row.isFree ? null : parseInt(row.robuxAmount, 10),
				stock: (row.releaseKind === "Limited" || row.releaseKind === "LimitedUnique") ? parseInt(row.stock, 10) : null,
				offsaleDurationValue: row.releaseKind === "Offsale" ? parseInt(row.offsaleDurationValue, 10) : null,
				offsaleDurationUnit: row.releaseKind === "Offsale" ? offsaleDurationUnitToEnum(row.offsaleDurationUnit) : null,
				applySaleSettings: row.applySaleSettings,
			};
		});

		disabled = true;
		try {
			const response = await request.post("/item-release", {
				items: payloadRows,
			});
			successMessage = `Release posted for ${response.data?.count || payloadRows.length} item(s).`;
		} catch (err) {
			errorMessage = err?.message || "Failed to post item release.";
		} finally {
			disabled = false;
		}
	};
</script>

<svelte:head>
	<title>Item Releases</title>
</svelte:head>

<Main>
	<div class="row item-release-page">
		<div class="col-12">
			<h1>Item Releases</h1>
			<p class="muted mb-2">
				Post item releases to Discord and optionally apply sale settings instantly.
			</p>
			<p class="muted">
				Ping role: <code>&lt;@&1454994424063987978&gt;</code>
			</p>
			{#if errorMessage}
				<div class="alert alert-danger">{errorMessage}</div>
			{/if}
			{#if successMessage}
				<div class="alert alert-success">{successMessage}</div>
			{/if}
		</div>
	</div>

	{#each rows as row, index}
	<div class="mt-3 release-card p-3">
			<div class="d-flex justify-content-between align-items-center mb-2">
				<h4 class="mb-0">Item {index + 1}</h4>
				<button class="btn btn-outline-danger btn-sm" disabled={disabled || rows.length === 1} on:click={() => removeRow(row.id)}>Remove</button>
			</div>
			<div class="row">
				<div class="col-12 col-lg-6">
					<label class="form-label">Item URL or Asset ID</label>
					<input class="form-control dark-input release-input" disabled={disabled} bind:value={row.itemInput} placeholder="https://zekoro.org/catalog/920/Item-Name or 920" />
				</div>
				<div class="col-12 col-lg-3">
					<label class="form-label">Release Type</label>
					<select class="form-control dark-input release-input" disabled={disabled} bind:value={row.releaseKind}>
						<option value="Onsale">Onsale</option>
						<option value="Offsale">Offsale</option>
						<option value="Limited">Limited</option>
						<option value="LimitedUnique">Limited/U</option>
					</select>
				</div>
				<div class="col-12 col-lg-3">
					<label class="form-label">Price</label>
					<div class="d-flex align-items-center gap-2">
						<input class="form-check-input mt-0" type="checkbox" disabled={disabled} bind:checked={row.isFree} id={`free-${row.id}`} />
						<label class="form-check-label m-0" for={`free-${row.id}`}>Free</label>
					</div>
					<input class="form-control dark-input release-input mt-2" disabled={disabled || row.isFree} bind:value={row.robuxAmount} placeholder="Robux Amount" />
				</div>
				{#if row.releaseKind === "Limited" || row.releaseKind === "LimitedUnique"}
					<div class="col-12 col-lg-3 mt-3">
						<label class="form-label">Stock (Required)</label>
						<input class="form-control dark-input release-input" disabled={disabled} bind:value={row.stock} placeholder="e.g. 100" />
					</div>
				{/if}
				{#if row.releaseKind === "Offsale"}
					<div class="col-12 col-lg-3 mt-3">
						<label class="form-label">Offsale Timer</label>
						<input class="form-control dark-input release-input" disabled={disabled} bind:value={row.offsaleDurationValue} placeholder="Duration" />
					</div>
					<div class="col-12 col-lg-3 mt-3">
						<label class="form-label">Duration Unit</label>
						<select class="form-control dark-input release-input" disabled={disabled} bind:value={row.offsaleDurationUnit}>
							<option value="Seconds">Seconds</option>
							<option value="Minutes">Minutes</option>
							<option value="Hours">Hours</option>
							<option value="Days">Days</option>
						</select>
					</div>
				{/if}
				<div class="col-12 col-lg-3 mt-3">
					<label class="form-label">Apply Sale Settings</label>
					<div class="d-flex align-items-center gap-2">
						<input class="form-check-input mt-0" type="checkbox" disabled={disabled} bind:checked={row.applySaleSettings} id={`apply-${row.id}`} />
						<label class="form-check-label m-0" for={`apply-${row.id}`}>Apply on post</label>
					</div>
				</div>
			</div>
		</div>
	{/each}

	<div class="mt-3 d-flex gap-2">
		<button class="btn btn-outline-primary" disabled={disabled} on:click={addRow}>Add Item</button>
		<button class="btn btn-success" disabled={disabled} on:click={submit}>{disabled ? "Posting..." : "Post Release"}</button>
	</div>
</Main>

<style>
	:global(body) {
		background: #090d13 !important;
	}

	.item-release-page {
		color: #f3f7ff;
	}

	.muted {
		color: #a7b1c2;
	}

	.release-card {
		background: linear-gradient(180deg, #161d27 0%, #121821 100%) !important;
		border: 1px solid rgba(255, 255, 255, 0.08) !important;
		color: #f2f6ff !important;
	}

	.release-card.card,
	.release-card.card-body,
	.release-card .card-body {
		background: linear-gradient(180deg, #161d27 0%, #121821 100%) !important;
		border-color: rgba(255, 255, 255, 0.08) !important;
		color: #f2f6ff !important;
	}

	.form-label {
		margin-bottom: 6px;
		color: #d8e1ef !important;
		font-weight: 600;
	}

	h4.mb-0 {
		color: #f2f6ff !important;
	}

	.release-input {
		background: #10161f !important;
		border-color: #2a3344 !important;
		color: #f2f6ff !important;
	}

	.release-input::placeholder {
		color: #7f8aa1 !important;
	}

	.form-check-label {
		color: #d8e1ef !important;
	}

	.alert-danger {
		background: rgba(226, 78, 101, 0.2) !important;
		color: #ffdbe2 !important;
		border: 1px solid rgba(226, 78, 101, 0.45) !important;
	}

	.alert-success {
		background: rgba(40, 199, 111, 0.2) !important;
		color: #dfffea !important;
		border: 1px solid rgba(40, 199, 111, 0.45) !important;
	}

	code {
		background: rgba(255, 255, 255, 0.1);
		color: #ffd4e0;
		padding: 2px 6px;
		border-radius: 4px;
	}
</style>
