const SteamUser = require("steam-user");
const SteamTotp = require("steam-totp");
const fs = require("fs");
const request = require("request");
const demofile = require("demofile");
const bz2 = require("unbzip2-stream");
const SteamID = require("steamid");

const Aimbot = require("./detectors/aimbot.js");
const AFKing = require("./detectors/AFKing.js");
const Wallhack = require("./detectors/wallhack.js");

const Helper = require("./helpers/Helper.js");
const GameCoordinator = require("./helpers/GameCoordinator.js");
const config = require("./config.json");

const telebot = require("node-telegram-bot-api");
const token = config.telegram.token;
const chatid = config.telegram.chatid;
const bot = new telebot(token)
const steamUser = new SteamUser();
let csgoUser = undefined;

/*
process.on("unhandledRejection", (reason, promise) => {
	console.error("A request failed to run. Github, Telegram, Steam or CSGO might currently be offline. Logging out...");
    bot.sendMessage(chatid, "A request failed to run. Github, Telegram, Steam or CSGO might currently be offline. Logging out...")
	// The process should exit automatically once Steam has successfully logged off
	steamUser.logOff();
});
*/
let data = {
	casesCompleted: 0,
	total: {
		startTimestamp: 0,
		endTimestamp: 0
	},
	download: {
		startTimestamp: 0,
		endTimestamp: 0
	},
	unpacking: {
		startTimestamp: 0,
		endTimestamp: 0
	},
	parsing: {
		startTimestamp: 0,
		endTimestamp: 0
	},
	curcasetempdata: {
		sid: undefined,
		owMsg: undefined,
		wasAlreadyConvicted: false,
		aimbot_infractions: [],
		AFKing_infractions: [],
		Wallhack_infractions: []
	},
	owndata: {
		steamid64: 0,
		aimbotconvict: false, 
		wallhackconvict: false,
		afkconvict: false
	}
};

let logonSettings = {
	accountName: config.account.username,
	password: config.account.password
};

if (config.account.sharedSecret && config.account.sharedSecret.length > 5) {
	logonSettings.twoFactorCode = SteamTotp.getAuthCode(config.account.sharedSecret);
}

function ms2readable(millis) {
	var minutes = Math.floor(millis / 60000);
	var seconds = ((millis % 60000) / 1000).toFixed(0);
	return (seconds == 60 ? (minutes+1) + ":00" : minutes + ":" + (seconds < 10 ? "0" : "") + seconds);
}

steamUser.logOn(logonSettings);

