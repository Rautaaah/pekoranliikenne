print("[info] gameserver.txt start")
local serverOk = false;
local http = game:GetService("HttpService");
http.HttpEnabled = false;

-- begin dynamiclly edited
local url = "http://zekoro.org";
local port = %port%;
local placeId = %placeId%;
local creatorType = Enum.CreatorType.User;
local creatorId = %creatorId%;
local placeVersionId = 0;
local vipServerOwnerId = 0;
local isDebugServer = false;
-- end dyanmically edited

-- Loaded by StartGameSharedScript --
pcall(function() game:SetCreatorID(creatorId, creatorType) end)
--[[
	-- TODO: something is fucking up our strings when we try to use try to call SetUrl()
pcall(function() game:GetService("SocialService"):SetFriendUrl(url .. "/Game/LuaWebService/HandleSocialRequest.ashx?method=IsFriendsWith&playerid=%d&userid=%d") end)
pcall(function() game:GetService("SocialService"):SetBestFriendUrl(url .. "/Game/LuaWebService/HandleSocialRequest.ashx?method=IsBestFriendsWith&playerid=%d&userid=%d") end)
pcall(function() game:GetService("SocialService"):SetGroupUrl(url .. "/Game/LuaWebService/HandleSocialRequest.ashx?method=IsInGroup&playerid=%d&groupid=%d") end)
pcall(function() game:GetService("SocialService"):SetGroupRankUrl(url .. "/Game/LuaWebService/HandleSocialRequest.ashx?method=GetGroupRank&playerid=%d&groupid=%d") end)
pcall(function() game:GetService("SocialService"):SetGroupRoleUrl(url .. "/Game/LuaWebService/HandleSocialRequest.ashx?method=GetGroupRole&playerid=%d&groupid=%d") end)
pcall(function() game:GetService("GamePassService"):SetPlayerHasPassUrl(url .. "/Game/GamePass/GamePassHandler.ashx?Action=HasPass&UserID=%d&PassID=%d") end)
pcall(function() game:GetService("MarketplaceService"):SetProductInfoUrl(url .. "/api/marketplace/productinfo?assetId=%d") end)
pcall(function() game:GetService("MarketplaceService"):SetDevProductInfoUrl(url .. "/api/marketplace/productDetails?productId=%d") end)
pcall(function() game:GetService("MarketplaceService"):SetPlayerOwnsAssetUrl(url .. "/api/ownership/hasasset?userId=%d&assetId=%d") end)
pcall(function() game:SetPlaceVersion(placeVersionId) end)
pcall(function() game:SetVIPServerOwnerId(vipServerOwnerId) end)
]]--

------------------- UTILITY FUNCTIONS --------------------------


function waitForChild(parent, childName)
	while true do
		local child = parent:findFirstChild(childName)
		if child then
			return child
		end
		parent.ChildAdded:wait()
	end
end

-----------------------------------END UTILITY FUNCTIONS -------------------------
	print("wait for run service...");
    -- Prevent server script from running in Studio when not in run mode
    local runService = nil
    while runService == nil do
        wait(0.1)
        runService = game:GetService('RunService')
    end
	print("run service is running!");

    --[[ Services ]]--
    local RobloxReplicatedStorage = game:GetService('RobloxReplicatedStorage')
    local ScriptContext = game:GetService('ScriptContext')

    --[[ Fast Flags ]]--
    local serverFollowersSuccess, serverFollowersEnabled = pcall(function() return settings():GetFFlag("UserServerFollowers") end)
    local IsServerFollowers = serverFollowersSuccess and serverFollowersEnabled

    local RemoteEvent_NewFollower = nil

    --[[ Add Server CoreScript ]]--
    -- TODO: FFlag check
    if IsServerFollowers then
        ScriptContext:AddCoreScriptLocal("ServerCoreScripts/ServerSocialScript", script.Parent)
    else
        -- above script will create this now
        RemoteEvent_NewFollower = Instance.new('RemoteEvent')
        RemoteEvent_NewFollower.Name = "NewFollower"
        RemoteEvent_NewFollower.Parent = RobloxReplicatedStorage
    end

    --[[ Remote Events ]]--
    local RemoteEvent_SetDialogInUse = Instance.new("RemoteEvent")
    RemoteEvent_SetDialogInUse.Name = "SetDialogInUse"
    RemoteEvent_SetDialogInUse.Parent = RobloxReplicatedStorage

    --[[ Event Connections ]]--
    -- Params:
        -- followerRbxPlayer: player object of the new follower, this is the client who wants to follow another
        -- followedRbxPlayer: player object of the person being followed
    local function onNewFollower(followerRbxPlayer, followedRbxPlayer)
        RemoteEvent_NewFollower:FireClient(followedRbxPlayer, followerRbxPlayer)
    end
    if RemoteEvent_NewFollower then
        RemoteEvent_NewFollower.OnServerEvent:connect(onNewFollower)
    end

    local function setDialogInUse(player, dialog, value)
        if dialog ~= nil then
            dialog.InUse = value
        end
    end
    RemoteEvent_SetDialogInUse.OnServerEvent:connect(setDialogInUse)

