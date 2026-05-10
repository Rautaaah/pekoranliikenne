<script lang="ts">
    import { onMount } from "svelte";
    import Main from "../components/templates/Main.svelte";
    import request from "../lib/request";

    type RewardType = "robux" | "asset";
    type PromocodeEntry = {
        promocode: string;
        robux?: number | null;
        assetId?: number | null;
        isActive: boolean;
        maxUses: number;
        claimedUses: number;
        createdByUserId?: number | null;
        createdAt?: string;
        updatedAt?: string;
    };

    let loading = true;
    let disabled = false;
    let errorMessage: string | undefined;
    let successMessage: string | undefined;
    let promocodes: PromocodeEntry[] = [];

    let promocode = "";
    let rewardType: RewardType = "robux";
    let robux: number | undefined = undefined;
    let assetId: number | undefined = undefined;
    let maxUses = 1;
    let isActive = true;

    const resetForm = () => {
        promocode = "";
        rewardType = "robux";
        robux = undefined;
        assetId = undefined;
        maxUses = 1;
        isActive = true;
    };

    const loadPromocodes = async () => {
        loading = true;
        errorMessage = undefined;
        try {
            const response = await request.get("/promocodes");
            promocodes = response.data;
        } catch (e) {
            errorMessage = e.message;
        } finally {
            loading = false;
        }
    };

    const getRewardLabel = (entry: PromocodeEntry) => {
        if (entry.assetId != null) {
            return `Asset #${entry.assetId}`;
        }
        if (entry.robux != null) {
            return `${entry.robux} Robux`;
        }
        return "Unknown";
    };

    const getCreatedAtLabel = (entry: PromocodeEntry) => {
        if (!entry.createdAt) {
            return "Unknown";
        }
        return new Date(entry.createdAt).toLocaleString();
    };

    const createPromocode = async () => {
        errorMessage = undefined;
        successMessage = undefined;

        if (!promocode.trim()) {
            errorMessage = "Enter a promo code.";
            return;
        }
        if (!maxUses || Number(maxUses) < 1) {
            errorMessage = "Enter a valid max uses amount.";
            return;
        }

        const payload: any = {
            promocode,
            maxUses: Number(maxUses),
            isActive,
        };

        if (rewardType === "robux") {
            if (!robux || Number(robux) < 1) {
                errorMessage = "Enter a Robux amount greater than 0.";
                return;
            }
            payload.robux = Number(robux);
        } else {
            if (!assetId || Number(assetId) < 1) {
                errorMessage = "Enter an asset ID greater than 0.";
                return;
            }
            payload.assetId = Number(assetId);
        }

        disabled = true;
        try {
            await request.post("/promocodes", payload);
            successMessage = `Created promo code ${promocode.trim().toUpperCase()}.`;
            resetForm();
            await loadPromocodes();
        } catch (e) {
            errorMessage = e.message;
        } finally {
            disabled = false;
        }
    };

    const togglePromocode = async (entry: PromocodeEntry) => {
        disabled = true;
        errorMessage = undefined;
        successMessage = undefined;
        try {
            await request.post("/promocodes/toggle", {
                promocode: entry.promocode,
                isActive: !entry.isActive,
            });
            successMessage = `${entry.promocode} is now ${entry.isActive ? "disabled" : "active"}.`;
            await loadPromocodes();
        } catch (e) {
            errorMessage = e.message;
        } finally {
            disabled = false;
        }
    };

    const deletePromocode = async (entry: PromocodeEntry) => {
        const confirmation = prompt(`Type ${entry.promocode} to delete this promo code.`, "");
        if (confirmation !== entry.promocode) {
            return;
        }

        disabled = true;
        errorMessage = undefined;
        successMessage = undefined;
        try {
            await request.delete(`/promocodes?promocode=${encodeURIComponent(entry.promocode)}`);
            successMessage = `Deleted ${entry.promocode}.`;
            await loadPromocodes();
        } catch (e) {
            errorMessage = e.message;
        } finally {
            disabled = false;
        }
    };

    onMount(() => {
        loadPromocodes();
    });
</script>

<svelte:head>
    <title>Promocodes</title>
</svelte:head>

