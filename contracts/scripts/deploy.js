// scripts/deploy.js — Hardhat 3 ESM style
// Hardhat 3 menggunakan network.create() untuk mendapatkan ethers instance
import { network } from "hardhat";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const { ethers, networkName } = await network.create();

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log(`Deploying to ${networkName}...`);
  console.log("Deploying with account:", deployer.address);

  const EnergyPlatform = await ethers.getContractFactory("EnergyPlatform");
  const contract = await EnergyPlatform.deploy(deployer.address); // admin = deployer
  await contract.waitForDeployment();

  const address = await contract.getAddress();

  // Fetch block number dari deployment receipt
  const deployTx = contract.deploymentTransaction();
  const receipt = deployTx ? await deployTx.wait() : null;
  const deployBlock = receipt?.blockNumber ?? 0;

  console.log("EnergyPlatform deployed to:", address);
  console.log("Admin:", deployer.address);
  console.log("Deployed at block:", deployBlock);

  // Baca ABI dari artifact yang sudah dikompilasi
  const artifactPath = path.resolve(
    __dirname,
    "../artifacts/contracts/EnergyPlatform.sol/EnergyPlatform.json"
  );
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));

  // Simpan alamat + ABI ke deployments/sepolia.json
  const deployment = {
    address,
    abi: artifact.abi,
    network: networkName,
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
    deployBlock: deployBlock,
  };

  const deploymentsDir = path.resolve(__dirname, "../deployments");
  fs.mkdirSync(deploymentsDir, { recursive: true });
  fs.writeFileSync(
    path.join(deploymentsDir, "sepolia.json"),
    JSON.stringify(deployment, null, 2)
  );
  console.log("Deployment saved to deployments/sepolia.json");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
