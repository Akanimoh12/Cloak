import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { nox } from '@iexec-nox/nox-hardhat-plugin';
import { parseUnits, zeroAddress } from 'viem';

describe('CloakVault', () => {
  it('aggregates encrypted intents and reveals only the net delta', async () => {
    const { viem } = await nox.connect();
    const [wallet] = await viem.getWalletClients();
    const me = wallet.account.address;

    const base = await viem.deployContract('TestUSDC', []);
    const target = await viem.deployContract('TestUSDC', []);
    const router = await viem.deployContract('MockSwapRouter', []);

    const vault = await viem.deployContract('CloakVault', [
      base.address,
      target.address,
      router.address,
      zeroAddress,
      3000,
      me,
      me,
    ]);

    await base.write.mint([me, parseUnits('10000', 6)]);
    await target.write.mint([router.address, parseUnits('10000', 6)]);
    await base.write.approve([vault.address, parseUnits('10000', 6)]);
    await vault.write.deposit([parseUnits('10000', 6)]);
    assert.equal(await vault.read.totalAssets(), parseUnits('10000', 6));

    // two encrypted intents: +500 and -200 tUSDC
    for (const delta of [500_000_000n, -200_000_000n]) {
      const { handle, handleProof } = await nox.encryptInput(
        delta,
        'int256',
        vault.address,
      );
      await vault.write.submitIntent([handle, handleProof]);
    }
    assert.equal(await vault.read.epochIntentCount([0n]), 2n);

    // manager can privately decrypt the running aggregate
    const netHandle = await vault.read.netDeltaHandle();
    const { value: privateView } = await nox.decrypt(netHandle);
    assert.equal(privateView, 300_000_000n);

    // after close, only the net becomes publicly decryptable
    await vault.write.closeEpoch();
    const { value, decryptionProof } = await nox.publicDecrypt(netHandle);
    assert.equal(value, 300_000_000n);

    await vault.write.executeRebalance([decryptionProof, 0n]);
    assert.equal(await vault.read.epoch(), 1n);
    assert.equal(await target.read.balanceOf([vault.address]), 300_000_000n);

    // fresh epoch starts from an encrypted zero
    const freshHandle = await vault.read.netDeltaHandle();
    const { value: fresh } = await nox.decrypt(freshHandle);
    assert.equal(fresh, 0n);
  });
});
