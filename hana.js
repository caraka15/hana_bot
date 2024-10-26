// bot.js
const ethers = require('ethers');
const fs = require('fs');
const moment = require('moment-timezone');
const schedule = require('node-schedule');
const chalk = require('chalk');
require('dotenv').config();

// Read config
const config = JSON.parse(fs.readFileSync('./config.json', 'utf8'));

// Simple ABI for depositETH function
const abi = [
    {
        "inputs": [],
        "name": "depositETH",
        "outputs": [],
        "stateMutability": "payable",
        "type": "function"
    }
];

let isOperationRunning = false;

function getCurrentServerTime() {
    return moment().tz(config.timezone).format('YYYY-MM-DD HH:mm:ss');
}

function logWithBorder(message) {
    const border = "=".repeat(100);
    console.log(border);
    console.log(message);
    console.log(border);
}

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function getGasPrice(provider) {
    try {
        const feeData = await provider.getFeeData();
        const maxFeePerGas = feeData.maxFeePerGas * BigInt(12) / BigInt(10);
        const maxPriorityFeePerGas = feeData.maxPriorityFeePerGas * BigInt(12) / BigInt(10);

        return {
            maxFeePerGas,
            maxPriorityFeePerGas
        };
    } catch (error) {
        console.error("Error getting gas price:", error);
        throw error;
    }
}

async function main() {
    isOperationRunning = true;

    if (!process.env.PRIVATE_KEY) {
        throw new Error("Please set PRIVATE_KEY in your .env file");
    }

    logWithBorder(
        chalk.green(`🚀 [${getCurrentServerTime()}] Starting batch execution...`)
    );

    const provider = new ethers.JsonRpcProvider(config.rpc);
    const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
    const contract = new ethers.Contract(config.contractAddress, abi, wallet);

    logWithBorder(
        chalk.cyan(`💳 Connected wallet address: ${await wallet.getAddress()}`)
    );

    for (let i = 0; i < config.numberOfTransactions; i++) {
        try {
            const value = ethers.parseEther("0.0000000001");
            const gasData = await getGasPrice(provider);
            const nonce = await wallet.getNonce();

            const txRequest = {
                to: config.contractAddress,
                value: value,
                data: contract.interface.encodeFunctionData("depositETH"),
                nonce: nonce,
                gasLimit: 100000,
                maxFeePerGas: gasData.maxFeePerGas,
                maxPriorityFeePerGas: gasData.maxPriorityFeePerGas,
                type: 2
            };

            console.log(
                chalk.yellow(`\n📝 [${getCurrentServerTime()}] Preparing transaction ${i + 1}/${config.numberOfTransactions}`)
            );
            console.log(
                chalk.blue(`⛽ Gas settings:
                Max Fee: ${ethers.formatUnits(gasData.maxFeePerGas, "gwei")} gwei
                Priority Fee: ${ethers.formatUnits(gasData.maxPriorityFeePerGas, "gwei")} gwei
                Gas Limit: ${txRequest.gasLimit}`)
            );

            const tx = await wallet.sendTransaction(txRequest);
            console.log(
                chalk.yellow(`📤 Transaction sent: ${tx.hash}`)
            );

            const receipt = await tx.wait();
            console.log(
                chalk.green(`✅ Transaction confirmed in block ${receipt.blockNumber}`)
            );

            const delay = Math.floor(Math.random() * (config.maxDelay - config.minDelay + 1)) + config.minDelay;
            console.log(
                chalk.cyan(`⏳ Waiting ${delay / 1000} seconds before next transaction...`)
            );
            await sleep(delay);

        } catch (error) {
            console.error(
                chalk.red(`❌ Error in transaction ${i + 1}:`, error)
            );
            if (error.reason) {
                console.error(
                    chalk.red(`Error reason: ${error.reason}`)
                );
            }
            console.log(
                chalk.yellow(`⏳ Waiting 10 seconds before retrying...`)
            );
            await sleep(10000);
            i--;
        }
    }

    logWithBorder(
        chalk.green(`✨ [${getCurrentServerTime()}] Batch execution completed`)
    );

    isOperationRunning = false;
}

function updateCountdown(scheduledHour, scheduledMinute, timezone) {
    function update() {
        if (!isOperationRunning) {
            const now = moment().tz(timezone);
            let nextExecution = moment()
                .tz(timezone)
                .set({ hour: scheduledHour, minute: scheduledMinute, second: 0 });

            if (nextExecution.isSameOrBefore(now)) {
                nextExecution.add(1, "day");
            }

            const duration = moment.duration(nextExecution.diff(now));
            const hours = duration.hours().toString().padStart(2, "0");
            const minutes = duration.minutes().toString().padStart(2, "0");
            const seconds = duration.seconds().toString().padStart(2, "0");

            process.stdout.write(
                chalk.cyan(`\r⏳ [${getCurrentServerTime()}] Next execution in: ${chalk.yellow(`${hours}:${minutes}:${seconds}`)}`)
            );
        }
    }

    update();
    return setInterval(update, 1000);
}

function scheduleTask() {
    const timezone = config.timezone || "Asia/Jakarta";
    const scheduledTime = config.scheduledTime || "07:00";
    const [scheduledHour, scheduledMinute] = scheduledTime.split(":").map(Number);

    logWithBorder(
        chalk.cyan(`⚙️ [${getCurrentServerTime()}] Current configuration:`)
    );
    console.log(
        chalk.yellow(JSON.stringify(
            {
                ...config,
            },
            null,
            2
        ))
    );

    logWithBorder(
        chalk.cyan(`🕒 [${getCurrentServerTime()}] Scheduling task to run at ${scheduledTime} ${timezone}`)
    );

    const job = schedule.scheduleJob(
        { hour: scheduledHour, minute: scheduledMinute, tz: timezone },
        function () {
            logWithBorder(
                chalk.green(`✨ [${getCurrentServerTime()}] Starting scheduled task...`)
            );
            main().catch(console.error);
        }
    );

    const countdownInterval = updateCountdown(scheduledHour, scheduledMinute, timezone);

    job.on("scheduled", function () {
        clearInterval(countdownInterval);
        logWithBorder(
            chalk.green(`✓ [${getCurrentServerTime()}] Task executed.`)
        );
        scheduleTask();
    });

    return job;
}

// Start the scheduler
scheduleTask();