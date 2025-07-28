import { IssuerSparkWallet } from "@buildonspark/issuer-sdk";

const WALLET_SERVER_URL = "http://localhost:3456";
const GENERATE_FUNDED_MNEMONICS_URL = `${WALLET_SERVER_URL}/setup/generate-funded-mnemonics`;
const CLEAR_CACHE_URL = `${WALLET_SERVER_URL}/cache/clear`;

export interface GetFundedWalletMnemonicsResponse {
  mnemonics: string[];
  tokenIdentifier: string;
}

async function _getFundedWalletsInfo(numWallets: number, satsAmount: number, tokensAmount: number): Promise<GetFundedWalletMnemonicsResponse> {
  let response = await fetch(GENERATE_FUNDED_MNEMONICS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      count: numWallets,
      satsAmount,
      tokensAmount,
    }),
  })

  if (!response.ok) {
    throw new Error(`Failed to generate funded mnemonics: ${response.statusText}`);
  }

  await clearWalletServerCache();

  let data = await response.json() as GetFundedWalletMnemonicsResponse;

  return data;
}

export async function getFundedWalletInfo(satsAmount: number, tokensAmount: number): Promise<{mnemonic: string, tokenIdentifier: string}> {
  let data = await _getFundedWalletsInfo(1, satsAmount, tokensAmount);

  return {
    mnemonic: data.mnemonics[0]!,
    tokenIdentifier: data.tokenIdentifier,
  }
}

export async function getFundedUserWalletsInfo(numUsers: number, satsAmount: number, tokensAmount: number): Promise<{mnemonics: string[], tokenIdentifier: string}> {
  let data = await _getFundedWalletsInfo(numUsers, satsAmount, tokensAmount);

  return data;
}


async function clearWalletServerCache() {
  let response = await fetch(CLEAR_CACHE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to clear wallet server cache: ${response.statusText}`);
  }

  return response.json();
}

