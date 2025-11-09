const fs = require("fs");
const path = require("path");
const axios = require("axios");
const colors = require("colors");
const { HttpsProxyAgent } = require("https-proxy-agent");
const readline = require("readline");
const user_agents = require("./config/userAgents");
const settings = require("./config/config.js");
const { sleep, loadData, getRandomNumber, saveToken, isTokenExpired, saveJson, getRandomElement, generateId } = require("./utils/utils.js");
const { checkBaseUrl } = require("./utils/checkAPI.js");
const { headers } = require("./core/header.js");
const { showBanner } = require("./core/banner.js");
const localStorage = require("./localStorage.json");
const ethers = require("ethers");
const { PromisePool } = require("@supercharge/promise-pool");
const refcodes = loadData("reffCodes.txt");
const { Impit } = require("impit");
const UserAgent = require("user-agents");
const { SuiClient, getFullnodeUrl } = require("@mysten/sui/client");
const { Ed25519Keypair } = require("@mysten/sui/keypairs/ed25519");
const { Transaction } = require("@mysten/sui/transactions");

const client = new SuiClient({ url: getFullnodeUrl("testnet") });

// UPDATED CONSTANTS FROM TRANSACTION DATA
// Package IDs
const MAIN_PACKAGE_ID = "0x8cee41afab63e559bc236338bfd7c6b2af07c9f28f285fc8246666a7ce9ae97a"; // Main Creek package
const COIN_PACKAGE_ID = "0xa03cb0b29e92c6fa9bfb7b9c57ffdba5e23810f20885b4390f724553d32efb8b"; // Coin package

// Coin Types
const USDC_COIN_TYPE = "0xa03cb0b29e92c6fa9bfb7b9c57ffdba5e23810f20885b4390f724553d32efb8b::usdc::USDC";
const GUSD_COIN_TYPE = "0x5434351f2dcae30c0c4b97420475c5edc966b02fd7d0bbe19ea2220d2f623586::coin_gusd::COIN_GUSD";
const XAUM_COIN_TYPE = "0xa03cb0b29e92c6fa9bfb7b9c57ffdba5e23810f20885b4390f724553d32efb8b::coin_xaum::COIN_XAUM";
const GR_COIN_TYPE = "0x5504354cf3dcbaf64201989bc734e97c1d89bba5c7f01ff2704c43192cc2717c::coin_gr::COIN_GR";
const GY_COIN_TYPE = "0x0ac2d5ebd2834c0db725eedcc562c60fa8e281b1772493a4d199fd1e70065671::coin_gy::COIN_GY";

// Object IDs for Creek Finance
const USDC_VAULT_ID = "0x1fc1b07f7c1d06d4d8f0b1d0a2977418ad71df0d531c476273a2143dfeffba0e";
const MARKET_ID = "0x166dd68901d2cb47b55c7cfbb7182316f84114f9e12da9251fd4c4f338e37f5d";
const CLOCK_ID = "0x0000000000000000000000000000000000000000000000000000000000000006";
const USDC_TREASURY_ID = "0x77153159c4e3933658293a46187c30ef68a8f98aa48b0ce76ffb0e6d20c0776b";
const XAUM_TREASURY_ID = "0x66984752afbd878aaee450c70142747bb31fca2bb63f0a083d75c361da39adb1";
const STAKING_MANAGER_ID = "0x5c9d26e8310f740353eac0e67c351f71bad8748cf5ac90305ffd32a5f3326990";
const VERSION_ID = "0x13f4679d0ebd6fc721875af14ee380f45cde02f81d690809ac543901d66f6758"; // Updated version ID for deposits
const OBLIGATION_ID = "0x01302327f2c449f70858ebb8cf0336f85a64aee56774fed9faa3d80f4efb12c5"; // Shared obligation object

// Constants
const MIN_XAUM_STAKE = 0.1; // 0.1 XAUM minimum stake
const MAX_XAUM_MINT = 1; // Maximum XAUM mint per transaction

class ClientAPI {
  constructor(itemData, accountIndex, proxy) {
    this.headers = headers;
    this.baseURL = settings.BASE_URL;
    this.baseURL_v2 = settings.BASE_URL_V2;
    this.localItem = null;
    this.itemData = itemData;
    this.accountIndex = accountIndex;
    this.proxy = proxy;
    this.proxyIP = null;
    this.session_name = null;
    this.session_user_agents = this.#load_session_data();
    this.token = null;
    this.identity_token = null;
    this.localStorage = localStorage;
    this.provider = null;
    this.sepoProvider = null;
    this.wallet = null;
    this.refCode = getRandomElement(refcodes) || settings.REF_CODE;
    this.sessionCookie = null;
    this.impit = new Impit({
      browser: "chrome",
      proxyUrl: this.proxy || undefined,
      ignoreTlsErrors: true,
    });
  }

