import { expect } from "chai";
import { network } from "hardhat";

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Deploy a fresh EnergyPlatform contract.
 * Returns { ethers, contract, admin, device1, device2, nonAdmin }.
 */
async function deploy() {
  const conn = await network.create();
  const { ethers } = conn;
  const signers = await ethers.getSigners();
  const admin = signers[0];
  const device1 = signers[1];
  const device2 = signers[2];
  const nonAdmin = signers[3];

  const factory = await ethers.getContractFactory("EnergyPlatform");
  const contract = await factory.deploy(admin.address);
  await contract.waitForDeployment();

  return { ethers, contract, admin, device1, device2, nonAdmin };
}

/**
 * Assert that a promise reverts with the given reason string.
 */
async function expectRevertedWith(promise, reason) {
  try {
    await promise;
    throw new Error(`Expected revert with "${reason}" but transaction succeeded`);
  } catch (err) {
    if (err.message && err.message.startsWith("Expected revert")) throw err;
    const msg = err.message || String(err);
    if (!msg.includes(reason)) {
      throw new Error(`Expected revert reason "${reason}" but got: ${msg.slice(0, 300)}`);
    }
  }
}

// ── Test constants ──────────────────────────────────────────────────────────
const BATCH_ID = "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890";
const HASH_VAL = "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
const HOUR_WINDOW_START = 1700000000;

// ── Test Suite ──────────────────────────────────────────────────────────────