-----------------------------------"CUSTOM" SHARED CODE----------------------------------

pcall(function() settings().Network.UseInstancePacketCache = true end)
pcall(function() settings().Network.UsePhysicsPacketCache = true end)
--pcall(function() settings()["Task Scheduler"].PriorityMethod = Enum.PriorityMethod.FIFO end)
pcall(function() settings()["Task Scheduler"].PriorityMethod = Enum.PriorityMethod.AccumulatedError end)

--settings().Network.PhysicsSend = 1 -- 1==RoundRobin
--settings().Network.PhysicsSend = Enum.PhysicsSendMethod.ErrorComputation2
settings().Network.PhysicsSend = Enum.PhysicsSendMethod.TopNErrors
settings().Network.ExperimentalPhysicsEnabled = true
settings().Network.WaitingForCharacterLogRate = 100
pcall(function() settings().Diagnostics:LegacyScriptMode() end)

-----------------------------------START GAME SHARED SCRIPT------------------------------

local assetId = placeId -- might be able to remove this now

local scriptContext = game:GetService('ScriptContext')
pcall(function() scriptContext:AddStarterScript(37801172) end)
scriptContext.ScriptsDisabled = true

game:SetPlaceID(assetId, false)
game:GetService("ChangeHistoryService"):SetEnabled(false)

-- establish this peer as the Server
local ns = game:GetService("NetworkServer")

if url~=nil then
	pcall(function() game:GetService("Players"):SetAbuseReportUrl(url .. "/AbuseReport/InGameChatHandler.ashx") end)
	pcall(function() game:GetService("ScriptInformationProvider"):SetAssetUrl(url .. "/Asset/") end)
	pcall(function() game:GetService("ContentProvider"):SetBaseUrl(url .. "/") end)
	--pcall(function() game:GetService("Players"):SetChatFilterUrl(url .. "/moderation/filtertext/") end)

	game:GetService("BadgeService"):SetPlaceId(placeId)

	game:GetService("BadgeService"):SetIsBadgeLegalUrl("")
	game:GetService("InsertService"):SetBaseSetsUrl(url .. "/Game/Tools/InsertAsset.ashx?nsets=10&type=base")
	game:GetService("InsertService"):SetUserSetsUrl(url .. "/Game/Tools/InsertAsset.ashx?nsets=20&type=user&userid=%d")
	game:GetService("InsertService"):SetCollectionUrl(url .. "/Game/Tools/InsertAsset.ashx?sid=%d")
	game:GetService("InsertService"):SetAssetUrl(url .. "/Asset/?id=%d")
	game:GetService("InsertService"):SetAssetVersionUrl(url .. "/Asset/?assetversionid=%d")

	pcall(function() loadfile(url .. "/Game/LoadPlaceInfo.ashx?PlaceId=" .. placeId)() end)

	-- pcall(function()
	--			if access then
	--				loadfile(url .. "/Game/PlaceSpecificScript.ashx?PlaceId=" .. placeId .. "&" .. access)()
	--			end
	--		end)
end

