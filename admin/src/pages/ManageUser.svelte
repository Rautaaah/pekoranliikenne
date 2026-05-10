<script lang="ts">
	import { link } from "svelte-routing";
	import { RefreshCwIcon, UserIcon, LinkIcon, LockIcon, XIcon, SlashIcon, DollarSignIcon, ShoppingBagIcon, MailIcon, AwardIcon, UserMinusIcon, FileTextIcon, DatabaseIcon, ActivityIcon, AlertTriangleIcon } from "svelte-feather-icons";
	import moment from "../lib/moment";
	import * as rank from "../stores/rank";
	import DiscordLinkedIcon from "../components/DiscordLinkedIcon.svelte";
	export let userId: string;

	import Main from "../components/templates/Main.svelte";
	import request from "../lib/request";
	import Confirm from "../components/modal/Confirm.svelte";
	import Permission from "../components/Permission.svelte";
	import ManageTextContent from "../components/users/ManageTextContent.svelte";
	import ManagePermissions from "../components/users/ManagePermissions.svelte";
	let userInfo;
	const privacySettings = ["inventory_privacy", "theme", "gender", "trade_privacy", "trade_filter", "private_message_privacy"];
	const privacySettingToString = (setting: string): string => {
		return setting
														.replace(/\_/g, " ")
														.split(" ")
														.map((v) => {
															return v.slice(0, 1).toUpperCase() + v.slice(1);
														})
														.join(" ")
	}
	$: {
		userInfo = request.get("/user?userId=" + encodeURIComponent(userId)).then((d) => {
			title = `${d.data.username}'s Profile`;
			info = d.data;
			return d;
		});
		modalVisible = false;
	}
	let title: string;
	let info;

	let modalBody: string;
	let modalVisible = false;
	let modalCb: (arg1: boolean) => void;
	let errorMessage: string | undefined;
	let successMessage: string | undefined;
	let warningModalVisible = false;
	let warningReason = "";
	let warningInternalReason = "";
	let warningDisabled = false;
	const isWarningRecord = (data) => {
		const internalReason = data?.["ban_reason_internal"] || "";
		const expiredAt = data?.["ban_expired_at"];
		const createdAt = data?.["ban_created_at"];
		return internalReason.startsWith("[Warning]") ||
			internalReason.includes("Warning issued from player profile.") ||
			(expiredAt && createdAt && new Date(expiredAt).getTime() <= new Date(createdAt).getTime() + 60000);
	};

	const submitWarning = () => {
		errorMessage = undefined;
		successMessage = undefined;
		if (!warningReason || warningReason.trim().length < 3) {
			errorMessage = "Warning reason is required.";
			return;
		}
		warningDisabled = true;
		request
			.post("/warn", {
				userId,
				reason: warningReason.trim(),
				internalReason: warningInternalReason.trim() || "Warning issued from player profile.",
			})
			.then(() => {
				window.location.reload();
			})
			.catch((err) => {
				errorMessage = err.message;
			})
			.finally(() => {
				warningDisabled = false;
			});
	};
</script>

<style>
	div.sp {
		margin: 0 auto;
		display: block;
	}
	div.actions > button,
	div.actions > a {
		margin-bottom: 0.5rem;
	}

	.warning-modal-backdrop {
		position: fixed;
		inset: 0;
		z-index: 1100;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(0, 0, 0, 0.65);
		padding: 1rem;
	}

	.warning-modal {
		width: min(640px, 100%);
	}
</style>

<svelte:head>
	<title>{title || ""}</title>
</svelte:head>

