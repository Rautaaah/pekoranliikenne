<script lang="ts">
	import { navigate } from "svelte-routing";
	import Main from "../components/templates/Main.svelte";
	import request from "../lib/request";
	export let userId: string;
	let disabled = false;
	let errorMessage: string | undefined;
	let successMessage: string | undefined;
	let robuxAmount = "";
	let ticketsAmount = "";
	let robuxAction: "add" | "remove" = "add";
	let ticketsAction: "add" | "remove" = "add";
	let balanceRobux = 0;
	let balanceTickets = 0;
	import * as rank from "../stores/rank";

	const loadUserBalances = () =>
		request.get("/user?userId=" + encodeURIComponent(userId)).then((d) => {
			balanceRobux = typeof d.data.balance_robux === "number" ? d.data.balance_robux : 0;
			balanceTickets = typeof d.data.balance_tickets === "number" ? d.data.balance_tickets : 0;
			return d;
		});

	loadUserBalances().catch(() => {
		errorMessage = "Failed to load the user's current balances.";
	});

	rank.promise.then(() => {
		if (!rank.is("admin")) {
			errorMessage = "You must have the administrator permission to manage currency.";
		}
	});

	const parsePositiveAmount = (value: string, label: string) => {
		const parsed = Number(value);
		if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) {
			throw new Error(`${label} amount must be a whole number greater than 0.`);
		}
		return parsed;
	};

	const submitRobux = async () => {
		if (disabled) return;
		errorMessage = undefined;
		successMessage = undefined;
		try {
			const amount = parsePositiveAmount(robuxAmount, "Robux");
			disabled = true;
			await request.post("/giverobux", {
				userId,
				robux: robuxAction === "remove" ? -amount : amount,
			});
			successMessage = robuxAction === "remove" ? "Robux removed successfully." : "Robux added successfully.";
			robuxAmount = "";
			await loadUserBalances();
			navigate("/admin/manage-user/" + userId);
		} catch (e) {
			errorMessage = e.message;
		} finally {
			disabled = false;
		}
	};

	const submitTickets = async () => {
		if (disabled) return;
		errorMessage = undefined;
		successMessage = undefined;
		try {
			const amount = parsePositiveAmount(ticketsAmount, "Tickets");
			disabled = true;
			await request.post("/givetickets", {
				userId,
				tickets: ticketsAction === "remove" ? -amount : amount,
			});
			successMessage = ticketsAction === "remove" ? "Tickets removed successfully." : "Tickets added successfully.";
			ticketsAmount = "";
			await loadUserBalances();
			navigate("/admin/manage-user/" + userId);
		} catch (e) {
			errorMessage = e.message;
		} finally {
			disabled = false;
		}
	};
</script>

<style>
	p.err {
		color: red;
	}
	p.ok {
		color: #2ecc71;
	}
</style>

<svelte:head>
	<title>Manage Currency</title>
</svelte:head>

<Main>
	<div class="row">
		<div class="col-12">
			<h1>Manage Currency</h1>
			{#if errorMessage}
				<p class="err">{errorMessage}</p>
			{/if}
			{#if successMessage}
				<p class="ok">{successMessage}</p>
			{/if}
		</div>
		<div class="col-12 col-lg-6">
			<p class="mb-2"><span class="badge bg-success">{balanceRobux.toLocaleString()} Robux</span></p>
			<label for="message-subject">Robux Amount</label>
			<input type="number" min="1" step="1" class="form-control dark-input" id="robux-amount" bind:value={robuxAmount} {disabled} />
		</div>
		<div class="col-12 col-lg-6">
			<label for="robux-action">Robux Action</label>
			<select id="robux-action" class="form-control dark-input" bind:value={robuxAction} disabled={disabled}>
				<option value="add">Add Robux</option>
				<option value="remove">Remove Robux</option>
			</select>
		</div>
		<div class="col-12 mt-4">
			<button
				class="btn btn-success"
				{disabled}
				on:click|preventDefault={submitRobux}>{robuxAction === "remove" ? "Remove Robux" : "Add Robux"}</button
			>
		</div>
		<div class="col-12 mt-4 mb-4">
			<hr />
		</div>
		<div class="col-12 col-lg-6">
			<p class="mb-2"><span class="badge bg-warning text-dark">{balanceTickets.toLocaleString()} Tickets</span></p>
			<label for="message-subject">Tickets Amount</label>
			<input type="number" min="1" step="1" class="form-control dark-input" id="tickets-amount" bind:value={ticketsAmount} {disabled} />
		</div>
		<div class="col-12 col-lg-6">
			<label for="tickets-action">Tickets Action</label>
			<select id="tickets-action" class="form-control dark-input" bind:value={ticketsAction} disabled={disabled}>
				<option value="add">Add Tickets</option>
				<option value="remove">Remove Tickets</option>
			</select>
		</div>
		<div class="col-12 mt-4">
			<button
				class="btn btn-warning"
				{disabled}
				on:click|preventDefault={submitTickets}>{ticketsAction === "remove" ? "Remove Tickets" : "Add Tickets"}</button
			>
		</div>
	</div>
</Main>