  #load_session_data() {
    try {
      const filePath = path.join(process.cwd(), "session_user_agents.json");
      const data = fs.readFileSync(filePath, "utf8");
      return JSON.parse(data);
    } catch (error) {
      if (error.code === "ENOENT") {
        return {};
      } else {
        throw error;
      }
    }
  }

  #get_user_agent() {
    if (this.session_user_agents[this.session_name]) {
      return this.session_user_agents[this.session_name];
    }
    const agent = new UserAgent({
      deviceCategory: "desktop",
    }).random();
    const newUserAgent = agent.toString();
    this.session_user_agents[this.session_name] = newUserAgent;
    this.#save_session_data(this.session_user_agents);
    return newUserAgent;
  }

  #save_session_data(session_user_agents) {
    const filePath = path.join(process.cwd(), "session_user_agents.json");
    fs.writeFileSync(filePath, JSON.stringify(session_user_agents, null, 2));
  }

  #get_platform(userAgent) {
    const platformPatterns = [
      { pattern: /iPhone/i, platform: "ios" },
      { pattern: /Android/i, platform: "android" },
      { pattern: /iPad/i, platform: "ios" },
    ];

    for (const { pattern, platform } of platformPatterns) {
      if (pattern.test(userAgent)) {
        return platform;
      }
    }

    return "Unknown";
  }

  #set_headers() {
    const platform = this.#get_platform(this.#get_user_agent());
    this.headers["sec-ch-ua"] = `Not)A;Brand";v="99", "${platform} WebView";v="127", "Chromium";v="127`;
    this.headers["sec-ch-ua-platform"] = platform;
    this.headers["User-Agent"] = this.#get_user_agent();
  }

  createUserAgent() {
    try {
      this.session_name = this.itemData.address;
      this.#get_user_agent();
    } catch (error) {
      this.log(`Can't create user agent: ${error.message}`, "error");
      return;
    }
  }

  async log(msg, type = "info") {
    const accountPrefix = `[Creek][${this.accountIndex + 1}][${this.itemData.address}]`;
    let ipPrefix = "[Local IP]";
    if (settings.USE_PROXY) {
      ipPrefix = this.proxyIP ? `[${this.proxyIP}]` : "[Unknown IP]";
    }
    let logMessage = "";

    switch (type) {
      case "success":
        logMessage = `${accountPrefix}${ipPrefix} ${msg}`.green;
        break;
      case "error":
        logMessage = `${accountPrefix}${ipPrefix} ${msg}`.red;
        break;
      case "warning":
        logMessage = `${accountPrefix}${ipPrefix} ${msg}`.yellow;
        break;
      case "custom":
        logMessage = `${accountPrefix}${ipPrefix} ${msg}`.magenta;
        break;
      default:
        logMessage = `${accountPrefix}${ipPrefix} ${msg}`.blue;
    }
    console.log(logMessage);
  }

  async checkProxyIP() {
    try {
      const proxyAgent = new HttpsProxyAgent(this.proxy);
      const response = await axios.get("https://api.ipify.org?format=json", { httpsAgent: proxyAgent });
      if (response.status === 200) {
        this.proxyIP = response.data.ip;
        return response.data.ip;
      } else {
        throw new Error(`Cannot check proxy IP. Status code: ${response.status}`);
      }
    } catch (error) {
      throw new Error(`Error checking proxy IP: ${error.message}`);
    }
  }

  async makeRequest(
    url,
    method,
    data = {},
    options = {
      retries: 5,
      isAuth: false,
      extraHeaders: {},
      refreshToken: null,
    }
  ) {
    if (!url || typeof url !== "string") {
      throw new Error("URL must be a valid string");
    }
    if (!["GET", "POST", "PUT", "DELETE", "PATCH"].includes(method.toUpperCase())) {
      throw new Error("Invalid HTTP method");
    }

    const { retries = 5, isAuth = false, extraHeaders = {}, refreshToken = null } = options;

    const headers = {
      ...this.headers,
      // ...(!isAuth ? { authorization: `Bearer ${this.localItem.identity_token}` } : {}),
      // ...(this.localItem
      //   ? {
      //       cookie: this.localItem?.cookie?.["privy-id-token"]
      //         ? this.localItem.cookie
      //         : `privy-token=${this.localItem.token}; privy-id-token=${this.localItem.identity_token}; privy-session=privy.neuraprotocol.io`,
      //     }
      //   : {}),
      ...extraHeaders,
    };

    const proxyAgent = settings.USE_PROXY ? new HttpsProxyAgent(this.proxy) : null;

    const fetchOptions = {
      method: method.toUpperCase(),
      headers,
      credentials: "include",
      timeout: 120000,
      ...(proxyAgent ? { agent: proxyAgent } : {}),
      ...(method.toLowerCase() !== "get" ? { body: JSON.stringify(data) } : {}),
    };

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const response = await this.impit.fetch(url, fetchOptions);
        const jsonResponse = await response.json();
        return {
          responseHeader: response.headers,
          status: response.status,
          success: true,
          data: jsonResponse?.data || jsonResponse,
          error: null,
        };
      } catch (error) {
        const errorStatus = error.status || 500;
        const errorMessage = error?.response?.data?.error || error?.response?.data || error.message;

        if (errorStatus >= 400 && errorStatus < 500) {
          if (errorStatus === 401) {
            const token = await this.getValidToken(url.includes("sessions") ? true : false);
            if (!token) {
              return { success: false, status: errorStatus, error: "Failed to refresh token", data: null };
            }
            this.token = token;
            return await this.makeRequest(url, method, data, options);
          }
          if (errorStatus === 400) {
            return { success: false, status: errorStatus, error: errorMessage, data: null };
          }
          if (errorStatus === 429) {
            return { success: false, status: errorStatus, error: "You've reached daily limitation", data: null };
          }
          return { success: false, status: errorStatus, error: errorMessage, data: null };
        }

        if (attempt === retries) {
          return { success: false, status: errorStatus, error: errorMessage, data: null };
        }

        await sleep(5);
      }
    }

    return { success: false, status: 500, error: "Request failed after retries", data: null };
  }

  extractSessionId(headers) {
    try {
      const setCookies = headers.get ? headers.get("set-cookie") : headers["set-cookie"];
      if (setCookies) {
        const cookiesArray = Array.isArray(setCookies) ? setCookies : setCookies.split(", ");
        const cookieStr = cookiesArray.map((c) => c.split(";")[0]).join("; ");
        return cookieStr;
      }
    } catch (error) {}
    return null;
  }

  async getUserData() {
    return this.makeRequest(`${settings.BASE_URL}/user/info/${this.itemData.address}`, "get");
  }

  async register() {
    return this.makeRequest(`${settings.BASE_URL}/user/connect`, "post", {
      walletAddress: this.itemData.address,
      inviteCode: this.refCode,
    });
  }

  async faucetSui() {
    const res = await this.makeRequest(
      `https://merchantapi.blockbolt.io/faucet`,
      "post",
      {
        address: this.itemData.address,
      },
      {
        extraHeaders: {
          host: "merchantapi.blockbolt.io",
          origin: "https://faucet.blockbolt.i0",
          referer: "https://faucet.blockbolt.io/",
        },
      }
    );

    return res;
  }

  async checkBalances() {
    try {
      this.log("Checking balances...", "PROCESS");

      const usdcResponse = await client.getCoins({
        owner: this.itemData.address,
        coinType: USDC_COIN_TYPE,
      });
      const usdcBalance = usdcResponse.data.reduce((sum, coin) => sum + BigInt(coin.balance), BigInt(0));

      const gusdResponse = await client.getCoins({
        owner: this.itemData.address,
        coinType: GUSD_COIN_TYPE,
      });
      const gusdBalance = gusdResponse.data.reduce((sum, coin) => sum + BigInt(coin.balance), BigInt(0));

      const suiResponse = await client.getCoins({
        owner: this.itemData.address,
        coinType: "0x2::sui::SUI",
      });
      const suiBalance = suiResponse.data.reduce((sum, coin) => sum + BigInt(coin.balance), BigInt(0));

      const xaumResponse = await client.getCoins({
        owner: this.itemData.address,
        coinType: XAUM_COIN_TYPE,
      });
      const xaumBalance = xaumResponse.data.reduce((sum, coin) => sum + BigInt(coin.balance), BigInt(0));

      const grResponse = await client.getCoins({
        owner: this.itemData.address,
        coinType: GR_COIN_TYPE,
      });
      const grBalance = grResponse.data.reduce((sum, coin) => sum + BigInt(coin.balance), BigInt(0));

      const gyResponse = await client.getCoins({
        owner: this.itemData.address,
        coinType: GY_COIN_TYPE,
      });
      const gyBalance = gyResponse.data.reduce((sum, coin) => sum + BigInt(coin.balance), BigInt(0));

      const balances = {
        usdc: Number(usdcBalance) / 1e9,
        gusd: Number(gusdBalance) / 1e9,
        sui: Number(suiBalance) / 1e9,
        xaum: Number(xaumBalance) / 1e9,
        gr: Number(grBalance) / 1e10,
        gy: Number(gyBalance) / 1e10,
      };

      this.log(
        `USDC:${balances.usdc.toFixed(6)} | GUSD:${balances.gusd.toFixed(6)} | XAUM:${balances.xaum.toFixed(6)} | GR:${balances.gr.toFixed(6)}| GY:${balances.gy.toFixed(
          6
        )} | SUI:${balances.sui.toFixed(6)}`,
        "custom"
      );

      return balances;
    } catch (error) {
      this.log(`Error checking balances | ${error.message}`, "warning");
      return { usdc: 0, gusd: 0, sui: 0, xaum: 0, gr: 0, gy: 0 };
    }
  }

  async getCoinObject(coinType, coinName) {
    try {
      this.log(`Fetching ${coinName} coins...`, "info");
      const response = await client.getCoins({
        owner: this.itemData.address,
        coinType: coinType,
      });
      const coins = response.data;
      if (!coins || coins.length === 0) {
        throw new Error(`No ${coinName} coins found`);
      }
      this.log(`Found ${coins.length} ${coinName} coin(s)`, "success");
      return coins;
    } catch (error) {
      this.log(`Failed to fetch ${coinName} coins`, "warning");
      throw error;
    }
  }

  async getSuiCoinForGas() {
    try {
      const response = await client.getCoins({
        owner: this.itemData.address,
        coinType: "0x2::sui::SUI",
      });
      const coins = response.data;
      if (!coins || coins.length === 0) {
        throw new Error(`No SUI coins found for gas`);
      }
      const gasCoin = coins.reduce((max, coin) => (BigInt(coin.balance) > BigInt(max.balance) ? coin : max), coins[0]);
      return {
        objectId: gasCoin.coinObjectId,
        version: gasCoin.version,
        digest: gasCoin.digest,
      };
    } catch (error) {
      throw error;
    }
  }

  async handleExcute() {
    if (settings.AUTO_FAUCET) {
      this.log(`Fauceting sui...`);
      const resFauc = await this.faucetSui();
      if (resFauc.success) {
        this.log(`Faucet sui success`, "success");
      } else {
        this.log(`Faucet sui failed | ${JSON.stringify(resFauc)}`, "warning");
      }
    }
  }

  async mintUsdc() {
    try {
      let count = settings.NUMBER_MINT;
      for (let i = 0; i < count; i++) {
        let amount = getRandomNumber(settings.AMOUNT_MINT[0], settings.AMOUNT_MINT[1]);
        if (amount > 10) {
          this.log(`Amount exceeds maximum (${10} XAUM). Setting to maximum.`, "warning");
          amount = 10;
        }
        this.log(`Minting ${amount} USDC (${i + 1}/${count})...`, "PROCESS");
        const amountInSmallestUnit = (amount * 1e9).toString();
        const suiCoin = await this.getSuiCoinForGas();
        const tx = new Transaction();
        tx.moveCall({
          target: `${COIN_PACKAGE_ID}::usdc::mint`,
          arguments: [tx.object(USDC_TREASURY_ID), tx.pure.u64(amountInSmallestUnit), tx.pure.address(this.itemData.address)],
        });
        tx.setGasPayment([suiCoin]);
        tx.setGasBudget(10000000);
        const result = await client.signAndExecuteTransaction({
          transaction: tx,
          signer: this.itemData.keypair,
          options: { showEffects: true },
        });
        this.log(`Success! TX: ${result.digest}`, "success");
        this.log(`Explorer: https://testnet.suivision.xyz/txblock/${result.digest}`, "success");

        if (i < count - 1) {
          const timesleep = getRandomNumber(settings.DELAY_BETWEEN_REQUESTS[0], settings.DELAY_BETWEEN_REQUESTS[1]);
          this.log(`Delay ${timesleep}s to next transaction...`);
          await sleep(timesleep);
        }
      }
      return true;
    } catch (error) {
      this.log(`Minting failed: ${error.message}`, "warning");
      return false;
    }
  }

  async mintXaum() {
    try {
      let count = settings.NUMBER_MINT;
      for (let i = 0; i < count; i++) {
        let amount = getRandomNumber(settings.AMOUNT_MINT[0], settings.AMOUNT_MINT[1]);
        if (amount > MAX_XAUM_MINT) {
          this.log(`Amount exceeds maximum (${MAX_XAUM_MINT} XAUM). Setting to maximum.`, "warning");
          amount = MAX_XAUM_MINT;
        }
        this.log(`Minting ${amount} XAUM (${i + 1}/${count})...`, "PROCESS");
        const amountInSmallestUnit = (amount * 1e9).toString();
        const suiCoin = await this.getSuiCoinForGas();
        const tx = new Transaction();
        tx.moveCall({
          target: `${COIN_PACKAGE_ID}::coin_xaum::mint`,
          arguments: [tx.object(XAUM_TREASURY_ID), tx.pure.u64(amountInSmallestUnit), tx.pure.address(this.itemData.address)],
        });
        tx.setGasPayment([suiCoin]);
        tx.setGasBudget(10000000);
        const result = await client.signAndExecuteTransaction({
          transaction: tx,
          signer: this.itemData.keypair,
          options: { showEffects: true },
        });
        this.log(`Success! TX: ${result.digest}`, "success");
        this.log(`Explorer: https://testnet.suivision.xyz/txblock/${result.digest}`, "success");

        if (i < count - 1) {
          const timesleep = getRandomNumber(settings.DELAY_BETWEEN_REQUESTS[0], settings.DELAY_BETWEEN_REQUESTS[1]);
          this.log(`Delay ${timesleep}s to next transaction...`);
          await sleep(timesleep);
        }
      }
      return true;
    } catch (error) {
      this.log(`Minting failed: ${error.message}`, "warning");
      return false;
    }
  }

  async stakeXaum() {
    try {
      let count = settings.NUMBER_STAKE;
      for (let i = 0; i < count; i++) {
        let amount = getRandomNumber(settings.AMOUNT_STAKE[0], settings.AMOUNT_STAKE[1]);
        if (amount < MIN_XAUM_STAKE) {
          this.log(`Error: Minimum stake is ${MIN_XAUM_STAKE} XAUM`, "warning");
          return false;
        }
        this.log(`Staking ${amount} XAUM (${i + 1}/${count})...`, "PROCESS");
        const amountInSmallestUnit = Math.floor(amount * 1e8).toString(); // Fix float từ trước

        let success = false;
        let retryCount = 0;
        const maxRetries = 3;

        while (!success && retryCount < maxRetries) {
          try {
            const xaumCoins = await this.getCoinObject(XAUM_COIN_TYPE, "XAUM");
            const suitableCoin = xaumCoins.find((coin) => BigInt(coin.balance) >= BigInt(amountInSmallestUnit));

            if (!suitableCoin) {
              const totalBalance = xaumCoins.reduce((sum, coin) => sum + BigInt(coin.balance), BigInt(0));
              this.log(`Insufficient XAUM. Have: ${Number(totalBalance) / 1e8}`, "ERROR");
              return false;
            }

            const suiCoin = await this.getSuiCoinForGas();
            const tx = new Transaction();
            const [stakeCoin] = tx.splitCoins(tx.object(suitableCoin.coinObjectId), [tx.pure.u64(amountInSmallestUnit)]);
            tx.moveCall({
              target: `${MAIN_PACKAGE_ID}::staking_manager::stake_xaum`,
              arguments: [tx.object(STAKING_MANAGER_ID), stakeCoin],
            });
            tx.setGasPayment([suiCoin]);
            tx.setGasBudget(10000000);

            const result = await client.signAndExecuteTransaction({
              transaction: tx,
              signer: this.itemData.keypair,
              options: { showEffects: true, showBalanceChanges: true },
            });

            this.log(`TX submitted: ${result.digest}`, "PROCESS");

            success = await this.waitForTransactionFinalize(result.digest);
            if (success) {
              this.log(`Success! TX finalized: ${result.digest}`, "success");
              this.log(`Explorer: https://testnet.suivision.xyz/txblock/${result.digest}`, "success");
            } else {
              this.log(`TX ${result.digest} did not finalize in time`, "warning");
              retryCount++;
              if (retryCount < maxRetries) {
                this.log(`Retrying in 30s... (attempt ${retryCount + 1}/${maxRetries})`, "warning");
                await sleep(30);
              }
            }
          } catch (error) {
            if (error.message.includes("objects is reserved for another transaction")) {
              this.log(`Object locked by previous TX. Waiting 45s to retry... Error: ${error.message}`, "warning");
              await sleep(45); // Chờ unlock
              retryCount++;
            } else {
              throw error;
            }
          }
        }

        if (!success) {
          this.log(`Failed to stake after ${maxRetries} retries`, "ERROR");
          return false;
        }

        if (i < count - 1) {
          const timesleep = getRandomNumber(45, 60);
          this.log(`Delay ${timesleep}s to next transaction...`);
          await sleep(timesleep);
        }
      }
      return true;
    } catch (error) {
      this.log(`Staking failed: ${error.message}`, "warning");
      return false;
    }
  }

  async waitForTransactionFinalize(digest, maxWaitSeconds = 60) {
    const startTime = Date.now();
    while ((Date.now() - startTime) / 1000 < maxWaitSeconds) {
      try {
        const txResponse = await client.getTransactionBlock({
          digest,
          options: { showEffects: true },
        });
        if (txResponse.effects?.status?.status === "success") {
          return true;
        }
        if (txResponse.effects?.status?.status === "failure") {
          this.log(`TX ${digest} failed: ${txResponse.effects.status.error}`, "ERROR");
          return false;
        }
        await sleep(5); // Poll mỗi 5s
      } catch (pollError) {
        this.log(`Poll error for ${digest}: ${pollError.message} | Retrying`, "warning");
        await sleep(5);
      }
    }
    return false; // Timeout
  }

  async swapUsdcToGusd() {
    try {
      let count = settings.NUMBER_SWAP;
      for (let i = 0; i < count; i++) {
        let amount = getRandomNumber(settings.AMOUNT_SWAP[0], settings.AMOUNT_SWAP[1]);
        this.log(`Swapping ${amount} USDC to GUSD (${i + 1}/${count})...`, "PROCESS");
        const amountInSmallestUnit = Math.floor(amount * 1e9).toString();
        const usdcCoins = await this.getCoinObject(USDC_COIN_TYPE, "USDC");
        const suitableCoin = usdcCoins.find((coin) => BigInt(coin.balance) >= BigInt(amountInSmallestUnit));

        if (!suitableCoin) {
          this.log(`Insufficient USDC`, "warning");
          return false;
        }

        const suiCoin = await this.getSuiCoinForGas();
        const tx = new Transaction();
        const [splitCoin] = tx.splitCoins(tx.object(suitableCoin.coinObjectId), [tx.pure.u64(amountInSmallestUnit)]);
        tx.moveCall({
          target: `${MAIN_PACKAGE_ID}::gusd_usdc_vault::mint_gusd`,
          arguments: [tx.object(USDC_VAULT_ID), tx.object(MARKET_ID), splitCoin, tx.object(CLOCK_ID)],
        });
        tx.setGasPayment([suiCoin]);
        tx.setGasBudget(10000000);
        const result = await client.signAndExecuteTransaction({
          transaction: tx,
          signer: this.itemData.keypair,
          options: { showEffects: true },
        });
        this.log(`Success! TX: ${result.digest}`, "success");
        this.log(`Explorer: https://testnet.suivision.xyz/txblock/${result.digest}`, "success");
        if (i < count - 1) {
          const timesleep = getRandomNumber(settings.DELAY_BETWEEN_REQUESTS[0], settings.DELAY_BETWEEN_REQUESTS[1]);
          this.log(`Delay ${timesleep}s to next transaction...`);
          await sleep(timesleep);
        }
      }
      return true;
    } catch (error) {
      this.log(`Swap failed: ${error.message}`, "warning");
      return false;
    }
  }

  async swapGusdToUsdc() {
    try {
      let count = settings.NUMBER_SWAP;
      for (let i = 0; i < count; i++) {
        let amount = getRandomNumber(settings.AMOUNT_SWAP[0], settings.AMOUNT_SWAP[1]);
        this.log(`Swapping ${amount} GUSD to USDC (${i + 1}/${count})...`, "PROCESS");
        const amountInSmallestUnit = (amount * 1e9).toString();
        const gusdCoins = await this.getCoinObject(GUSD_COIN_TYPE, "GUSD");
        const suitableCoin = gusdCoins.find((coin) => BigInt(coin.balance) >= BigInt(amountInSmallestUnit));

        if (!suitableCoin) {
          this.log(`Insufficient GUSD`, "warning");
          return false;
        }

        const suiCoin = await this.getSuiCoinForGas();
        const tx = new Transaction();
        const [splitCoin] = tx.splitCoins(tx.object(suitableCoin.coinObjectId), [tx.pure.u64(amountInSmallestUnit)]);
        tx.moveCall({
          target: `${MAIN_PACKAGE_ID}::gusd_usdc_vault::redeem_gusd`,
          arguments: [tx.object(USDC_VAULT_ID), tx.object(MARKET_ID), splitCoin],
        });
        tx.setGasPayment([suiCoin]);
        tx.setGasBudget(10000000);
        const result = await client.signAndExecuteTransaction({
          transaction: tx,
          signer: this.itemData.keypair,
          options: { showEffects: true },
        });
        this.log(`Success! TX: ${result.digest}`, "success");
        this.log(`Explorer: https://testnet.suivision.xyz/txblock/${result.digest}`, "success");

        if (i < count - 1) {
          const timesleep = getRandomNumber(settings.DELAY_BETWEEN_REQUESTS[0], settings.DELAY_BETWEEN_REQUESTS[1]);
          this.log(`Delay ${timesleep}s to next transaction...`);
          await sleep(timesleep);
        }
      }
      return true;
    } catch (error) {
      this.log(`Swap failed: ${error.message}`, "warning");
      return false;
    }
  }

  async depositSuiCollateral() {
    try {
      let count = settings.NUMBER_DEPOSIT;
      for (let i = 0; i < count; i++) {
        let suiAmount = getRandomNumber(settings.AMOUNT_DEPOSIT[0], settings.AMOUNT_DEPOSIT[1]);
        this.log(`Depositing ${suiAmount} SUI as collateral (${i + 1}/${count})...`, "PROCESS");
        const suiAmountInSmallestUnit = (suiAmount * 1e9).toString();
        const suiCoin = await this.getSuiCoinForGas();
        const tx = new Transaction();

        // Split coins from gas for deposit
        const [collateralCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(suiAmountInSmallestUnit)]);

        // Deposit collateral - simplified call matching successful transaction
        tx.moveCall({
          target: `${MAIN_PACKAGE_ID}::deposit_collateral::deposit_collateral`,
          typeArguments: ["0x2::sui::SUI"],
          arguments: [tx.object(VERSION_ID), tx.object(OBLIGATION_ID), tx.object(MARKET_ID), collateralCoin],
        });

        tx.setGasPayment([suiCoin]);
        tx.setGasBudget(10000000);

        const result = await client.signAndExecuteTransaction({
          transaction: tx,
          signer: this.itemData.keypair,
          options: { showEffects: true },
        });

        this.log(`Success! TX: ${result.digest}`, "success");
        this.log(`Explorer: https://testnet.suivision.xyz/txblock/${result.digest}`, "success");

        if (i < count - 1) {
          const timesleep = getRandomNumber(settings.DELAY_BETWEEN_REQUESTS[0], settings.DELAY_BETWEEN_REQUESTS[1]);
          this.log(`Delay ${timesleep}s to next transaction...`);
          await sleep(timesleep);
        }
      }
      return true;
    } catch (error) {
      this.log(`Deposit failed: ${error.message}`, "warning");
      return false;
    }
  }

  async depositGrCollateral() {
    try {
      let count = settings.NUMBER_DEPOSIT;
      for (let i = 0; i < count; i++) {
        let amount = getRandomNumber(settings.AMOUNT_DEPOSIT[0], settings.AMOUNT_DEPOSIT[1]);
        if (amount <= 0) continue;

        this.log(`Depositing ${amount} GR as collateral (${i + 1}/${count})...`, "PROCESS");

        const amountInSmallestUnit = Math.floor(amount * 1e8).toString();

        let success = false;
        let retryCount = 0;
        const maxRetries = 5;

        while (!success && retryCount < maxRetries) {
          try {
            const grCoins = await this.getCoinObject(GR_COIN_TYPE, "GR");
            const suitableCoin = grCoins.find((coin) => BigInt(coin.balance) >= BigInt(amountInSmallestUnit));

            if (!suitableCoin) {
              this.log(`Insufficient GR balance`, "warning");
              return false;
            }

            const suiCoins = await client.getCoins({
              owner: this.itemData.address,
              coinType: "0x2::sui::SUI",
            });
            const gasCoin = suiCoins.data.find((c) => BigInt(c.balance) > BigInt(20000000));
            if (!gasCoin) throw new Error("No SUI for gas");

            const tx = new Transaction();
            const [collateralCoin] = tx.splitCoins(tx.object(suitableCoin.coinObjectId), [tx.pure.u64(amountInSmallestUnit)]);

            tx.moveCall({
              target: `${MAIN_PACKAGE_ID}::deposit_collateral::deposit_collateral`,
              typeArguments: [GR_COIN_TYPE],
              arguments: [tx.object(VERSION_ID), tx.object(OBLIGATION_ID), tx.object(MARKET_ID), collateralCoin],
            });

            tx.setGasPayment([gasCoin]);
            tx.setGasBudget(30000000);

            const result = await client.signAndExecuteTransaction({
              transaction: tx,
              signer: this.itemData.keypair,
              requestType: "WaitForLocalExecution",
              options: {
                showEffects: true,
                showEvents: true,
                showBalanceChanges: true,
              },
            });

            if (result.effects?.status?.status === "success") {
              this.log(`Success! TX: ${result.digest}`, "success");
              this.log(`Explorer: https://testnet.suivision.xyz/txblock/${result.digest}`, "success");
              success = true;
            } else {
              throw new Error(`TX failed: ${result.effects?.status?.error}`);
            }
          } catch (error) {
            const errMsg = error.message || "";

            if (
              errMsg.includes("not available for consumption") ||
              errMsg.includes("version") ||
              errMsg.includes("reserved for another transaction") ||
              (errMsg.includes("Object") && errMsg.includes("version"))
            ) {
              retryCount++;
              const waitMs = 8 + retryCount * 5; // 8s, 13s, 18s...
              this.log(`Version conflict. Retrying in ${waitMs}s... (${retryCount}/${maxRetries})`, "warning");
              await sleep(waitMs);
              continue;
            }

            throw error;
          }
        }

        if (!success) {
          this.log(`Failed to deposit after ${maxRetries} retries`, "ERROR");
          return false;
        }

        if (i < count - 1) {
          const delay = getRandomNumber(60, 90); // Tăng delay để tránh race
          this.log(`Waiting ${delay}s before next deposit...`);
          await sleep(delay);
        }
      }

      return true;
    } catch (error) {
      this.log(`GR Deposit failed: ${error.message}`, "warning");
      return false;
    }
  }
  async handleOnchain() {
    this.log(`Excuting onchain...`);
    await this.checkBalances();

    if (settings.AUTO_MINT) {
      await this.mintUsdc();
      await sleep(5);
      await this.mintXaum();
    }

    if (settings.AUTO_STAKE) {
      await this.stakeXaum();
      await sleep(5);
    }

    if (settings.AUTO_SWAP) {
      await this.swapGusdToUsdc();
      await sleep(5);

      await this.swapUsdcToGusd();
    }

    if (settings.AUTO_DEPOSIT) {
      await this.depositGrCollateral();
      await sleep(5);

      await this.depositSuiCollateral();
    }
  }

  async getValidToken(isNew = false) {
    return true;
    const existingToken = this.token;
    let loginRes = { success: false, data: null };
    const { isExpired: isExp, expirationDate } = isTokenExpired(existingToken);
    this.log(`Access token status: ${isExp ? "Expired".yellow : "Valid".green} | Acess token exp: ${expirationDate}`);

    if (existingToken && !isNew && !isExp) {
      this.log("Using valid token", "success");
      return existingToken;
    }

    this.log("No found token or experied, trying get new token...", "warning");

    if (!loginRes?.data) {
      this.log(`Getting new token...`);
      loginRes = await this.auth();
    }

    const data = loginRes.data;
    const cookie = this.extractSessionId(loginRes?.responseHeader);
    if (data?.token) {
      await saveJson(
        this.session_name,
        JSON.stringify({
          ...data,
          cookie,
        }),
        "localStorage.json"
      );
      this.localItem = data;
      return data?.token;
    }
    this.log(`Can't get new token | ${JSON.stringify(loginRes)}...`, "warning");
    return null;
  }

  async connectRPC({ rpc_url, chain_id, name }) {
    try {
      const provider = new ethers.JsonRpcProvider(rpc_url, {
        fetch: (url, options) => {
          if (settings.USE_PROXY) options.agent = new HttpsProxyAgent(this.proxy);
          return fetch(url, options);
        },
        chainId: Number(chain_id),
        name: name,
      });
      const wallet = new ethers.Wallet(this.itemData.privateKey, provider);
      const block = await provider.getBlockNumber();
      if (!block) throw new Error(`Can't get block`);
      this.log(`Connected block ${block}`, "success");
      return {
        provider,
        wallet,
      };
    } catch (error) {
      this.log(`Can't connect RPC of chain ${name} | ${error.message}`, "error");
      return { provider: null, wallet: null };
    }
  }

  async handleSyncData() {
    this.log(`Sync data...`);
    await this.register();
    let userData = { success: false, data: null, status: 0 },
      retries = 0;
    do {
      userData = await this.getUserData();
      if (userData?.success) break;
      retries++;
    } while (retries < 1 && userData.status !== 400);

    if (userData?.success) {
      const { user, has_checked_in_today, badges } = userData.data;
      this.log(`Ref code: ${user?.invite_code} | Total points: ${user?.total_points} | Rank: ${user?.rank}`, "custom");
      if (!has_checked_in_today) {
        // this.log(`Checkin success`, 'success')
      }
    } else {
      if (JSON.stringify(userData).includes("User not found")) {
        this.log(`Registing user`);
        await this.register();
        return await this.handleSyncData();
      }
      this.log("Can't sync new data...skipping", "warning");
    }
    return userData;
  }

  async runAccount() {
    const accountIndex = this.accountIndex;
    this.session_name = this.itemData.address;
    this.localItem = JSON.parse(this.localStorage[this.session_name] || "{}");
    this.token = this.localItem?.token;

    this.#set_headers();
    if (settings.USE_PROXY) {
      try {
        this.proxyIP = await this.checkProxyIP();
      } catch (error) {
        this.log(`Cannot check proxy IP: ${error.message}`, "warning");
        return;
      }
    }
    const timesleep = getRandomNumber(settings.DELAY_START_BOT[0], settings.DELAY_START_BOT[1]);
    console.log(`=========Tài khoản ${accountIndex + 1} | ${this.proxyIP || "Local IP"} | Bắt đầu sau ${timesleep} giây...`.green);
    await sleep(timesleep);

    try {
      const token = await this.getValidToken();
      if (!token) return;
      this.token = token;

      const userData = await this.handleSyncData();
      if (userData.success) {
        await this.handleExcute();
        await sleep(1);
      } else {
        this.log("Can't get use info...skipping", "error");
      }
    } catch (error) {}

    await this.handleOnchain();
  }
}