pcall(function() game:GetService("NetworkServer"):SetIsPlayerAuthenticationRequired(true) end)
settings().Diagnostics.LuaRamLimit = 0
--settings().Network:SetThroughputSensitivity(0.08, 0.01)
--settings().Network.SendRate = 35
--settings().Network.PhysicsSend = 0  -- 1==RoundRobin

local function reportPlayerEvent(userId, t)
    -- wrapped in pcall to prevent keys spilling in error logs
	local ok, msg = pcall(function()
		local msg = http:JSONEncode({
			["authorization"] = "_AUTHORIZATION_STRING_",
			["serverId"] = game.JobId,
			["userId"] = tostring(userId),
			["eventType"] = t,
			["placeId"] = tostring(placeId),
		})
		-- print("sending",msg)
		game:HttpPost(url .. "/gs/players/report", msg, false, "application/json");
	end)
	-- print("player event",ok,msg)
end

print("[info] jobId is", game.JobId);

function CalculateAveragePing()
	local totalPing = 0
	local replicatorCount = 0
	local averagePing = 0
	local status, err = pcall(function()
		for _, r in ipairs(stats().Network:GetChildren()) do
			if r.Name ~= "Packets Thread" then
				r:GetValue() -- hax
				totalPing = totalPing + r.Ping:GetValue()
				replicatorCount = replicatorCount + 1
			end
		end
		if replicatorCount > 0 then
			averagePing = totalPing / replicatorCount
		end
	end)
	if (not status) then
		PrintDebugMessage("CalculateAveragePing error = " .. err)
	end
	return averagePing
end

local function pollToReportActivity()
	local ping = CalculateAveragePing()
	local function sendPing()
		game:HttpPost(url .. "/gs/ping", http:JSONEncode({
			["authorization"] = "_AUTHORIZATION_STRING_",
			["serverId"] = game.JobId,
			["ping"] = ping,
			["placeId"] = placeId,
		}), false, "application/json");
	end
	while serverOk do
		local ok, data = pcall(function()
			sendPing();
		end)
		--print("[info] poll resp", ok, data)
		wait(5)
	end
	print("Server is no longer ok. Activity is not being reported. Will die soon.")
end
local playersJoin = 0;

local function shutdown()
	print("[info] shut down server")
	if isDebugServer then
		print("Would shut down, but this is a debug server, so shutdown is disabled")
		return
	end
	pcall(function()
		game:HttpPost(url .. "/gs/shutdown", http:JSONEncode({
			["authorization"] = "_AUTHORIZATION_STRING_",
			["serverId"] = game.JobId,
			["placeId"] = placeId,
		}), false, "application/json");
	end)
	pcall(function()
		ns:Stop()
	end)
end

local adminsList = nil
local maintenanceEnabled = false
local flyingUsers = {}
spawn(function()
	local ok, newList = pcall(function()
		local result = game:GetService('HttpRbxApiService'):GetAsync(url .. "/gs/admin/owners", true)
		return game:GetService('HttpService'):JSONDecode(result)
	end)
	if not ok then
		print("GetStaff failed because",newList)
		return
	end
	pcall(function()
		adminsList = {}
		for i,v in ipairs(newList.owners or {}) do
			adminsList[v] = true
		end
	end)
end)

local bannedIds = {}

local function splitWords(text)
	local out = {}
	for word in string.gmatch(text, "%S+") do
		table.insert(out, word)
	end
	return out
end

local function parseUserId(raw)
	if raw == nil then return nil end
	local n = tonumber(raw)
	if n == nil then return nil end
	return math.floor(n)
end

local function findPlayerByUserId(userId)
	for _, p in ipairs(game:GetService("Players"):GetPlayers()) do
		if p.userId == userId then return p end
	end
	return nil
end

local function notifyAll(message, seconds)
	seconds = seconds or 5
	local hint = Instance.new("Hint")
	hint.Text = tostring(message)
	hint.Parent = game:GetService("Workspace")
	delay(seconds, function()
		pcall(function() hint:Destroy() end)
	end)
end

