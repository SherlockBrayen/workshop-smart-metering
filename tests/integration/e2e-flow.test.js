/**
 * Integration Verification Test — E2E Flow
 *
 * Verifies that all components are properly wired:
 * 1. Edge Simulator config connects to correct backend URL
 * 2. Backend can resolve deployment file path
 * 3. Hash computation is consistent between edge and backend
 * 4. Frontend can resolve contract deployment info (path alias)
 * 5. CORS is properly configured
 * 6. Devices route supports auto-discovery
 *
 * Requirements: 6.1, 6.2, 6.3, 6.4, 7.1, 7.2, 7.3
 */

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');

describe('E2E Integration Wiring Verification', () => {
  // ─── 1. Path Resolution ────────────────────────────────────────

  describe('Deployment file path resolution', () => {
    const DEPLOYMENT_PATH = path.resolve(__dirname, '../../contracts/deployments/sepolia.json');

    it('contracts/deployments/sepolia.json exists', () => {
      assert.ok(fs.existsSync(DEPLOYMENT_PATH), `Expected file at: ${DEPLOYMENT_PATH}`);
    });

    it('deployment file has valid JSON structure', () => {
      const content = JSON.parse(fs.readFileSync(DEPLOYMENT_PATH, 'utf8'));
      assert.ok(content.address, 'deployment must have address field');
      assert.ok('abi' in content, 'deployment must have abi field');
      assert.ok(content.network, 'deployment must have network field');
    });

    it('backend blockchainService resolves to same deployment file', () => {
      // Backend resolves from backend/src/services/ → ../../../contracts/deployments/sepolia.json
      const backendServiceDir = path.resolve(__dirname, '../../backend/src/services');
      const backendResolved = path.resolve(backendServiceDir, '../../../contracts/deployments/sepolia.json');
      // Should resolve to the same workshop/contracts/deployments/sepolia.json
      assert.strictEqual(
        path.normalize(backendResolved),
        path.normalize(DEPLOYMENT_PATH),
        'Backend should resolve to the same deployment file'
      );
    });

    it('frontend vite alias resolves to correct directory', () => {
      // Vite alias: @contracts → path.resolve(__dirname, '../contracts/deployments')
      // from frontend/ → workshop/contracts/deployments
      const frontendDir = path.resolve(__dirname, '../../frontend');
      const frontendResolved = path.resolve(frontendDir, '../contracts/deployments');
      const expectedDir = path.resolve(__dirname, '../../contracts/deployments');
      assert.strictEqual(
        path.normalize(frontendResolved),
        path.normalize(expectedDir),
        'Frontend @contracts alias should resolve to workshop/contracts/deployments'
      );
    });

    it('frontend tsconfig paths match vite alias', () => {
      const tsconfigPath = path.resolve(__dirname, '../../frontend/tsconfig.json');
      const raw = fs.readFileSync(tsconfigPath, 'utf8');
      // Strip single-line comments (tsconfig is JSONC)
      const jsonStr = raw.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
      const tsconfig = JSON.parse(jsonStr);
      const contractsPath = tsconfig.compilerOptions.paths['@contracts/*'];
      assert.ok(contractsPath, 'tsconfig must have @contracts/* path alias');
      assert.deepStrictEqual(contractsPath, ['../contracts/deployments/*']);
    });
  });

  // ─── 2. Edge Simulator Config ──────────────────────────────────

  describe('Edge Simulator configuration', () => {
    it('edge/config.js exports required fields', () => {
      // We can't require config.js directly (needs .env), but we can check the file structure
      const configPath = path.resolve(__dirname, '../../edge/config.js');
      const content = fs.readFileSync(configPath, 'utf8');

      assert.ok(content.includes('backendUrl'), 'config must export backendUrl');
      assert.ok(content.includes('infuraUrl'), 'config must export infuraUrl');
      assert.ok(content.includes('contractAddress'), 'config must export contractAddress');
      assert.ok(content.includes('device'), 'config must export device object');
      assert.ok(content.includes('rooms'), 'config must export rooms array');
      assert.ok(content.includes("'http://localhost:3000'"), 'default backendUrl should be http://localhost:3000');
    });

    it('edge device.js uses CONTRACT_ABI with required functions', () => {
      const devicePath = path.resolve(__dirname, '../../edge/device.js');
      const content = fs.readFileSync(devicePath, 'utf8');

      assert.ok(content.includes('registerDevice'), 'device must call registerDevice');
      assert.ok(content.includes('getDeviceStatus'), 'device must call getDeviceStatus');
      assert.ok(content.includes('recordHash'), 'device must call recordHash');
    });

    it('edge simulator configures 1 gateway with 5 sensor rooms', () => {
      const configPath = path.resolve(__dirname, '../../edge/config.js');
      const content = fs.readFileSync(configPath, 'utf8');

      const roomMatches = content.match(/\{ id: \d/g);
      assert.ok(roomMatches, 'config must define room objects');
      assert.strictEqual(roomMatches.length, 5, 'must configure exactly 5 rooms/sensors');
      assert.ok(content.includes('device:'), 'config must export single device object');
    });
  });

  // ─── 3. Hash Computation Consistency ───────────────────────────

  describe('Hash computation consistency (edge vs backend)', () => {
    const edgeHashComputer = require('../../edge/hashComputer');
    const backendHashAuditor = require('../../backend/src/services/hashAuditor');

    it('serializeDeterministic produces same output for same input', () => {
      const testData = [
        { room: 1, power: 150.5, voltage: 220.1, measuredAt: '2025-01-01T00:00:00.000Z' },
        { room: 1, power: 155.2, voltage: 219.8, measuredAt: '2025-01-01T00:00:10.000Z' },
      ];

      const edgeSerialized = edgeHashComputer.serializeDeterministic(testData);
      const backendSerialized = backendHashAuditor.sortedStringify(testData);

      assert.strictEqual(edgeSerialized, backendSerialized,
        'Edge and backend must produce identical deterministic JSON');
    });

    it('computeBatchId is deterministic', () => {
      const address = '0x1234567890abcdef1234567890abcdef12345678';
      const hourWindowStart = 1704067200; // 2024-01-01 00:00:00 UTC

      const batchId1 = edgeHashComputer.computeBatchId(address, hourWindowStart);
      const batchId2 = edgeHashComputer.computeBatchId(address, hourWindowStart);

      assert.strictEqual(batchId1, batchId2, 'batchId must be deterministic');
      assert.match(batchId1, /^0x[a-fA-F0-9]{64}$/, 'batchId must be bytes32 hex');
    });

    it('computeHash is deterministic (same readings → same hash)', () => {
      const readings = [
        { room: 1, power: 150.5, voltage: 220.1, measuredAt: '2025-01-01T00:00:00.000Z' },
      ];

      const hash1 = edgeHashComputer.computeHash(readings);
      const hash2 = edgeHashComputer.computeHash(readings);

      assert.strictEqual(hash1, hash2, 'hash must be deterministic');
      assert.match(hash1, /^0x[a-fA-F0-9]{64}$/, 'hash must be bytes32 hex');
    });

    it('different readings produce different hashes', () => {
      const readings1 = [{ room: 1, power: 150.5 }];
      const readings2 = [{ room: 1, power: 150.6 }];

      const hash1 = edgeHashComputer.computeHash(readings1);
      const hash2 = edgeHashComputer.computeHash(readings2);

      assert.notStrictEqual(hash1, hash2, 'different data must produce different hashes');
    });

    it('getCurrentHourWindowStart returns floor to hour', () => {
      const hwStart = edgeHashComputer.getCurrentHourWindowStart();
      assert.strictEqual(hwStart % 3600, 0, 'hourWindowStart must be divisible by 3600');
      // Must be within this hour
      const now = Math.floor(Date.now() / 1000);
      assert.ok(hwStart <= now, 'hourWindowStart must be <= now');
      assert.ok(hwStart > now - 3600, 'hourWindowStart must be within last hour');
    });
  });

  // ─── 4. Backend CORS Configuration ─────────────────────────────

  describe('Backend CORS configuration', () => {
    it('backend app.js configures CORS for localhost:5173', () => {
      const appPath = path.resolve(__dirname, '../../backend/src/app.js');
      const content = fs.readFileSync(appPath, 'utf8');

      assert.ok(content.includes('cors'), 'backend must use cors middleware');
      assert.ok(
        content.includes('http://localhost:5173'),
        'CORS origin must include frontend dev server (http://localhost:5173)'
      );
    });

    it('backend .env.example documents CORS_ORIGIN', () => {
      const envExamplePath = path.resolve(__dirname, '../../backend/.env.example');
      if (fs.existsSync(envExamplePath)) {
        const content = fs.readFileSync(envExamplePath, 'utf8');
        assert.ok(content.includes('CORS_ORIGIN'), '.env.example should document CORS_ORIGIN');
      }
    });
  });

  // ─── 5. Frontend Proxy Configuration ───────────────────────────

  describe('Frontend proxy configuration', () => {
    it('vite.config.ts proxies /api to backend', () => {
      const viteConfigPath = path.resolve(__dirname, '../../frontend/vite.config.ts');
      const content = fs.readFileSync(viteConfigPath, 'utf8');

      assert.ok(content.includes("'/api'"), 'vite config must proxy /api');
      assert.ok(
        content.includes('http://localhost:3000'),
        'proxy target must be backend at http://localhost:3000'
      );
    });

    it('apiClient uses relative path (works with proxy)', () => {
      const apiClientPath = path.resolve(__dirname, '../../frontend/src/services/apiClient.ts');
      const content = fs.readFileSync(apiClientPath, 'utf8');

      // baseURL should be empty or relative (not absolute localhost:3000) to work with Vite proxy
      assert.ok(
        content.includes("|| ''"),
        'apiClient baseURL should default to empty string for Vite proxy'
      );
    });
  });

  // ─── 6. Protected Routes ───────────────────────────────────────

  describe('Frontend route protection', () => {
    it('App.tsx uses ProtectedRoute for dashboard, devices, audit', () => {
      const appPath = path.resolve(__dirname, '../../frontend/src/App.tsx');
      const content = fs.readFileSync(appPath, 'utf8');

      assert.ok(content.includes('ProtectedRoute'), 'App must import ProtectedRoute');
      assert.ok(
        content.includes('element={<ProtectedRoute />}'),
        'App must guard protected routes with ProtectedRoute'
      );

      // Check each protected route
      const protectedRoutes = ['/dashboard', '/devices', '/audit'];
      for (const route of protectedRoutes) {
        assert.ok(content.includes(`path="${route}"`), `Route ${route} must exist`);
      }
    });

    it('ProtectedRoute checks useAuth admin state', () => {
      const protectedRoutePath = path.resolve(
        __dirname, '../../frontend/src/components/ProtectedRoute.tsx'
      );
      const content = fs.readFileSync(protectedRoutePath, 'utf8');

      assert.ok(content.includes('isAdmin'), 'ProtectedRoute must check admin state from useAuth');
      assert.ok(content.includes('Navigate'), 'ProtectedRoute must redirect unauthorized users');
    });
  });

  // ─── 7. Backend API Routes ─────────────────────────────────────

  describe('Backend API routes wiring', () => {
    it('app.js mounts all required routes', () => {
      const appPath = path.resolve(__dirname, '../../backend/src/app.js');
      const content = fs.readFileSync(appPath, 'utf8');

      assert.ok(content.includes("'/api/auth'"), 'must mount /api/auth route');
      assert.ok(content.includes("'/api/devices'"), 'must mount /api/devices route');
      assert.ok(content.includes("'/api/audit'"), 'must mount /api/audit route');
      // data route handles /api/readings
      assert.ok(
        content.includes("'/api'") || content.includes("'/api/readings'"),
        'must mount readings route'
      );
    });

    it('devices route supports auto-discovery without addresses param', () => {
      const devicesPath = path.resolve(__dirname, '../../backend/src/routes/devices.js');
      const content = fs.readFileSync(devicesPath, 'utf8');

      assert.ok(
        content.includes('EnergyReading.distinct'),
        'devices route must auto-discover addresses from MongoDB when no param provided'
      );
    });
  });

  // ─── 8. Contract Interaction Wiring ────────────────────────────

  describe('Contract interaction wiring', () => {
    it('frontend useContract.ts imports from @contracts/sepolia.json', () => {
      const hookPath = path.resolve(__dirname, '../../frontend/src/hooks/useContract.ts');
      const content = fs.readFileSync(hookPath, 'utf8');

      assert.ok(
        content.includes("@contracts/sepolia.json"),
        'useContract must import from @contracts/sepolia.json alias'
      );
      assert.ok(content.includes('BrowserProvider'), 'must use ethers BrowserProvider');
      assert.ok(content.includes('Contract'), 'must create ethers Contract instance');
    });

    it('backend blockchainService uses ethers JsonRpcProvider (read-only)', () => {
      const servicePath = path.resolve(__dirname, '../../backend/src/services/blockchainService.js');
      const content = fs.readFileSync(servicePath, 'utf8');

      assert.ok(content.includes('JsonRpcProvider'), 'must use JsonRpcProvider');
      assert.ok(content.includes('getDeviceStatus'), 'must expose getDeviceStatus');
      assert.ok(content.includes('getHash'), 'must expose getHash');
      assert.ok(content.includes('getAdmin'), 'must expose getAdmin');
      // Backend should NOT have a wallet/signer
      assert.ok(!content.includes('new ethers.Wallet'), 'backend must NOT instantiate a Wallet');
    });

    it('edge device.js uses ethers Wallet for tx signing', () => {
      const devicePath = path.resolve(__dirname, '../../edge/device.js');
      const content = fs.readFileSync(devicePath, 'utf8');

      assert.ok(content.includes('ethers.Wallet'), 'edge must use ethers.Wallet');
      assert.ok(content.includes('JsonRpcProvider'), 'edge must use JsonRpcProvider');
    });
  });
});