<Main>
	{#if modalVisible}
		<Confirm
			title="Confirm"
			message={modalBody}
			cb={(e) => {
				modalVisible = false;
				modalCb(e);
			}}
		/>
	{/if}
	{#if warningModalVisible}
		<div class="warning-modal-backdrop">
			<div class="card bg-dark text-light warning-modal">
				<div class="card-body card-header">
					<h3 class="mb-0"><AlertTriangleIcon /> Warn User</h3>
				</div>
				<div class="card-body">
					<p class="text-muted">
						This will block the player from their account until they read the warning and click Agree.
					</p>
					<label class="form-label" for="warning-reason">Warning shown to player</label>
					<textarea
						id="warning-reason"
						class="form-control"
						rows="5"
						placeholder="Example: Do not harass other users or post inappropriate content on Zekoro."
						bind:value={warningReason}
						disabled={warningDisabled}
					/>
					<label class="form-label mt-3" for="warning-internal-reason">Internal note (optional)</label>
					<textarea
						id="warning-internal-reason"
						class="form-control"
						rows="3"
						placeholder="Only visible in moderation logs."
						bind:value={warningInternalReason}
						disabled={warningDisabled}
					/>
					<div class="d-flex justify-content-end gap-2 mt-4">
						<button
							class="btn btn-outline-light"
							disabled={warningDisabled}
							on:click={() => {
								warningModalVisible = false;
							}}
						>
							Cancel
						</button>
						<button class="btn btn-warning" disabled={warningDisabled} on:click={submitWarning}>
							Issue Warning
						</button>
					</div>
				</div>
			</div>
		</div>
	{/if}

	{#await userInfo}
		<div class="row">
			<div class="col-12 text-center">
				<div class="spinner-border sp" />
			</div>
		</div>
	{:then info}
		<div class="row">
			<div class="col-12 col-lg-9">
				{#if errorMessage}
					<div class="alert alert-danger" role="alert">
						{errorMessage}
					</div>
				{/if}
				{#if successMessage}
					<div class="alert alert-success" role="alert">
						{successMessage}
					</div>
				{/if}
				<div class="row">
					<div class="col-12 col-lg-4">
						<div class="card bg-dark">
							<div class="card card-body card-header">
								<h3 class="mb-0">
									{info ? info.data.username : 'Loading...'}
									{#if info?.data?.discord_linked}
										<DiscordLinkedIcon size={20} />
									{/if}
								</h3>
							</div>
							<div class="card-body">
								<p>
									{#if info.data.is_admin}
										<span class="badge bg-warning">Admin</span>
									{/if}
									{#if info.data.is_moderator}
										<span class="badge bg-info">Moderator</span>
									{/if}
									{#if info.data.status === "Ok"}
										<span class="badge bg-success">Account OK</span>
									{:else}
										<span class="badge bg-danger">
											{info.data.status}
										</span>
									{/if}
								</p>
								<img class="avatar-thumb" alt={`${info.data.username}'s Avatar`} src={info.data.thumbnail_url} />
								<p>
									<a href={`/users/${info.data.id}/profile`}><LinkIcon /> View Zekoro Profile</a>
								</p>
							</div>
						</div>
					</div>
					<div class="col-12 col-lg-8">
						<div class="card bg-dark text-light">
							<div class="card card-body card-header">
								<h3 class="mb-0">User Summary</h3>
							</div>
							{#if info.data.status !== "Ok"}
								<div class="card card-body card-header bg-danger">
									{#if info.data.status === 'Supressed'}
									<p class="mb-0">This account is {isWarningRecord(info.data) ? "warned" : "temporarily banned"}.</p>
									{:else if info.data.status === 'Deleted'}
									<p class="mb-0">This account is deleted.</p>
									{:else if info.data.status === 'Forgotten'}
									<p class="mb-0">This account is GDPR deleted.</p>
									{:else if info.data.status==='MustValidateEmail'}
									<p class="mb-0">This account is locked.</p>
									{:else}
									<p class="mb-0">This account's status is {info.data.status}.</p>
									{/if}
								</div>
							{/if}
							{#if info.data.is_moderator || info.data.is_admin}
							<div class="card card-body card-header bg-info">
								<p class="mb-0">This user is a staff member.</p>
							</div>
							{/if}
							{#if (!info.data.is_moderator && !info.data.is_admin && !info.data.joinApp && !info.data.invite)}
							<div class="card card-body card-header bg-warning">
								<p class="mb-0">User does not have an invite or join app. They cannot access the website.</p>
							</div>
							{/if}
							<div class="card-body">
								<p class="mb-0">Joined {moment(info.data.created_at).fromNow()} ({moment(info.data.created_at).format("MMM DD YYYY, h:mm A")})</p>
								<p class="mb-0">Last Online {moment(info.data.online_at).fromNow()} ({moment(info.data.online_at).format("MMM DD YYYY, h:mm A")})</p>
								<p class="mb-2">
									<span class="badge bg-success">{typeof info.data.balance_robux === "number" ? info.data.balance_robux.toLocaleString() : "0"} Robux</span>
									<span class="badge bg-warning">{typeof info.data.balance_tickets === "number" ? info.data.balance_tickets.toLocaleString() : "0"} Tix</span>
								</p>
								<div class="row">
									<div class="col-6">
										<table class="w-100 mt-4 settings-table">
											<tbody>
												{#each privacySettings as setting}
												<tr>
													<td class="fw-bold">{privacySettingToString(setting)}</td>
													<td>{info.data[setting]}</td>
												</tr>
												{/each}
											</tbody>
										</table>
									</div>
									<div class="col-6">
										<table class="w-100 mt-4 settings-table">
											<tbody>
												<tr>
													<td class="fw-bold">Join Method</td>
													<td>
														{#if info.data.joinApp}
														<a href={`/admin/applications/${info.data.joinApp.id}`}>
															Application
														</a>
														{:else if info.data.invite}
														<span>Invited by <a href={`/admin/manage-user/${info.data.invite.authorId}`}>#{info.data.invite.authorId}</a></span>
														{:else}
														N/A
													{/if}
													</td>
												</tr>

												<tr>
													<td class="fw-bold">Membership</td>
													<td>
														{#if info.data.membership}
														{info.data.membership.membershipType}
														{:else}
														None
														{/if}
													</td>
												</tr>
											</tbody>
										</table>
									</div>
								</div>
								{#if info.data.status === "Ok" || info.data.status === "MustValidateEmail" || info.data.status === "Forgotten"}
								<p></p>
								{:else}

								<h3 class="mt-2">{isWarningRecord(info.data) ? "Warning Data" : "Ban Data"}</h3>
									<p class="mb-0"><span class="fw-bold">Reason</span>: <span class="monospace">{info.data["ban_reason"] || "No reason specified"}</span></p>
									<p class="mb-0"><span class="fw-bold">Internal Reason</span>: <span class="monospace">{info.data["ban_reason_internal"] || "No internal reason specified"}</span></p>
									<p class="mb-0"><span class="fw-bold">Author</span>: <a href={`/users/${info.data["ban_author_user_id"]}/profile`}>{info.data["ban_author_username"] || "No author"}</a></p>
									<p class="mb-0"><span class="fw-bold">Created</span>: {moment(info.data["ban_created_at"]).format("MMM DD YYYY, h:mm A")}</p>
									<p class="mb-0"><span class="fw-bold">Expiration</span>: {info.data["ban_expired_at"] ? moment(info.data["ban_expired_at"]).format("MMM DD YYYY, h:mm A") : 'Never'}</p>
								{/if}
							</div>
						</div>
					</div>
				</div>
				<ManageTextContent userId={userId} />

				{#if rank.is("owner")}
					<ManagePermissions userId={userId} />
				{/if}
			</div>

			<div class="col-12 col-md-6 col-lg-3 actions">
				<div class="card mb-2 bg-dark">
					<div class="card-body card-header"><h4 class="mb-0">Account Actions</h4></div>
				</div>
				{#if info.data.is_moderator || info.data.is_admin}
					<Permission p="GetUsersList">
						<a use:link class="btn-outline-info btn w-100" href={`/admin/performance/${userId}`}>
							<ActivityIcon /> Staff Performance
						</a>
					</Permission>
				{/if}
				<Permission p="BanUser">
					<button
						class="btn-outline-warning btn w-100"
						on:click={(e) => {
							e.preventDefault();
							warningReason = "";
							warningInternalReason = "";
							warningModalVisible = true;
						}}
					>
						<AlertTriangleIcon /> Warning
					</button>
				</Permission>
				{#if info.data.status !== "Ok"}
					<Permission p="UnbanUser">
						<button
							class="btn-outline-warning btn w-100"
							on:click={(e) => {
								e.preventDefault();
								request
									.post("/unban", {
										userId,
									})
									.then((data) => {
										window.location.reload();
									})
									.catch((e) => {
										errorMessage = e.message;
									});
							}}
						>
							{info.data.status === "MustValidateEmail" ? "Unlock" : "Unban"}
						</button>
					</Permission>
				{:else}
					<Permission p="BanUser">
						<a use:link class="btn-outline-danger btn w-100" href={`/admin/ban-user/${userId}`}>Ban</a>
					</Permission>
				{/if}
				{#if rank.is("admin")}
					<Permission p="DeleteUser">
						<button
							class="btn-outline-danger btn w-100"
							on:click={(e) => {
								e.preventDefault();
								modalBody = 'Confirm permanent account closure. This action now bans the account, renames it to "[ Account Deleted (User ID)]", kicks active sessions, and prevents login.';
								modalCb = (t) => {
									if (t) {
										// null
										request
											.post("/user/delete", {
												userId,
											})
											.then(() => {
												window.location.reload();
											})
											.catch((err) => {
												errorMessage = err.message;
											});
									}
								};
								modalVisible = true;
							}}
						>
							Delete Account (Permanent Ban)
						</button>
					</Permission>
				{/if}
				<Permission p="NullifyPassword">
					<button
						class="btn-outline-primary btn w-100"
						on:click={(e) => {
							e.preventDefault();
							errorMessage = undefined;
							successMessage = undefined;
							modalBody = "Please confirm that you want to reset this account password to `changeme`.\n\nThis will also expire their active sessions.";
							modalCb = (t) => {
								if (t) {
									request
										.post("/user/reset-password", {
											userId,
										})
										.then(() => {
											successMessage = "Password reset to changeme and active sessions were expired.";
										})
										.catch((err) => {
											errorMessage = err.message;
										});
								}
							};
							modalVisible = true;
						}}
					>
						<LockIcon /> Reset Password
					</button>
				</Permission>
				<Permission p="DestroyAllSessionsForUser">
					<button
						class="btn-outline-primary btn w-100"
						on:click={(e) => {
							e.preventDefault();
							modalBody = "Please confirm that you want to reset all sessions for this account.";
							modalCb = (t) => {
								if (t) {
									// reset
									request
										.post("/user/logout", {
											userId,
										})
										.then(() => {})
										.catch((err) => {
											errorMessage = err.message;
										});
								}
							};
							modalVisible = true;
						}}
					>
						<XIcon /> Reset Sessions
					</button>
				</Permission>
				<Permission p="LockAccount">
					<button
						class="btn-outline-primary btn w-100"
						on:click={(e) => {
							e.preventDefault();
							modalBody = "Please confirm that you want to lock this account, making it impossible to login until they contact a staff member.";
							modalCb = (t) => {
								if (t) {
									// reset
									request
										.post("/user/lock", {
											userId,
										})
										.then(() => {})
										.catch((err) => {
											errorMessage = err.message;
										});
								}
							};
							modalVisible = true;
						}}
					>
						<SlashIcon /> Lock Account
					</button>
				</Permission>
				<Permission p="ResetUsername">
					<button
						class="btn-outline-primary btn w-100"
						on:click={(e) => {
							e.preventDefault();
							modalBody = "Please confirm that you want to reset the username of this account.";
							modalCb = (t) => {
								if (t) {
									// null
									request
										.post("/users/" + userId+"/reset-username", {})
										.then(() => {
											window.location.reload();
										})
										.catch((err) => {
											errorMessage = err.message;
										});
								}
							};
							modalVisible = true;
						}}
					>
						<UserMinusIcon /> Reset Username
					</button>
				</Permission>
				<Permission p="ResetDescription">
					<button
						class="btn-outline-primary btn w-100"
						on:click={(e) => {
							e.preventDefault();
							modalBody = "Please confirm that you want to reset the description of this account.";
							modalCb = (t) => {
								if (t) {
									// null
									request
										.post("/users/" + userId+"/reset-description", {})
										.then(() => {
											window.location.reload();
										})
										.catch((err) => {
											errorMessage = err.message;
										});
								}
							};
							modalVisible = true;
						}}
					>
						<FileTextIcon /> Reset Description
					</button>
				</Permission>
				
				{#if rank.is("owner")}
				<button
				  class="btn-outline-primary btn w-100"
				  on:click={(e) => {
					e.preventDefault();
					const actionText = info.data.verified ? "Unverify" : "Verify";
					modalBody = `Please confirm that you want to ${actionText.toLowerCase()} the player.`;
					modalCb = (t) => {
					  if (t) {
						request
						  .post(`/users/${userId}/${info.data.verified ? 'unverify' : 'verify'}-user`, {})
						  .then(() => {
							window.location.reload();
						  })
						  .catch((err) => {
							errorMessage = err.message;
						  });
					  }
					};
					modalVisible = true;
				  }}
				>
				  <UserIcon /> {info.data.verified ? "Unverify User" : "Verify User"}
				</button>
			  	{/if}
			  
				<div class="card mb-2 bg-dark">
					<div class="card-body card-header"><h4 class="mb-0">Game Actions</h4></div>
				</div>
				{#if rank.is("owner")}
					<button
					class="btn-outline-primary btn w-100"
					on:click={(e) => {
						e.preventDefault();
						modalBody = "Please confirm that you want to kick the player ";
						modalCb = (t) => {
							if (t) {
								request
									.get("/rcc/kickplayer?userId=" + userId + "&reason=Kicked by Administrator", {})
									.then(() => {
										window.location.reload();
									})
									.catch((err) => {
										errorMessage = err.message;
									});
							}
						};
						modalVisible = true;
					}}
				>
					<DatabaseIcon /> Kick player from the game
				</button>
				{/if}
				<div class="card mb-2 bg-dark">
					<div class="card-body card-header"><h4 class="mb-0">Economy Actions</h4></div>
				</div>

				{#if rank.hasPermission("GiveUserRobux")}
					<a use:link class="btn-outline-primary btn w-100" href={`/admin/manage-robux-user/${userId}`}><DollarSignIcon /> Manage Currency</a>
				{/if}
				{#if rank.hasPermission("GetUserTransactions")}
					<a use:link class="btn-outline-primary btn w-100" href={`/admin/user-transactions/${userId}`}><DollarSignIcon /> Review Transactions</a>
					<a use:link class="btn-outline-primary btn w-100" href={`/admin/user-trades/${userId}`}><DatabaseIcon /> Review Trades</a>
				{/if}
				{#if rank.hasPermission("GiveUserItem") || rank.hasPermission("RemoveUserItem")}
					<a use:link class="btn-outline-primary btn w-100" href={`/admin/manage-inventory-user/${userId}`}><ShoppingBagIcon /> Manage Inventory</a>
				{/if}
				<div class="card mb-2 bg-dark">
					<div class="card-body card-header"><h4 class="mb-0">Misc Actions</h4></div>
				</div>
				<a use:link class="btn-outline-primary btn w-100" href={`/admin/message-user/${userId}`}><MailIcon /> Send Message</a>
				
				{#if rank.hasPermission("GiveUserBadge") || rank.hasPermission("DeleteUserBadge")}
					<a use:link class="btn-outline-primary btn w-100" href={`/admin/manage-badges-user/${userId}`}><AwardIcon /> Manage Badges</a>
				{/if}

				<Permission p="DeleteUsername">
					<a use:link class="btn-outline-primary btn w-100" href={`/admin/manage-usernames/${userId}`}><MailIcon /> Manage Usernames</a>
				</Permission>
				<Permission p="CreateGameForUser">
					<button
						class="btn-outline-primary btn w-100"
						on:click={(e) => {
							e.preventDefault();
							request
								.post("/create-game", {
									userId: userId,
								})
								.then((d) => {
									window.location.href = `/games/${d.data.placeId}/--`;
								})
								.catch((e) => {
									errorMessage = e.message;
								});
						}}>Create Game</button
					>
				</Permission>
				<div class="card mb-2 bg-dark">
					<div class="card-body card-header"><h4 class="mb-0">Avatar Actions</h4></div>
				</div>
				<Permission p="RegenerateAvatar">
					<button
						class="btn-outline-primary btn w-100"
						on:click={(e) => {
							e.preventDefault();
							// regen
							request
								.post("/user/regenerate-avatar", {
									userId,
								})
								.then(() => {})
								.catch((err) => {
									errorMessage = err.message;
								});
						}}
					>
						<RefreshCwIcon /> Regen Avatar
					</button>
				</Permission>
				<Permission p="ResetAvatar">
					<button
						class="btn-outline-primary btn w-100"
						on:click={(e) => {
							e.preventDefault();
							// regen
							request
								.post("/user/reset-avatar", {
									userId,
								})
								.then(() => {})
								.catch((err) => {
									errorMessage = err.message;
								});
						}}
					>
						<UserIcon /> Set Avatar to Default
					</button>
				</Permission>
			</div>
		</div>
	{:catch e}
		<div class="row">
			<div class="col-12 text-center">
				<p>Something went wrong. Try refreshing this page.</p>
			</div>
		</div>
	{/await}
</Main>