local function postAdmin(route, payload)
	local body = game:GetService("HttpService"):JSONEncode(payload)
	local ok, result = pcall(function()
		return game:HttpPost(url .. route, body, false, "application/json")
	end)
	if not ok then return false, tostring(result) end
	local okDecode, data = pcall(function()
		return game:GetService("HttpService"):JSONDecode(result)
	end)
	if okDecode then return true, data end
	return true, { ok = true }
end

local function processModCommand(sender, message)
	local prefix = string.sub(message, 1, 1)
	if prefix ~= ";" and prefix ~= ":" then
		return
	end
	local words = splitWords(message)
	if #words == 0 then return end
	local command = string.lower(string.sub(words[1], 2))
	local targetUserId = parseUserId(words[2])

	if command == "announce" then
		local msg = string.sub(message, string.len(words[1]) + 2)
		if msg and msg ~= "" then notifyAll("[Announcement] " .. msg, 8) end
		return
	end
	if command == "shutdown" then
		local reason = string.sub(message, string.len(words[1]) + 2)
		if reason == nil or reason == "" then reason = "Server shutdown by admin" end
		notifyAll(reason, 4)
		wait(4)
		shutdown()
		return
	end
	if command == "maintenance" then
		local arg = string.lower(words[2] or "")
		if arg == "on" then
			maintenanceEnabled = true
			notifyAll("Maintenance mode enabled")
		elseif arg == "off" then
			maintenanceEnabled = false
			notifyAll("Maintenance mode disabled")
		end
		return
	end
	if command == "fly" or command == "unfly" then
		local targetPlayer = sender
		if targetUserId ~= nil then
			local resolved = findPlayerByUserId(targetUserId)
			if resolved ~= nil then targetPlayer = resolved end
		end
		if targetPlayer and targetPlayer.Character and targetPlayer.Character:FindFirstChild("Humanoid") then
			local humanoid = targetPlayer.Character.Humanoid
			if command == "fly" then
				humanoid.PlatformStand = false
				humanoid:ChangeState(Enum.HumanoidStateType.Swimming)
				pcall(function() targetPlayer.Character.HumanoidRootPart.Velocity = Vector3.new(0, 75, 0) end)
				flyingUsers[targetPlayer.userId] = true
				notifyAll(targetPlayer.Name .. " is now flying", 3)
			else
				flyingUsers[targetPlayer.userId] = nil
				pcall(function() targetPlayer.Character.HumanoidRootPart.Velocity = Vector3.new(0, 0, 0) end)
				notifyAll(targetPlayer.Name .. " flight disabled", 3)
			end
		end
		return
	end
	if command == "kick" and targetUserId ~= nil then
		local p = findPlayerByUserId(targetUserId)
		if p ~= nil then
			local reason = string.sub(message, string.len(words[1]) + string.len(words[2]) + 3)
			if reason == nil or reason == "" then reason = "Kicked by admin" end
			p:Kick(reason)
		end
		return
	end
	if targetUserId == nil then return end

	local payload = {
		authorization = "_AUTHORIZATION_STRING_",
		serverId = game.JobId,
		actorUserId = sender.userId,
		targetUserId = targetUserId,
	}
	local route = nil
	if command == "ban" then
		route = "/gs/admin/ban"
		payload.reason = string.sub(message, string.len(words[1]) + string.len(words[2]) + 3)
	elseif command == "unban" then
		route = "/gs/admin/unban"
	elseif command == "warn" then
		route = "/gs/admin/warn"
		payload.reason = string.sub(message, string.len(words[1]) + string.len(words[2]) + 3)
	elseif command == "giveitem" then
		route = "/gs/admin/giveitem"
		payload.assetId = parseUserId(words[3]) or 0
	elseif command == "removeitem" then
		route = "/gs/admin/removeitem"
		payload.assetId = parseUserId(words[3]) or 0
	elseif command == "givecurrency" then
		route = "/gs/admin/givecurrency"
		payload.amount = parseUserId(words[3]) or 0
		payload.currency = "robux"
	elseif command == "removecurrency" then
		route = "/gs/admin/removecurrency"
		payload.amount = parseUserId(words[3]) or 0
		payload.currency = "robux"
	elseif command == "setrank" then
		route = "/gs/admin/setrank"
		payload.rank = words[3] or ""
	elseif command == "logs" then
		route = "/gs/admin/logs"
	elseif command == "resetinventory" then
		route = "/gs/admin/resetinventory"
	end
	if route == nil then return end
	local okRes, result = postAdmin(route, payload)
	if okRes then
		print("[admin] command result", route, game:GetService("HttpService"):JSONEncode(result))
	else
		print("[admin] command failed", route, result)
	end
	if command == "ban" then
		local p = findPlayerByUserId(targetUserId)
		if p ~= nil then p:Kick("Banned by admin") end
	end