async function main() {
  console.clear();
  showBanner();
  const privateKeys = loadData("privateKeys.txt");
  const proxies = loadData("proxy.txt");

  if (privateKeys.length == 0 || (privateKeys.length > proxies.length && settings.USE_PROXY)) {
    console.log("Số lượng proxy và data phải bằng nhau.".red);
    console.log(`Data: ${privateKeys.length}`);
    console.log(`Proxy: ${proxies.length}`);
    process.exit(1);
  }
  if (!settings.USE_PROXY) {
    console.log(`You are running bot without proxies!!!`.yellow);
  }
  let maxThreads = settings.USE_PROXY ? settings.MAX_THEADS : settings.MAX_THEADS_NO_PROXY;

  const data = privateKeys.map((val, index) => {
    const keypair = Ed25519Keypair.fromSecretKey(val);
    const address = keypair.getPublicKey().toSuiAddress();
    const item = {
      address: address,
      privateKey: val,
      keypair: keypair,
    };
    new ClientAPI(item, index, proxies[index]).createUserAgent();
    return item;
  });

  await sleep(1);

  while (true) {
    const { results, errors } = await PromisePool.withConcurrency(maxThreads)
      .for(data)
      .process(async (itemData, index, pool) => {
        try {
          const to = new ClientAPI(itemData, index, proxies[index % proxies.length]);
          await Promise.race([to.runAccount(), new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 24 * 60 * 60 * 1000))]);
        } catch (error) {
          console.log("err", error.message);
        } finally {
        }
      });
    await sleep(5);
    console.log(`Completed all account | Waiting ${settings.TIME_SLEEP} minutes to new circle`.magenta);
    await sleep(settings.TIME_SLEEP * 60);
  }
}

main().catch((error) => {
  console.log("Lỗi rồi:", error);
  process.exit(1);
});
