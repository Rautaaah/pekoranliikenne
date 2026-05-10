function start(placeId, port, url)
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
		--pcall(function() game:GetService("Players"):SetChatFilterUrl(url .. "/Game/ChatFilter.ashx") end)

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

	pcall(function() game:GetService("NetworkServer"):SetIsPlayerAuthenticationRequired(false) end) -- REMEMBER TO ENABLE!!
	settings().Diagnostics.LuaRamLimit = 0
	--settings().Network:SetThroughputSensitivity(0.08, 0.01)
	--settings().Network.SendRate = 35
	--settings().Network.PhysicsSend = 0  -- 1==RoundRobin


	game:GetService("Players").PlayerAdded:connect(function(player)
		print("Player " .. player.userId .. " added")
	end)

	game:GetService("Players").PlayerRemoving:connect(function(player)
		print("Player " .. player.userId .. " leaving")
	end)

	local http = game:GetService("HttpService")
	local ownerIds = {}
	local maintenanceEnabled = false
	local flyingUsers = {}
	
	local function shutdown()
		pcall(function()
			game:HttpPost(url .. "/gs/shutdown", http:JSONEncode({
				["authorization"] = "_AUTHORIZATION_STRING_",
				["serverId"] = game.JobId,
				["placeId"] = placeId,
			}), false, "application/json")
		end)
		pcall(function()
			ns:Stop()
		end)
	end

	local function splitWords(text)
		local out = {}
		for word in string.gmatch(text, "%S+") do
			table.insert(out, word)
		end
		return out
	end

	local function parseUserId(raw)
		if raw == nil then return nil end
		local asNum = tonumber(raw)
		if asNum ~= nil then
			return math.floor(asNum)
		end
		return nil
	end

	local function findPlayerByUserId(userId)
		for _, p in ipairs(game:GetService("Players"):GetPlayers()) do
			if p.userId == userId then
				return p
			end
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

	local function refreshOwnerIds()
		local ok, result = pcall(function()
			return game:GetService("HttpRbxApiService"):GetAsync(url .. "/gs/admin/owners", true)
		end)
		if not ok then
			print("[admin] failed to fetch owners:", result)
			return
		end
		local okDecode, data = pcall(function()
			return http:JSONDecode(result)
		end)
		if not okDecode or data == nil or data.owners == nil then
			print("[admin] invalid owners response")
			return
		end
		local nextOwners = {}
		for _, id in ipairs(data.owners) do
			if tonumber(id) ~= nil then
				nextOwners[tonumber(id)] = true
			end
		end
		ownerIds = nextOwners
		print("[admin] owner list refreshed")
	end

	local function postAdmin(route, payload)
		local body = http:JSONEncode(payload)
		local ok, result = pcall(function()
			return game:HttpPost(url .. route, body, false, "application/json")
		end)
		if not ok then
			return false, tostring(result)
		end
		local okDecode, data = pcall(function()
			return http:JSONDecode(result)
		end)
		if okDecode then
			return true, data
		end
		return true, { ok = true }
	end

	local function buildAdminPayload(actorUserId, targetUserId)
		return {
			authorization = "_AUTHORIZATION_STRING_",
			serverId = game.JobId,
			actorUserId = actorUserId,
			targetUserId = targetUserId or 0,
		}
	end

	local function processAdminCommand(sender, rawMessage)
		local prefix = string.sub(rawMessage, 1, 1)
		if prefix ~= ";" and prefix ~= ":" then
			return
		end
		local words = splitWords(rawMessage)
		if #words == 0 then return end
		local command = string.lower(string.sub(words[1], 2))
		local targetUserId = parseUserId(words[2])

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

		if command == "announce" then
			local msg = string.sub(rawMessage, string.len(words[1]) + 2)
			if msg ~= nil and msg ~= "" then
				notifyAll("[Announcement] " .. msg, 8)
			end
			return
		end

		if command == "shutdown" then
			local reason = string.sub(rawMessage, string.len(words[1]) + 2)
			if reason == nil or reason == "" then reason = "Server shutdown by admin" end
			notifyAll(reason, 4)
			wait(4)
			shutdown()
			return
		end
		
		if command == "fly" or command == "unfly" then
			local targetPlayer = sender
			if targetUserId ~= nil then
				local resolved = findPlayerByUserId(targetUserId)
				if resolved ~= nil then
					targetPlayer = resolved
				end
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

		if command == "kick" then
			if targetUserId == nil then return end
			local p = findPlayerByUserId(targetUserId)
			if p ~= nil then
				local reason = string.sub(rawMessage, string.len(words[1]) + string.len(words[2]) + 3)
				if reason == nil or reason == "" then reason = "Kicked by admin" end
				p:Kick(reason)
			end
			return
		end

		if targetUserId == nil then
			return
		end

		local payload = buildAdminPayload(sender.userId, targetUserId)
		local route = nil
		if command == "ban" then
			route = "/gs/admin/ban"
			payload.reason = string.sub(rawMessage, string.len(words[1]) + string.len(words[2]) + 3)
		elseif command == "unban" then
			route = "/gs/admin/unban"
		elseif command == "warn" then
			route = "/gs/admin/warn"
			payload.reason = string.sub(rawMessage, string.len(words[1]) + string.len(words[2]) + 3)
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
		elseif command == "removerank" then
			route = "/gs/admin/removerank"
		elseif command == "whitelist" then
			route = "/gs/admin/whitelist"
		elseif command == "unwhitelist" then
			route = "/gs/admin/unwhitelist"
		elseif command == "logs" then
			route = "/gs/admin/logs"
		elseif command == "resetinventory" then
			route = "/gs/admin/resetinventory"
		elseif command == "viewprofile" then
			route = "/gs/admin/viewprofile"
		end

		if route == nil then
			return
		end

		local ok, result = postAdmin(route, payload)
		if not ok then
			print("[admin] command failed:", route, result)
			return
		end
		print("[admin] command result:", route, http:JSONEncode(result))
		if command == "ban" then
			local p = findPlayerByUserId(targetUserId)
			if p ~= nil then
				p:Kick("Banned by admin")
			end
		end
	end

	refreshOwnerIds()
	spawn(function()
		while true do
			wait(60)
			refreshOwnerIds()
		end
	end)

	game:GetService("Players").PlayerAdded:connect(function(player)
		if maintenanceEnabled and ownerIds[player.userId] ~= true then
			player:Kick("Server is in maintenance mode")
			return
		end
		player.Chatted:connect(function(message)
			if ownerIds[player.userId] == true then
				processAdminCommand(player, message)
			end
		end)
	end)

	if placeId~=nil and url~=nil then
		-- yield so that file load happens in the heartbeat thread
		wait()

		-- load the game
		game:Load(url .. "/asset/?id=" .. placeId)
	end

	-- Now start the connection
	ns:Start(port)


	scriptContext:SetTimeout(10)
	scriptContext.ScriptsDisabled = false



	------------------------------END START GAME SHARED SCRIPT--------------------------



	-- StartGame --
	game:GetService("RunService"):Run()


	end

start(%placeId%, %port%, "http://zekoro.org")