end

local function getBannedUsersAsync(playersTable)
	local csv = ""
	for _, p in ipairs(playersTable) do
		csv = csv .. "," .. tostring(p.userId)
	end
	if csv == "" then return end
	csv = string.sub(csv, 2)

	local url = "Users/GetBanStatus.ashx?userIds=" .. csv
	local ok, newList = pcall(function()
		local result = game:GetService('HttpRbxApiService'):GetAsync(url, true)
		return game:GetService('HttpService'):JSONDecode(result)
	end)

	if not ok then
		print("getBannedUsersAsync failed because",newList)
		return
	end

	local ok, banProcErr = pcall(function()
		for _, entry in ipairs(newList) do
			if entry.isBanned then
				local inGame = game:GetService("Players"):GetPlayerByUserId(entry.userId)
				if inGame ~= nil then
					inGame:Kick("Account restriction. Visit our website for more information.")
				end
			end
		end
	end)
	if not ok then
		print("[error] could not process ban result",banProcErr)
	end
end
local hasNoPlayerCount = 0
spawn(function()
	while true do
		wait(30)
		print("Checking banned players...")
		if #game:GetService("Players"):GetPlayers() == 0 then
			print("[warn] no players. m=",hasNoPlayerCount)
			serverOk = false
			hasNoPlayerCount = hasNoPlayerCount + 1
		else
			print("game has players, reset mod")
			hasNoPlayerCount = 0
		end
		if hasNoPlayerCount >= 3 then
			local currentPlayers = #game:GetService("Players"):GetPlayers()
			if currentPlayers == 0 then
				print("Server has had no players for over 1.5m, attempt shutdown")
				pcall(function()
					shutdown()
				end)
			else
				print("[info] skipped idle shutdown because players are connected:", currentPlayers)
				hasNoPlayerCount = 0
			end
		end
		getBannedUsersAsync(game:GetService("Players"):GetPlayers())
	end
end)

game:GetService("Players").PlayerAdded:connect(function(player)
	playersJoin = playersJoin + 1;
	print("Player " .. player.userId .. " added")
    reportPlayerEvent(player.userId, "Join")

	if bannedIds[player.userId] ~= nil then
		player:Kick("Banned from this server by an administrator")
		return
	end
	if maintenanceEnabled and (adminsList == nil or adminsList[player.userId] ~= true) then
		player:Kick("Server is in maintenance mode")
		return
	end

	player.Chatted:connect(function(message)
		if adminsList ~= nil and adminsList[player.userId] ~= nil then
			print("is an admin",player)
			processModCommand(player, message)
		end
	end)
end)

game:GetService("Players").PlayerRemoving:connect(function(player)
	print("Player " .. player.userId .. " leaving")
    reportPlayerEvent(player.userId, "Leave")
	local pCount = #game:GetService("Players"):GetPlayers();
	if pCount == 0 then
		shutdown();
	end
end)

if placeId~=nil and url~=nil then
	-- yield so that file load happens in the heartbeat thread
	wait()

	-- load the game
	game:Load(url .. "/asset/?id=" .. placeId)
end

-- initCharPositionHack()

-- Now start the connection
ns:Start(port)

scriptContext:SetTimeout(10)
scriptContext.ScriptsDisabled = false



------------------------------END START GAME SHARED SCRIPT--------------------------



-- StartGame --
game:GetService("RunService"):Run()

serverOk = true;
coroutine.wrap(function()
	pollToReportActivity()
end)()
-- kill server if nobody joins within 2m of creation
delay(120, function()
	if playersJoin == 0 then
		serverOk = false
		shutdown();
	end
end)

print("[info] gameserver.txt end");