steamUser.on("loggedOn", async () => {
	console.log("Successfully logged into " + steamUser.steamID.toString());
	steam_persona = config.account.steam_persona;
	if (steam_persona == "Offline") {
		steamUser.setPersona(SteamUser.EPersonaState.Offline);
	}
	else if (steam_persona == "Online") {
		steamUser.setPersona(SteamUser.EPersonaState.Online);
	}
	else if (steam_persona == "Busy") {
		steamUser.setPersona(SteamUser.EPersonaState.Busy);
	}
	else if (steam_persona == "Away") {
		steamUser.setPersona(SteamUser.EPersonaState.Away);
	}
	else if (steam_persona == "Snooze") {
		steamUser.setPersona(SteamUser.EPersonaState.Snooze);
	}
	else if (steam_persona == "LookingToTrade") {
		steamUser.setPersona(SteamUser.EPersonaState.LookingToTrade);
	}
	else if (steam_persona == "LookingToPlay") {
		steamUser.setPersona(SteamUser.EPersonaState.LookingToPlay);
	}
	else if (steam_persona == "Invisible") {
		steamUser.setPersona(SteamUser.EPersonaState.Invisible);
	}
	else {
		steamUser.setPersona(SteamUser.EPersonaState.Offline);
	}
	
	console.log("Checking protobufs...");
	let foundProtobufs = Helper.verifyProtobufs();
	if (foundProtobufs) {
		console.log("Found protobufs");
	} else {
		console.log("Failed to find protobufs, downloading and extracting...");
		await Helper.downloadProtobufs(__dirname);
	}

	csgoUser = new GameCoordinator(steamUser);

	console.log("Checking for updates...");

	try {
		let package = JSON.parse(fs.readFileSync("./package.json"));
		let res = await Helper.GetLatestVersion().catch(console.error);

		if (package.version !== res) {
			let repoURL = package.repository.url.split(".");
			repoURL.pop();
			console.log("A new version is available on Github @ " + repoURL.join("."));
			console.log("Downloading is optional but recommended. Make sure to check if there are any new values to be added in your old \"config.json\"");
		} else {
			console.log("Up to date!");
		}
	} catch (e) {
		console.log("Failed to check for updates");
	}

	console.log("Establishing CSGO GameCoordinator connection...");
	steamUser.gamesPlayed([730]);
	await csgoUser.start();

	let lang = (await Helper.DownloadLanguage("csgo_english.txt")).lang;

	let mmHello = await csgoUser.sendMessage(
		730,
		csgoUser.Protos.csgo.ECsgoGCMsg.k_EMsgGCCStrike15_v2_MatchmakingClient2GCHello,
		{},
		csgoUser.Protos.csgo.CMsgGCCStrike15_v2_MatchmakingClient2GCHello,
		{},
		csgoUser.Protos.csgo.ECsgoGCMsg.k_EMsgGCCStrike15_v2_MatchmakingGC2ClientHello,
		csgoUser.Protos.csgo.CMsgGCCStrike15_v2_MatchmakingGC2ClientHello,
		30000
	);

	let rank = mmHello.ranking;
	if (rank.rank_type_id !== 6) {
		rank = await csgoUser.sendMessage(
			730,
			csgoUser.Protos.csgo.ECsgoGCMsg.k_EMsgGCCStrike15_v2_ClientGCRankUpdate,
			{},
			csgoUser.Protos.csgo.CMsgGCCStrike15_v2_ClientGCRankUpdate,
			{
				rankings: {
					rank_type_id: 6
				}
			},
			csgoUser.Protos.csgo.ECsgoGCMsg.k_EMsgGCCStrike15_v2_ClientGCRankUpdate,
			csgoUser.Protos.csgo.CMsgGCCStrike15_v2_ClientGCRankUpdate,
			30000
		);

		rank = rank.rankings[0];
	}

	steam_name = steamUser.accountInfo.name;
	console.log("[" + steam_name + "] Rank: " + lang.Tokens["skillgroup_" + rank.rank_id] + " | " + rank.wins + " Win" + (rank.wins === 1 ? "" : "s"));
	bot.sendMessage(chatid, "[" + steam_name + "] Rank: " + lang.Tokens["skillgroup_" + rank.rank_id] + " | " + rank.wins + " Win" + (rank.wins === 1 ? "" : "s" + "\nPersona set to: " + steam_persona));

	if (rank.rank_id < 7 || rank.wins < 150) {
		console.log((rank.rank_id < 7 ? "Our rank is too low" : "We do not have enough wins") + " in order to request Overwatch cases. You need at least 150 wins and " + lang.Tokens["skillgroup_7"] + ".");
		bot.sendMessage(chatid, "[" + steam_name + "] WE LOST OUR RANK!");
		steamUser.logOff();
		return;
	}

	console.log("We are likely able to request Overwatch cases. Trying to start case handler...");

	doOverwatchCase();
});

steamUser.on("error", (err) => {
	if (csgoUser && csgoUser._GCHelloInterval) clearInterval(csgoUser._GCHelloInterval);

	console.error(err);
});

