# CSGO Overwatch Bot

# Installation

1. Install [NodeJS](https://nodejs.org/)
2. Clone this repository and extract it in a folder
3. Open a command prompt inside the directory
4. Run `npm install`
5. Make a duplicate of the `config.json.example` and remove the `.example`
6. Adjust your now called `config.json` - [See Config](#config)
7. Run `node index.js`
8. After every update repeat from step 3 onwards to ensure everything required is up to date

# Detections

- **Aimbot**:
- - Log the past X ticks, when the suspect gets a kill check all angles within the past X ticks. If the difference is above the threshold add an infraction.
- **AFKing**:
- - Everytime the round starts log the current position of the player on every tick, at the end of the round compare all the positions. If the player did not leave a specific radius within the entire round add an infraction.
- **Wallhack**:
- - On every kill just check if the event included the `penetrated` parameter and if its 1 or higher, meaning the last bullet was a wallbang. It will not work when the player only damages through a wall instead of killing.

# Config

- `account`
- - `username`: The account name you use to log into that account
- - `password`: The password for the account
- - `sharedSecret`: Optional shared secret for two factor authentication
- - `steam_persona`: Sets the steam persona state (eg. Offline)
- `parsing`
- - `steamWebAPIKey`: Optional Steam Web API key
- - `minimumTime`: The minimum amount of seconds of parsing before sending the Conviction-Message
- - `aimbot`
- - - `maxTicks`: The maximum amount of ticks to check when the suspect gets a kill
- - - `threshold`: The maximum threshold between angles before adding an Aimbot-Infraction
- - `afking`
- - - `radius`: If a player is within this radius an entire round it counts as an AFKing-Infraction
- `verdict`
- - `writeLog`: Should we write logs to a file?
- - `backupDemo`: Should we backup the demo file?
- - `maxVerdicts`: The maximum amount of cases we want to do. 0 for infinite
- - `maxAimbot`: The maximum amount of infractions allowed before setting user as aimbotter
- - `maxWallKills`: Maximum amount of allowed kills through a wall before setting user as wallhacking
- - `maxAFKing`: The maximum amount of infractions allowed before setting user as griefing
- `richPresence`
- - `steam_display`: What information to display on Steam - [Read more](#rich-presence)
- `telegram`
- - `token`: Bot-Token from Botfather
- - `chatid`: ChatID where the bot should send its messages to


# SETTINGS THAT **MUST** BE SET
- `telegram`
- `richPresence`


If we start the game with a Overwatch case already being assigned to us the GC wil respond with the same assigned case we got earlier. It might also respond with a new case incase our old case has expired, this is untested though.
