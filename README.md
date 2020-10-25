# Trading-bot-uniswap_experiment
An experimental trading bot on ethreum as a part of my learning journey 

# Bot Execution Flow
1. There is histprice.txt file which will have date and token price.
2. Bot will read above file and check todays entry exist or not. If there is no entry then bot will make a entry with todays date and market price.
3. Bot will extract last 50 days and 200 days prices from same file to calculate 50 days moving average and 200 days moving avgerage. bot will auto calculate last 50 or 200 days by its own
4. Calculate 50 days MA and 200 days MA
5. If 50 days MA is greater than 200 days MA then execute a buy order and set -5% as stop loss
6. Bot will fetch market price every sec and compare with stop loss set and if stop loss hits bot will auto trigger sell order of exact amount which was taken at the time of buy
7. If 200 days MA is greater than 50 days MA then execute a sell order
8. complete the process

you can have multiple historical data files for each token and you can trade with all tokens (just changing config) with this bot.

# Setup
- extracts .zip at any location
- go to folder location usind cmd
- run 'npm install'
- we have .env file that needs to modify with your details

# Execute bot
- run 'node index.js'
