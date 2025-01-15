import anchor from "@coral-xyz/anchor";
import { KrystalAutoVault } from "../target/types/krystal_auto_vault.js";
import {
  Keypair, PublicKey, SystemProgram,
} from "@solana/web3.js";
import {
  MINT_SIZE, createInitializeMint2Instruction, getAssociatedTokenAddressSync,
  createMintToInstruction,
  TOKEN_2022_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
} from "@solana/spl-token";
import { expect } from "chai";
import { buildTransaction } from "./helper.js";
import pRetry from 'p-retry';

const UserVaultSeed = "userVault";
const GlobalStateSeed = "globalState";

describe("krystal-auto-vault", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.KrystalAutoVault as anchor.Program<KrystalAutoVault>;
  const provider = anchor.AnchorProvider.env();
  const payer = provider.wallet;
  const user = Keypair.generate();
  const tokenMint = Keypair.generate();

  console.log("user:", user.publicKey.toBase58());

  it("should update admin successfully", async () => {
    const newAdmin = Keypair.generate();
    const updateAdminIx = await program.methods
      .updateAdmin()
      .accounts({
        admin: payer.publicKey,
        newAdmin: newAdmin.publicKey,
      })
      .instruction();

    const tx = await buildTransaction({
      connection: provider.connection,
      payer: payer.publicKey,
      signers: [],
      instructions: [updateAdminIx],
    });

    const signedTx = await payer.signTransaction(tx);
    const simulateResult = await provider.connection.simulateTransaction(signedTx, { sigVerify: true });
    expect(simulateResult.value.err).to.be.null;
  });

  it("should fail to update admin by non-admin account", async () => {
    const newAdmin = Keypair.generate();
    const updateAdminIx = await program.methods
      .updateAdmin()
      .accounts({
        admin: newAdmin.publicKey,
        newAdmin: newAdmin.publicKey,
      })
      .instruction();

    const tx = await buildTransaction({
      connection: provider.connection,
      payer: payer.publicKey,
      signers: [newAdmin],
      instructions: [updateAdminIx],
    });

    const signedTx = await payer.signTransaction(tx);
    const simulateResult = await provider.connection.simulateTransaction(signedTx, { sigVerify: true });
    expect(simulateResult.value.err).to.not.be.null;
  });

  it("should add and remove operator successfully", async () => {
    const operator = Keypair.generate();
    const addOperatorIx = await program.methods
      .updateOperator(true)
      .accounts({
        admin: payer.publicKey,
        operator: operator.publicKey,
      })
      .instruction();

    const removeOperatorIx = await program.methods
      .updateOperator(false).accounts({
        admin: payer.publicKey,
        operator: operator.publicKey,
      })
      .instruction();

    const tx = await buildTransaction({
      connection: provider.connection,
      payer: payer.publicKey,
      signers: [],
      instructions: [addOperatorIx, removeOperatorIx],
    });

    const signedTx = await payer.signTransaction(tx);
    const simulateResult = await provider.connection.simulateTransaction(signedTx, { sigVerify: true });
    expect(simulateResult.value.err).to.be.null;
  });

  it("should fail to add operator by non-admin account", async () => {
    const newAdmin = Keypair.generate();

    const updateAdminIx = await program.methods
      .updateOperator(true)
      .accounts({
        admin: newAdmin.publicKey,
        operator: newAdmin.publicKey,
      })
      .instruction();

    const tx = await buildTransaction({
      connection: provider.connection,
      payer: payer.publicKey,
      signers: [newAdmin],
      instructions: [updateAdminIx],
    });

    const signedTx = await payer.signTransaction(tx);

    const simulateResult = await provider.connection.simulateTransaction(signedTx, { sigVerify: true });
    expect(simulateResult.value.err).to.not.be.null;
  })

  it("should create PDA global account with owner data", async () => {
    // Derive the PDA address
    const [pda, bump] = PublicKey.findProgramAddressSync(
      [Buffer.from(GlobalStateSeed)],
      program.programId
    );
    console.log("globalState PDA:", pda.toBase58());

    const globalStateAccountInfo = await provider.connection.getAccountInfo(pda);

    if (globalStateAccountInfo == null) {
      // Create the PDA account
      const tx = await program.methods
        .initializeGlobalState()
        .accounts({
          payer: payer.publicKey,
          admin: payer.publicKey,
        })
        .rpc();

      console.log("Create Global State PDA signature", tx);
    }

    const globalStateAccount = await program.account.globalState.fetch(pda);

    expect(globalStateAccount.admin.toBase58()).to.equal(payer.publicKey.toBase58());
    const operators = globalStateAccount.operators.map(operator => operator.toBase58());
    expect(operators).to.include(payer.publicKey.toBase58());
    expect(globalStateAccount.bump).to.equal(bump);
  })

  it("should create PDA account with owner data if needed", async () => {

    // Derive the PDA address
    const [pda, bump] = PublicKey.findProgramAddressSync(
      [Buffer.from(UserVaultSeed), user.publicKey.toBuffer()],
      program.programId
    );

    console.log("userVault", pda.toBase58());

    const pdaAccountInfo = await provider.connection.getAccountInfo(pda);
    if (pdaAccountInfo == null) {
      // Create the PDA account
      const tx = await program.methods
        .initializeUserPda()
        .accounts({
          payer: payer.publicKey,
          owner: user.publicKey,
        })
        .rpc();

      console.log("Create PDA signature", tx);
    }

    const userVault = await program.account.userVault.fetch(pda);
    expect(userVault.owner.toBase58()).to.equal(user.publicKey.toBase58());
    expect(userVault.bump).to.equal(bump);
  });

  it("should create SPL token and mint token to user vault", async () => {
    console.log("tokenMint", tokenMint.publicKey.toBase58());

    const tokenConfig = {
      decimals: 9,
      name: "My USD",
      symbol: "mUSD",
    }

    const createMintInstruction = SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: tokenMint.publicKey,
      lamports: await provider.connection.getMinimumBalanceForRentExemption(MINT_SIZE),
      space: MINT_SIZE,
      programId: TOKEN_2022_PROGRAM_ID,
    });

    const initializeMintInstruction = createInitializeMint2Instruction(
      tokenMint.publicKey,
      tokenConfig.decimals,
      payer.publicKey,
      payer.publicKey,
      TOKEN_2022_PROGRAM_ID,
    );

    const [userVaultPda, bump] = PublicKey.findProgramAddressSync(
      [Buffer.from(UserVaultSeed), user.publicKey.toBuffer()],
      program.programId
    );
    const pdaATA = getAssociatedTokenAddressSync(tokenMint.publicKey, userVaultPda, true, TOKEN_2022_PROGRAM_ID);
    const createATA = createAssociatedTokenAccountIdempotentInstruction(payer.publicKey, pdaATA, userVaultPda, tokenMint.publicKey, TOKEN_2022_PROGRAM_ID);
    const balance = 1000;
    const mintToIx = createMintToInstruction(tokenMint.publicKey, pdaATA, payer.publicKey, balance, [], TOKEN_2022_PROGRAM_ID);
    const instructions = [
      createMintInstruction,
      initializeMintInstruction,
      createATA,
      mintToIx,
    ];

    const tx = await buildTransaction({
      connection: provider.connection,
      payer: payer.publicKey,
      signers: [tokenMint],
      instructions,
    });
    const signedTx = await payer.signTransaction(tx);

    const txSig = await provider.connection.sendTransaction(signedTx);
    console.log("Create Mint signature", txSig);

    // Wait for the transaction to be confirmed
    const accountInfo = await pRetry(async () => {
      const info = await provider.connection.getAccountInfo(pdaATA);
      if (info == null) {
        throw new Error("Account not created yet");
      }
      return info;
    }, {
      retries: 20,
      minTimeout: 1000,
      maxTimeout: 1000,
      factor: 1
    })

    expect(accountInfo).to.not.be.null;

    const userVaultAccount = await provider.connection.getTokenAccountBalance(pdaATA);
    expect(userVaultAccount.value.amount).to.equal(balance.toString());
  });

  it("should transfer sol successfully", async () => {
    const userPublicKey = user.publicKey;
    // Derive the PDA address
    const [pda, bump] = PublicKey.findProgramAddressSync(
      [Buffer.from(UserVaultSeed), userPublicKey.toBuffer()],
      program.programId
    );

    // ========= Transfer SOL =========
    const setupSolIx = SystemProgram.transfer({
      fromPubkey: payer.publicKey,
      toPubkey: pda,
      lamports: 1,
    })

    const setupTx = await buildTransaction({
      connection: provider.connection,
      payer: payer.publicKey,
      signers: [],
      instructions: [setupSolIx],
    })
    const signedSetupTx = await payer.signTransaction(setupTx);

    const sendTxSig = await provider.sendAndConfirm(signedSetupTx);
    console.log("Setup transaction signature", sendTxSig);
    // ==================

    // Transfer 1 lamport to the user
    const transferByAdminIx = await program.methods
      .transferLamports(new anchor.BN(1))
      .accounts({
        user: payer.publicKey,
        to: payer.publicKey,
      })
      .instruction();

    const transferByAdminTx = await buildTransaction({
      connection: provider.connection,
      payer: payer.publicKey,
      signers: [],
      instructions: [transferByAdminIx],
    });
    const signedTransferByAdminTx = await payer.signTransaction(transferByAdminTx);

    const simulateTransferByAdminResult = await provider.connection.simulateTransaction(signedTransferByAdminTx);
    console.log("simulateTransferByAdminResult", simulateTransferByAdminResult.value.err);
    expect(simulateTransferByAdminResult.value.err).to.not.be.null;

    // Transfer 1 lamport to the user
    const transferLamportsIx = await program.methods
      .transferLamports(new anchor.BN(1))
      .accounts({
        user: user.publicKey,
        to: payer.publicKey,
      })
      .instruction();

    const transferTx = await buildTransaction({
      connection: provider.connection,
      payer: payer.publicKey,
      signers: [user],
      instructions: [transferLamportsIx],
    });
    const signedTx = await payer.signTransaction(transferTx);

    const simulateResult = await provider.connection.simulateTransaction(signedTx);
    expect(simulateResult.value.err).to.be.null;

    const txSig = await provider.connection.sendTransaction(signedTx);
    console.log("transfer sol transaction signature", txSig);
  });

  it("should transfer spl token by owner successfully", async () => {
    // Derive the PDA address
    const [pda, bump] = PublicKey.findProgramAddressSync(
      [Buffer.from(UserVaultSeed), user.publicKey.toBuffer()],
      program.programId
    );

    const pdaAta = getAssociatedTokenAddressSync(tokenMint.publicKey, pda, true, TOKEN_2022_PROGRAM_ID);
    const payerAta = getAssociatedTokenAddressSync(tokenMint.publicKey, payer.publicKey, false, TOKEN_2022_PROGRAM_ID);
    const createRecipientAtaIx = createAssociatedTokenAccountIdempotentInstruction(
      payer.publicKey, payerAta, payer.publicKey, tokenMint.publicKey, TOKEN_2022_PROGRAM_ID
    );

    const transferIx = await program.methods
      .transferToken(new anchor.BN(1))
      .accounts({
        user: user.publicKey,
        fromTokenAccount: pdaAta,
        toTokenAccount: payerAta,
        mint: tokenMint.publicKey,
        tokenProgram: TOKEN_2022_PROGRAM_ID
      })
      .instruction();
    const tx = await buildTransaction({
      connection: provider.connection,
      payer: payer.publicKey,
      instructions: [createRecipientAtaIx, transferIx],
      signers: [user],
    })

    const signedTx = await payer.signTransaction(tx);
    const simulateResult = await provider.connection.simulateTransaction(signedTx);
    expect(simulateResult.value.err).to.be.null;
  });

  it("should fail to transfer token by non-operator", async () => {
    // Derive the PDA address
    const [pda, bump] = PublicKey.findProgramAddressSync(
      [Buffer.from(UserVaultSeed), user.publicKey.toBuffer()],
      program.programId
    );

    const operator = Keypair.generate();

    const pdaAta = getAssociatedTokenAddressSync(tokenMint.publicKey, pda, true, TOKEN_2022_PROGRAM_ID);
    const payerAta = getAssociatedTokenAddressSync(tokenMint.publicKey, payer.publicKey, false, TOKEN_2022_PROGRAM_ID);
    const createRecipientAtaIx = createAssociatedTokenAccountIdempotentInstruction(
      payer.publicKey, payerAta, payer.publicKey, tokenMint.publicKey, TOKEN_2022_PROGRAM_ID
    );

    const transferIx = await program.methods
      .transferByOperator(new anchor.BN(1))
      .accounts({
        operator: operator.publicKey,
        user: user.publicKey,
        fromTokenAccount: pdaAta,
        toTokenAccount: payerAta,
        mint: tokenMint.publicKey,
        tokenProgram: TOKEN_2022_PROGRAM_ID
      })
      .instruction();

    const tx = await buildTransaction({
      connection: provider.connection,
      payer: payer.publicKey,
      instructions: [createRecipientAtaIx, transferIx],
      signers: [operator],
    })

    const signedTx = await payer.signTransaction(tx);
    const simulateResult = await provider.connection.simulateTransaction(signedTx);
    console.log("simulateResult", simulateResult.value.err);
    expect(simulateResult.value.err).to.not.be.null;
  })

  it("should transfer spl token by operator successfully", async () => {
    // Derive the PDA address
    const [pda, bump] = PublicKey.findProgramAddressSync(
      [Buffer.from(UserVaultSeed), user.publicKey.toBuffer()],
      program.programId
    );

    const pdaAta = getAssociatedTokenAddressSync(tokenMint.publicKey, pda, true, TOKEN_2022_PROGRAM_ID);
    const payerAta = getAssociatedTokenAddressSync(tokenMint.publicKey, payer.publicKey, false, TOKEN_2022_PROGRAM_ID);
    const createRecipientAtaIx = createAssociatedTokenAccountIdempotentInstruction(
      payer.publicKey, payerAta, payer.publicKey, tokenMint.publicKey, TOKEN_2022_PROGRAM_ID
    );

    const transferIx = await program.methods
      .transferByOperator(new anchor.BN(1))
      .accounts({
        operator: payer.publicKey,
        user: user.publicKey,
        fromTokenAccount: pdaAta,
        toTokenAccount: payerAta,
        mint: tokenMint.publicKey,
        tokenProgram: TOKEN_2022_PROGRAM_ID
      })
      .instruction();

    const tx = await buildTransaction({
      connection: provider.connection,
      payer: payer.publicKey,
      instructions: [createRecipientAtaIx, transferIx],
      signers: [],
    })

    const signedTx = await payer.signTransaction(tx);
    const simulateResult = await provider.connection.simulateTransaction(signedTx);
    expect(simulateResult.value.err).to.be.null;
  });

  it("should withdraw token by operator successfully", async () => {
    // Derive the PDA address
    const [pda, bump] = PublicKey.findProgramAddressSync(
      [Buffer.from(UserVaultSeed), user.publicKey.toBuffer()],
      program.programId
    );

    const pdaAta = getAssociatedTokenAddressSync(tokenMint.publicKey, pda, true, TOKEN_2022_PROGRAM_ID);
    const payerAta = getAssociatedTokenAddressSync(tokenMint.publicKey, payer.publicKey, false, TOKEN_2022_PROGRAM_ID);
    const createRecipientAtaIx = createAssociatedTokenAccountIdempotentInstruction(
      payer.publicKey, payerAta, payer.publicKey, tokenMint.publicKey, TOKEN_2022_PROGRAM_ID
    );

    const transferIx = await program.methods
      .withdrawTokenByOperator()
      .accounts({
        operator: payer.publicKey,
        user: user.publicKey,
        fromTokenAccount: pdaAta,
        toTokenAccount: payerAta,
        mint: tokenMint.publicKey,
        tokenProgram: TOKEN_2022_PROGRAM_ID
      })
      .instruction();

    const tx = await buildTransaction({
      connection: provider.connection,
      payer: payer.publicKey,
      instructions: [createRecipientAtaIx, transferIx],
      signers: [],
    })

    const signedTx = await payer.signTransaction(tx);
    const simulateResult = await provider.connection.simulateTransaction(signedTx);
    expect(simulateResult.value.err).to.be.null;
  });

  it("should fail to withdraw token by non-operator", async () => {
    // Derive the PDA address
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from(UserVaultSeed), user.publicKey.toBuffer()],
      program.programId
    );

    const operator = Keypair.generate();

    const pdaAta = getAssociatedTokenAddressSync(tokenMint.publicKey, pda, true, TOKEN_2022_PROGRAM_ID);
    const payerAta = getAssociatedTokenAddressSync(tokenMint.publicKey, payer.publicKey, false, TOKEN_2022_PROGRAM_ID);
    const createRecipientAtaIx = createAssociatedTokenAccountIdempotentInstruction(
      payer.publicKey, payerAta, payer.publicKey, tokenMint.publicKey, TOKEN_2022_PROGRAM_ID
    );

    const transferIx = await program.methods
      .withdrawTokenByOperator()
      .accounts({
        operator: operator.publicKey,
        user: user.publicKey,
        fromTokenAccount: pdaAta,
        toTokenAccount: payerAta,
        mint: tokenMint.publicKey,
        tokenProgram: TOKEN_2022_PROGRAM_ID
      })
      .instruction();

    const tx = await buildTransaction({
      connection: provider.connection,
      payer: payer.publicKey,
      instructions: [createRecipientAtaIx, transferIx],
      signers: [operator],
    })

    const signedTx = await payer.signTransaction(tx);
    const simulateResult = await provider.connection.simulateTransaction(signedTx);
    console.log("withdraw by non-operator simulate result", simulateResult.value.err);
    expect(simulateResult.value.err).to.not.be.null;
  })

  it("should approve and revoke approval successfully", async () => {

    // Derive the PDA address
    const [pda, bump] = PublicKey.findProgramAddressSync(
      [Buffer.from(UserVaultSeed), user.publicKey.toBuffer()],
      program.programId
    );

    const tokenAccount = getAssociatedTokenAddressSync(tokenMint.publicKey, pda, true, TOKEN_2022_PROGRAM_ID);

    const delegate = payer.publicKey;

    const approveIx = await program.methods
      .approveToken(new anchor.BN(10))
      .accounts({
        user: user.publicKey,
        tokenAccount: tokenAccount,
        delegate: delegate,
        tokenProgram: TOKEN_2022_PROGRAM_ID
      })
      .instruction();

    const revokeIx = await program.methods
      .revokeApproval()
      .accounts({
        user: user.publicKey,
        tokenAccount: tokenAccount,
        delegate: delegate,
        tokenProgram: TOKEN_2022_PROGRAM_ID
      })
      .instruction();

    const instructions = [
      approveIx,
      revokeIx,
    ];

    const tx = await buildTransaction({
      connection: provider.connection,
      payer: payer.publicKey,
      instructions: instructions,
      signers: [],
    })

    const signedTx = await payer.signTransaction(tx);
    const simulateResult = await provider.connection.simulateTransaction(signedTx);
    expect(simulateResult.value.err).to.be.null;
  });

  it("should withdraw and close token account by operator successfully", async () => {
    // Derive the PDA address
    const [pda, _bump] = PublicKey.findProgramAddressSync(
      [Buffer.from(UserVaultSeed), user.publicKey.toBuffer()],
      program.programId
    );

    const tokenAccount = getAssociatedTokenAddressSync(tokenMint.publicKey, pda, true, TOKEN_2022_PROGRAM_ID);
    const destATA = getAssociatedTokenAddressSync(tokenMint.publicKey, payer.publicKey, false, TOKEN_2022_PROGRAM_ID);
    const createDestAta = createAssociatedTokenAccountIdempotentInstruction(payer.publicKey, destATA, payer.publicKey, tokenMint.publicKey, TOKEN_2022_PROGRAM_ID);

    const withdrawIx = await program.methods
      .withdrawToken()
      .accounts({
        user: user.publicKey,
        fromTokenAccount: tokenAccount,
        toTokenAccount: destATA,
        mint: tokenMint.publicKey,
        tokenProgram: TOKEN_2022_PROGRAM_ID
      })
      .instruction();

    const closeIx = await program.methods
      .closeTokenAccount()
      .accounts({
        user: user.publicKey,
        tokenAccount: tokenAccount,
        destination: payer.publicKey,
        tokenProgram: TOKEN_2022_PROGRAM_ID
      })
      .instruction();

    const tx = await buildTransaction({
      connection: provider.connection,
      payer: payer.publicKey,
      instructions: [createDestAta, withdrawIx, closeIx],
      signers: [user],
    })

    const signedTx = await payer.signTransaction(tx);
    const simulateResult = await provider.connection.simulateTransaction(signedTx);
    expect(simulateResult.value.err).to.be.null;

    const sig = await provider.connection.sendTransaction(signedTx);
    console.log("withdraw and close token account signature", sig);

    const accountInfo = await pRetry(async () => {
      const info = await provider.connection.getAccountInfo(tokenAccount);
      if (info != null) {
        throw new Error("Account not closed yet");
      }
      return info;
    }, {
      retries: 20,
      minTimeout: 1000,
      maxTimeout: 1000,
      factor: 1
    })

    expect(accountInfo).to.be.null;
  })

  it("should close account by owner successfully", async () => {
    // Derive the PDA address
    const [pda, bump] = PublicKey.findProgramAddressSync(
      [Buffer.from(UserVaultSeed), user.publicKey.toBuffer()],
      program.programId
    );

    const closeIx = await program.methods
      .closeUserPda()
      .accounts({
        owner: user.publicKey,
        destination: payer.publicKey,
      })
      .instruction();

    const tx = await buildTransaction({
      connection: provider.connection,
      payer: payer.publicKey,
      instructions: [closeIx],
      signers: [user],
    })

    const signedTx = await payer.signTransaction(tx);
    const simulateResult = await provider.connection.simulateTransaction(signedTx);
    expect(simulateResult.value.err).to.be.null;

    const sig = await provider.connection.sendTransaction(tx);
    console.log("close account signature", sig);

    const accountInfo = await pRetry(async () => {
      const info = await provider.connection.getAccountInfo(pda);
      if (info != null) {
        throw new Error("Account not closed yet");
      }

      return info;
    }, {
      retries: 20,
      minTimeout: 1000,
      maxTimeout: 1000,
      factor: 1
    })
    expect(accountInfo).to.be.null;
  });
});
