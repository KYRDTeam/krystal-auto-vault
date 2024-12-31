import * as anchor from "@coral-xyz/anchor";
import {
    Keypair, PublicKey,
    TransactionMessage,
    VersionedTransaction,
    AddressLookupTableAccount
} from "@solana/web3.js";

export const wait = (msec: number) => new Promise((resolve, _) => {
    setTimeout(resolve, msec)
});

export async function buildTransaction(
    {
        connection,
        payer,
        signers,
        instructions,
        lookupTableAccounts = [],
    }: {
        connection: anchor.web3.Connection,
        payer: PublicKey,
        signers: Keypair[],
        instructions: anchor.web3.TransactionInstruction[],
        lookupTableAccounts?: AddressLookupTableAccount[]
    }
): Promise<VersionedTransaction> {
    let latestBlockhash = await connection.getLatestBlockhash();

    const messageV0 = new TransactionMessage({
        payerKey: payer,
        recentBlockhash: latestBlockhash.blockhash,
        instructions,
    }).compileToV0Message(lookupTableAccounts);

    const tx = new VersionedTransaction(messageV0);

    if (signers.length > 0) {
        signers.forEach(s => {
            tx.sign([s])
        });
    }

    return tx;
}