describe("EnergyPlatform — Workshop Unit Tests", function () {
  this.timeout(60_000);

  // ── Requirement 1.1: constructor sets admin ────────────────────────────
  describe("constructor (Req 1.1)", function () {
    it("should set admin address correctly via constructor", async function () {
      const { contract, admin } = await deploy();
      expect(await contract.getAdmin()).to.equal(admin.address);
    });

    it("should revert if admin address is zero", async function () {
      const conn = await network.create();
      const { ethers } = conn;
      const factory = await ethers.getContractFactory("EnergyPlatform");
      await expectRevertedWith(
        factory.deploy("0x0000000000000000000000000000000000000000"),
        "Admin address cannot be zero"
      );
    });
  });

  // ── Requirement 1.2, 1.3: registerDevice ──────────────────────────────
  describe("registerDevice (Req 1.2, 1.3)", function () {
    it("should register a device with PENDING status (1)", async function () {
      const { contract, device1 } = await deploy();
      await contract.connect(device1).registerDevice();
      const status = await contract.getDeviceStatus(device1.address);
      expect(status).to.equal(1n); // PENDING
    });

    it("should emit DeviceRegistered event on successful registration", async function () {
      const { contract, device1 } = await deploy();
      const tx = await contract.connect(device1).registerDevice();
      const receipt = await tx.wait();

      const event = receipt.logs.find(
        (l) => l.fragment && l.fragment.name === "DeviceRegistered"
      );
      expect(event, "DeviceRegistered event missing").to.not.be.undefined;
      expect(event.args[0].toLowerCase()).to.equal(device1.address.toLowerCase());
    });

    // ── Requirement 1.4: revert if already registered ─────────────────
    it("should revert if device already registered (Req 1.4)", async function () {
      const { contract, device1 } = await deploy();
      await contract.connect(device1).registerDevice();
      await expectRevertedWith(
        contract.connect(device1).registerDevice(),
        "Device already registered"
      );
    });

    it("should revert if device tries to re-register after being APPROVED", async function () {
      const { contract, admin, device1 } = await deploy();
      await contract.connect(device1).registerDevice();
      await contract.connect(admin).approveDevice(device1.address);
      await expectRevertedWith(
        contract.connect(device1).registerDevice(),
        "Device already registered"
      );
    });

    it("should revert if device tries to re-register after being REJECTED", async function () {
      const { contract, admin, device1 } = await deploy();
      await contract.connect(device1).registerDevice();
      await contract.connect(admin).rejectDevice(device1.address);
      await expectRevertedWith(
        contract.connect(device1).registerDevice(),
        "Device already registered"
      );
    });
  });

  // ── Requirement 1.5, 1.7: approveDevice ───────────────────────────────
  describe("approveDevice (Req 1.5, 1.7)", function () {
    it("should approve a PENDING device when called by admin", async function () {
      const { contract, admin, device1 } = await deploy();
      await contract.connect(device1).registerDevice();
      await contract.connect(admin).approveDevice(device1.address);
      const status = await contract.getDeviceStatus(device1.address);
      expect(status).to.equal(2n); // APPROVED
    });

    it("should emit DeviceApproved event", async function () {
      const { contract, admin, device1 } = await deploy();
      await contract.connect(device1).registerDevice();
      const tx = await contract.connect(admin).approveDevice(device1.address);
      const receipt = await tx.wait();

      const event = receipt.logs.find(
        (l) => l.fragment && l.fragment.name === "DeviceApproved"
      );
      expect(event, "DeviceApproved event missing").to.not.be.undefined;
      expect(event.args[0].toLowerCase()).to.equal(device1.address.toLowerCase());
    });

    it("should revert if called by non-admin (Req 1.7)", async function () {
      const { contract, device1, nonAdmin } = await deploy();
      await contract.connect(device1).registerDevice();
      await expectRevertedWith(
        contract.connect(nonAdmin).approveDevice(device1.address),
        "Only admin can call this function"
      );
    });

    it("should revert if device is not in PENDING status", async function () {
      const { contract, admin, device2 } = await deploy();
      // device2 is UNREGISTERED
      await expectRevertedWith(
        contract.connect(admin).approveDevice(device2.address),
        "Device is not in PENDING status"
      );
    });
  });

  // ── Requirement 1.6, 1.7: rejectDevice ────────────────────────────────
  describe("rejectDevice (Req 1.6, 1.7)", function () {
    it("should reject a PENDING device when called by admin", async function () {
      const { contract, admin, device1 } = await deploy();
      await contract.connect(device1).registerDevice();
      await contract.connect(admin).rejectDevice(device1.address);
      const status = await contract.getDeviceStatus(device1.address);
      expect(status).to.equal(3n); // REJECTED
    });

    it("should emit DeviceRejected event", async function () {
      const { contract, admin, device1 } = await deploy();
      await contract.connect(device1).registerDevice();
      const tx = await contract.connect(admin).rejectDevice(device1.address);
      const receipt = await tx.wait();

      const event = receipt.logs.find(
        (l) => l.fragment && l.fragment.name === "DeviceRejected"
      );
      expect(event, "DeviceRejected event missing").to.not.be.undefined;
      expect(event.args[0].toLowerCase()).to.equal(device1.address.toLowerCase());
    });

    it("should revert if called by non-admin (Req 1.7)", async function () {
      const { contract, device1, nonAdmin } = await deploy();
      await contract.connect(device1).registerDevice();
      await expectRevertedWith(
        contract.connect(nonAdmin).rejectDevice(device1.address),
        "Only admin can call this function"
      );
    });

    it("should revert if device is not in PENDING status", async function () {
      const { contract, admin, device2 } = await deploy();
      await expectRevertedWith(
        contract.connect(admin).rejectDevice(device2.address),
        "Device is not in PENDING status"
      );
    });
  });

  // ── Requirement 1.8, 1.9, 1.10: recordHash ────────────────────────────
  describe("recordHash (Req 1.8, 1.9, 1.10)", function () {
    it("should record hash from an APPROVED device (Req 1.8)", async function () {
      const { contract, admin, device1 } = await deploy();
      await contract.connect(device1).registerDevice();
      await contract.connect(admin).approveDevice(device1.address);

      await contract.connect(device1).recordHash(BATCH_ID, HASH_VAL, HOUR_WINDOW_START);
      const storedHash = await contract.getHash(BATCH_ID);
      expect(storedHash.toLowerCase()).to.equal(HASH_VAL.toLowerCase());
    });

    it("should emit HashRecorded event with correct args (Req 1.9)", async function () {
      const { contract, admin, device1 } = await deploy();
      await contract.connect(device1).registerDevice();
      await contract.connect(admin).approveDevice(device1.address);

      const tx = await contract.connect(device1).recordHash(BATCH_ID, HASH_VAL, HOUR_WINDOW_START);
      const receipt = await tx.wait();

      const event = receipt.logs.find(
        (l) => l.fragment && l.fragment.name === "HashRecorded"
      );
      expect(event, "HashRecorded event missing").to.not.be.undefined;
      expect(event.args[0].toLowerCase()).to.equal(device1.address.toLowerCase()); // device
      expect(event.args[1].toLowerCase()).to.equal(BATCH_ID.toLowerCase()); // batchId
      expect(event.args[2].toLowerCase()).to.equal(HASH_VAL.toLowerCase()); // hash
      expect(event.args[3]).to.equal(BigInt(HOUR_WINDOW_START)); // hourWindowStart
      // args[4] is block.timestamp — just check it's > 0
      expect(event.args[4]).to.be.gt(0n);
    });

    it("should revert if device is UNREGISTERED (Req 1.10)", async function () {
      const { contract, device2 } = await deploy();
      await expectRevertedWith(
        contract.connect(device2).recordHash(BATCH_ID, HASH_VAL, HOUR_WINDOW_START),
        "Only approved devices can call this function"
      );
    });

    it("should revert if device is PENDING (Req 1.10)", async function () {
      const { contract, device2 } = await deploy();
      await contract.connect(device2).registerDevice();
      await expectRevertedWith(
        contract.connect(device2).recordHash(BATCH_ID, HASH_VAL, HOUR_WINDOW_START),
        "Only approved devices can call this function"
      );
    });

    it("should revert if device is REJECTED (Req 1.10)", async function () {
      const { contract, admin, device2 } = await deploy();
      await contract.connect(device2).registerDevice();
      await contract.connect(admin).rejectDevice(device2.address);
      await expectRevertedWith(
        contract.connect(device2).recordHash(BATCH_ID, HASH_VAL, HOUR_WINDOW_START),
        "Only approved devices can call this function"
      );
    });
  });

  // ── Requirement 1.11: getHash ─────────────────────────────────────────
  describe("getHash (Req 1.11)", function () {
    it("should return bytes32 zero for non-existent batchId", async function () {
      const { ethers, contract } = await deploy();
      const batchId = "0x0000000000000000000000000000000000000000000000000000000000000001";
      const storedHash = await contract.getHash(batchId);
      expect(storedHash).to.equal("0x0000000000000000000000000000000000000000000000000000000000000000");
    });

    it("should return the stored hash for a recorded batch", async function () {
      const { contract, admin, device1 } = await deploy();
      await contract.connect(device1).registerDevice();
      await contract.connect(admin).approveDevice(device1.address);
      await contract.connect(device1).recordHash(BATCH_ID, HASH_VAL, HOUR_WINDOW_START);
      const storedHash = await contract.getHash(BATCH_ID);
      expect(storedHash.toLowerCase()).to.equal(HASH_VAL.toLowerCase());
    });
  });

  // ── Requirement 1.12: getDeviceStatus ─────────────────────────────────
  describe("getDeviceStatus (Req 1.12)", function () {
    it("should return UNREGISTERED (0) for unknown device", async function () {
      const { contract, device1 } = await deploy();
      expect(await contract.getDeviceStatus(device1.address)).to.equal(0n);
    });

    it("should return PENDING (1) after registration", async function () {
      const { contract, device1 } = await deploy();
      await contract.connect(device1).registerDevice();
      expect(await contract.getDeviceStatus(device1.address)).to.equal(1n);
    });

    it("should return APPROVED (2) after approval", async function () {
      const { contract, admin, device1 } = await deploy();
      await contract.connect(device1).registerDevice();
      await contract.connect(admin).approveDevice(device1.address);
      expect(await contract.getDeviceStatus(device1.address)).to.equal(2n);
    });

    it("should return REJECTED (3) after rejection", async function () {
      const { contract, admin, device1 } = await deploy();
      await contract.connect(device1).registerDevice();
      await contract.connect(admin).rejectDevice(device1.address);
      expect(await contract.getDeviceStatus(device1.address)).to.equal(3n);
    });
  });

  // ── Requirement 1.13: getAdmin ────────────────────────────────────────
  describe("getAdmin (Req 1.13)", function () {
    it("should return the admin address set in constructor", async function () {
      const { contract, admin } = await deploy();
      expect(await contract.getAdmin()).to.equal(admin.address);
    });
  });
});
