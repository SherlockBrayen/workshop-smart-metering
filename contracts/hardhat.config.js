import hardhatMocha from "@nomicfoundation/hardhat-mocha";
import hardhatEthers from "@nomicfoundation/hardhat-ethers";
import { configVariable } from "hardhat/config";

// Load .env synchronously so process.env is populated before config is evaluated
import { createRequire } from "module";
const _require = createRequire(import.meta.url);
_require("dotenv").config();

/** @type import('hardhat/config').HardhatUserConfig */
export default {
  plugins: [hardhatMocha, hardhatEthers],
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    hardhat: {
      type: "edr-simulated",
      chainId: 31337,
    },
    sepolia: {
      type: "http",
      url: configVariable("INFURA_URL"),
      accounts: [configVariable("DEPLOYER_PRIVATE_KEY")],
      chainId: 11155111,
    },
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
};