<Main>
    <div class="row">
        <div class="col-12">
            <h3 class="mb-1">Promocodes</h3>
            <p class="text-muted">Create, disable, activate, and delete redeemable promocodes.</p>
            {#if errorMessage}
                <p class="text-danger">{errorMessage}</p>
            {/if}
            {#if successMessage}
                <p class="text-success">{successMessage}</p>
            {/if}
        </div>

        <div class="col-12 col-xl-5">
            <div class="card bg-dark text-white border-secondary">
                <div class="card-body">
                    <h4 class="card-title">Create Promo Code</h4>
                    <div class="mb-3">
                        <label class="form-label" for="promocode">Code</label>
                        <input id="promocode" class="form-control dark-input" type="text" bind:value={promocode} {disabled} placeholder="SPRING2026" />
                    </div>
                    <div class="mb-3">
                        <label class="form-label" for="reward-type">Reward Type</label>
                        <select id="reward-type" class="form-select dark-input" bind:value={rewardType} disabled={disabled}>
                            <option value="robux">Robux</option>
                            <option value="asset">Asset</option>
                        </select>
                    </div>
                    {#if rewardType === "robux"}
                        <div class="mb-3">
                            <label class="form-label" for="robux">Robux Amount</label>
                            <input id="robux" class="form-control dark-input" type="number" min="1" bind:value={robux} {disabled} placeholder="250" />
                        </div>
                    {:else}
                        <div class="mb-3">
                            <label class="form-label" for="asset-id">Asset ID</label>
                            <input id="asset-id" class="form-control dark-input" type="number" min="1" bind:value={assetId} {disabled} placeholder="12345" />
                        </div>
                    {/if}
                    <div class="mb-3">
                        <label class="form-label" for="max-uses">Max Uses</label>
                        <input id="max-uses" class="form-control dark-input" type="number" min="1" bind:value={maxUses} {disabled} placeholder="100" />
                    </div>
                    <div class="form-check mb-3">
                        <input id="active" class="form-check-input" type="checkbox" bind:checked={isActive} disabled={disabled} />
                        <label class="form-check-label" for="active">Active on creation</label>
                    </div>
                    <button class="btn btn-success" disabled={disabled} on:click={createPromocode}>Create Promo Code</button>
                </div>
            </div>
        </div>

        <div class="col-12 col-xl-7 mt-4 mt-xl-0">
            <div class="card bg-dark text-white border-secondary">
                <div class="card-body">
                    <div class="d-flex justify-content-between align-items-center mb-3">
                        <h4 class="card-title mb-0">Existing Promocodes</h4>
                        <button class="btn btn-outline-light btn-sm" disabled={disabled || loading} on:click={loadPromocodes}>Refresh</button>
                    </div>
                    {#if loading}
                        <p class="text-muted mb-0">Loading promocodes...</p>
                    {:else if promocodes.length === 0}
                        <p class="text-muted mb-0">No promocodes have been created yet.</p>
                    {:else}
                        <div class="table-responsive">
                            <table class="table table-dark table-striped align-middle">
                                <thead>
                                    <tr>
                                        <th>Code</th>
                                        <th>Reward</th>
                                        <th>Claims</th>
                                        <th>Status</th>
                                        <th>Created</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {#each promocodes as entry}
                                        <tr>
                                            <td class="fw-bold">{entry.promocode}</td>
                                            <td>{getRewardLabel(entry)}</td>
                                            <td>{entry.claimedUses} / {entry.maxUses}</td>
                                            <td>
                                                <span class={`badge ${entry.isActive ? "bg-success" : "bg-secondary"}`}>
                                                    {entry.isActive ? "Active" : "Disabled"}
                                                </span>
                                            </td>
                                            <td>{getCreatedAtLabel(entry)}</td>
                                            <td>
                                                <div class="d-flex gap-2 flex-wrap">
                                                    <button class={`btn btn-sm ${entry.isActive ? "btn-outline-warning" : "btn-outline-success"}`} disabled={disabled} on:click={() => togglePromocode(entry)}>
                                                        {entry.isActive ? "Disable" : "Activate"}
                                                    </button>
                                                    <button class="btn btn-sm btn-outline-danger" disabled={disabled} on:click={() => deletePromocode(entry)}>Delete</button>
                                                </div>
                                            </td>
                                        </tr>
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
