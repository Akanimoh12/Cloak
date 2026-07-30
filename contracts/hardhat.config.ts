import hardhatToolboxViemPlugin from '@nomicfoundation/hardhat-toolbox-viem';
import { configVariable, defineConfig } from 'hardhat/config';
import noxPlugin from '@iexec-nox/nox-hardhat-plugin';

export default defineConfig({
  plugins: [hardhatToolboxViemPlugin, noxPlugin],
  solidity: '0.8.35',
  networks: {
    // local network used by the Nox plugin's dockerized test stack
    default: {
      type: 'edr-simulated',
      chainType: 'op',
      allowUnlimitedContractSize: true,
    },
    sepolia: {
      type: 'http',
      url: configVariable('SEPOLIA_RPC'),
      accounts: [configVariable('PK')],
    },
  },
});
