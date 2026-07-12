// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title EnergyPlatform
 * @notice Smart contract untuk workshop demo smart metering blockchain.
 *         Berfungsi sebagai registri perangkat dan audit trail hash batch data.
 */
contract EnergyPlatform {

    // ── State Variables ──────────────────────────────────────────────
    address public admin;

    enum DeviceStatus { UNREGISTERED, PENDING, APPROVED, REJECTED }

    struct DeviceInfo {
        DeviceStatus status;
        uint256 registeredAt;
    }

    mapping(address => DeviceInfo) public devices;
    mapping(bytes32 => bytes32) public batchHashes;

    // ── Events ───────────────────────────────────────────────────────
    event DeviceRegistered(address indexed device, uint256 timestamp);
    event DeviceApproved(address indexed device, uint256 timestamp);
    event DeviceRejected(address indexed device, uint256 timestamp);
    event HashRecorded(
        address indexed device,
        bytes32 batchId,
        bytes32 hash,
        uint256 hourWindowStart,
        uint256 timestamp
    );

    // ── Modifiers ────────────────────────────────────────────────────
    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin can call this function");
        _;
    }

    modifier onlyApprovedDevice() {
        require(
            devices[msg.sender].status == DeviceStatus.APPROVED,
            "Only approved devices can call this function"
        );
        _;
    }

    // ── Constructor ──────────────────────────────────────────────────
    constructor(address _admin) {
        require(_admin != address(0), "Admin address cannot be zero");
        admin = _admin;
    }

    // ── Device Registry ──────────────────────────────────────────────

    /// @notice Dipanggil oleh device sendiri (msg.sender) untuk mendaftar.
    ///         Revert jika sudah terdaftar.
    function registerDevice() external {
        require(
            devices[msg.sender].status == DeviceStatus.UNREGISTERED,
            "Device already registered"
        );

        devices[msg.sender] = DeviceInfo({
            status: DeviceStatus.PENDING,
            registeredAt: block.timestamp
        });

        emit DeviceRegistered(msg.sender, block.timestamp);
    }

    /// @notice Hanya admin. Ubah status PENDING -> APPROVED.
    function approveDevice(address device) external onlyAdmin {
        require(
            devices[device].status == DeviceStatus.PENDING,
            "Device is not in PENDING status"
        );

        devices[device].status = DeviceStatus.APPROVED;

        emit DeviceApproved(device, block.timestamp);
    }

    /// @notice Hanya admin. Ubah status PENDING -> REJECTED.
    function rejectDevice(address device) external onlyAdmin {
        require(
            devices[device].status == DeviceStatus.PENDING,
            "Device is not in PENDING status"
        );

        devices[device].status = DeviceStatus.REJECTED;

        emit DeviceRejected(device, block.timestamp);
    }

    // ── Hash Audit Trail ─────────────────────────────────────────────

    /// @notice Hanya device berstatus APPROVED. Catat hash batch on-chain.
    function recordHash(
        bytes32 batchId,
        bytes32 hash,
        uint256 hourWindowStart
    ) external onlyApprovedDevice {
        batchHashes[batchId] = hash;

        emit HashRecorded(msg.sender, batchId, hash, hourWindowStart, block.timestamp);
    }

    // ── View Functions ───────────────────────────────────────────────

    /// @notice Kembalikan hash yang tersimpan untuk suatu batchId (bytes32 zero jika belum ada).
    function getHash(bytes32 batchId) external view returns (bytes32) {
        return batchHashes[batchId];
    }

    /// @notice Kembalikan status perangkat.
    function getDeviceStatus(address device) external view returns (DeviceStatus) {
        return devices[device].status;
    }

    /// @notice Kembalikan alamat admin.
    function getAdmin() external view returns (address) {
        return admin;
    }
}