async function doOverwatchCase() {
	// Redo this every case incase of a short connection loss which reset our presence
	if (typeof config.richPresence !== "undefined") {
		steamUser.uploadRichPresence(730, config.richPresence);
	}

	data.total.startTimestamp = Date.now();
	console.log("-".repeat(20) + "\nRequested Overwatch case");
	let caseUpdate = await csgoUser.sendMessage(
		730,
		csgoUser.Protos.csgo.ECsgoGCMsg.k_EMsgGCCStrike15_v2_PlayerOverwatchCaseUpdate,
		{},
		csgoUser.Protos.csgo.CMsgGCCStrike15_v2_PlayerOverwatchCaseUpdate,
		{
			reason: 1
		},
		csgoUser.Protos.csgo.ECsgoGCMsg.k_EMsgGCCStrike15_v2_PlayerOverwatchCaseAssignment,
		csgoUser.Protos.csgo.CMsgGCCStrike15_v2_PlayerOverwatchCaseAssignment,
		30000
	);

	if (caseUpdate.caseurl) {
		data.curcasetempdata.owMsg = caseUpdate;
		data.download.startTimestamp = Date.now();

		// Download demo
		if (fs.existsSync("./demofile.dem")) fs.unlinkSync("./demofile.dem");
		console.log("Downloading case " + caseUpdate.caseid + " from url " + caseUpdate.caseurl);

		let sid = SteamID.fromIndividualAccountID(caseUpdate.suspectid);
		if (!sid.isValid()) {
			console.log("Got invalid suspect ID " + caseUpdate.suspectid);
			doOverwatchCase();
			return;
		}
		data.curcasetempdata.sid = sid;
        
        bot.sendMessage(chatid, "[" + steam_name + "] Getting a new OW-Case!");
        
		let r = request(caseUpdate.caseurl);
		r.on("response", (res) => {
			res.pipe(fs.createWriteStream("./demofile.bz2")).on("close", async () => {
				data.download.endTimestamp = Date.now();

				// Successfully downloaded, tell the GC about it!
				console.log("Finished downloading " + caseUpdate.caseid + ", unpacking...");

				await csgoUser.sendMessage(
					730,
					csgoUser.Protos.csgo.ECsgoGCMsg.k_EMsgGCCStrike15_v2_PlayerOverwatchCaseStatus,
					{},
					csgoUser.Protos.csgo.CMsgGCCStrike15_v2_PlayerOverwatchCaseStatus,
					{
						caseid: caseUpdate.caseid,
						statusid: 1
					},
					undefined,
					undefined,
					30000
				);

				data.unpacking.startTimestamp = Date.now();

				// Parse the demo
				fs.createReadStream("./demofile.bz2").pipe(bz2()).pipe(fs.createWriteStream("./demofile.dem")).on("close", () => {
					data.unpacking.endTimestamp = Date.now();

					fs.unlinkSync("./demofile.bz2");

					data.parsing.startTimestamp = Date.now();

					console.log("Finished unpacking " + caseUpdate.caseid + ", parsing as suspect " + sid.getSteamID64() + "...");

					fs.readFile("./demofile.dem", (err, buffer) => {
						if (err) return console.error(err);

						data.curcasetempdata.aimbot_infractions = [];
						data.curcasetempdata.AFKing_infractions = [];
						data.curcasetempdata.Wallhack_infractions = [];
						data.curcasetempdata.wasAlreadyConvicted = false;

						let lastProg = -1;
						let playerIndex = -1;
						const demoFile = new demofile.DemoFile();

						demoFile.gameEvents.on("player_connect", getPlayerIndex);
						demoFile.gameEvents.on("player_disconnect", getPlayerIndex);
						demoFile.gameEvents.on("round_freeze_end", getPlayerIndex);

						function getPlayerIndex() {
							playerIndex = demoFile.players.map(p => p.steamId === "BOT" ? p.steamId : new SteamID(p.steamId).getSteamID64()).indexOf(sid.getSteamID64());
						}

						demoFile.on("tickend", (curTick) => {
							demoFile.emit("tickend__", { curTick: curTick, player: playerIndex });
						});

						// Detection
						Aimbot(demoFile, sid, data, config);
						AFKing(demoFile, sid, data, config);
						Wallhack(demoFile, sid, data, config);

						demoFile.on("progress", (progressFraction) => {
							let prog = Math.round(progressFraction * 100);
							if (prog % 10 !== 0) {
								return;
							}

							if (prog === lastProg) {
								return;
							}

							lastProg = prog;
							console.log("Parsing demo: " + prog + "%");
						});

						demoFile.parse(buffer);

						demoFile.on("end", async (err) => {
							data.parsing.endTimestamp = Date.now();

							if (err.error) {
								console.error(err);
							}

							console.log("Done parsing case " + caseUpdate.caseid);

							// Setup conviction object
							let convictionObj = {
								caseid: caseUpdate.caseid,
								suspectid: caseUpdate.suspectid,
								fractionid: caseUpdate.fractionid,
								rpt_aimbot: (data.curcasetempdata.aimbot_infractions.length > config.verdict.maxAimbot) ? 1 : 0,
								rpt_wallhack: (data.curcasetempdata.Wallhack_infractions.length > config.verdict.maxWallKills) ? 1 : 0, // TODO: Add detection for looking at enemies through walls
								rpt_speedhack: 0, // TODO: Add detection for other cheats (Ex BunnyHopping)
								rpt_teamharm: (data.curcasetempdata.AFKing_infractions.length > config.verdict.maxAFKing) ? 1 : 0, // TODO: Add detection for damaging teammates
								reason: 3
							};

							// Check the Steam Web API, if a token is provided, if the user is already banned, if so always send a conviction even if the bot didn't detect it
							if (config.parsing.steamWebAPIKey && config.parsing.steamWebAPIKey.length >= 10) {
								let banChecker = await new Promise((resolve, reject) => {
									request("https://api.steampowered.com/ISteamUser/GetPlayerBans/v1/?key=" + config.parsing.steamWebAPIKey + "&format=json&steamids=" + sid.getSteamID64(), (err, res, body) => {
										if (err) {
											reject(err);
											return;
										}

										let json = undefined;
										try {
											json = JSON.parse(body);
										} catch (e) { };

										if (json === undefined) {
											reject(body);
											return;
										}

										if (!json.players || json.players.length <= 0) {
											reject(json);
											return;
										}

										resolve(json.players[0]);
									});
								}).catch((err) => {
									console.error(err);
								});

								if (banChecker && banChecker.NumberOfGameBans >= 1 && banChecker.DaysSinceLastBan <= 7 /* Demos are availble for 1 week */) {
									// If the bot didn't catch the suspect aimbotting it is most likely just a waller and nothing else
									convictionObj.rpt_wallhack = 1;

									console.log("Suspect is already banned. Forcefully convicting...");
									bot.sendMessage(chatid, "[" + steam_name + "] Suspect is already banned. Forcing conviction...");

									data.curcasetempdata.wasAlreadyConvicted = true;
								} else {
									console.log("According to the Steam API the suspect has not been banned yet.");
									bot.sendMessage(chatid, "[" + steam_name + "] According to the Steam API the suspect has not been banned yet.");

									data.curcasetempdata.wasAlreadyConvicted = false;
								}
							}

							if ((data.parsing.endTimestamp - data.parsing.startTimestamp) < (config.parsing.minimumTime * 1000)) {
								// Wait this long before sending the request, if we parse the demo too fast the GC ignores us
								let timer = parseInt((config.parsing.minimumTime * 1000) - (data.parsing.endTimestamp - data.parsing.startTimestamp)) / 1000;

								timer_set = "[" + steam_name + "] Waiting " + timer + " second" + (timer === 1 ? "" : "s") + " to avoid the GC ignoring us";
								console.log(timer_set);
								bot.sendMessage(chatid, timer_set);

								await new Promise(r => setTimeout(r, (timer * 1000)));
							}
                            
							if (data.curcasetempdata.aimbot_infractions.length > config.verdict.maxAimbot){data.owndata.aimbotconvict = true}else{data.owndata.aimbotconvict = false}
							if (data.curcasetempdata.Wallhack_infractions.length > config.verdict.maxWallKills){data.owndata.wallhackconvict = true}else{data.owndata.wallhackconvict = false}
							if (data.curcasetempdata.AFKing_infractions.length > config.verdict.maxAFKing){data.owndata.afkconvict = true}else{data.owndata.afkconvict = false}
							
							data.owndata.steamid64 = (data.curcasetempdata.sid ? data.curcasetempdata.sid.getSteamID64() : 0);
							
							// Once we finished analysing the demo send the results
							let caseUpdate2 = await csgoUser.sendMessage(
								730,
								csgoUser.Protos.csgo.ECsgoGCMsg.k_EMsgGCCStrike15_v2_PlayerOverwatchCaseUpdate,
								{},
								csgoUser.Protos.csgo.CMsgGCCStrike15_v2_PlayerOverwatchCaseUpdate,
								convictionObj,
								csgoUser.Protos.csgo.ECsgoGCMsg.k_EMsgGCCStrike15_v2_PlayerOverwatchCaseAssignment,
								csgoUser.Protos.csgo.CMsgGCCStrike15_v2_PlayerOverwatchCaseAssignment,
								30000
							);

							if (caseUpdate2.caseurl) {
								// We got a new case despite sending a completion... Should never happen
								console.log("Unexpected behaviour: Got a new case but sent convcitionObj. Retrying in 30 seconds");
								setTimeout(doOverwatchCase, (30 * 1000));
								return;
							}

							if (!caseUpdate2.caseid) {
								console.log("Unexpected behaviour: Got a cooldown despite sending completion. Retrying in 30 seconds");
								setTimeout(doOverwatchCase, (30 * 1000));
								return;
							}

							data.total.endTimestamp = Date.now();
							data.casesCompleted++;
                            
                            
							// Print logs
							console.log("Internal ID: " + data.casesCompleted);
							console.log("CaseID: " + caseUpdate2.caseid);
							console.log("Suspect: " + (data.curcasetempdata.sid ? data.curcasetempdata.sid.getSteamID64() : 0));
							tg_chatoutput = data.owndata.steamid64 + "\n" + "AIM: " + data.owndata.aimbotconvict + " (" + data.curcasetempdata.aimbot_infractions.length + ")" + "\n" +  "WH: " + data.owndata.wallhackconvict + " (" + data.curcasetempdata.Wallhack_infractions.length + ")" + "\n" +  "AFK: " + data.owndata.afkconvict + " (" + data.curcasetempdata.AFKing_infractions.length + ")" + "\n" + "https://steamcommunity.com/profiles/" + data.owndata.steamid64;
							
							if (data.owndata.aimbotconvict == true || data.owndata.wallhackconvict == true || data.owndata.afkconvict == true){
								bot.sendMessage(chatid, tg_chatoutput);
								console.log("Convicted for:");
								console.log("   Aimbotting: " + data.owndata.aimbotconvict);
								console.log("   Wallhacking: " + data.owndata.wallhackconvict);
								console.log("   AFKing: " + data.owndata.afkconvict);
                            } else {
								if (data.curcasetempdata.wasAlreadyConvicted == true)
									bot.sendMessage(chatid, "Forcing conviction since the suspect was already banned!" + "\n" + "\n" + "https://steamcommunity.com/profiles/" + data.owndata.steamid64);
								else {
									bot.sendMessage(chatid, tg_chatoutput + "\n\nSuspect wasnt raging, no conviction was sent.");
								}
							}
							console.log("Infractions:");
							console.log("	Aimbot: " + data.curcasetempdata.aimbot_infractions.length);
							console.log("	Wallhack: " + data.curcasetempdata.Wallhack_infractions.length);
							console.log("	Other: 0");
							console.log("	Griefing: " + data.curcasetempdata.AFKing_infractions.length);
							console.log("Timings:");
							console.log("	Total: " + parseInt((data.total.endTimestamp - data.total.startTimestamp) / 1000) + "s");
							console.log("	Download: " + parseInt((data.download.endTimestamp - data.download.startTimestamp) / 1000) + "s");
							console.log("	Unpacking: " + parseInt((data.unpacking.endTimestamp - data.unpacking.startTimestamp) / 1000) + "s");
							console.log("	Parsing: " + parseInt((data.parsing.endTimestamp - data.parsing.startTimestamp) / 1000) + "s");
							console.log("	Throttle: " + caseUpdate2.throttleseconds + "s");
                            
							if (config.verdict.writeLog) {
								if (!fs.existsSync("./cases")) {
									fs.mkdirSync("./cases");
								}

								if (!fs.existsSync("./cases/" + caseUpdate2.caseid)) {
									fs.mkdirSync("./cases/" + caseUpdate2.caseid);
								}

								// Write case file
								fs.writeFileSync("./cases/" + caseUpdate2.caseid + "/message.json", JSON.stringify(data.curcasetempdata.owMsg, null, 4));
								fs.writeFileSync("./cases/" + caseUpdate2.caseid + "/data.json", JSON.stringify(data, null, 4));
							}

							if (config.verdict.backupDemo) {
								if (!fs.existsSync("./cases")) {
									fs.mkdirSync("./cases");
								}

								if (!fs.existsSync("./cases/" + caseUpdate2.caseid)) {
									fs.mkdirSync("./cases/" + caseUpdate2.caseid);
								}

								// Copy demo
								fs.copyFileSync("./demofile.dem", "./cases/" + caseUpdate2.caseid + "/demofile.dem");
							}

							// Check case limit
							if (config.verdict.maxVerdicts > 0 && data.casesCompleted >= config.verdict.maxVerdicts) {
								console.log("Finished doing " + config.verdict.maxVerdicts + " case" + (config.verdict.maxVerdicts === 1 ? "" : "s"));
								steamUser.logOff();
								return;
							}

							timeout_value = ((caseUpdate2.throttleseconds + 1) * 1000);
							bot.sendMessage(chatid, "[" + steam_name + "] Requesting a new overwatch case after: " + ms2readable(timeout_value) + " Minutes");

							// Request a overwatch case after the time has run out
							setTimeout(doOverwatchCase, timeout_value);
						});
					});
				});
			});
		});
	} else {
		if (!caseUpdate.caseid) {
			// We are still on cooldown
			console.log("We are still on cooldown... Waiting " + (caseUpdate.throttleseconds + 1) + " seconds");

			setTimeout(doOverwatchCase, ((caseUpdate.throttleseconds + 1) * 1000));
			return;
		}

		// We got a completion but without actually sending a completion... Should never happen
		console.log("Unexpected behaviour: Got a completion without sending one. Retrying in 30 seconds");
		setTimeout(doOverwatchCase, (30 * 1000));
	}
}
