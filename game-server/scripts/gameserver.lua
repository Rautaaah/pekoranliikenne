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
	pcall(function() game:GetService("Players"):SetChatFilterUrl(url .. "/Game/ChatFilter.ashx") end)

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

--pcall(function() game:GetService("NetworkServer"):SetIsPlayerAuthenticationRequired(true) end)
settings().Diagnostics.LuaRamLimit = 0
--settings().Network:SetThroughputSensitivity(0.08, 0.01)
--settings().Network.SendRate = 35
--settings().Network.PhysicsSend = 0  -- 1==RoundRobin

local HttpService = game:GetService("HttpService")
local Players = game:GetService("Players")
local verifiedUsers = {}
local verifiedLoaded = false
local verifiedLoading = false

local VERIFIED_PREFIX = "\226\156\147 "

local function buildVerifiedBadge()
	local gui = Instance.new("BillboardGui")
	gui.Name = "VerifiedBadge"
	gui.AlwaysOnTop = true
	gui.Size = UDim2.new(0, 24, 0, 24)
	gui.StudsOffset = Vector3.new(0.9, 2.6, 0)

	local bg = Instance.new("ImageLabel")
	bg.Name = "Bg"
	bg.BackgroundTransparency = 1
	bg.Size = UDim2.new(1, 0, 1, 0)
	bg.Image = "rbxasset://textures/whiteCircle.png"
	bg.ImageColor3 = Color3.new(31/255, 130/255, 224/255)
	bg.Parent = gui

	local check = Instance.new("TextLabel")
	check.Name = "Check"
	check.BackgroundTransparency = 1
	check.Size = UDim2.new(1, 0, 1, 0)
	check.Position = UDim2.new(0, 0, 0, -1)
	check.Text = "\226\156\147"
	check.TextColor3 = Color3.new(1, 1, 1)
	check.Font = Enum.Font.SourceSansBold
	check.TextScaled = true
	check.TextStrokeTransparency = 0.7
	check.Parent = gui

	return gui
end

local function attachVerifiedBadge(character)
	if character == nil then return end
	local head = character:FindFirstChild("Head")
	if head == nil then
		local startedAt = tick()
		while head == nil and (tick() - startedAt) < 5 do
			wait(0.1)
			head = character:FindFirstChild("Head")
		end
	end
	if head == nil then return end
	if head:FindFirstChild("VerifiedBadge") ~= nil then return end
	local badge = buildVerifiedBadge()
	badge.Parent = head
end

local function applyVerified(player)
	pcall(function()
		player:SetAttribute("IsVerified", true)
	end)
	pcall(function()
		local current = player.DisplayName
		if current == nil or current == "" then current = player.Name end
		if string.sub(current, 1, #VERIFIED_PREFIX) ~= VERIFIED_PREFIX then
			player.DisplayName = VERIFIED_PREFIX .. current
		end
	end)
	pcall(function()
		if player.Character then attachVerifiedBadge(player.Character) end
	end)
	pcall(function()
		player.CharacterAdded:connect(function(character)
			attachVerifiedBadge(character)
		end)
	end)
end

local function loadVerifiedUsers()
	if verifiedLoaded or verifiedLoading then return end
	verifiedLoading = true
	local ok, result = pcall(function()
		return game:GetService('HttpRbxApiService'):GetAsync("Users/ListStaff.ashx", true)
	end)
	if ok then
		local okDecode, data = pcall(function()
			return HttpService:JSONDecode(result)
		end)
		if okDecode and data then
			for _, id in ipairs(data) do
				local n = tonumber(id)
				if n then verifiedUsers[n] = true end
			end
		end
	else
		print("[verified] failed to fetch list:", result)
	end
	verifiedLoaded = true
	verifiedLoading = false
	for _, p in ipairs(Players:GetPlayers()) do
		if verifiedUsers[p.userId] then
			applyVerified(p)
		end
	end
end

spawn(function()
	wait(1)
	pcall(loadVerifiedUsers)
end)

game:GetService("Players").PlayerAdded:connect(function(player)
	print("Player " .. player.userId .. " added")
	pcall(function()
		player:SetAttribute("IsVerified", false)
	end)
	if verifiedUsers[player.userId] then
		applyVerified(player)
	end
end)

game:GetService("Players").PlayerRemoving:connect(function(player)
	print("Player " .. player.userId .. " leaving")
end)

if placeId~=nil and url~=nil then
	-- yield so that file load happens in the heartbeat thread
	wait()
	
	-- load the game
	game:Load(url .. "/asset/?id=" .. placeId)
end

-- Now start the connection
print(port)
ns:Start(port) 


scriptContext:SetTimeout(10)
scriptContext.ScriptsDisabled = false



------------------------------END START GAME SHARED SCRIPT--------------------------



-- StartGame -- 
game:GetService("RunService"):Run()


end
